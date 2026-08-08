import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { promisify } from "node:util";
import { readFile, rm, writeFile } from "node:fs/promises";
import { isIP } from "node:net";
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
  StagedProductionReceipt,
  StagedProductionSourceIdentity,
  StagedProductionVerificationAdapters,
} from "./staged-production-verification";
import {
  prepareStagedProductionVerification,
  STAGED_PRODUCTION_RECEIPT_PREDICATE_TYPE,
  verifyPreparedStagedProductionReceipt,
  verifySignedStagedProductionPredicate,
} from "./staged-production-verification";
import {
  canonicalizeVerificationValue,
  fingerprintCatalog,
  fingerprintPublicConfiguration,
  fingerprintRuntimeFiles,
  PUBLIC_RUNTIME_CONFIGURATION_KEYS,
  sha256Fingerprint,
} from "./verification-fingerprints";

type CommandResult = { stderr: string; stdout: string };
type CommandRunner = (
  command: string,
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv; signal?: AbortSignal },
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
  meta?: unknown;
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

export function requireProductionSiteUrl(env: NodeJS.ProcessEnv): void {
  const value = env.NEXT_PUBLIC_SITE_URL?.trim();
  let url: URL | undefined;
  try {
    url = new URL(value ?? "");
  } catch {
    // The shared fail-closed error below owns diagnostics.
  }
  const hostname = url?.hostname.replace(/^\[|\]$/g, "").toLowerCase() ?? "";
  if (
    !url || url.protocol !== "https:" || url.origin !== value ||
    hostname === "localhost" || hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") || isIP(hostname) !== 0
  ) {
    throw new Error("Staged Production verification requires the exact HTTPS Production site URL.");
  }
}

function interrupted(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    const fail = () => reject(new Error(
      signal.reason === "staged-production-timeout"
        ? "Staged Production verification reached its owned timeout."
        : "Staged Production verification was cancelled.",
    ));
    if (signal.aborted) fail();
    else signal.addEventListener("abort", fail, { once: true });
  });
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
  const metadata = payload.meta;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    throw new Error("Vercel did not return deployment source metadata.");
  }
  const candidateSha = (metadata as Record<string, unknown>).githubCommitSha;
  if (typeof candidateSha !== "string" || !/^[0-9a-f]{40}$/.test(candidateSha)) {
    throw new Error("Vercel did not return an exact deployment source identity.");
  }
  return {
    candidateSha,
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
  expectedSourceSha?: string;
  readSourceIdentity(buildId: string): Promise<StagedProductionSourceIdentity>;
  run: CommandRunner;
  signal?: AbortSignal;
}): StagedProductionVerificationAdapters["deployment"] {
  const fetchDeployment = input.fetch ?? globalThis.fetch;
  const teamId = requireEnvironment(input.env, "VERCEL_ORG_ID");
  requireEnvironment(input.env, "VERCEL_PROJECT_ID");
  const token = requireEnvironment(input.env, "VERCEL_TOKEN");

  const expectedSources = new Map<string, string>();
  const inspectExact = async (idOrUrl: string, expectedSha?: string) => {
    const endpoint = new URL(
      `https://api.vercel.com/v13/deployments/${encodeURIComponent(idOrUrl)}`,
    );
    endpoint.searchParams.set("teamId", teamId);
    const response = await fetchDeployment(endpoint, {
      headers: { Authorization: `Bearer ${token}` },
      signal: input.signal,
    });
    if (!response.ok) {
      throw new Error(`Vercel deployment inspection failed with status ${response.status}.`);
    }
    const deployment = parseDeployment(await response.json() as VercelDeploymentResponse);
    const requiredSha = expectedSha ?? expectedSources.get(deployment.id) ?? input.expectedSourceSha;
    if (!requiredSha || deployment.candidateSha !== requiredSha) {
      throw new Error("Vercel deployment source metadata does not match the requested candidate.");
    }
    const { candidateSha: _candidateSha, ...verifiedDeployment } = deployment;
    return verifiedDeployment;
  };

  return {
    async create(request) {
      requireProductionSiteUrl(input.env);
      const buildId = randomUUID();
      const identity = await input.readSourceIdentity(buildId);
      if (identity.candidateSha !== request.candidateSha) {
        throw new Error("The local source identity does not match the deployment request.");
      }
      const publicConfigurationKeys = [
        ...PUBLIC_RUNTIME_CONFIGURATION_KEYS,
        ...Object.keys(input.env).filter((key) => key.startsWith("NEXT_PUBLIC_")),
      ].filter((key, index, values) => values.indexOf(key) === index);
      const publicConfigurationArgs = publicConfigurationKeys.flatMap((key) => {
        const argument = input.env[key] === undefined ? `${key}=` : key;
        return ["--build-env", argument, "--env", argument];
      });
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
          ...publicConfigurationArgs,
          "--build-env",
          `MEI_PELLE_VERIFICATION_BUILD_ID=${buildId}`,
          "--env",
          `MEI_PELLE_VERIFICATION_BUILD_ID=${buildId}`,
          "--build-env",
          `MEI_PELLE_VERIFICATION_SOURCE_SHA=${identity.candidateSha}`,
          "--env",
          `MEI_PELLE_VERIFICATION_SOURCE_SHA=${identity.candidateSha}`,
          "--build-env",
          `MEI_PELLE_VERIFICATION_RUNTIME_FINGERPRINT=${identity.artifact.runtimeFingerprint}`,
          "--env",
          `MEI_PELLE_VERIFICATION_RUNTIME_FINGERPRINT=${identity.artifact.runtimeFingerprint}`,
          "--meta",
          `githubCommitSha=${request.candidateSha}`,
        ],
        { cwd: input.cwd, env: input.env, signal: input.signal },
      );
      const generatedUrl = deploymentUrl(result.stdout.trim());
      const inspected = await inspectExact(new URL(generatedUrl).host, request.candidateSha);
      expectedSources.set(inspected.id, request.candidateSha);
      const deployment: StagedProductionDeployment = {
        id: inspected.id,
        target: inspected.target,
        url: inspected.url,
      };
      return deployment;
    },
    inspect(id) { return inspectExact(id); },
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

