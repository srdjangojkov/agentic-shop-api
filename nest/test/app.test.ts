import "reflect-metadata";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { startTestDb } from "./test-db";

describe("NestJS app skeleton", () => {
  let app: INestApplication;
  let db: Awaited<ReturnType<typeof startTestDb>>;

  beforeAll(async () => {
    db = await startTestDb();
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.forRoot(db.uri)],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await db?.stop();
  });

  it("boots and answers unknown routes with 404", async () => {
    const res = await request(app.getHttpServer()).get("/does-not-exist");

    expect(res.status).toBe(404);
  });
});
