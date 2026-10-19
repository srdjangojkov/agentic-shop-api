import "reflect-metadata";
import { INestApplication } from "@nestjs/common";
import { Connection } from "mongoose";
import request from "supertest";
import { createTestApp, withDisconnectedApp } from "./test-app";
import { startTestDb } from "./test-db";

// Same expectations as the Express characterization test in ../../test/categories.get.test.ts.

const missingId = "64c2d97e105160d0391b04e8";

describe("GET /categories/:id", () => {
  let app: INestApplication;
  let connection: Connection;
  let db: Awaited<ReturnType<typeof startTestDb>>;

  const categories = () => connection.collection("categories");
  const insertCategory = async (fields: { name: string; status?: boolean }) => {
    const now = new Date();
    const { insertedId } = await categories().insertOne({ status: true, createdAt: now, updatedAt: now, ...fields });
    return String(insertedId);
  };

  beforeAll(async () => {
    db = await startTestDb();
    ({ app, connection } = await createTestApp(db.uri));
  });

  afterEach(async () => {
    await categories().deleteMany({});
  });

  afterAll(async () => {
    await app?.close();
    await db?.stop();
  });

  it("returns an existing category with its stored fields", async () => {
    const id = await insertCategory({ name: "Longboard" });

    const res = await request(app.getHttpServer()).get(`/categories/${id}`);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/^application\/json/);
    expect(Object.keys(res.body).sort()).toEqual(["_id", "createdAt", "name", "status", "updatedAt"]);
    expect(res.body).toMatchObject({ _id: id, name: "Longboard", status: true });
    expect(new Date(res.body.createdAt).toISOString()).toBe(res.body.createdAt);
  });

  it("returns a soft-deleted category too (no status filter)", async () => {
    const id = await insertCategory({ name: "Pennyboard", status: false });

    const res = await request(app.getHttpServer()).get(`/categories/${id}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: "Pennyboard", status: false });
  });

  it("responds 400 with a validation error when the id does not exist", async () => {
    const res = await request(app.getHttpServer()).get(`/categories/${missingId}`);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      errors: [
        {
          type: "field",
          value: missingId,
          msg: `Category id: ${missingId} doesn't exist`,
          path: "id",
          location: "params",
        },
      ],
    });
  });

  it("responds 400 with two validation errors when the id is not a MongoId", async () => {
    const res = await request(app.getHttpServer()).get("/categories/abc");

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      errors: [
        { type: "field", value: "abc", msg: "Invalid value", path: "id", location: "params" },
        {
          type: "field",
          value: "abc",
          msg: 'Cast to ObjectId failed for value "abc" (type string) at path "_id" for model "Category"',
          path: "id",
          location: "params",
        },
      ],
    });
  });

  it("responds 400 with the query error as a validation error when the database is unreachable", async () => {
    await withDisconnectedApp(db.uri, async (failingApp) => {
      const res = await request(failingApp.getHttpServer()).get(`/categories/${missingId}`);

      expect(res.status).toBe(400);
      expect(res.body.errors).toHaveLength(1);
      expect(res.body.errors[0]).toMatchObject({ type: "field", value: missingId, path: "id", location: "params" });
      expect(res.body.errors[0].msg).toEqual(expect.any(String));
    });
  });
});
