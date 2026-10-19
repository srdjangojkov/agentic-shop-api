/** NestJS app tests. Independent of the Express tests in ../test. */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/test"],
  testMatch: ["**/*.test.ts"],
  testTimeout: 60000,
};
