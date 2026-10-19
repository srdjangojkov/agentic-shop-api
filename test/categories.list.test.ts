import request from "supertest";
import createApp from "../src/create-app";
import CategoryModel from "../src/models/category";
import { clearTestDb, startTestDb, stopTestDb } from "./helpers/test-db";

// Characterizes GET /categories as the Express app behaves today.
// Once migrated, the NestJS test for this endpoint uses the same expectations.

const app = createApp();

beforeAll(startTestDb);
afterEach(clearTestDb);
afterAll(stopTestDb);

describe("GET /categories", () => {
  it("returns an empty array when there are no categories", async () => {
    const res = await request(app).get("/categories");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/^application\/json/);
    expect(res.body).toEqual([]);
  });

  it("returns only active categories, with their stored fields", async () => {
    await CategoryModel.create({ name: "Longboard" });
    await CategoryModel.create({ name: "Skateboard" });
    await CategoryModel.create({ name: "Pennyboard", status: false });

    const res = await request(app).get("/categories");

    expect(res.status).toBe(200);
    expect(res.body.map((c: { name: string }) => c.name).sort()).toEqual(["Longboard", "Skateboard"]);
    for (const category of res.body) {
      expect(Object.keys(category).sort()).toEqual(["_id", "createdAt", "name", "status", "updatedAt"]);
      expect(category.status).toBe(true);
      expect(category._id).toMatch(/^[0-9a-f]{24}$/);
      expect(new Date(category.createdAt).toISOString()).toBe(category.createdAt);
    }
  });
});
