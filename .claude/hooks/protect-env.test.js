#!/usr/bin/env node
// Runs the protect-env hook as Claude Code would (JSON on stdin) and checks
// the exit code for each case. Usage: node .claude/hooks/protect-env.test.js

const { spawnSync } = require("child_process");
const path = require("path");

const HOOK = path.join(__dirname, "protect-env.js");
const BLOCK = 2;
const ALLOW = 0;

const cases = [
  ["Read .env", { tool_name: "Read", tool_input: { file_path: "/repo/.env" } }, BLOCK],
  ["Read nested .env", { tool_name: "Read", tool_input: { file_path: "/repo/nest/.env" } }, BLOCK],
  ["Read .env.local", { tool_name: "Read", tool_input: { file_path: "/repo/.env.local" } }, BLOCK],
  ["Read Windows path", { tool_name: "Read", tool_input: { file_path: "D:\\repo\\.env" } }, BLOCK],
  ["Edit .env", { tool_name: "Edit", tool_input: { file_path: ".env", old_string: "a", new_string: "b" } }, BLOCK],
  ["Write .env", { tool_name: "Write", tool_input: { file_path: ".env", content: "X=1" } }, BLOCK],
  ["Grep in .env", { tool_name: "Grep", tool_input: { pattern: "DB_URI", path: ".env" } }, BLOCK],
  ["Bash cat .env", { tool_name: "Bash", tool_input: { command: "cat .env" } }, BLOCK],
  ["Bash quoted", { tool_name: "Bash", tool_input: { command: "head -n 5 './nest/.env'" } }, BLOCK],
  ["Bash redirect", { tool_name: "Bash", tool_input: { command: "echo X=1 >> .env" } }, BLOCK],
  ["Bash source", { tool_name: "Bash", tool_input: { command: "source .env && npm run dev" } }, BLOCK],
  ["Bash env flag", { tool_name: "Bash", tool_input: { command: "node --env-file=.env src/app.ts" } }, BLOCK],
  ["Read .env.example", { tool_name: "Read", tool_input: { file_path: "/repo/.env.example" } }, ALLOW],
  ["Bash cat example", { tool_name: "Bash", tool_input: { command: "cat .env.example" } }, ALLOW],
  ["Read source file", { tool_name: "Read", tool_input: { file_path: "/repo/src/app.ts" } }, ALLOW],
  ["Read dotenv-ish name", { tool_name: "Read", tool_input: { file_path: "/repo/src/env.ts" } }, ALLOW],
  ["Bash npm test", { tool_name: "Bash", tool_input: { command: "npm test" } }, ALLOW],
  ["Bash dotenv word", { tool_name: "Bash", tool_input: { command: "grep -rn dotenv src" } }, ALLOW],
  ["Glob tool", { tool_name: "Glob", tool_input: { pattern: "**/*.ts" } }, ALLOW],
  ["Malformed JSON fails open", "{not json", ALLOW],
];

let failed = 0;
for (const [name, input, expected] of cases) {
  const stdin = typeof input === "string" ? input : JSON.stringify(input);
  const result = spawnSync(process.execPath, [HOOK], { input: stdin, encoding: "utf8" });
  const ok = result.status === expected;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name} (exit ${result.status}, expected ${expected})`);
}

console.log(`\n${cases.length - failed}/${cases.length} passed`);
process.exit(failed ? 1 : 0);
