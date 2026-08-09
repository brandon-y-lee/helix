import { execFile } from "node:child_process";
import { appendFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { promisify } from "node:util";

import { BROWSER_VERIFICATION_PLAN } from "../browser-verification-plan";
import {
  findReusableProtectedPushReceipt,
  VERIFICATION_RECEIPT_PREDICATE_TYPE,
  type CurrentVerificationInputs,
  type Sha256Fingerprint,
  type VerificationReceipt,
} from "./routine-browser-verification";
import {
  createRoutineReceiptOrchestrator,
  verifySignedRoutineReceipt,
} from "./verification-orchestrator";
import {
  canonicalizeVerificationValue,
  fingerprintCatalog,
  fingerprintConfiguration,
  fingerprintRuntimeFiles,
  isReviewedNonRuntimePath,
  sha256Fingerprint,
} from "./verification-fingerprints";

const execFileAsync = promisify(execFile);
const RECEIPT_DIRECTORY = "mei-pelle-verification-receipt";
const SUBJECT_FILE = "runtime-subject.json";
const PREDICATE_FILE = "predicate.json";

type VerificationExecutionEvidence = {
  version: 1;
  artifact: { buildId: string; outcome: "passed" };
  browser: {
    attempts: number;
    outcome: "passed" | "failed" | "partial" | "cancelled" | "timed-out";
    version: string;
  };
  catalog: { after: Sha256Fingerprint; before: Sha256Fingerprint };
  completedAt: string;
};

function required(environment: NodeJS.ProcessEnv, key: string): string {
  const value = environment[key];
  if (!value) throw new Error(`Verification receipt requires ${key}.`);
  return value;
}

function requireFingerprint(value: string, key: string): Sha256Fingerprint {
  if (!/^sha256:[0-9a-f]{64}$/.test(value)) {
    throw new Error(`Verification receipt requires a valid ${key}.`);
  }
  return value as Sha256Fingerprint;
}

async function readVersionedFiles(cwd: string) {
  const { stdout } = await execFileAsync("git", ["ls-files", "-z"], {
    cwd,
    encoding: "buffer",
  });
  const paths = stdout
    .toString("utf8")
    .split("\0")
    .filter(Boolean);
  return Promise.all(paths.map(async (path) => ({
    contents: (await readFile(resolve(cwd, path))).toString("base64"),
    path,
  })));
}

async function readChromiumVersion(environment: NodeJS.ProcessEnv): Promise<string> {
  if (environment.VERIFICATION_BROWSER_VERSION?.trim()) {
    return environment.VERIFICATION_BROWSER_VERSION.trim();
  }
  const candidateRequire = createRequire(resolve(
    environment.VERIFICATION_BROWSER_CWD ?? process.cwd(),
    "package.json",
  ));
  const candidatePlaywright = candidateRequire("@playwright/test") as {
    chromium: { executablePath(): string };
  };
  const executablePath = candidatePlaywright.chromium.executablePath();
  const { stdout } = await execFileAsync(executablePath, ["--version"], {
    encoding: "utf8",
  });
  const version = stdout.trim();
  if (!version) throw new Error("Verification receipt could not identify Chromium.");
  return version;
}

async function writeActionsOutput(environment: NodeJS.ProcessEnv, values: Record<string, string>) {
  const outputPath = required(environment, "GITHUB_OUTPUT");
  await appendFile(
    outputPath,
    Object.entries(values).map(([key, value]) => `${key}=${value}\n`).join(""),
    "utf8",
  );
}

export async function writeVerificationExecutionEvidence(input: {
  cwd: string;
  environment: NodeJS.ProcessEnv;
}) {
  const { cwd, environment } = input;
  const browserResult = JSON.parse(await readFile(
    required(environment, "VERIFICATION_BROWSER_RESULT_PATH"),
    "utf8",
  )) as { attempts?: unknown; buildId?: unknown; outcome?: unknown };
  const buildId = (await readFile(resolve(cwd, ".next/BUILD_ID"), "utf8")).trim();
  if (
    browserResult.buildId !== buildId || browserResult.outcome !== "passed" ||
    !Number.isSafeInteger(browserResult.attempts) || Number(browserResult.attempts) < 1
  ) {
    throw new Error("Verification evidence requires a matching passed browser result.");
  }
  const evidence: VerificationExecutionEvidence = {
    version: 1,
    artifact: {
      buildId,
      outcome: "passed",
    },
    browser: {
      attempts: Number(browserResult.attempts),
      outcome: "passed",
      version: await readChromiumVersion(environment),
    },
    catalog: {
      before: requireFingerprint(
        required(environment, "CATALOG_FINGERPRINT_BEFORE"),
        "Catalog fingerprint before",
      ),
      after: requireFingerprint(
        required(environment, "CATALOG_FINGERPRINT_AFTER"),
        "Catalog fingerprint after",
      ),
    },
    completedAt: new Date().toISOString(),
  };
  if (!evidence.artifact.buildId) throw new Error("Verification evidence requires a build ID.");
  await writeFile(
    required(environment, "VERIFICATION_EVIDENCE_PATH"),
    canonicalizeVerificationValue(evidence),
    { encoding: "utf8", mode: 0o600 },
  );
  return evidence;
}

async function readVerificationExecutionEvidence(
  environment: NodeJS.ProcessEnv,
): Promise<VerificationExecutionEvidence> {
  const evidence = JSON.parse(await readFile(
    required(environment, "VERIFICATION_EVIDENCE_PATH"),
    "utf8",
  )) as VerificationExecutionEvidence;
  if (
    evidence.version !== 1 || evidence.artifact?.outcome !== "passed" ||
    !evidence.artifact.buildId?.trim() || !Number.isSafeInteger(evidence.browser?.attempts) ||
    evidence.browser.attempts < 1 || !evidence.browser.version?.trim() ||
    !evidence.completedAt?.trim()
  ) {
    throw new Error("Verification execution evidence is incomplete or malformed.");
  }
  requireFingerprint(evidence.catalog.before, "Catalog fingerprint before");
  requireFingerprint(evidence.catalog.after, "Catalog fingerprint after");
  return evidence;
}

export async function prepareVerificationReceipt(input: {
  cwd: string;
  environment: NodeJS.ProcessEnv;
}) {
  const { cwd, environment } = input;
  const evidence = await readVerificationExecutionEvidence(environment);
  const catalogBefore = evidence.catalog.before;
  const catalogAfter = evidence.catalog.after;
  const catalogCurrent = environment.CATALOG_FINGERPRINT_CURRENT
    ? requireFingerprint(environment.CATALOG_FINGERPRINT_CURRENT, "current Catalog fingerprint")
    : catalogAfter;
  if (catalogBefore !== catalogAfter || catalogAfter !== catalogCurrent) {
    throw new Error("Verification receipt requires one stable current Catalog fingerprint.");
  }
  const files = await readVersionedFiles(cwd);
  const configurationFingerprint = fingerprintConfiguration(environment);
  const runtimeSubject = canonicalizeVerificationValue({
    configurationFingerprint,
    filesFingerprint: fingerprintRuntimeFiles(files),
  });
  const runtimeFingerprint = sha256Fingerprint(runtimeSubject);
  const packageJson = JSON.parse(
    await readFile(resolve(cwd, "package.json"), "utf8"),
  ) as {
    packageManager: string;
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
  };
  const buildId = (await readFile(resolve(cwd, ".next/BUILD_ID"), "utf8")).trim();
  if (buildId !== evidence.artifact.buildId) {
    throw new Error("Verification evidence does not match the staged production artifact.");
  }
  const artifact = {
    buildId,
    configurationFingerprint,
    runtimeFingerprint,
  };
  let catalogReads = 0;
  const identity = {
    baseSha: required(environment, "VERIFICATION_DEV_BASE"),
    browserVersions: { chromium: evidence.browser.version },
    candidateSha: required(environment, "VERIFICATION_CANDIDATE_SHA"),
    frameworkVersion: packageJson.dependencies.next ?? "unknown",
    nodeVersion: process.version,
    packageManagerVersion: packageJson.packageManager,
    planFingerprint: fingerprintCatalog(BROWSER_VERIFICATION_PLAN),
    playwrightVersion: packageJson.devDependencies["@playwright/test"] ?? "unknown",
    pullRequest: Number(required(environment, "VERIFICATION_PULL_REQUEST")),
    workflowRun: required(environment, "VERIFICATION_WORKFLOW_RUN"),
  };
  const orchestrator = createRoutineReceiptOrchestrator({
    identity: { async read() { return identity; } },
    artifact: { async prepare() { return artifact; } },
    browser: {
      async verify() {
        return {
          attempts: evidence.browser.attempts,
          outcome: evidence.browser.outcome,
        };
      },
    },
    catalog: {
      async fingerprint() {
        catalogReads += 1;
        return catalogReads === 1 ? catalogBefore : catalogAfter;
      },
    },
    clock: { now: () => evidence.completedAt },
  });
  const result = await orchestrator.prepare({
    number: identity.pullRequest,
    baseSha: identity.baseSha,
    headSha: identity.candidateSha,
    candidateSha: identity.candidateSha,
    gate: "complete-behavioral",
    reasons: ["trusted execution evidence"],
    timeoutMs: 20 * 60 * 1_000,
    signal: new AbortController().signal,
  });
  if (result.outcome !== "passed") {
    const reason = result.outcome === "changed-input" ? ` (${result.reason})` : "";
    throw new Error(
      `Routine Browser Verification cannot issue a receipt: ${result.outcome}${reason}.`,
    );
  }
  const receipt = result.receipt;
  const directory = resolve(required(environment, "RUNNER_TEMP"), RECEIPT_DIRECTORY);
  await mkdir(directory, { recursive: true });
  const subjectPath = resolve(directory, SUBJECT_FILE);
  const predicatePath = resolve(directory, PREDICATE_FILE);
  await Promise.all([
    writeFile(subjectPath, runtimeSubject, { encoding: "utf8", mode: 0o600 }),
    writeFile(predicatePath, canonicalizeVerificationValue(receipt), { encoding: "utf8", mode: 0o600 }),
  ]);
  return { predicatePath, receipt, runtimeFingerprint, subjectPath };
}

export async function readCurrentVerificationInputs(input: {
  cwd: string;
  environment: NodeJS.ProcessEnv;
}): Promise<CurrentVerificationInputs> {
  const { cwd, environment } = input;
  const files = await readVersionedFiles(cwd);
  const configurationFingerprint = fingerprintConfiguration(environment);
  const runtimeSubject = canonicalizeVerificationValue({
    configurationFingerprint,
    filesFingerprint: fingerprintRuntimeFiles(files),
  });
  const packageJson = JSON.parse(await readFile(resolve(cwd, "package.json"), "utf8")) as {
    packageManager: string;
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
  };
  return {
    artifact: {
      buildId: (await readFile(resolve(cwd, ".next/BUILD_ID"), "utf8")).trim(),
      configurationFingerprint,
      runtimeFingerprint: sha256Fingerprint(runtimeSubject),
    },
    browsers: { chromium: await readChromiumVersion(environment) },
    catalogFingerprint: requireFingerprint(
      required(environment, "CATALOG_FINGERPRINT_CURRENT"),
      "current Catalog fingerprint",
    ),
    integration: {
      baseSha: required(environment, "VERIFICATION_DEV_BASE"),
      candidateSha: required(environment, "VERIFICATION_CANDIDATE_SHA"),
      pullRequest: Number(required(environment, "VERIFICATION_PULL_REQUEST")),
    },
    planFingerprint: fingerprintCatalog(BROWSER_VERIFICATION_PLAN),
    tools: {
      framework: packageJson.dependencies.next ?? "unknown",
      node: process.version,
      packageManager: packageJson.packageManager,
      playwright: packageJson.devDependencies["@playwright/test"] ?? "unknown",
    },
  };
}

type AttestationVerification = {
  verificationResult?: { statement?: { predicate?: VerificationReceipt } };
};

type VerificationCommandRunner = (
  command: string,
  args: string[],
  options: { encoding: "utf8" },
) => Promise<{ stderr: string; stdout: string }>;

async function defaultCommandRunner(
  command: string,
  args: string[],
  options: { encoding: "utf8" },
) {
  const result = await execFileAsync(command, args, options);
  return { stderr: String(result.stderr), stdout: String(result.stdout) };
}

export async function verifyVerificationReceipt(input: {
  attestationId: string;
  bundlePath?: string;
  currentInputs: CurrentVerificationInputs | (() => Promise<CurrentVerificationInputs>);
  repository: string;
  run?: VerificationCommandRunner;
  subjectPath: string;
}) {
  const run = input.run ?? defaultCommandRunner;
  const args = [
    "attestation", "verify", input.subjectPath,
    "--repo", input.repository,
    "--predicate-type", VERIFICATION_RECEIPT_PREDICATE_TYPE,
    "--signer-workflow", `${input.repository}/.github/workflows/dev-integration-verification.yml`,
    "--format", "json",
    ...(input.bundlePath ? ["--bundle", input.bundlePath] : []),
  ];
  const { stdout } = await run("gh", args, { encoding: "utf8" });
  const verified = JSON.parse(String(stdout)) as AttestationVerification[];
  const current = typeof input.currentInputs === "function"
    ? await input.currentInputs()
    : input.currentInputs;
  const result = await verifySignedRoutineReceipt(current, {
    async lookup() {
      return verified.flatMap(({ verificationResult }) => {
        const receipt = verificationResult?.statement?.predicate;
        return receipt ? [{ id: input.attestationId, receipt }] : [];
      });
    },
  });
  if (result.outcome !== "reused") {
    throw new Error("Verified attestation does not match the current Integration Slot inputs.");
  }
  return result;
}

type AssociatedPullRequest = {
  base?: { ref?: string };
  head?: { sha?: string };
  merged_at?: string | null;
  number?: number;
};

export interface ProtectedPushObservationAdapter {
  artifactBuildId(receipt: VerificationReceipt): Promise<string | null>;
  browserVersion(): Promise<string>;
}

type ProtectedPushCurrentInputs = Omit<CurrentVerificationInputs, "artifact"> & {
  artifact: Omit<CurrentVerificationInputs["artifact"], "buildId">;
};

export async function findReusableProtectedPushReceiptWithEvidence(input: {
  allowIntegrationCarryForward: boolean;
  artifactBuildId(receipt: VerificationReceipt): Promise<string | null>;
  candidates: Array<{ id: string; receipt: VerificationReceipt }>;
  current: ProtectedPushCurrentInputs;
}) {
  for (const candidate of input.candidates) {
    const observedBuildId = await input.artifactBuildId(candidate.receipt);
    if (observedBuildId === null && !input.allowIntegrationCarryForward) continue;
    const result = await findReusableProtectedPushReceipt({
      ...input.current,
      artifact: {
        ...input.current.artifact,
        buildId: observedBuildId ?? candidate.receipt.artifact.buildId,
      },
    }, { async lookup() { return [candidate]; } }, {
      allowIntegrationCarryForward: input.allowIntegrationCarryForward,
    });
    if (result.outcome === "reused") return result;
  }
  return { outcome: "missing" as const, reusable: false as const };
}

/**
 * A reviewed merge with no changed paths is ancestry-only, so it is the safest
 * form of non-runtime receipt carry-forward.
 */
export function canCarryForwardProtectedPushReceipt(changedPaths: string[]): boolean {
  return changedPaths.every(isReviewedNonRuntimePath);
}

const PROTECTED_PUSH_SCRIPT = "verification:receipt:protected-push";
const PROTECTED_PUSH_COMMAND = "tsx scripts/github/verification-receipt-command.ts protected-push";

type ReceiptCutoverInput = {
  baseSha: string;
  candidateSha: string;
  pullRequest: number;
};

export interface ReceiptCutoverBootstrapAdapter {
  issueAndVerify(input: ReceiptCutoverInput): Promise<{ outcome: "passed" | "failed" }>;
}

export async function bootstrapInitialVerificationReceipt(
  input: ReceiptCutoverInput,
  adapter: ReceiptCutoverBootstrapAdapter,
): Promise<void> {
  const result = await adapter.issueAndVerify(input);
  if (result.outcome !== "passed") {
    throw new Error("Trusted receipt cutover did not produce a verified receipt.");
  }
}

function createGitHubReceiptCutoverBootstrap(input: {
  environment: NodeJS.ProcessEnv;
  repository: string;
  run: VerificationCommandRunner;
}): ReceiptCutoverBootstrapAdapter {
  return {
    async issueAndVerify(candidate) {
      const nonce = `protected-push-${required(input.environment, "GITHUB_RUN_ID")}-${required(input.environment, "GITHUB_RUN_ATTEMPT")}`;
      const title = `Integration verification #${candidate.pullRequest} ${nonce}`;
      await input.run("gh", [
        "workflow", "run", "dev-integration-verification.yml",
        "--repo", input.repository,
        "--ref", "dev",
        "-f", `pr_number=${candidate.pullRequest}`,
        "-f", `candidate_head=${candidate.candidateSha}`,
        "-f", `dev_base=${candidate.baseSha}`,
        "-f", "gate=complete-behavioral",
        "-f", `nonce=${nonce}`,
      ], { encoding: "utf8" });

      let runId: number | undefined;
      for (let attempt = 0; attempt < 30 && !runId; attempt += 1) {
        const observed = await input.run("gh", [
          "run", "list",
          "--repo", input.repository,
          "--workflow", "dev-integration-verification.yml",
          "--event", "workflow_dispatch",
          "--limit", "30",
          "--json", "databaseId,displayTitle",
        ], { encoding: "utf8" });
        const runs = JSON.parse(observed.stdout) as Array<{
          databaseId: number;
          displayTitle: string;
        }>;
        runId = runs.find((run) => run.displayTitle === title)?.databaseId;
        if (!runId) await new Promise((resolveDelay) => setTimeout(resolveDelay, 1_000));
      }
      if (!runId) throw new Error("Trusted receipt cutover workflow was not observable.");
      await input.run("gh", [
        "run", "watch", String(runId),
        "--repo", input.repository,
        "--exit-status",
        "--interval", "10",
      ], { encoding: "utf8" });
      return { outcome: "passed" };
    },
  };
}

export function isInitialReceiptVerificationCutover(
  previousPackage: { scripts?: Record<string, string> },
  currentPackage: { scripts?: Record<string, string> },
): boolean {
  return (
    previousPackage.scripts?.[PROTECTED_PUSH_SCRIPT] === undefined &&
    currentPackage.scripts?.[PROTECTED_PUSH_SCRIPT] === PROTECTED_PUSH_COMMAND
  );
}

export async function verifyProtectedBranchPushReceipt(input: {
  bootstrap?: ReceiptCutoverBootstrapAdapter;
  cwd: string;
  environment: NodeJS.ProcessEnv;
  observation?: ProtectedPushObservationAdapter;
  run?: VerificationCommandRunner;
}) {
  const { cwd, environment } = input;
  const repository = required(environment, "GITHUB_REPOSITORY");
  const pushSha = required(environment, "GITHUB_SHA");
  const baseSha = required(environment, "VERIFICATION_DEV_BASE");
  const run = input.run ?? defaultCommandRunner;
  const pullResponse = await run(
    "gh",
    ["api", `repos/${repository}/commits/${pushSha}/pulls`],
    { encoding: "utf8" },
  );
  const associated = (JSON.parse(pullResponse.stdout) as AssociatedPullRequest[])
    .filter((pull) => pull.base?.ref === "dev" && pull.merged_at && pull.number && pull.head?.sha);
  if (associated.length !== 1) {
    throw new Error("Protected dev push requires exactly one associated merged pull request.");
  }
  const pull = associated[0]!;
  const previousPackage = JSON.parse((await execFileAsync(
    "git",
    ["show", `${baseSha}:package.json`],
    { cwd, encoding: "utf8" },
  )).stdout) as { scripts?: Record<string, string> };
  const currentPackage = JSON.parse(
    await readFile(resolve(cwd, "package.json"), "utf8"),
  ) as { scripts?: Record<string, string> };
  const initialCutover = isInitialReceiptVerificationCutover(
    previousPackage,
    currentPackage,
  );
  if (initialCutover) {
    await bootstrapInitialVerificationReceipt({
      baseSha,
      candidateSha: pull.head!.sha!,
      pullRequest: pull.number!,
    }, input.bootstrap ?? createGitHubReceiptCutoverBootstrap({
      environment,
      repository,
      run,
    }));
  }
  const changed = await execFileAsync(
    "git",
    ["diff", "--name-only", "--diff-filter=ACMR", baseSha, pushSha],
    { cwd, encoding: "utf8" },
  );
  const changedPaths = changed.stdout.split("\n").filter(Boolean);
  const allowIntegrationCarryForward = canCarryForwardProtectedPushReceipt(changedPaths);
  const files = await readVersionedFiles(cwd);
  const configurationFingerprint = fingerprintConfiguration(environment);
  const runtimeSubject = canonicalizeVerificationValue({
    configurationFingerprint,
    filesFingerprint: fingerprintRuntimeFiles(files),
  });
  const runtimeFingerprint = sha256Fingerprint(runtimeSubject);
  const subjectDirectory = resolve(required(environment, "RUNNER_TEMP"), RECEIPT_DIRECTORY);
  await mkdir(subjectDirectory, { recursive: true });
  const subjectPath = resolve(subjectDirectory, SUBJECT_FILE);
  await writeFile(subjectPath, runtimeSubject, { encoding: "utf8", mode: 0o600 });
  const { stdout } = await run("gh", [
    "attestation", "verify", subjectPath,
    "--repo", repository,
    "--predicate-type", VERIFICATION_RECEIPT_PREDICATE_TYPE,
    "--signer-workflow", `${repository}/.github/workflows/dev-integration-verification.yml`,
    "--format", "json",
  ], { encoding: "utf8" });
  const verified = JSON.parse(stdout) as AttestationVerification[];
  const findBuildIds = async (directory: string): Promise<string[]> => {
    const entries = await readdir(directory, { withFileTypes: true });
    const found = await Promise.all(entries.map(async (entry) => {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) return findBuildIds(path);
      return entry.isFile() && entry.name === "BUILD_ID" ? [path] : [];
    }));
    return found.flat();
  };
  const observation = input.observation ?? {
    async artifactBuildId(receipt: VerificationReceipt) {
      const match = /^(\d+)-(\d+)$/.exec(receipt.workflowRun);
      if (!match) throw new Error("Verification Receipt has an invalid workflow run identity.");
      const artifactNamePrefix =
        `integration-build-evidence-${receipt.integration.pullRequest}-`;
      const artifactResponse = await run("gh", [
        "api", `repos/${repository}/actions/runs/${match[1]}/artifacts?per_page=100`,
        "--paginate", "--slurp",
      ], { encoding: "utf8" });
      const artifactPages = JSON.parse(artifactResponse.stdout) as Array<{
        artifacts: Array<{ expired: boolean; name: string }>;
      }>;
      const availableArtifacts = artifactPages
        .flatMap((page) => page.artifacts)
        .filter((artifact) => (
          artifact.name.startsWith(artifactNamePrefix) && !artifact.expired
        ));
      if (availableArtifacts.length === 0) return null;
      if (availableArtifacts.length !== 1) {
        throw new Error("Protected dev push requires exactly one receipted build artifact.");
      }
      const artifactDirectory = resolve(subjectDirectory, `workflow-${match[1]}-${match[2]}`);
      await mkdir(artifactDirectory, { recursive: true });
      await run("gh", [
        "run", "download", match[1]!,
        "--repo", repository,
        "--name", availableArtifacts[0]!.name,
        "--dir", artifactDirectory,
      ], { encoding: "utf8" });
      const buildIds = await findBuildIds(artifactDirectory);
      if (buildIds.length !== 1) {
        throw new Error("Protected dev push requires exactly one receipted build identity.");
      }
      const buildId = (await readFile(buildIds[0]!, "utf8")).trim();
      if (!buildId) throw new Error("Protected dev push receipted build identity is empty.");
      return buildId;
    },
    async browserVersion() {
      return readChromiumVersion(environment);
    },
  };
  const packageJson = JSON.parse(await readFile(resolve(cwd, "package.json"), "utf8")) as {
    packageManager: string;
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
  };
  const { getProducts } = await import("../../lib/catalog");
  const browserVersion = await observation.browserVersion();
  const catalogFingerprint = fingerprintCatalog(await getProducts());
  const candidates = verified.flatMap(({ verificationResult }, index) => {
    const receipt = verificationResult?.statement?.predicate;
    return receipt ? [{ id: `verified-${index + 1}`, receipt }] : [];
  });
  const result = await findReusableProtectedPushReceiptWithEvidence({
    allowIntegrationCarryForward,
    artifactBuildId: (receipt) => observation.artifactBuildId(receipt),
    candidates,
    current: {
      artifact: { configurationFingerprint, runtimeFingerprint },
      browsers: { chromium: browserVersion },
      catalogFingerprint,
      integration: {
        baseSha,
        candidateSha: pull.head!.sha!,
        pullRequest: pull.number!,
      },
      planFingerprint: fingerprintCatalog(BROWSER_VERIFICATION_PLAN),
      tools: {
        framework: packageJson.dependencies.next ?? "unknown",
        node: process.version,
        packageManager: packageJson.packageManager,
        playwright: packageJson.devDependencies["@playwright/test"] ?? "unknown",
      },
    },
  });
  if (result.outcome === "reused") return result;
  throw new Error("Protected dev push has no matching signed Verification Receipt.");
}

