#!/usr/bin/env node
// Runs the verify-gate Stop hook as Claude Code would (JSON on stdin) against a
// throwaway fixture repo in the OS temp directory, and checks its decisions.
// The fixture's "typecheck" and "test" scripts are tiny Node scripts that log
// each run and fail when a flag file exists, so no real project code runs.
// Usage: node .claude/hooks/verify-gate.test.js

const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const HOOK = path.join(__dirname, "verify-gate.js");

const CHECK_SCRIPT = `
const fs = require("fs");
const name = process.argv[2];
fs.appendFileSync("runs.log", name + "\\n");
if (fs.existsSync("fail-" + name)) {
  console.error("src/index.ts(1,7): error TS2322: Type 'string' is not assignable to type 'number'. [" + name + "]");
  process.exit(1);
}
console.log(name + " ok");
`;

const fixtures = [];

function makeFixture({ withTypecheck = true, withDeps = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "verify-gate-fixture-"));
  fixtures.push(dir);
  const scripts = { test: "node check.js test" };
  if (withTypecheck) scripts.typecheck = "node check.js typecheck";
  const pkg = { name: "fixture", private: true, scripts };
  if (withDeps) pkg.devDependencies = { typescript: "^5.8.3" };
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify(pkg, null, 2));
  fs.writeFileSync(path.join(dir, "check.js"), CHECK_SCRIPT);
  fs.mkdirSync(path.join(dir, "src"));
  fs.writeFileSync(path.join(dir, "src", "index.ts"), "export const a: number = 1;\n");
  const git = (...args) => spawnSync("git", args, { cwd: dir, encoding: "utf8" });
  git("init", "-q");
  git("add", ".");
  git("-c", "user.name=t", "-c", "user.email=t@example.com", "commit", "-qm", "init");
  return { dir, state: path.join(dir, ".git", "verify-gate-state.json") };
}

function runHook(fx, event) {
  const result = spawnSync(process.execPath, [HOOK], {
    input: typeof event === "string" ? event : JSON.stringify(event),
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: fx.dir, VERIFY_GATE_STATE_FILE: fx.state },
  });
  let json = null;
  try {
    json = result.stdout.trim() ? JSON.parse(result.stdout) : null;
  } catch {
    json = { unparseable: result.stdout };
  }
  return { status: result.status, json, stderr: result.stderr };
}

function runs(fx) {
  const log = path.join(fx.dir, "runs.log");
  return fs.existsSync(log) ? fs.readFileSync(log, "utf8").trim().split("\n").filter(Boolean) : [];
}

function edit(fx, text) {
  fs.writeFileSync(path.join(fx.dir, "src", "index.ts"), text);
}

const stop = (active = false) => ({ session_id: "s1", hook_event_name: "Stop", stop_hook_active: active });
const isBlock = (r) => r.json && r.json.decision === "block";

const tests = [];
const test = (name, fn) => tests.push([name, fn]);
function expect(cond, msg) {
  if (!cond) throw new Error(msg);
}

test("no relevant changes: allows, runs nothing", () => {
  const fx = makeFixture();
  const r = runHook(fx, stop());
  expect(r.status === 0 && r.json === null, `expected silent allow, got ${JSON.stringify(r.json)}`);
  expect(runs(fx).length === 0, `expected no runs, got ${runs(fx)}`);
});

test("changed source, both pass: allows, runs each check once", () => {
  const fx = makeFixture();
  edit(fx, "export const a: number = 2;\n");
  const r = runHook(fx, stop());
  expect(r.status === 0 && !isBlock(r), "expected allow");
  expect(/all checks passed/.test(r.json.systemMessage), "expected pass summary");
  expect(runs(fx).join(",") === "typecheck,test", `runs: ${runs(fx)}`);
});

test("same state on next stop: not re-run", () => {
  const fx = makeFixture();
  edit(fx, "export const a: number = 2;\n");
  runHook(fx, stop());
  const r = runHook(fx, stop());
  expect(r.json === null, "expected silent allow");
  expect(runs(fx).length === 2, `expected no new runs, got ${runs(fx)}`);
});

test("typecheck fails: blocks with command and output, test still runs", () => {
  const fx = makeFixture();
  edit(fx, "export const a: number = 'x';\n");
  fs.writeFileSync(path.join(fx.dir, "fail-typecheck"), "");
  const r = runHook(fx, stop());
  expect(r.status === 0 && isBlock(r), `expected block, got ${JSON.stringify(r.json)}`);
  expect(r.json.reason.includes("`npm run typecheck`"), "reason names the failed command");
  expect(r.json.reason.includes("error TS2322"), "reason carries the error output");
  expect(/`npm test` in \.: passed/.test(r.json.reason), "reason reports the test result");
  expect(runs(fx).join(",") === "typecheck,test", `runs: ${runs(fx)}`);
});

test("both fail: both reported", () => {
  const fx = makeFixture();
  edit(fx, "x\n");
  fs.writeFileSync(path.join(fx.dir, "fail-typecheck"), "");
  fs.writeFileSync(path.join(fx.dir, "fail-test"), "");
  const r = runHook(fx, stop());
  expect(isBlock(r), "expected block");
  expect((r.json.reason.match(/failed\n/g) || []).length === 2, "two failure sections");
});

test("stop_hook_active, nothing changed after block: allows with NOT verified, no re-run", () => {
  const fx = makeFixture();
  edit(fx, "x\n");
  fs.writeFileSync(path.join(fx.dir, "fail-test"), "");
  runHook(fx, stop());
  const r = runHook(fx, stop(true));
  expect(!isBlock(r), "expected allow");
  expect(/NOT verified/.test(r.json.systemMessage), "expected warning");
  expect(runs(fx).length === 2, `expected no re-run, got ${runs(fx)}`);
});

