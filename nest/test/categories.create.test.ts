import "reflect-metadata";
import { INestApplication } from "@nestjs/common";
import { Connection } from "mongoose";
import request from "supertest";
import { authHeader, createTestApp, withDisconnectedApp } from "./test-app";
import { startTestDb } from "./test-db";

// Same expectations as the Express characterization test in ../../test/categories.create.test.ts,
// except the "NestJS differs from Express" cases, which are listed in docs/ai-workflow/parity.md.

const invalidName = (value?: unknown) => ({ type: "field", value, msg: "Invalid value", path: "name", location: "body" });

describe("POST /categories", () => {
  let app: INestApplication;
  let connection: Connection;
  let db: Awaited<ReturnType<typeof startTestDb>>;

  const categories = () => connection.collection("categories");
  const insertCategory = async (fields: { name: string; status?: boolean }) => {
    const now = new Date();
    await categories().insertOne({ status: true, createdAt: now, updatedAt: now, ...fields });
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

  it("creates an active category from the name only and responds 201", async () => {
    const res = await request(app.getHttpServer()).post("/categories").set("Authorization", authHeader()).send({ name: "Longboard", status: false, extra: 1 });

    expect(res.status).toBe(201);
    expect(res.headers["content-type"]).toMatch(/^application\/json/);
    expect(Object.keys(res.body).sort()).toEqual(["_id", "createdAt", "name", "status", "updatedAt"]);
    expect(res.body).toMatchObject({ name: "Longboard", status: true });
    expect(res.body._id).toMatch(/^[0-9a-f]{24}$/);

    const stored = await categories().findOne({ name: "Longboard" });
    expect(stored).toMatchObject({ name: "Longboard", status: true });
    expect(stored).not.toHaveProperty("extra");
    expect(String(stored?._id)).toBe(res.body._id);
  });

  it.each([
    ["an active", true],
    ["a soft-deleted", false],
  ])("responds 400 when the name is taken by %s category", async (_label, status) => {
    await insertCategory({ name: "Longboard", status });

    const res = await request(app.getHttpServer()).post("/categories").set("Authorization", authHeader()).send({ name: "Longboard" });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      errors: [{ type: "field", value: "Longboard", msg: "Longboard already exists", path: "name", location: "body" }],
    });
    expect(await categories().countDocuments()).toBe(1);
  });

  it("responds 400 with two validation errors when the name is missing", async () => {
    const res = await request(app.getHttpServer()).post("/categories").set("Authorization", authHeader()).send({});

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ errors: [invalidName(), invalidName()] });
    expect(await categories().countDocuments()).toBe(0);
  });

  it.each([[""], [null]])("responds 400 with one validation error when the name is %p", async (name) => {
    const res = await request(app.getHttpServer()).post("/categories").set("Authorization", authHeader()).send({ name });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ errors: [invalidName(name)] });
    expect(await categories().countDocuments()).toBe(0);
  });

  it.each([
    ["  ", "  "],
    [123, "123"],
    [true, "true"],
  ])("accepts the name %p and stores it as %p", async (name, stored) => {
    const res = await request(app.getHttpServer()).post("/categories").set("Authorization", authHeader()).send({ name });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe(stored);
  });

  it("responds 400 with the query error as a validation error when the database is unreachable", async () => {
    await withDisconnectedApp(db.uri, async (failingApp) => {
      const res = await request(failingApp.getHttpServer()).post("/categories").set("Authorization", authHeader()).send({ name: "Longboard" });

      expect(res.status).toBe(400);
      expect(res.body.errors).toHaveLength(1);
      expect(res.body.errors[0]).toMatchObject({ type: "field", value: "Longboard", path: "name", location: "body" });
      expect(res.body.errors[0].msg).toEqual(expect.any(String));
    });
  });

  describe("NestJS differs from Express (parity.md)", () => {
    it.each([
      ["an object", { $ne: null }],
      ["an array", ["a", "b"]],
    ])("rejects %s name as a validation error before any query (S8)", async (_label, name) => {
      await insertCategory({ name: "Longboard" });

      const res = await request(app.getHttpServer()).post("/categories").set("Authorization", authHeader()).send({ name });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ errors: [invalidName(name)] });
      expect(await categories().countDocuments()).toBe(1);
    });

    it("reads the name from the body only", async () => {
      const res = await request(app.getHttpServer()).post("/categories?name=Longboard").set("Authorization", authHeader()).send({});

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ errors: [invalidName(), invalidName()] });
      expect(await categories().countDocuments()).toBe(0);
    });
  });
});
