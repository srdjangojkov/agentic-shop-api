import "reflect-metadata";
import { INestApplication } from "@nestjs/common";
import { Connection, Types } from "mongoose";
import request from "supertest";
import { authHeader, createTestApp, withDisconnectedApp } from "./test-app";
import { startTestDb } from "./test-db";

// Same expectations as the Express characterization test in ../../test/categories.delete.test.ts.

const missingId = "64c2d97e105160d0391b04e8";

describe("DELETE /categories/:id", () => {
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

  it("soft-deletes the category, responds 200 with status false and hides it from the list", async () => {
    const id = await insertCategory({ name: "Longboard" });
    await insertCategory({ name: "Skateboard" });

    const res = await request(app.getHttpServer()).delete(`/categories/${id}`).set("Authorization", authHeader());

    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(["_id", "createdAt", "name", "status", "updatedAt"]);
    expect(res.body).toMatchObject({ _id: id, name: "Longboard", status: false });
    expect(await stored(id)).toMatchObject({ name: "Longboard", status: false });

    const list = await request(app.getHttpServer()).get("/categories");
    expect(list.body.map((c: { name: string }) => c.name)).toEqual(["Skateboard"]);
  });

  it("responds 200 again for an already deleted category", async () => {
    const id = await insertCategory({ name: "Longboard", status: false });

    const res = await request(app.getHttpServer()).delete(`/categories/${id}`).set("Authorization", authHeader());

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: "Longboard", status: false });
  });

  it("responds 400 with a validation error when the id does not exist", async () => {
    const res = await request(app.getHttpServer()).delete(`/categories/${missingId}`).set("Authorization", authHeader());

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      errors: [
        { type: "field", value: missingId, msg: `Category id: ${missingId} doesn't exist`, path: "id", location: "params" },
      ],
    });
  });

  it("responds 400 with two validation errors when the id is not a MongoId", async () => {
    const res = await request(app.getHttpServer()).delete("/categories/abc").set("Authorization", authHeader());

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
      const res = await request(failingApp.getHttpServer()).delete(`/categories/${missingId}`).set("Authorization", authHeader());

      expect(res.status).toBe(400);
      expect(res.body.errors).toHaveLength(1);
      expect(res.body.errors[0]).toMatchObject({ type: "field", value: missingId, path: "id", location: "params" });
      expect(res.body.errors[0].msg).toEqual(expect.any(String));
    });
  });
});
