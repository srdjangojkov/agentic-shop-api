import "reflect-metadata";
import { INestApplication } from "@nestjs/common";
import { getConnectionToken } from "@nestjs/mongoose";
import { Test } from "@nestjs/testing";
import { Connection } from "mongoose";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { startTestDb } from "./test-db";

// Same expectations as the Express characterization test in ../../test/categories.list.test.ts.

describe("GET /categories", () => {
  let app: INestApplication;
  let connection: Connection;
  let db: Awaited<ReturnType<typeof startTestDb>>;

  const categories = () => connection.collection("categories");

  beforeAll(async () => {
    db = await startTestDb();
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.forRoot(db.uri)],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    connection = moduleRef.get<Connection>(getConnectionToken());
  });

  afterEach(async () => {
    await categories().deleteMany({});
  });

  afterAll(async () => {
    await app?.close();
    await db?.stop();
  });

  it("returns an empty array when there are no categories", async () => {
    const res = await request(app.getHttpServer()).get("/categories");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/^application\/json/);
    expect(res.body).toEqual([]);
  });

  it("returns only active categories, with their stored fields", async () => {
    const now = new Date();
    await categories().insertMany([
      { name: "Longboard", status: true, createdAt: now, updatedAt: now },
      { name: "Skateboard", status: true, createdAt: now, updatedAt: now },
      { name: "Pennyboard", status: false, createdAt: now, updatedAt: now },
    ]);

    const res = await request(app.getHttpServer()).get("/categories");

    expect(res.status).toBe(200);
    expect(res.body.map((c: { name: string }) => c.name).sort()).toEqual(["Longboard", "Skateboard"]);
    for (const category of res.body) {
      expect(Object.keys(category).sort()).toEqual(["_id", "createdAt", "name", "status", "updatedAt"]);
      expect(category.status).toBe(true);
      expect(category._id).toMatch(/^[0-9a-f]{24}$/);
      expect(new Date(category.createdAt).toISOString()).toBe(category.createdAt);
    }
  });

  it("responds 400 ERROR_GET_CATEGORIES when the query fails", async () => {
    // Disconnected, queries buffer and then time out; a short timeout keeps the failure fast.
    // A separate app on a closed connection, so the shared app and database stay intact.
    const failing = await Test.createTestingModule({
      imports: [AppModule.forRoot(db.uri)],
    }).compile();
    const failingApp = failing.createNestApplication();
    await failingApp.init();
    const failingConnection = failing.get<Connection>(getConnectionToken());
    failingConnection.set("bufferTimeoutMS", 200);
    await failingConnection.close();

    try {
      const res = await request(failingApp.getHttpServer()).get("/categories");

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ errors: "ERROR_GET_CATEGORIES" });
    } finally {
      await failingApp.close();
    }
  });
});
