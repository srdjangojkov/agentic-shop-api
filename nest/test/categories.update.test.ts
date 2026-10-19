import "reflect-metadata";
import { INestApplication } from "@nestjs/common";
import { Connection, Types } from "mongoose";
import request from "supertest";
import { createTestApp, withDisconnectedApp } from "./test-app";
import { startTestDb } from "./test-db";

// Same expectations as the Express characterization test in ../../test/categories.update.test.ts,
// except the "NestJS differs from Express" cases, which are listed in docs/ai-workflow/parity.md.

const missingId = "64c2d97e105160d0391b04e8";
const castError = (value: string) =>
  `Cast to ObjectId failed for value "${value}" (type string) at path "_id" for model "Category"`;

describe("PUT /categories/:id", () => {
  let app: INestApplication;
  let connection: Connection;
  let db: Awaited<ReturnType<typeof startTestDb>>;

  const categories = () => connection.collection("categories");
  const insertCategory = async (fields: { name: string; status?: boolean }) => {
    const now = new Date();
    const { insertedId } = await categories().insertOne({ status: true, createdAt: now, updatedAt: now, ...fields });
    return String(insertedId);
  };
  const stored = (id: string) => categories().findOne({ _id: new Types.ObjectId(id) });

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

  it("renames a category, responds 200 with the updated document and persists it", async () => {
    const id = await insertCategory({ name: "Longboard" });

    const res = await request(app.getHttpServer()).put(`/categories/${id}`).send({ name: "Cruiser" });

    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(["_id", "createdAt", "name", "status", "updatedAt"]);
    expect(res.body).toMatchObject({ _id: id, name: "Cruiser", status: true });
    expect(await stored(id)).toMatchObject({ name: "Cruiser", status: true });
  });

  it("accepts the category's current name", async () => {
    const id = await insertCategory({ name: "Longboard" });

    const res = await request(app.getHttpServer()).put(`/categories/${id}`).send({ name: "Longboard" });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Longboard");
  });

  it("applies status from the body, so PUT can soft-delete and restore", async () => {
    const id = await insertCategory({ name: "Longboard" });

    const off = await request(app.getHttpServer()).put(`/categories/${id}`).send({ status: false });
    expect(off.status).toBe(200);
    expect(off.body).toMatchObject({ name: "Longboard", status: false });

    const on = await request(app.getHttpServer()).put(`/categories/${id}`).send({ name: "Longboard", status: true });
    expect(on.status).toBe(200);
    expect(await stored(id)).toMatchObject({ status: true });
  });

  it("stores an empty name (no validation of the new name's content)", async () => {
    const id = await insertCategory({ name: "Longboard" });

    const res = await request(app.getHttpServer()).put(`/categories/${id}`).send({ name: "" });

    expect(res.status).toBe(200);
    expect(await stored(id)).toMatchObject({ name: "" });
  });

  it("responds 400, reported on the id, when the new name belongs to another category", async () => {
    const id = await insertCategory({ name: "Longboard" });
    await insertCategory({ name: "Skateboard", status: false });

    const res = await request(app.getHttpServer()).put(`/categories/${id}`).send({ name: "Skateboard" });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      errors: [{ type: "field", value: id, msg: "Skateboard already exists", path: "id", location: "params" }],
    });
    expect(await stored(id)).toMatchObject({ name: "Longboard" });
  });

  it("responds 400 with a validation error when the id does not exist", async () => {
    const res = await request(app.getHttpServer()).put(`/categories/${missingId}`).send({ name: "Cruiser" });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      errors: [
        { type: "field", value: missingId, msg: `Category id: ${missingId} doesn't exist`, path: "id", location: "params" },
      ],
    });
  });

  it("responds 400 with three validation errors when the id is not a MongoId", async () => {
    const res = await request(app.getHttpServer()).put("/categories/abc").send({ name: "Cruiser" });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      errors: [
        { type: "field", value: "abc", msg: "Invalid value", path: "id", location: "params" },
        { type: "field", value: "abc", msg: castError("abc"), path: "id", location: "params" },
        { type: "field", value: "abc", msg: castError("abc"), path: "id", location: "params" },
      ],
    });
  });

  it("responds 400 with the query errors as validation errors when the database is unreachable", async () => {
    await withDisconnectedApp(db.uri, async (failingApp) => {
      const res = await request(failingApp.getHttpServer()).put(`/categories/${missingId}`).send({ name: "Cruiser" });

      expect(res.status).toBe(400);
      expect(res.body.errors.length).toBeGreaterThanOrEqual(1);
      for (const error of res.body.errors) {
        expect(error).toMatchObject({ type: "field", value: missingId, path: "id", location: "params" });
        expect(error.msg).toEqual(expect.any(String));
      }
    });
  });

  describe("NestJS differs from Express (parity.md)", () => {
    it("applies only name and status, ignoring update operators and other keys (S8)", async () => {
      const id = await insertCategory({ name: "Longboard" });

      const res = await request(app.getHttpServer())
        .put(`/categories/${id}`)
        .send({ name: "Cruiser", $unset: { status: 1 }, extra: 1 });

      expect(res.status).toBe(200);
      const category = await stored(id);
      expect(category).toMatchObject({ name: "Cruiser", status: true });
      expect(category).not.toHaveProperty("extra");
    });

    it.each([
      ["an object", { a: 1 }],
      ["an array", ["a", "b"]],
    ])("rejects %s name as a validation error on the name (S8)", async (_label, name) => {
      const id = await insertCategory({ name: "Longboard" });

      const res = await request(app.getHttpServer()).put(`/categories/${id}`).send({ name });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        errors: [{ type: "field", value: name, msg: "Invalid value", path: "name", location: "body" }],
      });
      expect(await stored(id)).toMatchObject({ name: "Longboard" });
    });
  });
});
