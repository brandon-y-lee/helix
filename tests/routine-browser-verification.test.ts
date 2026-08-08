import { describe, expect, it } from "vitest";

import {
  findReusableProtectedPushReceipt,
  findReusableVerificationReceipt,
  runRoutineBrowserVerification,
  type RoutineBrowserVerificationAdapters,
  type RoutineBrowserVerificationInput,
  type VerificationReceipt,
  VERIFICATION_RETENTION_POLICY,
} from "@/scripts/github/verification-orchestrator";

const input: RoutineBrowserVerificationInput = {
  baseSha: "b".repeat(40),
  browserVersions: { chromium: "140.0.7339.16" },
  candidateSha: "c".repeat(40),
  frameworkVersion: "15.5.19",
  nodeVersion: "24.5.0",
  packageManagerVersion: "pnpm@9.15.4",
  planFingerprint: `sha256:${"4".repeat(64)}`,
  playwrightVersion: "1.55.1",
  pullRequest: 53,
  workflowRun: "12345-1",
};

function makeAdapters(
  overrides: Partial<RoutineBrowserVerificationAdapters> = {},
): RoutineBrowserVerificationAdapters {
  return {
    artifact: {
      async prepare() {
        return {
          buildId: "build-53",
          configurationFingerprint: `sha256:${"2".repeat(64)}`,
          runtimeFingerprint: `sha256:${"1".repeat(64)}`,
        };
      },
    },
    attestation: {
      async lookup() {
        return [];
      },
      async sign(receipt) {
        return { id: "attestation-53", receipt };
      },
    },
    browser: {
      async verify() {
        return { attempts: 1, outcome: "passed" };
      },
    },
    catalog: {
      async fingerprint() {
        return `sha256:${"3".repeat(64)}`;
      },
    },
    clock: {
      now() {
        return "2026-08-08T10:00:00.000Z";
      },
    },
    ...overrides,
  };
}

