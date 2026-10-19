import request from "supertest";
import createApp from "../src/create-app";
import CategoryModel from "../src/models/category";
import { clearTestDb, startTestDb, stopTestDb, withDisconnectedDb } from "./helpers/test-db";

// Characterizes GET /categories/:id as the Express app behaves today.
// The NestJS test in ../nest/test/categories.get.test.ts uses the same expectations.

const app = createApp();
const missingId = "64c2d97e105160d0391b04e8";

beforeAll(startTestDb);
afterEach(clearTestDb);
afterAll(stopTestDb);

describe("GET /categories/:id", () => {
  it("returns an existing category with its stored fields", async () => {
    const category = await CategoryModel.create({ name: "Longboard" });

    const res = await request(app).get(`/categories/${category._id}`);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/^application\/json/);
    expect(Object.keys(res.body).sort()).toEqual(["_id", "createdAt", "name", "status", "updatedAt"]);
    expect(res.body).toMatchObject({ _id: String(category._id), name: "Longboard", status: true });
    expect(new Date(res.body.createdAt).toISOString()).toBe(res.body.createdAt);
  });

  it("returns a soft-deleted category too (no status filter)", async () => {
    const category = await CategoryModel.create({ name: "Pennyboard", status: false });

    const res = await request(app).get(`/categories/${category._id}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: "Pennyboard", status: false });
  });

  it("responds 400 with a validation error when the id does not exist", async () => {
    const res = await request(app).get(`/categories/${missingId}`);

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
    const res = await request(app).get("/categories/abc");

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
    await withDisconnectedDb(async () => {
      const res = await request(app).get(`/categories/${missingId}`);

      expect(res.status).toBe(400);
      expect(res.body.errors).toHaveLength(1);
      expect(res.body.errors[0]).toMatchObject({ type: "field", value: missingId, path: "id", location: "params" });
      expect(res.body.errors[0].msg).toEqual(expect.any(String));
    });
  });
});
