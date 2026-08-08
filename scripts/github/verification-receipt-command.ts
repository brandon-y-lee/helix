import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { chromium } from "@playwright/test";

import { BROWSER_VERIFICATION_PLAN } from "../browser-verification-plan";
import {
  findReusableVerificationReceipt,
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
} from "./verification-fingerprints";

const execFileAsync = promisify(execFile);
const RECEIPT_DIRECTORY = "mei-pelle-verification-receipt";
const SUBJECT_FILE = "runtime-subject.json";
const PREDICATE_FILE = "predicate.json";
const CURRENT_INPUTS_FILE = "current-inputs.json";

function required(environment: NodeJS.ProcessEnv, key: string): string {
  const value = environment[key];
  if (!value) throw new Error(`Verification receipt requires ${key}.`);
  return value;
}

function fingerprintContents(contents: string): Sha256Fingerprint {
  return `sha256:${createHash("sha256").update(contents).digest("hex")}`;
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

async function readChromiumVersion(): Promise<string> {
  const { stdout } = await execFileAsync(chromium.executablePath(), ["--version"], {
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
  const files = await readVersionedFiles(cwd);
  const configurationFingerprint = fingerprintConfiguration(environment);
  const runtimeSubject = canonicalizeVerificationValue({
    configurationFingerprint,
    filesFingerprint: fingerprintRuntimeFiles(files),
  });
  const runtimeFingerprint = fingerprintContents(runtimeSubject);
  const packageJson = JSON.parse(
    await readFile(resolve(cwd, "package.json"), "utf8"),
  ) as {
    packageManager: string;
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
      browserVersions: { chromium: await readChromiumVersion() },
      candidateSha: required(environment, "VERIFICATION_CANDIDATE_SHA"),
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
  const currentInputsPath = resolve(directory, CURRENT_INPUTS_FILE);
  await Promise.all([
    writeFile(subjectPath, runtimeSubject, { encoding: "utf8", mode: 0o600 }),
    writeFile(predicatePath, canonicalizeVerificationValue(receipt), { encoding: "utf8", mode: 0o600 }),
    writeFile(currentInputsPath, canonicalizeVerificationValue({
      artifact: receipt.artifact,
      browsers: receipt.browsers,
      catalogFingerprint: receipt.catalog.after,
      integration: receipt.integration,
      planFingerprint: receipt.planFingerprint,
      tools: receipt.tools,
    }), { encoding: "utf8", mode: 0o600 }),
  ]);
  return { currentInputsPath, predicatePath, receipt, runtimeFingerprint, subjectPath };
}

type AttestationVerification = {
  verificationResult?: { statement?: { predicate?: VerificationReceipt } };
};

type VerificationCommandRunner = (
  command: string,
  args: string[],
  options: { encoding: "utf8" },
) => Promise<{ stderr: string; stdout: string }>;

export async function verifyVerificationReceipt(input: {
  attestationId: string;
  bundlePath?: string;
  currentInputsPath: string;
  repository: string;
  run?: VerificationCommandRunner;
  subjectPath: string;
}) {
  const run: VerificationCommandRunner = input.run ?? (async (command, args, options) => {
    const result = await execFileAsync(command, args, options);
    return { stderr: String(result.stderr), stdout: String(result.stdout) };
  });
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
  const current = JSON.parse(
    await readFile(input.currentInputsPath, "utf8"),
  ) as CurrentVerificationInputs;
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

async function main() {
  const operation = process.argv[2];
  if (operation === "prepare") {
    const result = await prepareVerificationReceipt({ cwd: process.cwd(), environment: process.env });
    await writeActionsOutput(process.env, {
      current_inputs_path: result.currentInputsPath,
      predicate_path: result.predicatePath,
      runtime_fingerprint: result.runtimeFingerprint,
      subject_path: result.subjectPath,
    });
    return;
  }
  if (operation === "verify") {
    const result = await verifyVerificationReceipt({
      attestationId: required(process.env, "ATTESTATION_ID"),
      bundlePath: process.env.ATTESTATION_BUNDLE_PATH,
      currentInputsPath: required(process.env, "VERIFICATION_CURRENT_INPUTS_PATH"),
      repository: required(process.env, "GITHUB_REPOSITORY"),
      subjectPath: required(process.env, "VERIFICATION_SUBJECT_PATH"),
    });
    process.stdout.write(`Verified reusable receipt ${result.attestationId}.\n`);
    return;
  }
  throw new Error("Verification receipt command requires prepare or verify.");
}

if (import.meta.url === new URL(process.argv[1] ?? "", import.meta.url).href) {
  main().catch((error: unknown) => {
    process.stderr.write(`verification-receipt: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
