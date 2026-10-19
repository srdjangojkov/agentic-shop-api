import request from "supertest";
import createApp from "../src/create-app";
import CategoryModel from "../src/models/category";
import { clearTestDb, startTestDb, stopTestDb, withDisconnectedDb } from "./helpers/test-db";

// Characterizes PUT /categories/:id as the Express app behaves today.
// The NestJS test in ../nest/test/categories.update.test.ts uses the same expectations,
// except where docs/ai-workflow/parity.md lists a difference ("Express only" cases below).

const app = createApp();
const missingId = "64c2d97e105160d0391b04e8";
const castError = (value: string) =>
  `Cast to ObjectId failed for value "${value}" (type string) at path "_id" for model "Category"`;

beforeAll(startTestDb);
afterEach(clearTestDb);
afterAll(stopTestDb);

describe("PUT /categories/:id", () => {
  it("renames a category, responds 200 with the updated document and persists it", async () => {
    const category = await CategoryModel.create({ name: "Longboard" });

    const res = await request(app).put(`/categories/${category._id}`).send({ name: "Cruiser" });

    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(["_id", "createdAt", "name", "status", "updatedAt"]);
    expect(res.body).toMatchObject({ _id: String(category._id), name: "Cruiser", status: true });
    expect(await CategoryModel.findById(category._id).lean()).toMatchObject({ name: "Cruiser", status: true });
  });

  it("accepts the category's current name", async () => {
    const category = await CategoryModel.create({ name: "Longboard" });

    const res = await request(app).put(`/categories/${category._id}`).send({ name: "Longboard" });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Longboard");
  });

  it("applies status from the body, so PUT can soft-delete and restore", async () => {
    const category = await CategoryModel.create({ name: "Longboard" });

    const off = await request(app).put(`/categories/${category._id}`).send({ status: false });
    expect(off.status).toBe(200);
    expect(off.body).toMatchObject({ name: "Longboard", status: false });

    const on = await request(app).put(`/categories/${category._id}`).send({ name: "Longboard", status: true });
    expect(on.status).toBe(200);
    expect(await CategoryModel.findById(category._id).lean()).toMatchObject({ status: true });
  });

  it("stores an empty name (no validation of the new name's content)", async () => {
    const category = await CategoryModel.create({ name: "Longboard" });

    const res = await request(app).put(`/categories/${category._id}`).send({ name: "" });

    expect(res.status).toBe(200);
    expect(await CategoryModel.findById(category._id).lean()).toMatchObject({ name: "" });
  });

  it("responds 400, reported on the id, when the new name belongs to another category", async () => {
    const category = await CategoryModel.create({ name: "Longboard" });
    await CategoryModel.create({ name: "Skateboard", status: false });

    const res = await request(app).put(`/categories/${category._id}`).send({ name: "Skateboard" });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      errors: [
        { type: "field", value: String(category._id), msg: "Skateboard already exists", path: "id", location: "params" },
      ],
    });
    expect(await CategoryModel.findById(category._id).lean()).toMatchObject({ name: "Longboard" });
  });

  it("responds 400 with a validation error when the id does not exist", async () => {
    const res = await request(app).put(`/categories/${missingId}`).send({ name: "Cruiser" });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      errors: [
        { type: "field", value: missingId, msg: `Category id: ${missingId} doesn't exist`, path: "id", location: "params" },
      ],
    });
  });

  it("responds 400 with three validation errors when the id is not a MongoId", async () => {
    const res = await request(app).put("/categories/abc").send({ name: "Cruiser" });

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
    await withDisconnectedDb(async () => {
      const res = await request(app).put(`/categories/${missingId}`).send({ name: "Cruiser" });

      expect(res.status).toBe(400);
      expect(res.body.errors.length).toBeGreaterThanOrEqual(1);
      for (const error of res.body.errors) {
        expect(error).toMatchObject({ type: "field", value: missingId, path: "id", location: "params" });
        expect(error.msg).toEqual(expect.any(String));
      }
    });
  });

  describe("Express only (not carried to NestJS, see parity.md)", () => {
    it("applies MongoDB update operators from the body (S8)", async () => {
      const category = await CategoryModel.create({ name: "Longboard" });

      const res = await request(app)
        .put(`/categories/${category._id}`)
        .send({ $unset: { status: 1 } });

      expect(res.status).toBe(200);
      expect(await CategoryModel.findById(category._id).lean()).not.toHaveProperty("status");
    });

    it("passes an object name to the uniqueness query and reports the cast error on the id", async () => {
      const category = await CategoryModel.create({ name: "Longboard" });

      const res = await request(app).put(`/categories/${category._id}`).send({ name: { a: 1 } });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        errors: [
          {
            type: "field",
            value: String(category._id),
            msg: 'Cast to string failed for value "{ a: 1 }" (type Object) at path "name" for model "Category"',
            path: "id",
            location: "params",
          },
        ],
      });
    });
  });
});
