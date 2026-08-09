import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  bootstrapInitialVerificationReceipt,
  canCarryForwardProtectedPushReceipt,
  findReusableProtectedPushReceiptWithEvidence,
  isInitialReceiptVerificationCutover,
  writeVerificationExecutionEvidence,
  verifyVerificationReceipt,
} from "@/scripts/github/verification-receipt-command";
import {
  VERIFICATION_RECEIPT_PREDICATE_TYPE,
  type Sha256Fingerprint,
  type VerificationReceipt,
} from "@/scripts/github/routine-browser-verification";

const receipt: VerificationReceipt = {
  artifact: {
    buildId: "build-53",
    configurationFingerprint: `sha256:${"2".repeat(64)}`,
    runtimeFingerprint: `sha256:${"1".repeat(64)}`,
  },
  browsers: { chromium: "Chromium 140.0.7339.16" },
  catalog: {
    after: `sha256:${"3".repeat(64)}`,
    before: `sha256:${"3".repeat(64)}`,
  },
  completedAt: "2026-08-08T10:00:00.000Z",
  integration: {
    baseSha: "b".repeat(40),
    candidateSha: "c".repeat(40),
    pullRequest: 53,
  },
  planFingerprint: `sha256:${"4".repeat(64)}`,
  result: "passed",
  tools: {
    framework: "15.5.19",
    node: "v24.5.0",
    packageManager: "pnpm@9.15.4",
    playwright: "1.55.1",
  },
  workflowRun: "12345-1",
};

