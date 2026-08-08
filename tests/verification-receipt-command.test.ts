import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  verifyVerificationReceipt,
} from "@/scripts/github/verification-receipt-command";
import {
  VERIFICATION_RECEIPT_PREDICATE_TYPE,
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
});
