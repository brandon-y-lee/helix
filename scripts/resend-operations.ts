import "dotenv/config";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCommand, parseManifest, runResendOperations } from "./resend-operations/operations";

const digest = (value: string) => createHash("sha256").update(value).digest("hex");
function privateFile(path: string) {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1_000_000 || (stat.mode & 0o077) !== 0
    || (process.getuid && stat.uid !== process.getuid())) throw new Error("Private owned files with restricted permissions are required.");
  return readFileSync(path, "utf8");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  (async () => {
    const input = parseCommand(process.argv.slice(2));
    const raw = privateFile(resolve(input.path));
    const manifest = parseManifest(JSON.parse(raw));
    const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
    const codeSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
    const clean = !execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim();
    const migrations = Object.fromEntries(manifest.migrations.map(item => [item.file, digest(readFileSync(resolve(root, "supabase/migrations", item.file), "utf8"))]));
    const evidence: Record<string, string> = {};
    for (const item of Object.values(manifest.evidence)) {
      try { evidence[item.file] = digest(privateFile(item.file)); } catch { /* The plan reports missing/changed private proof without exposing its content. */ }
    }
    let setupReceipt: unknown;
    try { setupReceipt = JSON.parse(privateFile(manifest.setupReceiptFile)); } catch { /* A plan can precede approved resource creation. */ }
    const report = await runResendOperations(input.command, raw, process.env, { codeSha, clean, migrations, evidence, setupReceipt }, fetch, input.confirmation);
    console.log(JSON.stringify(report, null, 2));
    if ("readyForGuardedApply" in report && !report.readyForGuardedApply) process.exitCode = 1;
  })().catch(() => {
    console.error("Resend operations failed. Check the exact private manifest, configuration, current provider state and approved action; inspect no raw provider payloads.");
    process.exitCode = 1;
  });
}
