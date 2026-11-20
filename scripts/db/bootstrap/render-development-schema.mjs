import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

// This command renders SQL for the guarded development installer. It never opens a database.
const root = new URL("../../../", import.meta.url);
const directory = new URL("supabase/bootstrap/development/", root);
const parent = "erasogmsqpgiirovubjh";
const child = "zyfkunnpnlmgvrojmrbg";
const mediaBodies = new Map([
  ["94bb6a756ad154f2e6f462acba7b47e06af3e395fc78cf8f71c25e457a7c5c94", 1], // draft media guard
  ["31f600f6bdb93d8597cb4e7b46a17ea32e0ecea2084807c613fa2378a698d984", 2], // URL validator
  ["88264a174508b665ae012aac8a1bcb64b0f89c44af570a06e0082320d1a47e64", 2], // media cutover
]);
const sourceFiles = new Map();

function readSource(path) {
  if (!/^supabase\/(migrations|tests\/checkpoints)\/[a-z0-9_-]+\.sql$/.test(path)) {
    throw new Error("Unexpected bootstrap source path");
  }
  if (!sourceFiles.has(path)) sourceFiles.set(path, readFileSync(new URL(path, root)));
  return sourceFiles.get(path);
}

function verifyHash(bytes, expected, location) {
  if (createHash("sha256").update(bytes).digest("hex") !== expected) {
    throw new Error(`Bootstrap source hash mismatch in ${location}`);
  }
}

function renderApplication() {
  // Only the dollar-quoted body is referenced. Signature, security, search_path, owner
  // assumptions and grants belong to the final-state schema beside the reference.
  const bodyMarker = /^-- @body (\S+) (\d+) (\d+) (\d+) ([a-f0-9]{64})( child-media)?$/gm;
  const seenMedia = new Set();
  const template = readFileSync(new URL("application.sql.in", directory), "utf8");
  const application = template.replace(bodyMarker, (_, path, line, offset, length, digest, isMedia) => {
    const bytes = readSource(path).subarray(Number(offset), Number(offset) + Number(length));
    verifyHash(bytes, digest, `${path}:${line}`);
    let body = bytes.toString("utf8");
    if (isMedia) {
      const occurrences = body.split(parent).length - 1;
      if (seenMedia.has(digest) || mediaBodies.get(digest) !== occurrences) {
        throw new Error("Unexpected source definition for the development media binding");
      }
      seenMedia.add(digest);
      body = body.replaceAll(parent, child);
    }
    if (body.includes("$helix_body$")) throw new Error("Function body delimiter collision");
    return "    AS $helix_body$" + body + "$helix_body$;";
  });
  if (
    application.includes("-- @body") ||
    application.includes(parent) ||
    seenMedia.size !== mediaBodies.size
  ) {
    throw new Error("Incomplete development application schema");
  }
  return [
    application,
    ...["privileges.sql", "platform.sql"].map((path) => readFileSync(new URL(path, directory), "utf8")),
  ].join("\n");
}

function renderDevelopmentChanges() {
  const changes = JSON.parse(readFileSync(new URL("dev-changes.json", directory), "utf8"));
  let previousVersion = "";
  return changes
    .map(({ path, version, sha256, transaction }) => {
      if (!path.startsWith(`supabase/migrations/${version}_`) || version <= previousVersion) {
        throw new Error("Development changes must be unique and ordered by migration version");
      }
      previousVersion = version;
      const bytes = readSource(path);
      verifyHash(bytes, sha256, path);
      let sql = bytes.toString("utf8").trim();
      if (transaction === "source") {
        // The sole explicitly wrapped, hash-pinned consent migration participates in
        // the installer's atomic transaction along with the rest of the dev changes.
        if (!sql.startsWith("BEGIN;\n") || !sql.endsWith("\nCOMMIT;")) {
          throw new Error(`Unexpected transaction boundaries in ${path}`);
        }
        sql = sql.slice("BEGIN;\n".length, -"\nCOMMIT;".length);
      } else if (transaction !== "caller") {
        throw new Error(`Unknown transaction policy in ${path}`);
      }
      if (version === "20260819233842") {
        sql = sql.replace(/^set lock_timeout = '10s';\nset statement_timeout = '120s';\n/, "");
      }
      return `-- ${path}\n${sql}\n`;
    })
    .join("\n");
}

const args = process.argv.slice(2);
if (args.length === 0) {
  process.stdout.write(renderApplication());
} else if (args.length === 1 && args[0] === "--dev-changes") {
  process.stdout.write(renderDevelopmentChanges());
} else {
  throw new Error("Usage: node scripts/db/bootstrap/render-development-schema.mjs [--dev-changes]");
}
