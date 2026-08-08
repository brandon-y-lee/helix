import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const verificationSystemPathPrefixes = [
  ".github/workflows/",
  ".nvmrc",
  "package.json",
  "playwright.config.ts",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "tsconfig.json",
  "vitest.config.ts",
  "vitest.setup.ts",
  "scripts/affected-browser-verification",
  "scripts/browser-verification-plan",
  "scripts/github/",
  "scripts/production-verification",
  "scripts/verify-affected",
  "scripts/verify-production",
  "tests/affected-browser-verification",
  "tests/github-workflow-tools",
  "tests/helpers/production-verification",
  "tests/integration-",
  "tests/prepare-integration-candidate",
  "tests/production-verification",
  "tests/routine-browser-verification",
  "tests/spec-integration-lifecycle",
  "tests/spec-lifecycle-adapters",
  "tests/spec-ruleset",
  "tests/verification-",
];

export function isVerificationSystemPath(path) {
  return verificationSystemPathPrefixes.some((prefix) => path.startsWith(prefix));
}

export function hasVerificationSystemPath(paths) {
  return paths.some(isVerificationSystemPath);
}

const entryPath = process.argv[1];
if (entryPath && import.meta.url === pathToFileURL(entryPath).href) {
  const changedFilesPath = process.argv[2];
  if (!changedFilesPath) {
    console.error("usage: node scripts/github/verification-system-paths.mjs <changed-files-file>");
    process.exitCode = 2;
  } else {
    const changedFiles = readFileSync(changedFilesPath, "utf8")
      .split("\n")
      .filter(Boolean);
    process.stdout.write(`${hasVerificationSystemPath(changedFiles)}\n`);
  }
}
