import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { createStorefrontBaseline, serializeStorefrontSnapshot } from "../../test-support/storefront-baseline";
import { createSupabaseStorefrontCatalogAdapter } from "../../test-support/supabase-storefront-catalog";
import { BROWSER_VERIFICATION_PLAN } from "../browser-verification-plan";
import {
  createNodeProductionVerificationAdapters,
  readProductionVerificationEnvironment,
} from "../production-verification-node";
import { verifyFreshProductionArtifact } from "../production-verification";
import {
  createOperationalVerificationIssueAdapter,
  createScheduledBrowserVerificationAdapter,
  runScheduledBrowserVerificationCommand,
  type ScheduledVerificationGitHubCommandAdapter,
} from "./scheduled-browser-verification";

const execFileAsync = promisify(execFile);
const EXPECTED_REPOSITORY = "brandon-y-lee/mei-pelle";
const CATALOG_READ_TIMEOUT_MS = 10_000;

const githubCommands: ScheduledVerificationGitHubCommandAdapter = {
  async run(args) {
    const { stdout } = await execFileAsync("gh", args, {
      cwd: process.cwd(),
      encoding: "utf8",
      env: process.env,
    });
    return { stdout: String(stdout) };
  },
};

async function readCatalogIdentity(env: NodeJS.ProcessEnv): Promise<string> {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("Scheduled verification requires approved Catalog read credentials.");
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CATALOG_READ_TIMEOUT_MS);
  try {
    const snapshot = await createStorefrontBaseline(
      createSupabaseStorefrontCatalogAdapter({
        anonKey,
        signal: controller.signal,
        url,
      }),
    );
    return serializeStorefrontSnapshot(snapshot);
  } finally {
    clearTimeout(timeout);
  }
}

async function main(): Promise<void> {
  const repository = process.env.SCHEDULED_VERIFICATION_REPOSITORY;
  const runUrl = process.env.SCHEDULED_VERIFICATION_RUN_URL;
  if (repository !== EXPECTED_REPOSITORY || !runUrl) {
    throw new Error("Scheduled verification requires the exact repository and workflow run URL.");
  }
  const expectedRunPrefix = `https://github.com/${EXPECTED_REPOSITORY}/actions/runs/`;
  if (!runUrl.startsWith(expectedRunPrefix)) {
    throw new Error("Scheduled verification received an invalid workflow run URL.");
  }

  const cwd = process.cwd();
  const environment = await readProductionVerificationEnvironment(cwd);
  const production = await createNodeProductionVerificationAdapters(cwd, environment);
  const packageJson = JSON.parse(await readFile(`${cwd}/package.json`, "utf8")) as {
    devDependencies?: Record<string, string>;
  };
  const browserVersion = packageJson.devDependencies?.["@playwright/test"];
  if (!browserVersion) throw new Error("The pinned Playwright version is unavailable.");

  const report = await runScheduledBrowserVerificationCommand({
    argv: process.argv.slice(2),
    issues: createOperationalVerificationIssueAdapter({
      commands: githubCommands,
      repository,
      runUrl,
    }),
    log: (message) => process.stdout.write(`${message}\n`),
    verification: createScheduledBrowserVerificationAdapter({
      browserVersion,
      readCatalogIdentity: () => readCatalogIdentity(environment),
      readPlanIdentity: () => JSON.stringify(BROWSER_VERIFICATION_PLAN),
      async readRuntimeSha() {
        const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], {
          cwd,
          encoding: "utf8",
        });
        return String(stdout).trim();
      },
      async verifyProduction(selection) {
        await verifyFreshProductionArtifact(
          { browserSelection: selection },
          production,
        );
      },
    }),
  });
  if (report.productionPromotion === "blocked") process.exitCode = 1;
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `scheduled-verification: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
