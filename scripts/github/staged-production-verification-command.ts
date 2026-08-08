import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { promisify } from "node:util";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { chromium, webkit } from "@playwright/test";

import { getProducts } from "../../lib/catalog";
import { BROWSER_VERIFICATION_PLAN } from "../browser-verification-plan";
import {
  createNodeProductionVerificationAdapters,
  readProductionVerificationEnvironment,
} from "../production-verification-node";
import { runProductionVerificationCli } from "../production-verification-cli";
import type {
  StagedProductionDeployment,
  StagedProductionSourceIdentity,
  StagedProductionVerificationAdapters,
} from "./staged-production-verification";
import { prepareStagedProductionVerification } from "./staged-production-verification";
import {
  canonicalizeVerificationValue,
  fingerprintCatalog,
  fingerprintConfiguration,
  fingerprintRuntimeFiles,
  sha256Fingerprint,
} from "./verification-fingerprints";

type CommandResult = { stderr: string; stdout: string };
type CommandRunner = (
  command: string,
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv },
) => Promise<CommandResult>;

const execFileAsync = promisify(execFile);

const runCommand: CommandRunner = async (command, args, options) => {
  const result = await execFileAsync(command, args, {
    ...options,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  return { stderr: String(result.stderr), stdout: String(result.stdout) };
};

type VercelDeploymentResponse = {
  alias?: unknown;
  id?: unknown;
  readyState?: unknown;
  target?: unknown;
  url?: unknown;
};

function requireEnvironment(
  env: NodeJS.ProcessEnv,
  key: "VERCEL_ORG_ID" | "VERCEL_PROJECT_ID" | "VERCEL_TOKEN",
): string {
  const value = env[key]?.trim();
  if (!value) throw new Error(`Staged Production verification requires ${key}.`);
  return value;
}

function deploymentUrl(value: string): string {
  const url = value.startsWith("https://") ? value : `https://${value}`;
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    throw new Error("Vercel returned an invalid staged deployment URL.");
  }
  return parsed.origin;
}

function parseDeployment(payload: VercelDeploymentResponse) {
  if (
    typeof payload.id !== "string" ||
    typeof payload.url !== "string" ||
    payload.target !== "production"
  ) {
    throw new Error("Vercel did not return an exact Production deployment identity.");
  }
  if (payload.alias !== undefined && !Array.isArray(payload.alias)) {
    throw new Error("Vercel returned malformed deployment alias evidence.");
  }
  const productionDomains = (payload.alias ?? []).map((alias) => {
    if (typeof alias !== "string") {
      throw new Error("Vercel returned malformed deployment alias evidence.");
    }
    return alias;
  });
  return {
    id: payload.id,
    productionDomains,
    ready: payload.readyState === "READY",
    target: "production" as const,
    url: deploymentUrl(payload.url),
  };
}

export function createVercelStagedDeploymentAdapter(input: {
  cwd: string;
  env: NodeJS.ProcessEnv;
  fetch?: typeof globalThis.fetch;
  run: CommandRunner;
}): StagedProductionVerificationAdapters["deployment"] {
  const fetchDeployment = input.fetch ?? globalThis.fetch;
  const teamId = requireEnvironment(input.env, "VERCEL_ORG_ID");
  requireEnvironment(input.env, "VERCEL_PROJECT_ID");
  const token = requireEnvironment(input.env, "VERCEL_TOKEN");

  const inspect = async (idOrUrl: string) => {
    const endpoint = new URL(
      `https://api.vercel.com/v13/deployments/${encodeURIComponent(idOrUrl)}`,
    );
    endpoint.searchParams.set("teamId", teamId);
    const response = await fetchDeployment(endpoint, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      throw new Error(`Vercel deployment inspection failed with status ${response.status}.`);
    }
    return parseDeployment(await response.json() as VercelDeploymentResponse);
  };

  return {
    async create(request) {
      const result = await input.run(
        "pnpm",
        [
          "exec",
          "vercel",
          "deploy",
          "--prod",
          "--skip-domain",
          "--yes",
          "--no-color",
          "--meta",
          `githubCommitSha=${request.candidateSha}`,
        ],
        { cwd: input.cwd, env: input.env },
      );
      const generatedUrl = deploymentUrl(result.stdout.trim());
      const inspected = await inspect(new URL(generatedUrl).host);
      const deployment: StagedProductionDeployment = {
        id: inspected.id,
        target: inspected.target,
        url: inspected.url,
      };
      return deployment;
    },
    inspect,
  };
}

async function readTrackedRuntimeFiles(cwd: string, env: NodeJS.ProcessEnv) {
  const { stdout } = await runCommand("git", ["ls-files", "-z"], { cwd, env });
  const paths = stdout.split("\0").filter(Boolean);
  return Promise.all(paths.map(async (path) => ({
    contents: (await readFile(resolve(cwd, path))).toString("base64"),
    path,
  })));
}

async function readExecutableVersion(executablePath: string, cwd: string, env: NodeJS.ProcessEnv) {
  const result = await runCommand(executablePath, ["--version"], { cwd, env });
  const version = `${result.stdout}\n${result.stderr}`.trim().split("\n").find(Boolean)?.trim();
  if (!version) throw new Error("Staged Production verification could not read a browser version.");
  return version;
}

async function readWebkitVersion(cwd: string): Promise<string> {
  const candidateRequire = createRequire(resolve(cwd, "node_modules/@playwright/test/package.json"));
  const coreEntry = candidateRequire.resolve("playwright-core");
  const manifest = JSON.parse(
    await readFile(resolve(dirname(coreEntry), "browsers.json"), "utf8"),
  ) as {
    browsers?: Array<{ browserVersion?: unknown; name?: unknown; revision?: unknown }>;
  };
  const webkitManifest = manifest.browsers?.find(({ name }) => name === "webkit");
  if (
    typeof webkitManifest?.browserVersion !== "string" ||
    typeof webkitManifest.revision !== "string"
  ) {
    throw new Error("Staged Production verification could not read the WebKit identity.");
  }
  const installedRevision = /webkit[^/]*-(\d+)\//.exec(webkit.executablePath())?.[1];
  return `WebKit ${webkitManifest.browserVersion} (revision ${
    installedRevision ?? webkitManifest.revision
  })`;
}

async function readPackageVersion(cwd: string, path: string): Promise<string> {
  const parsed = JSON.parse(await readFile(resolve(cwd, path), "utf8")) as { version?: unknown };
  if (typeof parsed.version !== "string" || !parsed.version.trim()) {
    throw new Error(`Staged Production verification could not read ${path}.`);
  }
  return parsed.version;
}

function createSourceAdapter(input: { cwd: string; env: NodeJS.ProcessEnv }) {
  return {
    async read(deployment: StagedProductionDeployment): Promise<StagedProductionSourceIdentity> {
      const [{ stdout: candidate }, files, chromiumVersion, webkitVersion, nextVersion, playwrightVersion] =
        await Promise.all([
          runCommand("git", ["rev-parse", "HEAD"], input),
          readTrackedRuntimeFiles(input.cwd, input.env),
          readExecutableVersion(chromium.executablePath(), input.cwd, input.env),
          readWebkitVersion(input.cwd),
          readPackageVersion(input.cwd, "node_modules/next/package.json"),
          readPackageVersion(input.cwd, "node_modules/@playwright/test/package.json"),
        ]);
      const packageJson = JSON.parse(
        await readFile(resolve(input.cwd, "package.json"), "utf8"),
      ) as { packageManager?: unknown };
      if (typeof packageJson.packageManager !== "string") {
        throw new Error("Staged Production verification requires a package manager identity.");
      }
      return {
        artifact: {
          buildId: deployment.id,
          configurationFingerprint: fingerprintConfiguration(input.env),
          runtimeFingerprint: fingerprintRuntimeFiles(files),
        },
        browsers: { chromium: chromiumVersion, webkit: webkitVersion },
        candidateSha: candidate.trim(),
        planFingerprint: sha256Fingerprint(
          canonicalizeVerificationValue(BROWSER_VERIFICATION_PLAN),
        ),
        tools: {
          framework: nextVersion,
          node: process.version,
          packageManager: packageJson.packageManager,
          playwright: playwrightVersion,
        },
      };
    },
  };
}

async function createBrowserAdapter(input: {
  cwd: string;
  env: NodeJS.ProcessEnv;
  signal?: AbortSignal;
}): Promise<StagedProductionVerificationAdapters["browser"]> {
  const environment = await readProductionVerificationEnvironment(input.cwd, input.env);
  const telemetryPath = environment.PLAYWRIGHT_JSON_OUTPUT_FILE?.trim();
  const projectEnvironment = (project: "chromium" | "webkit") => ({
    ...environment,
    ...(telemetryPath
      ? { PLAYWRIGHT_JSON_OUTPUT_FILE: telemetryPath.replace(/\.json$/, `-${project}.json`) }
      : {}),
  });
  const [chromiumVerification, webkitVerification] = await Promise.all([
    createNodeProductionVerificationAdapters(input.cwd, projectEnvironment("chromium")),
    createNodeProductionVerificationAdapters(input.cwd, projectEnvironment("webkit")),
  ]);
  const journeyIds = BROWSER_VERIFICATION_PLAN.journeys.map(({ id }) => id);
  return {
    async verify({ deployment }) {
      const attempts = { chromium: 0, webkit: 0 };
      try {
        const chromiumResult = await chromiumVerification.runBrowserTests({
          baseURL: deployment.url,
          selection: { journeyIds, projects: ["chromium"], retries: 0 },
          signal: input.signal,
        });
        attempts.chromium = (chromiumResult?.retries ?? 0) + 1;
        const webkitResult = await webkitVerification.runBrowserTests({
          baseURL: deployment.url,
          selection: {
            journeyIds,
            projects: ["webkit"],
            retries: 0,
            webkitJourneyIds: journeyIds,
          },
          signal: input.signal,
        });
        attempts.webkit = (webkitResult?.retries ?? 0) + 1;
        return { attempts, outcome: "passed" as const };
      } catch (error) {
        const retries = (error as { retryCount?: unknown }).retryCount;
        if (attempts.chromium === 0) {
          attempts.chromium = (typeof retries === "number" ? retries : 0) + 1;
        } else {
          attempts.webkit = (typeof retries === "number" ? retries : 0) + 1;
        }
        return {
          attempts,
          outcome: input.signal?.aborted ? "cancelled" as const : "failed" as const,
        };
      }
    },
  };
}

export async function runStagedProductionVerificationCommand(input: {
  candidateSha: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
  evidencePath: string;
  receiptPath: string;
  signal?: AbortSignal;
  workflowRun: string;
}) {
  const result = await prepareStagedProductionVerification(
    { candidateSha: input.candidateSha, workflowRun: input.workflowRun },
    {
      browser: await createBrowserAdapter(input),
      catalog: {
        async fingerprint() { return fingerprintCatalog(await getProducts()); },
      },
      clock: { now: () => new Date().toISOString() },
      deployment: createVercelStagedDeploymentAdapter({
        cwd: input.cwd,
        env: input.env,
        run: runCommand,
      }),
      source: createSourceAdapter(input),
    },
  );
  await writeFile(input.evidencePath, `${JSON.stringify(result)}\n`, { encoding: "utf8", mode: 0o600 });
  if (result.outcome !== "passed") {
    throw new Error(`Staged Production verification failed: ${result.outcome}.`);
  }
  await writeFile(input.receiptPath, `${JSON.stringify(result.receipt)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  return result;
}

function readArguments(argv: string[]) {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || !value || value.startsWith("--")) {
      throw new Error("Staged Production verification requires named value arguments.");
    }
    values.set(key, value);
  }
  const candidateSha = values.get("--candidate-sha");
  const evidencePath = values.get("--evidence-path");
  const receiptPath = values.get("--receipt-path");
  if (
    values.size !== 3 ||
    !candidateSha ||
    !/^[0-9a-f]{40}$/.test(candidateSha) ||
    !evidencePath ||
    !receiptPath
  ) {
    throw new Error("Staged Production verification arguments are invalid.");
  }
  return { candidateSha, evidencePath, receiptPath };
}

if (process.argv[1]?.endsWith("staged-production-verification-command.ts")) {
  runProductionVerificationCli(async (signal) => {
    if (process.env.CI !== "true" || process.env.GITHUB_ACTIONS !== "true") {
      throw new Error("Staged Production verification is restricted to GitHub Actions.");
    }
    const args = readArguments(process.argv.slice(2));
    const workflowRun = `${process.env.GITHUB_RUN_ID ?? ""}-${process.env.GITHUB_RUN_ATTEMPT ?? ""}`;
    if (!/^\d+-\d+$/.test(workflowRun)) {
      throw new Error("Staged Production verification requires a workflow run identity.");
    }
    await runStagedProductionVerificationCommand({
      ...args,
      cwd: process.cwd(),
      env: process.env,
      signal,
      workflowRun,
    });
  });
}
