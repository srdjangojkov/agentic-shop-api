import "reflect-metadata";
import { INestApplication } from "@nestjs/common";
import { sign } from "jsonwebtoken";
import { Connection, Types } from "mongoose";
import request from "supertest";
import { createTestApp, TEST_JWT_SECRET } from "./test-app";
import { startTestDb } from "./test-db";

// NestJS only: the write routes require a valid access token (S3 decided 2026-10-19,
// decisions.md). Express runs them without authentication; see parity.md.
// The guard mirrors checkJWT in ../../src/middleware/session.ts.

const unauthorized = { msg: "INVALID_SESSION" };
const token = (secret = TEST_JWT_SECRET, options = {}) => sign({ id: "tester@example.com" }, secret, { expiresIn: "1h", ...options });

describe("authentication on /categories", () => {
  let app: INestApplication;
  let connection: Connection;
  let db: Awaited<ReturnType<typeof startTestDb>>;
  let id: string;

  const categories = () => connection.collection("categories");

  beforeAll(async () => {
    db = await startTestDb();
    ({ app, connection } = await createTestApp(db.uri));
  });

  beforeEach(async () => {
    const now = new Date();
    const { insertedId } = await categories().insertOne({ name: "Longboard", status: true, createdAt: now, updatedAt: now });
    id = String(insertedId);
  });

  afterEach(async () => {
    await categories().deleteMany({});
  });

  afterAll(async () => {
    await app?.close();
    await db?.stop();
  });

  const writes = [
    ["POST /categories", () => request(app.getHttpServer()).post("/categories").send({ name: "Cruiser" })],
    ["PUT /categories/:id", () => request(app.getHttpServer()).put(`/categories/${id}`).send({ name: "Cruiser" })],
    ["DELETE /categories/:id", () => request(app.getHttpServer()).delete(`/categories/${id}`)],
  ] as const;

  const expectUnchanged = async () => {
    expect(await categories().countDocuments()).toBe(1);
    expect(await categories().findOne({ _id: new Types.ObjectId(id) })).toMatchObject({ name: "Longboard", status: true });
  };

  describe.each(writes)("%s", (_label, send) => {
    it.each([
      ["no Authorization header", undefined],
      ["a malformed token", "Bearer not-a-jwt"],
      ["a token signed with another secret", `Bearer ${token("another-secret")}`],
      ["an expired token", `Bearer ${token(TEST_JWT_SECRET, { expiresIn: -10 })}`],
      ["an HS512 token", `Bearer ${token(TEST_JWT_SECRET, { algorithm: "HS512" })}`],
      ["an unsigned (alg none) token", `Bearer ${sign({ id: "tester@example.com" }, "", { algorithm: "none" })}`],
    ])("responds 401 INVALID_SESSION and changes nothing with %s", async (_case, header) => {
      const req = send();
      const res = await (header ? req.set("Authorization", header) : req);

      expect(res.status).toBe(401);
      expect(res.body).toEqual(unauthorized);
      await expectUnchanged();
    });

    it("accepts a valid token, with or without the Bearer prefix (last header segment, as checkJWT)", async () => {
      const res = await send().set("Authorization", token());

      expect(res.status).toBeLessThan(300);
    });
  });

  it("checks the token before validating the request", async () => {
    const res = await request(app.getHttpServer()).put("/categories/abc").send({ name: "Cruiser" });

    expect(res.status).toBe(401);
    expect(res.body).toEqual(unauthorized);
  });

  it.each([["/categories"], ["/categories/:id"]])("keeps GET %s public (A1 open)", async (path) => {
    const res = await request(app.getHttpServer()).get(path.replace(":id", id));

    expect(res.status).toBe(200);
  });
});