type ServedArtifactManifest = StagedProductionSourceIdentity["artifact"] & {
  candidateSha: string;
};

function createSourceAdapter(input: {
  cwd: string;
  env: NodeJS.ProcessEnv;
  fetch?: typeof globalThis.fetch;
  signal?: AbortSignal;
}) {
  const readLocal = async (buildId: string): Promise<StagedProductionSourceIdentity> => {
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
        buildId,
        configurationFingerprint: fingerprintPublicConfiguration(input.env),
        runtimeFingerprint: fingerprintRuntimeFiles(files),
      },
      browsers: { chromium: chromiumVersion, webkit: webkitVersion },
      candidateSha: candidate.trim(),
      planFingerprint: sha256Fingerprint(canonicalizeVerificationValue(BROWSER_VERIFICATION_PLAN)),
      tools: {
        framework: nextVersion,
        node: process.version,
        packageManager: packageJson.packageManager,
        playwright: playwrightVersion,
      },
    };
  };
  return {
    readLocal,
    async read(deployment: StagedProductionDeployment): Promise<StagedProductionSourceIdentity> {
      const response = await (input.fetch ?? globalThis.fetch)(
        new URL("/api/verification/artifact", deployment.url),
        { headers: { Accept: "application/json" }, signal: input.signal },
      );
      if (!response.ok) {
        throw new Error(`Staged artifact identity request failed with status ${response.status}.`);
      }
      const manifest = await response.json() as ServedArtifactManifest;
      const local = await readLocal(manifest.buildId);
      if (
        manifest.candidateSha !== local.candidateSha ||
        manifest.configurationFingerprint !== local.artifact.configurationFingerprint ||
        manifest.runtimeFingerprint !== local.artifact.runtimeFingerprint ||
        !manifest.buildId?.trim()
      ) {
        throw new Error("The served staged artifact does not match the current source and configuration.");
      }
      const { candidateSha: _candidateSha, ...artifact } = manifest;
      return { ...local, artifact };
    },
  };
}

