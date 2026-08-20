import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { config as loadDotEnv } from "dotenv";
import {
  HELIX_REBRAND_CHECKS,
  auditActiveLegacyNames,
  runHelixRebrandChecks,
  type AuditedFile,
  type HelixRebrandExecutableCheck,
} from "./helix-rebrand-verification";

type CommandOutput = Readonly<{
  code: number;
  stdout: string;
}>;

function runCommand(
  command: string,
  args: readonly string[],
  cwd: string,
  stdio: "inherit" | "pipe",
): Promise<CommandOutput> {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, [...args], {
      cwd,
      env: process.env,
      stdio: stdio === "inherit" ? "inherit" : ["ignore", "pipe", "inherit"],
    });
    let stdout = "";
    if (stdio === "pipe") {
      child.stdout?.setEncoding("utf8");
      child.stdout?.on("data", (chunk: string) => {
        stdout += chunk;
      });
    }
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (signal) {
        reject(new Error(`${command} was interrupted by ${signal}.`));
        return;
      }
      resolveRun({ code: code ?? 1, stdout });
    });
  });
}

async function loadAuditedFiles(cwd: string): Promise<AuditedFile[]> {
  const listed = await runCommand(
    "git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    cwd,
    "pipe",
  );
  if (listed.code !== 0) {
    throw new Error("Unable to enumerate tracked and pending repository files.");
  }

  const files = await Promise.all(
    listed.stdout
      .split("\0")
      .filter(Boolean)
      .sort()
      .map(async (path) => {
        const buffer = await readFile(resolve(cwd, path)).catch((error: NodeJS.ErrnoException) => {
          if (error.code === "ENOENT") return null;
          throw error;
        });
        if (buffer === null) return null;
        return {
          path,
          content: buffer.includes(0) ? "" : buffer.toString("utf8"),
        };
      }),
  );
  return files.filter((file): file is AuditedFile => file !== null);
}

async function loadHistoricalMigrationPaths(cwd: string): Promise<ReadonlySet<string>> {
  const listed = await runCommand(
    "git",
    ["ls-tree", "-r", "--name-only", "dev", "--", "supabase/migrations"],
    cwd,
    "pipe",
  );
  if (listed.code !== 0) {
    throw new Error("Unable to enumerate immutable migration history from dev.");
  }
  return new Set([
    ...listed.stdout.split("\n").filter(Boolean),
    "supabase/migrations/20260819233842_complete_helix_rebrand_database_audit.sql",
  ]);
}

async function executeCheck(
  check: HelixRebrandExecutableCheck,
  cwd: string,
): Promise<void> {
  console.log(`\n[${check.category}] ${check.label}`);
  if (check.kind === "static-audit") {
    const findings = auditActiveLegacyNames(
      await loadAuditedFiles(cwd),
      await loadHistoricalMigrationPaths(cwd),
    );
    if (findings.length > 0) {
      const detail = findings
        .map(
          ({ path, line, variant }) =>
            `${path}${line > 0 ? `:${line}` : ""} (${variant})`,
        )
        .join("\n");
      throw new Error(`Active-name audit found ${findings.length} result(s):\n${detail}`);
    }
    return;
  }

  const result = await runCommand("pnpm", check.args, cwd, "inherit");
  if (result.code !== 0) {
    throw new Error(`pnpm ${check.args.join(" ")} exited with code ${result.code}.`);
  }
}

function selectedChecks(argv: readonly string[]): readonly HelixRebrandExecutableCheck[] {
  if (argv.includes("--audit-only")) {
    return HELIX_REBRAND_CHECKS.filter(({ kind }) => kind === "static-audit");
  }
  if (argv.includes("--local")) {
    return HELIX_REBRAND_CHECKS.filter(({ scope }) => scope === "local");
  }
  return HELIX_REBRAND_CHECKS;
}

async function main(): Promise<void> {
  const cwd = process.cwd();
  loadDotEnv({
    path: resolve(
      process.env.HELIX_REBRAND_ENV_FILE?.trim() || resolve(cwd, ".env.local"),
    ),
    quiet: true,
  });

  const report = await runHelixRebrandChecks(
    selectedChecks(process.argv.slice(2)),
    (check) => executeCheck(check, cwd),
  );
  console.log(`\n${JSON.stringify(report, null, 2)}`);
  if (!report.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
