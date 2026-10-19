#!/usr/bin/env node
// Stop hook: verification gate for the NestJS app in nest/. Before Claude
// finishes, runs `npm run typecheck` and `npm test` there when its source
// changed, and blocks the stop if either command fails. The Express app at the
// root is not checked (owner's choice).
//
// - A package is checked when its relevant files differ from the last state
//   checked here without failures, or, with no record yet, when git shows
//   uncommitted changes in them. Unchanged packages are skipped.
// - Both commands always run, so one failure does not hide the other.
// - A failure returns {"decision":"block","reason":...}: Claude sees the failed
//   command and the tail of its output, fixes the code and stops again, which
//   re-runs the gate.
// - Loop guard (stop_hook_active): when Claude stops again after a block
//   without changing any relevant file, or after MAX_BLOCKS consecutive
//   blocks, the stop is allowed and a warning says the checks did not pass.
// - Missing scripts and missing node_modules are reported, never counted as
//   passing, and do not block (the gate must not install or edit package.json).
// - Read-only towards the repo: it never edits, stashes or resets files. State
//   (last passing fingerprint, retry counter) lives in the OS temp directory.
//
// Output: JSON on stdout, exit 0. Unexpected errors allow the stop with a
// warning so a hook bug cannot trap the session.

const { spawnSync } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const PROJECT_DIR = path.resolve(process.env.CLAUDE_PROJECT_DIR || process.cwd());
const STATE_FILE =
  process.env.VERIFY_GATE_STATE_FILE ||
  path.join(
    os.tmpdir(),
    `claude-verify-gate-${crypto.createHash("sha1").update(PROJECT_DIR).digest("hex").slice(0, 12)}.json`
  );
const MAX_BLOCKS = 3;
const COMMAND_TIMEOUT_MS = 4 * 60 * 1000; // 2 checks stay well under the 1200 s hook timeout
const OUTPUT_TAIL_LINES = 60;
const OUTPUT_TAIL_CHARS = 5000;
const CHECKS = [
  { script: "typecheck", args: ["run", "typecheck"] },
  { script: "test", args: ["test"] },
];

// Files that can change the result of typecheck or test, per checked package.
const PACKAGES = [
  {
    name: "NestJS (nest/)",
    dir: "nest",
    paths: ["src", "test", "tsconfig.json", "jest.config.js", "package.json", "package-lock.json"],
  },
];

function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    return {};
  }
}

function writeState(state) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch {
    // Losing state only means a later run re-checks; never fail the hook for it.
  }
}

function listFiles(abs) {
  let stat;
  try {
    stat = fs.statSync(abs);
  } catch {
    return [];
  }
  if (stat.isFile()) return [abs];
  if (!stat.isDirectory()) return [];
  return fs
    .readdirSync(abs)
    .filter((entry) => entry !== "node_modules" && entry !== ".git")
    .sort()
    .flatMap((entry) => listFiles(path.join(abs, entry)));
}

function fingerprint(pkg) {
  const base = path.join(PROJECT_DIR, pkg.dir);
  const hash = crypto.createHash("sha1");
  for (const rel of pkg.paths) {
    for (const file of listFiles(path.join(base, rel))) {
      hash.update(path.relative(base, file).split(path.sep).join("/"));
      hash.update("\0");
      hash.update(fs.readFileSync(file));
      hash.update("\0");
    }
  }
  return hash.digest("hex");
}

// true/false from git; null when git is unavailable or this is not a repo.
function hasUncommittedChanges(pkg) {
  const pathspecs = pkg.paths.map((p) => path.posix.join(pkg.dir, p));
  const result = spawnSync("git", ["status", "--porcelain", "--untracked-files=all", "--", ...pathspecs], {
    cwd: PROJECT_DIR,
    encoding: "utf8",
  });
  if (result.error || result.status !== 0) return null;
  return result.stdout.trim() !== "";
}

function readScripts(pkgDir) {
  try {
    const json = JSON.parse(fs.readFileSync(path.join(pkgDir, "package.json"), "utf8"));
    const hasDeps = Object.keys({ ...json.dependencies, ...json.devDependencies }).length > 0;
    return { scripts: json.scripts || {}, hasDeps };
  } catch {
    return null;
  }
}

function tail(text) {
  // eslint-disable-next-line no-control-regex
  const clean = text.replace(/\x1b\[[0-9;]*m/g, "").trimEnd();
  let out = clean.split(/\r?\n/).slice(-OUTPUT_TAIL_LINES).join("\n");
  if (out.length > OUTPUT_TAIL_CHARS) out = "..." + out.slice(-OUTPUT_TAIL_CHARS);
  return out;
}

function runNpm(args, cwd) {
  // npm is npm.cmd on Windows, which Node only spawns through a shell.
  const isWindows = process.platform === "win32";
  const result = spawnSync(isWindows ? `npm ${args.join(" ")}` : "npm", isWindows ? [] : args, {
    cwd,
    encoding: "utf8",
    shell: isWindows,
    timeout: COMMAND_TIMEOUT_MS,
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, CI: "true", FORCE_COLOR: "0" },
  });
  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  if (result.error) {
    const reason = result.error.code === "ETIMEDOUT" ? "timed out" : result.error.message;
    return { ok: false, detail: `${reason}\n${tail(output)}` };
  }
  return { ok: result.status === 0, detail: tail(output), status: result.status };
}