async function main() {
  const operation = process.argv[2];
  if (operation === "browser-version") {
    const version = await readChromiumVersion(process.env);
    if (process.env.GITHUB_OUTPUT) {
      await writeActionsOutput(process.env, { version });
    } else {
      process.stdout.write(`${version}\n`);
    }
    return;
  }
  if (operation === "prepare") {
    const cwd = process.env.VERIFICATION_CANDIDATE_CWD
      ? resolve(process.env.VERIFICATION_CANDIDATE_CWD)
      : process.cwd();
    const result = await prepareVerificationReceipt({ cwd, environment: process.env });
    await writeActionsOutput(process.env, {
      browser_version: result.receipt.browsers.chromium,
      predicate_path: result.predicatePath,
      runtime_fingerprint: result.runtimeFingerprint,
      subject_path: result.subjectPath,
    });
    return;
  }
  if (operation === "evidence") {
    const cwd = process.env.VERIFICATION_CANDIDATE_CWD
      ? resolve(process.env.VERIFICATION_CANDIDATE_CWD)
      : process.cwd();
    await writeVerificationExecutionEvidence({ cwd, environment: process.env });
    return;
  }
  if (operation === "verify") {
    const cwd = process.env.VERIFICATION_CANDIDATE_CWD
      ? resolve(process.env.VERIFICATION_CANDIDATE_CWD)
      : process.cwd();
    const result = await verifyVerificationReceipt({
      attestationId: required(process.env, "ATTESTATION_ID"),
      bundlePath: process.env.ATTESTATION_BUNDLE_PATH,
      currentInputs: () => readCurrentVerificationInputs({ cwd, environment: process.env }),
      repository: required(process.env, "GITHUB_REPOSITORY"),
      subjectPath: required(process.env, "VERIFICATION_SUBJECT_PATH"),
    });
    process.stdout.write(`Verified reusable receipt ${result.attestationId}.\n`);
    return;
  }
  if (operation === "protected-push") {
    const result = await verifyProtectedBranchPushReceipt({
      cwd: process.cwd(),
      environment: process.env,
    });
    process.stdout.write(`Reused protected-push receipt ${result.attestationId}.\n`);
    return;
  }
  throw new Error(
    "Verification receipt command requires evidence, prepare, verify, browser-version, or protected-push.",
  );
}

if (import.meta.url === new URL(process.argv[1] ?? "", import.meta.url).href) {
  main().catch((error: unknown) => {
    process.stderr.write(`verification-receipt: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