async function readReceipt(path: string): Promise<StagedProductionReceipt> {
  const receipt = JSON.parse(await readFile(path, "utf8")) as StagedProductionReceipt;
  let receiptUrl: URL | undefined;
  try {
    receiptUrl = new URL(receipt?.deployment?.url ?? "");
  } catch {
    // The shared malformed-receipt failure below owns diagnostics.
  }
  if (
    !receipt || typeof receipt !== "object" ||
    !/^[0-9a-f]{40}$/.test(receipt.source?.candidateSha ?? "") ||
    !receipt.deployment?.id?.trim() || receiptUrl?.protocol !== "https:" ||
    !receiptUrl.hostname.endsWith(".vercel.app") || receiptUrl.origin !== receipt.deployment.url
  ) {
    throw new Error("Production Receipt is malformed.");
  }
  return receipt;
}

export async function reconstructStagedProductionReceipt(input: {
  cwd: string;
  env: NodeJS.ProcessEnv;
  receiptPath: string;
  subjectPath: string;
}) {
  const receipt = await readReceipt(input.receiptPath);
  const workflowRun = `${input.env.GITHUB_RUN_ID ?? ""}-${input.env.GITHUB_RUN_ATTEMPT ?? ""}`;
  if (!/^\d+-\d+$/.test(workflowRun)) {
    throw new Error("Production Receipt reconstruction requires the current workflow run identity.");
  }
  const sourceAdapter = createSourceAdapter(input);
  const deploymentAdapter = createVercelStagedDeploymentAdapter({
    cwd: input.cwd,
    env: input.env,
    expectedSourceSha: receipt.source.candidateSha,
    readSourceIdentity: sourceAdapter.readLocal,
    run: runCommand,
  });
  const deployment = await deploymentAdapter.inspect(receipt.deployment.id);
  if (
    !deployment.ready || deployment.productionDomains.length > 0 ||
    deployment.id !== receipt.deployment.id || deployment.target !== receipt.deployment.target ||
    deployment.url !== receipt.deployment.url
  ) {
    throw new Error("Production Receipt deployment identity is not the current staged deployment.");
  }
  const [source, catalogFingerprint] = await Promise.all([
    sourceAdapter.read(deployment),
    getProducts().then(fingerprintCatalog),
  ]);
  verifyPreparedStagedProductionReceipt(receipt, {
    catalogFingerprint, deployment, source, workflowRun,
  });
  await writeFile(input.subjectPath, canonicalizeVerificationValue({
    buildId: receipt.artifact.buildId,
    deploymentId: receipt.deployment.id,
    runtimeFingerprint: receipt.artifact.runtimeFingerprint,
  }), { encoding: "utf8", mode: 0o600 });
  return receipt;
}

