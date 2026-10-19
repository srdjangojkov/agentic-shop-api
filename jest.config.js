/** Express app tests. The NestJS app in nest/ has its own Jest config. */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/test"],
  testMatch: ["**/*.test.ts"],
  testTimeout: 60000,
};
