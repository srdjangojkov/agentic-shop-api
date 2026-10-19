import request from "supertest";
import createApp from "../src/create-app";
import CategoryModel from "../src/models/category";
import { clearTestDb, startTestDb, stopTestDb, withDisconnectedDb } from "./helpers/test-db";

// Characterizes POST /categories as the Express app behaves today.
// The NestJS test in ../nest/test/categories.create.test.ts uses the same expectations,
// except where docs/ai-workflow/parity.md lists a difference ("Express only" cases below).

const app = createApp();
const invalidName = (value?: unknown) => ({ type: "field", value, msg: "Invalid value", path: "name", location: "body" });

beforeAll(startTestDb);
afterEach(clearTestDb);
afterAll(stopTestDb);

describe("POST /categories", () => {
  it("creates an active category from the name only and responds 201", async () => {
    const res = await request(app).post("/categories").send({ name: "Longboard", status: false, extra: 1 });

    expect(res.status).toBe(201);
    expect(res.headers["content-type"]).toMatch(/^application\/json/);
    expect(Object.keys(res.body).sort()).toEqual(["_id", "createdAt", "name", "status", "updatedAt"]);
    expect(res.body).toMatchObject({ name: "Longboard", status: true });
    expect(res.body._id).toMatch(/^[0-9a-f]{24}$/);

    const stored = await CategoryModel.findById(res.body._id).lean();
    expect(stored).toMatchObject({ name: "Longboard", status: true });
    expect(stored).not.toHaveProperty("extra");
  });

  it.each([
    ["an active", true],
    ["a soft-deleted", false],
  ])("responds 400 when the name is taken by %s category", async (_label, status) => {
    await CategoryModel.create({ name: "Longboard", status });

    const res = await request(app).post("/categories").send({ name: "Longboard" });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      errors: [{ type: "field", value: "Longboard", msg: "Longboard already exists", path: "name", location: "body" }],
    });
    expect(await CategoryModel.countDocuments()).toBe(1);
  });

  it("responds 400 with two validation errors when the name is missing", async () => {
    const res = await request(app).post("/categories").send({});

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ errors: [invalidName(), invalidName()] });
    expect(await CategoryModel.countDocuments()).toBe(0);
  });

  it.each([[""], [null]])("responds 400 with one validation error when the name is %p", async (name) => {
    const res = await request(app).post("/categories").send({ name });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ errors: [invalidName(name)] });
    expect(await CategoryModel.countDocuments()).toBe(0);
  });

  it.each([
    ["  ", "  "],
    [123, "123"],
    [true, "true"],
  ])("accepts the name %p and stores it as %p", async (name, stored) => {
    const res = await request(app).post("/categories").send({ name });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe(stored);
  });

  it("responds 400 with the query error as a validation error when the database is unreachable", async () => {
    await withDisconnectedDb(async () => {
      const res = await request(app).post("/categories").send({ name: "Longboard" });

      expect(res.status).toBe(400);
      expect(res.body.errors).toHaveLength(1);
      expect(res.body.errors[0]).toMatchObject({ type: "field", value: "Longboard", path: "name", location: "body" });
      expect(res.body.errors[0].msg).toEqual(expect.any(String));
    });
  });

  describe("Express only (not carried to NestJS, see parity.md)", () => {
    it("uses an object name as a query operator in the uniqueness check (S8)", async () => {
      await CategoryModel.create({ name: "Longboard" });

      const res = await request(app).post("/categories").send({ name: { $ne: null } });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        errors: [{ type: "field", value: { $ne: null }, msg: "[object Object] already exists", path: "name", location: "body" }],
      });
    });

    it("fails the create with ERROR_CREATE_CATEGORY for an array name", async () => {
      jest.spyOn(console, "log").mockImplementationOnce(() => undefined);

      const res = await request(app).post("/categories").send({ name: ["a", "b"] });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ errors: "ERROR_CREATE_CATEGORY" });
    });

    it("also validates a name in the query string next to a valid body name", async () => {
      const res = await request(app).post("/categories?name=").send({ name: "Longboard" });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        errors: [{ type: "field", value: "", msg: "Invalid value", path: "name", location: "query" }],
      });
    });

    it("lets a name in the query string pass validation, then fails the create", async () => {
      jest.spyOn(console, "log").mockImplementationOnce(() => undefined);

      const res = await request(app).post("/categories?name=Longboard").send({});

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ errors: "ERROR_CREATE_CATEGORY" });
      expect(await CategoryModel.countDocuments()).toBe(0);
    });
  });
});