export async function verifyStagedProductionAttestation(input: {
  attestationId: string;
  bundlePath: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
  receiptPath: string;
  run?: CommandRunner;
  subjectPath: string;
}) {
  const receipt = await readReceipt(input.receiptPath);
  const repository = input.env.GITHUB_REPOSITORY?.trim();
  if (!repository || !input.attestationId.trim()) {
    throw new Error("Production Receipt verification requires GitHub identities.");
  }
  const { stdout } = await (input.run ?? runCommand)("gh", [
    "attestation", "verify", input.subjectPath,
    "--repo", repository,
    "--predicate-type", STAGED_PRODUCTION_RECEIPT_PREDICATE_TYPE,
    "--signer-workflow", `${repository}/.github/workflows/staged-production-verification.yml`,
    "--format", "json",
    "--bundle", input.bundlePath,
  ], { cwd: input.cwd, env: input.env });
  const verified = JSON.parse(stdout) as Array<{
    verificationResult?: { statement?: { predicate?: unknown } };
  }>;
  if (verified.length !== 1) {
    throw new Error("Production Receipt verification requires exactly one signed predicate.");
  }
  verifySignedStagedProductionPredicate(
    receipt,
    verified[0]?.verificationResult?.statement?.predicate,
  );
  return { attestationId: input.attestationId, outcome: "verified" as const };
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
        if (input.signal?.aborted) throw new Error("Staged verification was interrupted.");
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
        if (input.signal?.aborted) throw new Error("Staged verification was interrupted.");
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
          outcome: input.signal?.reason === "staged-production-timeout"
            ? "timed-out" as const
            : input.signal?.aborted ? "cancelled" as const : "failed" as const,
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
  timeoutMs?: number;
  workflowRun: string;
}) {
  const controller = new AbortController();
  const cancel = () => controller.abort(input.signal?.reason ?? "staged-production-cancelled");
  input.signal?.addEventListener("abort", cancel, { once: true });
  if (input.signal?.aborted) cancel();
  const timeout = setTimeout(
    () => controller.abort("staged-production-timeout"),
    input.timeoutMs ?? 25 * 60 * 1_000,
  );
  const source = createSourceAdapter({ ...input, signal: controller.signal });
  let evidenceWritten = false;
  try {
    const result = await Promise.race([prepareStagedProductionVerification(
      { candidateSha: input.candidateSha, workflowRun: input.workflowRun },
      {
        browser: await createBrowserAdapter({ ...input, signal: controller.signal }),
        catalog: {
          async fingerprint() { return fingerprintCatalog(await getProducts()); },
        },
        clock: { now: () => new Date().toISOString() },
        deployment: createVercelStagedDeploymentAdapter({
          cwd: input.cwd,
          env: input.env,
          readSourceIdentity: source.readLocal,
          run: runCommand,
          signal: controller.signal,
        }),
        source,
      },
    ), interrupted(controller.signal)]);
    if (controller.signal.aborted) {
      throw new Error("Staged Production verification ended after its deadline.");
    }
    await writeFile(input.evidencePath, `${JSON.stringify(result)}\n`, {
      encoding: "utf8", mode: 0o600,
    });
    if (controller.signal.aborted) {
      throw new Error("Staged Production verification ended while evidence was written.");
    }
    evidenceWritten = true;
    if (result.outcome !== "passed") {
      throw new Error(`Staged Production verification failed: ${result.outcome}.`);
    }
    if (controller.signal.aborted) {
      throw new Error("Staged Production verification ended before receipt creation.");
    }
    await writeFile(input.receiptPath, `${JSON.stringify(result.receipt)}\n`, {
      encoding: "utf8", mode: 0o600, signal: controller.signal,
    });
    if (controller.signal.aborted) {
      throw new Error("Staged Production verification ended during receipt creation.");
    }
    return result;
  } catch (error) {
    await rm(input.receiptPath, { force: true });
    if (!evidenceWritten) {
      const outcome = controller.signal.reason === "staged-production-timeout"
        ? "timed-out"
        : controller.signal.aborted ? "cancelled" : "failed";
      await writeFile(input.evidencePath, `${JSON.stringify({
        diagnostics: {
          reason: error instanceof Error ? error.message : "Staged verification failed.",
        },
        outcome,
        reusable: false,
      })}\n`, { encoding: "utf8", mode: 0o600 });
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    input.signal?.removeEventListener("abort", cancel);
  }
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

function readNamedArguments(argv: string[], requiredKeys: string[]) {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || !value || value.startsWith("--")) {
      throw new Error("Staged Production receipt command arguments are invalid.");
    }
    values.set(key, value);
  }
  if (values.size !== requiredKeys.length || requiredKeys.some((key) => !values.get(key))) {
    throw new Error("Staged Production receipt command arguments are incomplete.");
  }
  return Object.fromEntries(values) as Record<string, string>;
}

if (process.argv[1]?.endsWith("staged-production-verification-command.ts")) {
  runProductionVerificationCli(async (signal) => {
    if (process.env.CI !== "true" || process.env.GITHUB_ACTIONS !== "true") {
      throw new Error("Staged Production verification is restricted to GitHub Actions.");
    }
    const operation = process.argv[2]?.startsWith("--") ? "run" : process.argv[2];
    if (operation === "reconstruct-receipt") {
      const args = readNamedArguments(process.argv.slice(3), ["--receipt-path", "--subject-path"]);
      await reconstructStagedProductionReceipt({
        cwd: process.cwd(), env: process.env,
        receiptPath: args["--receipt-path"]!, subjectPath: args["--subject-path"]!,
      });
      return;
    }
    if (operation === "verify-attestation") {
      const args = readNamedArguments(process.argv.slice(3), [
        "--attestation-id", "--bundle-path", "--receipt-path", "--subject-path",
      ]);
      await verifyStagedProductionAttestation({
        attestationId: args["--attestation-id"]!, bundlePath: args["--bundle-path"]!,
        cwd: process.cwd(), env: process.env, receiptPath: args["--receipt-path"]!,
        subjectPath: args["--subject-path"]!,
      });
      return;
    }
    if (operation !== "run") throw new Error("Unknown staged Production receipt operation.");
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
