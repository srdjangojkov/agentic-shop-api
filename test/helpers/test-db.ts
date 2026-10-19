import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server-core";

// Throwaway MongoDB for tests. It never reads DB_URI or .env, and refuses any
// URI that is not on the local machine, so tests cannot touch Atlas or shared data.
// Set MONGOMS_SYSTEM_BINARY to use an existing mongod instead of a download.

let server: MongoMemoryServer | undefined;

export const startTestDb = async () => {
  server = await MongoMemoryServer.create();
  const uri = server.getUri("shop-api-test");
  if (!/^mongodb:\/\/127\.0\.0\.1:\d+\//.test(uri)) {
    throw new Error(`Refusing to run tests against a non-local database: ${uri}`);
  }
  await mongoose.connect(uri);
};

export const clearTestDb = async () => {
  const collections = await mongoose.connection.db.collections();
  await Promise.all(collections.map((c) => c.deleteMany({})));
};

export const stopTestDb = async () => {
  await mongoose.disconnect();
  await server?.stop();
};
