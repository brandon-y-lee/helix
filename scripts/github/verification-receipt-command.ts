import { execFile } from "node:child_process";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { chromium } from "@playwright/test";

import { BROWSER_VERIFICATION_PLAN } from "../browser-verification-plan";
import {
  findReusableVerificationReceipt,
  findReusableProtectedPushReceipt,
  runRoutineBrowserVerification,
  VERIFICATION_RECEIPT_PREDICATE_TYPE,
  type CurrentVerificationInputs,
  type Sha256Fingerprint,
  type VerificationReceipt,
} from "./routine-browser-verification";
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
  let executablePath = chromium.executablePath();
  if (environment.VERIFICATION_BROWSER_CWD) {
    const candidateRequire = createRequire(
      resolve(environment.VERIFICATION_BROWSER_CWD, "package.json"),
    );
    const candidatePlaywright = await import(
      pathToFileURL(candidateRequire.resolve("@playwright/test")).href
    ) as { chromium: typeof chromium };
    executablePath = candidatePlaywright.chromium.executablePath();
  }
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

export async function prepareVerificationReceipt(input: {
  cwd: string;
  environment: NodeJS.ProcessEnv;
}) {
  const { cwd, environment } = input;
  const catalogBefore = requireFingerprint(
    required(environment, "CATALOG_FINGERPRINT_BEFORE"),
    "Catalog fingerprint before",
  );
  const catalogAfter = requireFingerprint(
    required(environment, "CATALOG_FINGERPRINT_AFTER"),
    "Catalog fingerprint after",
  );
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
  const artifact = {
    buildId: (await readFile(resolve(cwd, ".next/BUILD_ID"), "utf8")).trim(),
    configurationFingerprint,
    runtimeFingerprint,
  };
  let catalogReads = 0;
  const result = await runRoutineBrowserVerification(
    {
      baseSha: required(environment, "VERIFICATION_DEV_BASE"),
      browserVersions: { chromium: await readChromiumVersion(environment) },
      candidateSha: required(environment, "VERIFICATION_CANDIDATE_SHA"),
      frameworkVersion: packageJson.dependencies.next ?? "unknown",
      nodeVersion: process.version,
      packageManagerVersion: packageJson.packageManager,
      planFingerprint: fingerprintCatalog(BROWSER_VERIFICATION_PLAN),
      playwrightVersion: packageJson.devDependencies["@playwright/test"] ?? "unknown",
      pullRequest: Number(required(environment, "VERIFICATION_PULL_REQUEST")),
      workflowRun: required(environment, "VERIFICATION_WORKFLOW_RUN"),
    },
    {
      artifact: { async prepare() { return artifact; } },
      attestation: {
        async lookup() { return []; },
        async sign(receipt) { return { id: "pending-github-attestation", receipt }; },
      },
      browser: { async verify() { return { attempts: 1, outcome: "passed" }; } },
      catalog: {
        async fingerprint() {
          catalogReads += 1;
          return catalogReads === 1 ? catalogBefore : catalogAfter;
        },
      },
      clock: { now: () => new Date().toISOString() },
    },
  );
  if (result.outcome !== "passed") {
    const reason = result.outcome === "changed-input" ? ` (${result.reason})` : "";
    throw new Error(
      `Routine Browser Verification cannot issue a receipt: ${result.outcome}${reason}.`,
    );
  }
  const receipt = {
    ...result.receipt,
    catalog: { before: catalogBefore, after: catalogAfter },
  };
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
  const result = await findReusableVerificationReceipt(current, {
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

const PROTECTED_PUSH_SCRIPT = "verification:receipt:protected-push";

export function isInitialReceiptVerificationCutover(
  previousPackage: { scripts?: Record<string, string> },
  currentPackage: { scripts?: Record<string, string> },
): boolean {
  return (
    !previousPackage.scripts?.[PROTECTED_PUSH_SCRIPT] &&
    Boolean(currentPackage.scripts?.[PROTECTED_PUSH_SCRIPT])
  );
}

export async function verifyProtectedBranchPushReceipt(input: {
  cwd: string;
  environment: NodeJS.ProcessEnv;
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
  const changed = await execFileAsync(
    "git",
    ["diff", "--name-only", "--diff-filter=ACMR", baseSha, pushSha],
    { cwd, encoding: "utf8" },
  );
  const changedPaths = changed.stdout.split("\n").filter(Boolean);
  const allowIntegrationCarryForward =
    changedPaths.length > 0 && changedPaths.every(isReviewedNonRuntimePath);
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
  let stdout: string;
  try {
    ({ stdout } = await run("gh", [
      "attestation", "verify", subjectPath,
      "--repo", repository,
      "--predicate-type", VERIFICATION_RECEIPT_PREDICATE_TYPE,
      "--signer-workflow", `${repository}/.github/workflows/dev-integration-verification.yml`,
      "--format", "json",
    ], { encoding: "utf8" }));
  } catch (error) {
    if (initialCutover) {
      return { outcome: "cutover" as const, reusable: false as const };
    }
    throw error;
  }
  const verified = JSON.parse(stdout) as AttestationVerification[];
  const packageJson = JSON.parse(await readFile(resolve(cwd, "package.json"), "utf8")) as {
    packageManager: string;
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
  };
  const { getProducts } = await import("../../lib/catalog");
  const result = await findReusableProtectedPushReceipt({
    artifact: { configurationFingerprint, runtimeFingerprint },
    catalogFingerprint: fingerprintCatalog(await getProducts()),
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
  }, {
    async lookup() {
      return verified.flatMap(({ verificationResult }, index) => {
        const receipt = verificationResult?.statement?.predicate;
        return receipt ? [{ id: `verified-${index + 1}`, receipt }] : [];
      });
    },
  }, { allowIntegrationCarryForward });
  if (result.outcome !== "reused") {
    if (initialCutover) {
      return { outcome: "cutover" as const, reusable: false as const };
    }
    throw new Error("Protected dev push has no matching signed Verification Receipt.");
  }
  return result;
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
      predicate_path: result.predicatePath,
      runtime_fingerprint: result.runtimeFingerprint,
      subject_path: result.subjectPath,
    });
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
    if (result.outcome === "cutover") {
      process.stdout.write(
        "Initial receipt-verification cutover accepted; dispatch the merged trusted workflow before closing the ticket.\n",
      );
    } else {
      process.stdout.write(`Reused protected-push receipt ${result.attestationId}.\n`);
    }
    return;
  }
  throw new Error("Verification receipt command requires prepare, verify, browser-version, or protected-push.");
}

if (import.meta.url === new URL(process.argv[1] ?? "", import.meta.url).href) {
  main().catch((error: unknown) => {
    process.stderr.write(`verification-receipt: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
