import "reflect-metadata";
import { INestApplication } from "@nestjs/common";
import { getConnectionToken } from "@nestjs/mongoose";
import { Test } from "@nestjs/testing";
import { sign } from "jsonwebtoken";
import { Connection } from "mongoose";
import { AppModule } from "../src/app.module";

// Test-only secret; never the real SECRET_JWT.
export const TEST_JWT_SECRET = "nest-test-jwt-secret";

// Authorization header with a valid access token, shaped like the Express ones ({ id: email }, 1h).
export const authHeader = () => `Bearer ${sign({ id: "tester@example.com" }, TEST_JWT_SECRET, { expiresIn: "1h" })}`;

// Boots the whole app against the given (isolated) database URI.
export const createTestApp = async (uri: string) => {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.forRoot(uri, TEST_JWT_SECRET)],
  }).compile();
  const app: INestApplication = moduleRef.createNestApplication();
  await app.init();
  return { app, connection: moduleRef.get<Connection>(getConnectionToken()) };
};

// Runs `fn` against a separate app whose connection is closed, so queries buffer and
// fail after a short timeout. The shared app and database stay intact.
export const withDisconnectedApp = async (uri: string, fn: (app: INestApplication) => Promise<void>) => {
  const { app, connection } = await createTestApp(uri);
  connection.set("bufferTimeoutMS", 200);
  await connection.close();

  try {
    await fn(app);
  } finally {
    await app.close();
  }
};