describe("Routine Browser Verification", () => {
  it("fails closed on malformed frozen candidate inputs before preparing an artifact", async () => {
    let artifactCalls = 0;
    const adapters = makeAdapters({
      artifact: {
        async prepare() {
          artifactCalls += 1;
          throw new Error("must not prepare");
        },
      },
    });

    await expect(runRoutineBrowserVerification(
      { ...input, candidateSha: "not-a-commit" },
      adapters,
    )).rejects.toThrow("candidate SHA");
    expect(artifactCalls).toBe(0);
  });

  it("publishes one reusable receipt for a stable first-pass Chromium result", async () => {
    let signed: VerificationReceipt | undefined;
    const adapters = makeAdapters({
      attestation: {
        async lookup() {
          return [];
        },
        async sign(receipt) {
          signed = receipt;
          return { id: "attestation-53", receipt };
        },
      },
    });

    const report = await runRoutineBrowserVerification(
      input,
      adapters,
    );

    expect(report).toEqual({
      attestationId: "attestation-53",
      outcome: "passed",
      receipt: signed,
      reusable: true,
    });
    expect(signed).toMatchObject({
      artifact: {
        buildId: "build-53",
        configurationFingerprint: `sha256:${"2".repeat(64)}`,
        runtimeFingerprint: `sha256:${"1".repeat(64)}`,
      },
      browsers: { chromium: "140.0.7339.16" },
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
        node: "24.5.0",
        packageManager: "pnpm@9.15.4",
        playwright: "1.55.1",
      },
      workflowRun: "12345-1",
    });
  });

  it("fails closed without a receipt when Catalog facts change during the run", async () => {
    let reads = 0;
    let signCalls = 0;
    const report = await runRoutineBrowserVerification(
      input,
      makeAdapters({
        attestation: {
          async lookup() {
            return [];
          },
          async sign(receipt) {
            signCalls += 1;
            return { id: "must-not-exist", receipt };
          },
        },
        catalog: {
          async fingerprint() {
            reads += 1;
            return `sha256:${(reads === 1 ? "3" : "5").repeat(64)}`;
          },
        },
      }),
    );

    expect(report).toEqual({
      outcome: "changed-input",
      reason: "catalog-changed",
      reusable: false,
    });
    expect(signCalls).toBe(0);
  });

  it.each([
    [{ attempts: 1, outcome: "failed" as const }, "failed"],
    [{ attempts: 1, outcome: "partial" as const }, "partial"],
    [{ attempts: 1, outcome: "cancelled" as const }, "cancelled"],
    [{ attempts: 1, outcome: "timed-out" as const }, "timed-out"],
    [{ attempts: 2, outcome: "passed" as const }, "retry-passed"],
  ])("does not sign a %s browser result", async (browserResult, outcome) => {
    let signCalls = 0;
    const report = await runRoutineBrowserVerification(input, makeAdapters({
      attestation: {
        async lookup() {
          return [];
        },
        async sign(receipt) {
          signCalls += 1;
          return { id: "must-not-exist", receipt };
        },
      },
      browser: {
        async verify() {
          return browserResult;
        },
      },
    }));

    expect(report).toEqual({ outcome, reusable: false });
    expect(signCalls).toBe(0);
  });

  it("reuses only a signed receipt matching every current verification input", async () => {
    const completed = await runRoutineBrowserVerification(input, makeAdapters());
    if (completed.outcome !== "passed") throw new Error("expected fixture receipt");
    const receipt = completed.receipt;
    const current = {
      artifact: receipt.artifact,
      browsers: receipt.browsers,
      catalogFingerprint: receipt.catalog.after,
      integration: receipt.integration,
      planFingerprint: receipt.planFingerprint,
      tools: receipt.tools,
    };

    await expect(findReusableVerificationReceipt(current, {
      async lookup() {
        return [{ id: "verified-53", receipt }];
      },
    })).resolves.toEqual({
      attestationId: "verified-53",
      outcome: "reused",
      receipt,
    });

    for (const stale of [
      { ...current, artifact: { ...current.artifact, buildId: "other-build" } },
      { ...current, artifact: { ...current.artifact, runtimeFingerprint: `sha256:${"9".repeat(64)}` as const } },
      { ...current, artifact: { ...current.artifact, configurationFingerprint: `sha256:${"9".repeat(64)}` as const } },
      { ...current, browsers: { chromium: "other-browser" } },
      { ...current, catalogFingerprint: `sha256:${"9".repeat(64)}` as const },
      { ...current, integration: { ...current.integration, candidateSha: "d".repeat(40) } },
      { ...current, integration: { ...current.integration, baseSha: "d".repeat(40) } },
      { ...current, integration: { ...current.integration, pullRequest: 54 } },
      { ...current, planFingerprint: `sha256:${"9".repeat(64)}` as const },
      { ...current, tools: { ...current.tools, framework: "other-framework" } },
      { ...current, tools: { ...current.tools, node: "other-node" } },
      { ...current, tools: { ...current.tools, packageManager: "other-package-manager" } },
      { ...current, tools: { ...current.tools, playwright: "other-playwright" } },
    ]) {
      await expect(findReusableVerificationReceipt(stale, {
        async lookup() {
          return [{ id: "stale", receipt }];
        },
      })).resolves.toEqual({ outcome: "missing", reusable: false });
    }
  });

  it("reuses protected-push evidence without rerunning browsers and fails closed on changed inputs", async () => {
    const completed = await runRoutineBrowserVerification(input, makeAdapters());
    if (completed.outcome !== "passed") throw new Error("expected fixture receipt");
    const { buildId: _buildId, ...artifact } = completed.receipt.artifact;
    const current = {
      artifact,
      catalogFingerprint: completed.receipt.catalog.after,
      integration: completed.receipt.integration,
      planFingerprint: completed.receipt.planFingerprint,
      tools: completed.receipt.tools,
    };
    const lookup = { async lookup() { return [{ id: "verified-53", receipt: completed.receipt }]; } };

    await expect(findReusableProtectedPushReceipt(current, lookup)).resolves.toMatchObject({
      attestationId: "verified-53",
      outcome: "reused",
    });
    await expect(findReusableProtectedPushReceipt({
      ...current,
      planFingerprint: `sha256:${"9".repeat(64)}`,
    }, lookup)).resolves.toEqual({ outcome: "missing", reusable: false });

    await expect(findReusableProtectedPushReceipt({
      ...current,
      integration: {
        baseSha: "d".repeat(40),
        candidateSha: "e".repeat(40),
        pullRequest: 54,
      },
    }, lookup, { allowIntegrationCarryForward: true })).resolves.toMatchObject({
      outcome: "reused",
    });
  });

  it("keeps retained predicates free of adapter extras and raw Catalog facts", async () => {
    const adapters = makeAdapters({
      artifact: {
        async prepare() {
          return {
            buildId: "build-53",
            configurationFingerprint: `sha256:${"2".repeat(64)}`,
            runtimeFingerprint: `sha256:${"1".repeat(64)}`,
            secret: "must-not-be-receipted",
            rawCatalog: { customer: "must-not-be-receipted" },
          } as never;
        },
      },
    });

    const report = await runRoutineBrowserVerification(input, adapters);
    expect(JSON.stringify(report)).not.toContain("must-not-be-receipted");
    expect(VERIFICATION_RETENTION_POLICY).toEqual({
      failureDiagnosticsDays: 90,
      receipt: "repository-lifetime",
      successfulReportsDays: 30,
      telemetryDays: 30,
    });
  });
});