describe("GitHub Verification Receipt lookup", () => {
  it("carries a receipt across an ancestry-only protected push", () => {
    expect(canCarryForwardProtectedPushReceipt({
      baseTreeSha: "same-tree",
      changedPaths: [],
      pushTreeSha: "same-tree",
    })).toBe(true);
    expect(canCarryForwardProtectedPushReceipt({
      baseTreeSha: "base-tree",
      changedPaths: [],
      pushTreeSha: "different-tree",
    })).toBe(false);
    expect(canCarryForwardProtectedPushReceipt({
      baseTreeSha: "base-tree",
      changedPaths: ["docs/agents/browser-verification.md"],
      pushTreeSha: "different-tree",
    })).toBe(true);
    expect(canCarryForwardProtectedPushReceipt({
      baseTreeSha: "base-tree",
      changedPaths: ["app/page.tsx"],
      pushTreeSha: "different-tree",
    })).toBe(false);
  });

  it("records actual artifact, Catalog, browser version, and retry evidence for orchestration", async () => {
    const directory = await mkdtemp(resolve(tmpdir(), "mei-pelle-execution-evidence-"));
    const evidencePath = resolve(directory, "execution.json");
    const browserResultPath = resolve(directory, "browser-result.json");
    try {
      await mkdir(resolve(directory, ".next"));
      await writeFile(resolve(directory, ".next/BUILD_ID"), "build-53\n");
      await writeFile(browserResultPath, JSON.stringify({
        attempts: 2, buildId: "build-53", outcome: "passed",
      }));
      await writeVerificationExecutionEvidence({
        cwd: directory,
        environment: {
          ...process.env,
          CATALOG_FINGERPRINT_AFTER: `sha256:${"3".repeat(64)}`,
          CATALOG_FINGERPRINT_BEFORE: `sha256:${"3".repeat(64)}`,
          VERIFICATION_BROWSER_RESULT_PATH: browserResultPath,
          VERIFICATION_BROWSER_VERSION: "Chromium 140",
          VERIFICATION_EVIDENCE_PATH: evidencePath,
        },
      });

      expect(JSON.parse(await readFile(evidencePath, "utf8"))).toMatchObject({
        artifact: { buildId: "build-53", outcome: "passed" },
        browser: { attempts: 2, outcome: "passed", version: "Chromium 140" },
        catalog: {
          after: `sha256:${"3".repeat(64)}`,
          before: `sha256:${"3".repeat(64)}`,
        },
        version: 1,
      });
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("fails closed when the trusted cutover workflow cannot produce and verify a receipt", async () => {
    await expect(bootstrapInitialVerificationReceipt({
      baseSha: "b".repeat(40),
      candidateSha: "c".repeat(40),
      pullRequest: 53,
    }, {
      async issueAndVerify() { return { outcome: "failed" }; },
    })).rejects.toThrow("did not produce a verified receipt");
  });

  it("permits exactly the one commit that introduces the protected-push receipt gate", () => {
    const command = "tsx scripts/github/verification-receipt-command.ts protected-push";
    expect(isInitialReceiptVerificationCutover(
      { scripts: {} },
      { scripts: { "verification:receipt:protected-push": command } },
    )).toBe(true);
    expect(isInitialReceiptVerificationCutover(
      { scripts: {} },
      { scripts: { "verification:receipt:protected-push": "echo bypass" } },
    )).toBe(false);
    expect(isInitialReceiptVerificationCutover(
      { scripts: { "verification:receipt:protected-push": command } },
      { scripts: { "verification:receipt:protected-push": command } },
    )).toBe(false);
  });
  it("enforces signature identity and every current input before reuse", async () => {
    const directory = await mkdtemp(resolve(tmpdir(), "mei-pelle-receipt-command-"));
    const calls: string[][] = [];
    const currentInputs = {
      artifact: receipt.artifact,
      browsers: receipt.browsers,
      catalogFingerprint: receipt.catalog.after,
      integration: receipt.integration,
      planFingerprint: receipt.planFingerprint,
      tools: receipt.tools,
    };

    try {
      const result = await verifyVerificationReceipt({
        attestationId: "attestation-53",
        bundlePath: resolve(directory, "bundle.json"),
        currentInputs: async () => currentInputs,
        repository: "brandon-y-lee/mei-pelle",
        run: async (_command, args) => {
          calls.push(args);
          return {
            stderr: "",
            stdout: JSON.stringify([{
              verificationResult: { statement: { predicate: receipt } },
            }]),
          } as never;
        },
        subjectPath: resolve(directory, "runtime-subject.json"),
      });

      expect(result).toMatchObject({
        attestationId: "attestation-53",
        outcome: "reused",
      });
      expect(calls[0]).toEqual(expect.arrayContaining([
        "--repo",
        "brandon-y-lee/mei-pelle",
        "--predicate-type",
        VERIFICATION_RECEIPT_PREDICATE_TYPE,
        "--signer-workflow",
        "brandon-y-lee/mei-pelle/.github/workflows/dev-integration-verification.yml",
        "--format",
        "json",
        "--bundle",
        resolve(directory, "bundle.json"),
      ]));
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("rejects a cryptographically verified predicate substituted for another candidate", async () => {
    const directory = await mkdtemp(resolve(tmpdir(), "mei-pelle-receipt-substitution-"));
    const currentInputs = {
      artifact: receipt.artifact,
      browsers: receipt.browsers,
      catalogFingerprint: receipt.catalog.after,
      integration: { ...receipt.integration, candidateSha: "d".repeat(40) },
      planFingerprint: receipt.planFingerprint,
      tools: receipt.tools,
    };

    try {
      await expect(verifyVerificationReceipt({
        attestationId: "attestation-53",
        currentInputs: async () => currentInputs,
        repository: "brandon-y-lee/mei-pelle",
        run: async () => ({
          stderr: "",
          stdout: JSON.stringify([{
            verificationResult: { statement: { predicate: receipt } },
          }]),
        }) as never,
        subjectPath: resolve(directory, "runtime-subject.json"),
      })).rejects.toThrow(
        "Verified attestation does not match the current Integration Slot inputs.",
      );
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("reconstructs current inputs instead of trusting a receipt-derived file", async () => {
    let reads = 0;
    await expect(verifyVerificationReceipt({
      attestationId: "attestation-53",
      currentInputs: async () => {
        reads += 1;
        return {
          artifact: { ...receipt.artifact, runtimeFingerprint: `sha256:${"9".repeat(64)}` },
          browsers: receipt.browsers,
          catalogFingerprint: receipt.catalog.after,
          integration: receipt.integration,
          planFingerprint: receipt.planFingerprint,
          tools: receipt.tools,
        };
      },
      repository: "brandon-y-lee/mei-pelle",
      run: async () => ({
        stderr: "",
        stdout: JSON.stringify([{
          verificationResult: { statement: { predicate: receipt } },
        }]),
      }) as never,
      subjectPath: "/tmp/runtime-subject.json",
    })).rejects.toThrow("does not match");
    expect(reads).toBe(1);
  });

  it("carries a reviewed non-runtime receipt forward when its build artifact has expired", async () => {
    const result = await findReusableProtectedPushReceiptWithEvidence({
      allowIntegrationCarryForward: true,
      artifactBuildId: async () => null,
      candidates: [{ id: "attestation-53", receipt }],
      current: {
        artifact: {
          configurationFingerprint: receipt.artifact.configurationFingerprint,
          runtimeFingerprint: receipt.artifact.runtimeFingerprint,
        },
        browsers: receipt.browsers,
        catalogFingerprint: receipt.catalog.after,
        integration: {
          baseSha: "d".repeat(40),
          candidateSha: "e".repeat(40),
          pullRequest: 54,
        },
        planFingerprint: receipt.planFingerprint,
        tools: receipt.tools,
      },
    });

    expect(result).toMatchObject({
      attestationId: "attestation-53",
      outcome: "reused",
    });
  });

  it("fails a fresh behavioral push when its build artifact is missing", async () => {
    const result = await findReusableProtectedPushReceiptWithEvidence({
      allowIntegrationCarryForward: false,
      artifactBuildId: async () => null,
      candidates: [{ id: "attestation-53", receipt }],
      current: {
        artifact: {
          configurationFingerprint: receipt.artifact.configurationFingerprint,
          runtimeFingerprint: receipt.artifact.runtimeFingerprint,
        },
        browsers: receipt.browsers,
        catalogFingerprint: receipt.catalog.after,
        integration: receipt.integration,
        planFingerprint: receipt.planFingerprint,
        tools: receipt.tools,
      },
    });

    expect(result).toEqual({ outcome: "missing", reusable: false });
  });

  it("fails closed when build-artifact observation itself fails", async () => {
    await expect(findReusableProtectedPushReceiptWithEvidence({
      allowIntegrationCarryForward: true,
      artifactBuildId: async () => {
        throw new Error("GitHub artifact API unavailable");
      },
      candidates: [{ id: "attestation-53", receipt }],
      current: {
        artifact: {
          configurationFingerprint: receipt.artifact.configurationFingerprint,
          runtimeFingerprint: receipt.artifact.runtimeFingerprint,
        },
        browsers: receipt.browsers,
        catalogFingerprint: receipt.catalog.after,
        integration: receipt.integration,
        planFingerprint: receipt.planFingerprint,
        tools: receipt.tools,
      },
    })).rejects.toThrow("GitHub artifact API unavailable");
  });

  it.each([
    ["artifact build", { artifactBuildId: "different-build" }],
    ["runtime", { runtimeFingerprint: `sha256:${"9".repeat(64)}` }],
    ["configuration", { configurationFingerprint: `sha256:${"9".repeat(64)}` }],
    ["browser", { chromium: "Chromium 141" }],
    ["Catalog", { catalogFingerprint: `sha256:${"9".repeat(64)}` }],
    ["plan", { planFingerprint: `sha256:${"9".repeat(64)}` }],
    ["framework", { framework: "16.0.0" }],
    ["Node", { node: "v25.0.0" }],
    ["package manager", { packageManager: "pnpm@10.0.0" }],
    ["Playwright", { playwright: "1.56.0" }],
  ])("rejects non-runtime carry-forward when the current %s identity differs", async (
    _label,
    mismatch,
  ) => {
    const artifactUnavailable = !("artifactBuildId" in mismatch);
    const result = await findReusableProtectedPushReceiptWithEvidence({
      allowIntegrationCarryForward: true,
      artifactBuildId: async () => {
        if (artifactUnavailable) return null;
        return mismatch.artifactBuildId!;
      },
      candidates: [{ id: "attestation-53", receipt }],
      current: {
        artifact: {
          configurationFingerprint: "configurationFingerprint" in mismatch
            ? mismatch.configurationFingerprint as Sha256Fingerprint
            : receipt.artifact.configurationFingerprint,
          runtimeFingerprint: "runtimeFingerprint" in mismatch
            ? mismatch.runtimeFingerprint as Sha256Fingerprint
            : receipt.artifact.runtimeFingerprint,
        },
        browsers: {
          chromium: "chromium" in mismatch ? mismatch.chromium! : receipt.browsers.chromium,
        },
        catalogFingerprint: "catalogFingerprint" in mismatch
          ? mismatch.catalogFingerprint as Sha256Fingerprint
          : receipt.catalog.after,
        integration: {
          baseSha: "d".repeat(40),
          candidateSha: "e".repeat(40),
          pullRequest: 54,
        },
        planFingerprint: "planFingerprint" in mismatch
          ? mismatch.planFingerprint as Sha256Fingerprint
          : receipt.planFingerprint,
        tools: {
          framework: "framework" in mismatch ? mismatch.framework! : receipt.tools.framework,
          node: "node" in mismatch ? mismatch.node! : receipt.tools.node,
          packageManager: "packageManager" in mismatch
            ? mismatch.packageManager!
            : receipt.tools.packageManager,
          playwright: "playwright" in mismatch ? mismatch.playwright! : receipt.tools.playwright,
        },
      },
    });

    expect(result).toEqual({ outcome: "missing", reusable: false });
  });
});
