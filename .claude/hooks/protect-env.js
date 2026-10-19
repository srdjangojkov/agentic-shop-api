#!/usr/bin/env node
// PreToolUse hook: blocks Claude's file tools and Bash commands that name a
// `.env` / `.env.*` file directly. `.env.example` stays allowed.
//
// This reduces the most common accidental exposure (opening `.env`). It is NOT
// a guarantee: secrets can still leak through app logs, `printenv`, scripts
// that load `.env`, or files that copy the values.
//
// Exit 2 = block (stderr is shown to Claude). Exit 0 = allow.
// Unparseable input fails open so a hook bug cannot lock the session.

const path = require("path");

const ALLOWED = new Set([".env.example"]);

function isEnvFile(p) {
  if (typeof p !== "string" || p === "") return false;
  const base = path.basename(p.replace(/\\/g, "/"));
  if (ALLOWED.has(base)) return false;
  return base === ".env" || base.startsWith(".env.");
}

// Split a shell command into rough tokens and strip quotes/redirections.
function commandTokens(command) {
  return command
    .split(/[\s;|&<>()`]+/)
    .map((t) => t.replace(/^['"]+|['"]+$/g, "").replace(/^[0-9]*>+/, ""))
    .filter(Boolean)
    .flatMap((t) => (t.includes("=") ? t.split("=") : [t]));
}

function findViolation(toolName, input) {
  if (!input || typeof input !== "object") return null;

  if (toolName === "Bash") {
    const hit = commandTokens(String(input.command || "")).find(isEnvFile);
    return hit ? `Bash command references ${hit}` : null;
  }

  const candidates = [input.file_path, input.path, input.notebook_path];
  const hit = candidates.find(isEnvFile);
  return hit ? `${toolName} on ${hit}` : null;
}

function main(raw) {
  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    return 0;
  }
  const violation = findViolation(event.tool_name, event.tool_input);
  if (!violation) return 0;
  process.stderr.write(
    `protect-env: blocked (${violation}). .env files hold secrets and must not be ` +
      `read, edited or printed. Use .env.example for variable names.\n`
  );
  return 2;
}

if (require.main === module) {
  let raw = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => (raw += chunk));
  process.stdin.on("end", () => process.exit(main(raw)));
}

module.exports = { isEnvFile, findViolation, main };
