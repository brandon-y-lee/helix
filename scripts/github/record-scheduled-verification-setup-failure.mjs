import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { createRuntimeIdentity, fingerprint } from "./scheduled-verification-runtime.mjs";

const execFileAsync = promisify(execFile);
const EXPECTED_REPOSITORY = "brandon-y-lee/mei-pelle";
const ISSUE_TITLE = "Scheduled WebKit verification failure";
const STATE_PREFIX = "<!-- mei-pelle:scheduled-webkit-state ";
const STATE_SUFFIX = " -->";

export function createScheduledSetupFailure(input) {
  return {
    kind: "setup-failed",
    identity: {
      browser: {
        name: "webkit",
        version: `playwright-webkit-${input.browserVersion}`,
      },
      catalogFingerprint: fingerprint("catalog-unavailable"),
      planFingerprint: fingerprint(input.planSource),
      runtimeFingerprint: fingerprint(input.runtimeIdentity),
    },
    summary: "Scheduled verification setup failed before complete WebKit evidence could run.",
  };
}

export function scheduledSetupFailureIssueBody(failure, runUrl) {
  return [
    "## Active scheduled verification failure",
    "",
    failure.summary,
    "",
    `Latest evidence: ${runUrl}`,
    "",
    "Production promotion remains blocked until matching clean WebKit evidence closes this issue.",
    "This state does not revert or remove code from `dev`.",
    "",
    `${STATE_PREFIX}${JSON.stringify(failure)}${STATE_SUFFIX}`,
  ].join("\n");
}

async function main() {
  const repository = process.env.SCHEDULED_VERIFICATION_REPOSITORY;
  const runUrl = process.env.SCHEDULED_VERIFICATION_RUN_URL;
  const expectedRunPrefix = `https://github.com/${EXPECTED_REPOSITORY}/actions/runs/`;
  if (repository !== EXPECTED_REPOSITORY || !runUrl?.startsWith(expectedRunPrefix)) {
    throw new Error("Setup-failure recording requires the exact repository and workflow run URL.");
  }

  const cwd = process.cwd();
  const [{ stdout }, packageJsonSource, planSource] = await Promise.all([
    execFileAsync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8" }),
    readFile(`${cwd}/package.json`, "utf8"),
    readFile(`${cwd}/scripts/browser-verification-plan.ts`, "utf8"),
  ]);
  const packageJson = JSON.parse(packageJsonSource);
  const browserVersion = packageJson.devDependencies?.["@playwright/test"];
  if (!browserVersion) throw new Error("The pinned Playwright version is unavailable.");

  const failure = createScheduledSetupFailure({
    browserVersion,
    planSource,
    runtimeIdentity: createRuntimeIdentity({
      commitSha: String(stdout).trim(),
      environment: process.env,
      nodeVersion: process.version,
    }),
  });
  const body = scheduledSetupFailureIssueBody(failure, runUrl);
  const { stdout: issueList } = await execFileAsync(
    "gh",
    [
      "issue", "list", "--repo", repository, "--state", "open",
      "--search", `${ISSUE_TITLE} in:title`, "--limit", "100",
      "--json", "number,title",
    ],
    { cwd, encoding: "utf8", env: process.env },
  );
  const active = JSON.parse(String(issueList)).filter((issue) => issue.title === ISSUE_TITLE);
  if (active.length > 1) {
    throw new Error("Multiple active scheduled WebKit failure issues require operator reconciliation.");
  }
  if (active[0]) {
    await execFileAsync(
      "gh",
      ["issue", "edit", String(active[0].number), "--repo", repository, "--body", body],
      { cwd, encoding: "utf8", env: process.env },
    );
  } else {
    await execFileAsync(
      "gh",
      ["issue", "create", "--repo", repository, "--title", ISSUE_TITLE, "--body", body],
      { cwd, encoding: "utf8", env: process.env },
    );
  }
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  main().catch((error) => {
    process.stderr.write(
      `scheduled-verification-setup: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
