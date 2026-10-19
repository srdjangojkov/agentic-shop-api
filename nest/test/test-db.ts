import { MongoMemoryServer } from "mongodb-memory-server-core";

// Throwaway MongoDB for tests. It never reads DB_URI or .env, and refuses any
// URI that is not on the local machine, so tests cannot touch Atlas or shared data.
// Set MONGOMS_SYSTEM_BINARY to use an existing mongod instead of a download.

export const startTestDb = async () => {
  const server = await MongoMemoryServer.create();
  const uri = server.getUri("shop-api-nest-test");
  if (!/^mongodb:\/\/127\.0\.0\.1:\d+\//.test(uri)) {
    await server.stop();
    throw new Error(`Refusing to run tests against a non-local database: ${uri}`);
  }
  return { uri, stop: () => server.stop() };
};
