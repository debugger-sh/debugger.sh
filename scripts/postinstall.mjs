/**
 * Bring up local Supabase after install and write its public URL and key
 * into .env.local. Skipped by CI.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

if (process.env.CI) process.exit(0);

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function run(args, capture) {
  const result = spawnSync("npx", args, {
    cwd: root,
    encoding: "utf8",
    stdio: capture ? ["inherit", "pipe", "inherit"] : "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
  return result.stdout ?? "";
}

function unquote(value) {
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1);
  }
  return value;
}

function parseEnv(text) {
  const vars = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).replace(/^export\s+/, "");
    vars[key] = unquote(trimmed.slice(eq + 1));
  }
  return vars;
}

function upsertEnv(path, updates) {
  const original = existsSync(path) ? readFileSync(path, "utf8") : "";
  const newline = original.includes("\r\n") ? "\r\n" : "\n";
  const lines = original.length ? original.split(/\r?\n/) : [];
  if (lines.at(-1) === "") lines.pop();

  const seen = new Set();
  const next = lines.map((line) => {
    const match = line.match(
      /^(\s*)(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/
    );
    if (!match || !(match[2] in updates)) return line;
    seen.add(match[2]);
    return `${match[1]}${match[2]}=${updates[match[2]]}`;
  });
  for (const [name, value] of Object.entries(updates)) {
    if (!seen.has(name)) next.push(`${name}=${value}`);
  }
  writeFileSync(path, next.join(newline) + newline);
}

run(["supabase", "start"]);
const status = parseEnv(run(["supabase", "status", "-o", "env"], true));
const url = status.API_URL;
const key = status.PUBLISHABLE_KEY;
if (!url || !key) {
  console.error("supabase status did not include API_URL and PUBLISHABLE_KEY");
  process.exit(1);
}

const envPath = join(root, ".env.local");
upsertEnv(envPath, {
  NEXT_PUBLIC_SUPABASE_URL: url,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key,
});
console.log("Updated .env.local");