test("stop_hook_active after a fix: re-runs and allows", () => {
  const fx = makeFixture();
  edit(fx, "x\n");
  fs.writeFileSync(path.join(fx.dir, "fail-typecheck"), "");
  expect(isBlock(runHook(fx, stop())), "first stop blocks");
  fs.unlinkSync(path.join(fx.dir, "fail-typecheck"));
  edit(fx, "export const a: number = 3;\n");
  const r = runHook(fx, stop(true));
  expect(!isBlock(r) && /all checks passed/.test(r.json.systemMessage), `got ${JSON.stringify(r.json)}`);
  expect(runs(fx).length === 4, `runs: ${runs(fx)}`);
});

test("reverting a failing change to the committed state still re-runs", () => {
  const fx = makeFixture();
  edit(fx, "x\n");
  fs.writeFileSync(path.join(fx.dir, "fail-typecheck"), "");
  expect(isBlock(runHook(fx, stop())), "first stop blocks");
  fs.unlinkSync(path.join(fx.dir, "fail-typecheck"));
  edit(fx, "export const a: number = 1;\n");
  const r = runHook(fx, stop(true));
  expect(r.json && /all checks passed/.test(r.json.systemMessage), `got ${JSON.stringify(r.json)}`);
  expect(runs(fx).length === 4, `runs: ${runs(fx)}`);
});

test("still failing after 3 blocks: allows with NOT verified", () => {
  const fx = makeFixture();
  fs.writeFileSync(path.join(fx.dir, "fail-test"), "");
  let blocks = 0;
  for (let i = 0; i < 3; i++) {
    edit(fx, `export const a = ${i};\n`);
    if (isBlock(runHook(fx, stop(i > 0)))) blocks++;
  }
  edit(fx, "export const a = 99;\n");
  const r = runHook(fx, stop(true));
  expect(blocks === 3, `expected 3 blocks, got ${blocks}`);
  expect(!isBlock(r) && /NOT verified/.test(r.json.systemMessage), `got ${JSON.stringify(r.json)}`);
});

test("new stop (stop_hook_active false) resets the retry counter", () => {
  const fx = makeFixture();
  fs.writeFileSync(path.join(fx.dir, "fail-test"), "");
  for (let i = 0; i < 3; i++) {
    edit(fx, `export const a = ${i};\n`);
    runHook(fx, stop(i > 0));
  }
  edit(fx, "export const a = 42;\n");
  expect(isBlock(runHook(fx, stop(false))), "expected block again");
});

test("missing typecheck script: reported as NOT RUN, test runs, no block", () => {
  const fx = makeFixture({ withTypecheck: false });
  edit(fx, "export const a: number = 2;\n");
  const r = runHook(fx, stop());
  expect(!isBlock(r), "expected allow");
  expect(/NOT RUN \(no "typecheck" script/.test(r.json.systemMessage), r.json.systemMessage);
  expect(/did NOT run/.test(r.json.systemMessage), "expected not-verified wording");
  expect(runs(fx).join(",") === "test", `runs: ${runs(fx)}`);
});

test("dependencies declared but node_modules missing: reported, nothing run", () => {
  const fx = makeFixture({ withDeps: true });
  edit(fx, "export const a: number = 2;\n");
  const r = runHook(fx, stop());
  expect(!isBlock(r) && /node_modules missing/.test(r.json.systemMessage), JSON.stringify(r.json));
  expect(runs(fx).length === 0, `runs: ${runs(fx)}`);
});

test("change outside checked paths (docs) does not trigger", () => {
  const fx = makeFixture();
  fs.writeFileSync(path.join(fx.dir, "README.md"), "notes\n");
  const r = runHook(fx, stop());
  expect(r.json === null && runs(fx).length === 0, "expected silent allow");
});

test("hook does not modify the working tree", () => {
  const fx = makeFixture();
  edit(fx, "x\n");
  fs.writeFileSync(path.join(fx.dir, "fail-test"), "");
  const before = spawnSync("git", ["status", "--porcelain"], { cwd: fx.dir, encoding: "utf8" }).stdout;
  runHook(fx, stop());
  const after = spawnSync("git", ["status", "--porcelain"], { cwd: fx.dir, encoding: "utf8" }).stdout;
  // runs.log is the fixture script's own output, not the hook's.
  const strip = (s) => s.split("\n").filter((l) => !l.includes("runs.log")).join("\n");
  expect(strip(before) === strip(after), `before:\n${before}\nafter:\n${after}`);
  expect(fs.readFileSync(path.join(fx.dir, "src", "index.ts"), "utf8") === "x\n", "source untouched");
});

test("malformed stdin: still runs the gate", () => {
  const fx = makeFixture();
  edit(fx, "x\n");
  fs.writeFileSync(path.join(fx.dir, "fail-test"), "");
  const r = runHook(fx, "{not json");
  expect(r.status === 0 && isBlock(r), `got ${JSON.stringify(r.json)}`);
});

let failed = 0;
for (const [name, fn] of tests) {
  try {
    fn();
    console.log(`PASS  ${name}`);
  } catch (error) {
    failed++;
    console.log(`FAIL  ${name}: ${error.message}`);
  }
}
for (const dir of fixtures) fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${tests.length - failed}/${tests.length} passed`);
process.exit(failed ? 1 : 0);
