import { execFile } from "node:child_process";
import { appendFile, readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { createStorefrontBaseline, serializeStorefrontSnapshot } from "../../test-support/storefront-baseline";
import { createSupabaseStorefrontCatalogAdapter } from "../../test-support/supabase-storefront-catalog";
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
import { createRuntimeIdentity } from "./scheduled-verification-runtime.mjs";

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
  const [packageJsonSource, browserPlanSource] = await Promise.all([
    readFile(`${cwd}/package.json`, "utf8"),
    readFile(`${cwd}/scripts/browser-verification-plan.ts`, "utf8"),
  ]);
  const packageJson = JSON.parse(packageJsonSource) as {
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
    async onEvidenceClassified() {
      const githubEnvironment = process.env.GITHUB_ENV;
      if (githubEnvironment) {
        await appendFile(githubEnvironment, "SCHEDULED_VERIFICATION_RECORDED=1\n", "utf8");
      }
    },
    verification: createScheduledBrowserVerificationAdapter({
      browserVersion,
      readCatalogIdentity: () => readCatalogIdentity(environment),
      // The versioned source is also available before dependency installation,
      // allowing setup failures and browser runs to use the same plan identity.
      readPlanIdentity: () => browserPlanSource,
      async readRuntimeIdentity() {
        const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], {
          cwd,
          encoding: "utf8",
        });
        const commitSha = String(stdout).trim();
        return createRuntimeIdentity({
          commitSha,
          environment,
          nodeVersion: process.version,
        });
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
