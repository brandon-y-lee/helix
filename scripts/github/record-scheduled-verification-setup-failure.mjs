import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { createRuntimeIdentity, fingerprint } from "./scheduled-verification-runtime.mjs";
import {
  createOperationalVerificationIssueAdapter,
  recordScheduledVerificationFailure,
  scheduledFailureFromClassifiedEvidence,
  scheduledVerificationIssueBody,
} from "./scheduled-verification-issue.mjs";

const execFileAsync = promisify(execFile);
const EXPECTED_REPOSITORY = "brandon-y-lee/mei-pelle";

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
  return scheduledVerificationIssueBody(failure, runUrl);
}

export function createScheduledFallbackFailure(input) {
  if (!input.classifiedEvidence) return createScheduledSetupFailure(input.setup);
  const failure = scheduledFailureFromClassifiedEvidence(input.classifiedEvidence);
  if (!failure) throw new Error("Scheduled verification classified evidence is invalid.");
  return failure;
}

async function main() {
  const repository = process.env.SCHEDULED_VERIFICATION_REPOSITORY;
  const runUrl = process.env.SCHEDULED_VERIFICATION_RUN_URL;
  const expectedRunPrefix = `https://github.com/${EXPECTED_REPOSITORY}/actions/runs/`;
  if (repository !== EXPECTED_REPOSITORY || !runUrl?.startsWith(expectedRunPrefix)) {
    throw new Error("Setup-failure recording requires the exact repository and workflow run URL.");
  }

  const cwd = process.cwd();
  const evidenceFile = process.env.SCHEDULED_VERIFICATION_EVIDENCE_FILE;
  let failure;
  if (evidenceFile) {
    failure = createScheduledFallbackFailure({
      classifiedEvidence: JSON.parse(await readFile(evidenceFile, "utf8")),
    });
  } else {
    const [{ stdout }, packageJsonSource, planSource] = await Promise.all([
      execFileAsync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8" }),
      readFile(`${cwd}/package.json`, "utf8"),
      readFile(`${cwd}/scripts/browser-verification-plan.ts`, "utf8"),
    ]);
    const packageJson = JSON.parse(packageJsonSource);
    const browserVersion = packageJson.devDependencies?.["@playwright/test"];
    if (!browserVersion) throw new Error("The pinned Playwright version is unavailable.");
    failure = createScheduledFallbackFailure({
      setup: {
        browserVersion,
        planSource,
        runtimeIdentity: createRuntimeIdentity({
          commitSha: String(stdout).trim(),
          environment: process.env,
          nodeVersion: process.version,
        }),
      },
    });
  }
  const commands = {
    async run(args) {
      const { stdout: commandOutput } = await execFileAsync("gh", args, {
        cwd,
        encoding: "utf8",
        env: process.env,
      });
      return { stdout: String(commandOutput) };
    },
  };
  await recordScheduledVerificationFailure(
    createOperationalVerificationIssueAdapter({ commands, repository, runUrl }),
    failure,
  );
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  main().catch((error) => {
    process.stderr.write(
      `scheduled-verification-fallback: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