// Runs every check for one package. Returns results, failures and notes.
function verifyPackage(pkg) {
  const pkgDir = path.join(PROJECT_DIR, pkg.dir);
  const info = readScripts(pkgDir);
  const results = [];
  if (!info) {
    return [{ pkg, label: "package.json", state: "unavailable", detail: "package.json missing or unreadable" }];
  }
  if (info.hasDeps && !fs.existsSync(path.join(pkgDir, "node_modules"))) {
    return CHECKS.map((check) => ({
      pkg,
      label: `npm ${check.args.join(" ")}`,
      state: "unavailable",
      detail: `node_modules missing in ${pkg.dir}; run npm ci there first`,
    }));
  }
  for (const check of CHECKS) {
    const label = `npm ${check.args.join(" ")}`;
    if (!info.scripts[check.script]) {
      results.push({ pkg, label, state: "unavailable", detail: `no "${check.script}" script in ${pkg.dir}/package.json` });
      continue;
    }
    const run = runNpm(check.args, pkgDir);
    results.push({ pkg, label, state: run.ok ? "passed" : "failed", detail: run.detail, status: run.status });
  }
  return results;
}

function summary(results) {
  return results
    .map((r) => {
      const where = r.pkg.dir === "." ? "." : r.pkg.dir;
      const word = { passed: "passed", failed: "FAILED", unavailable: "NOT RUN" }[r.state];
      const extra = r.state === "unavailable" ? ` (${r.detail})` : "";
      return `- ${r.pkg.name}: \`${r.label}\` in ${where}: ${word}${extra}`;
    })
    .join("\n");
}

function respond(payload) {
  if (payload) process.stdout.write(JSON.stringify(payload));
  return 0;
}

function main(raw) {
  let event = {};
  try {
    event = JSON.parse(raw || "{}") || {};
  } catch {
    event = {};
  }
  const sessionId = String(event.session_id || "unknown");
  const state = readState();
  state.verified = state.verified || {};
  state.sessions = state.sessions || {};
  const session = event.stop_hook_active ? state.sessions[sessionId] || {} : {};

  const pending = [];
  for (const pkg of PACKAGES) {
    if (!fs.existsSync(path.join(PROJECT_DIR, pkg.dir, "package.json"))) continue;
    const fp = fingerprint(pkg);
    const known = state.verified[pkg.dir];
    let changed;
    if (known !== undefined) {
      changed = known !== fp;
    } else {
      const dirty = hasUncommittedChanges(pkg);
      changed = dirty !== false;
      // Clean tree and no record: this state is the baseline, not a pass.
      if (!changed) state.verified[pkg.dir] = fp;
    }
    if (changed) pending.push({ pkg, fp });
  }

  if (pending.length === 0) {
    delete state.sessions[sessionId];
    writeState(state);
    return respond(null);
  }

  const combined = pending.map((p) => `${p.pkg.dir}:${p.fp}`).join("|");

  if (event.stop_hook_active && session.lastFailed === combined) {
    delete state.sessions[sessionId];
    writeState(state);
    return respond({
      systemMessage:
        "Verification gate: checks FAILED and no relevant file changed since, so they were not re-run. " +
        "The code is NOT verified.\n" +
        (session.lastSummary || ""),
    });
  }
  if (event.stop_hook_active && (session.blocks || 0) >= MAX_BLOCKS) {
    delete state.sessions[sessionId];
    writeState(state);
    return respond({
      systemMessage:
        `Verification gate: stopped blocking after ${MAX_BLOCKS} failed attempts. The code is NOT verified.\n` +
        (session.lastSummary || ""),
    });
  }

  const results = pending.flatMap((p) => verifyPackage(p.pkg));
  const failed = results.filter((r) => r.state === "failed");
  const unavailable = results.filter((r) => r.state === "unavailable");
  const text = summary(results);

  for (const p of pending) {
    const own = results.filter((r) => r.pkg === p.pkg);
    // Record the state when nothing failed, so unchanged code is not re-run on every stop.
    // Unavailable checks were reported in this run's message; they are not passes.
    // A failed state is recorded so that any later state, a revert included, is re-checked.
    state.verified[p.pkg.dir] = own.some((r) => r.state === "failed") ? `failed:${p.fp}` : p.fp;
  }

  if (failed.length > 0) {
    state.sessions[sessionId] = {
      blocks: (session.blocks || 0) + 1,
      lastFailed: combined,
      lastSummary: text,
      at: new Date().toISOString(),
    };
    writeState(state);
    const details = failed
      .map((r) => `### ${r.pkg.name}: \`${r.label}\` (in ${r.pkg.dir}) failed\n${r.detail}`)
      .join("\n\n");
    return respond({
      decision: "block",
      reason:
        "Verification gate failed. Fix the code (do not weaken the checks), then finish again to re-run them.\n\n" +
        `${text}\n\n${details}`,
    });
  }

  delete state.sessions[sessionId];
  writeState(state);
  const note = unavailable.length
    ? "Verification gate: no failures, but some checks did NOT run, so they are not verified:\n"
    : "Verification gate: all checks passed.\n";
  return respond({ systemMessage: note + text });
}

if (require.main === module) {
  let raw = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => (raw += chunk));
  process.stdin.on("end", () => {
    try {
      process.exit(main(raw));
    } catch (error) {
      process.stdout.write(
        JSON.stringify({ systemMessage: `Verification gate error, checks NOT verified: ${error.message}` })
      );
      process.exit(0);
    }
  });
}

module.exports = { main };
