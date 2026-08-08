import { execFile } from "node:child_process";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import {
  runWindowsLifecycleVerification,
  type WindowsLifecycleSource,
} from "./verification-orchestrator";

const execFileAsync = promisify(execFile);

function readSource(value: string | undefined): WindowsLifecycleSource {
  if (value === "pull_request" || value === "schedule" || value === "workflow_dispatch") {
    return value;
  }
  throw new Error("Windows lifecycle verification requires an approved workflow event.");
}

async function readChangedFiles(
  source: WindowsLifecycleSource,
  baseSha: string | undefined,
): Promise<string[]> {
  if (source !== "pull_request") return [];
  if (!baseSha || !/^[0-9a-f]{40}$/i.test(baseSha)) {
    throw new Error("Windows lifecycle pull-request verification requires an exact base commit.");
  }
  const { stdout } = await execFileAsync(
    "git",
    ["diff", "--name-only", "--diff-filter=ACDMRTUXB", baseSha, "HEAD", "--"],
    { cwd: process.cwd(), encoding: "utf8" },
  );
  return String(stdout).split("\n").map((path) => path.trim()).filter(Boolean);
}

async function main(): Promise<void> {
  const source = readSource(process.env.WINDOWS_LIFECYCLE_SOURCE);
  const report = await runWindowsLifecycleVerification(
    {
      changedFiles: await readChangedFiles(
        source,
        process.env.WINDOWS_LIFECYCLE_BASE_SHA,
      ),
      source,
    },
    {
      async verifyLifecycle() {
        const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
        await execFileAsync(
          command,
          [
            "vitest",
            "run",
            "tests/production-verification.test.ts",
            "tests/production-verification-process.test.ts",
          ],
          { cwd: process.cwd(), encoding: "utf8", env: process.env },
        );
        return { outcome: "passed" };
      },
    },
  );
  process.stdout.write(`${JSON.stringify(report)}\n`);
  if (report.outcome === "failed") process.exitCode = 1;
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `windows-lifecycle-verification: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
