import { describe, expect, it } from "vitest";

import {
  runStagedProductionVerification,
  STAGED_PRODUCTION_RECEIPT_PREDICATE_TYPE,
  type StagedProductionDeployment,
  type StagedProductionSourceIdentity,
  type StagedProductionVerificationAdapters,
  verifyPreparedStagedProductionReceipt,
  verifySignedStagedProductionPredicate,
} from "@/scripts/github/verification-orchestrator";

const candidateSha = "c".repeat(40);
const deployment: StagedProductionDeployment = {
  id: "dpl_staged_57",
  target: "production",
  url: "https://mei-pelle-staged-57.vercel.app",
};
const sourceIdentity: StagedProductionSourceIdentity = {
  artifact: {
    buildId: "build-staged-57",
    configurationFingerprint: `sha256:${"2".repeat(64)}`,
    runtimeFingerprint: `sha256:${"1".repeat(64)}`,
  },
  browsers: {
    chromium: "Chromium 140.0.7339.16",
    webkit: "Playwright WebKit 26.0",
  },
  candidateSha,
  planFingerprint: `sha256:${"4".repeat(64)}`,
  tools: {
    framework: "15.5.19",
    node: "v24.5.0",
    packageManager: "pnpm@9.15.4",
    playwright: "1.55.1",
  },
};

type Scenario = {
  browser?: Awaited<ReturnType<StagedProductionVerificationAdapters["browser"]["verify"]>>;
  catalog?: [string, string];
  deploymentAfter?: Partial<StagedProductionDeployment> & {
    productionDomains?: string[];
  };
  sourceAfter?: Partial<StagedProductionSourceIdentity>;
};

function controlledAdapters(scenario: Scenario = {}) {
  const browserRequests: unknown[] = [];
  let catalogRead = 0;
  let deploymentRead = 0;
  let sourceRead = 0;
  let signingCalls = 0;
  const signedReceipts: unknown[] = [];
  const adapters: StagedProductionVerificationAdapters = {
    attestation: {
      async sign(receipt) {
        signingCalls += 1;
        signedReceipts.push(receipt);
        return { id: "attestation-57", url: "https://example.com/attestation-57" };
      },
    },
    browser: {
      async verify(request) {
        browserRequests.push(request);
        return scenario.browser ?? {
          attempts: { chromium: 1, webkit: 1 },
          outcome: "passed",
        };
      },
    },
    catalog: {
      async fingerprint() {
        const fingerprint = scenario.catalog?.[catalogRead] ?? `sha256:${"3".repeat(64)}`;
        catalogRead += 1;
        return fingerprint as `sha256:${string}`;
      },
    },
    clock: { now: () => "2026-08-08T22:30:00.000Z" },
    deployment: {
      async create() { return deployment; },
      async inspect() {
        deploymentRead += 1;
        return {
          ...deployment,
          ...(deploymentRead === 2 ? scenario.deploymentAfter : {}),
          productionDomains:
            deploymentRead === 2
              ? scenario.deploymentAfter?.productionDomains ?? []
              : [],
          ready: true,
        };
      },
    },
    source: {
      async read() {
        sourceRead += 1;
        return {
          ...sourceIdentity,
          ...(sourceRead === 2 ? scenario.sourceAfter : {}),
        };
      },
    },
  };
  return {
    adapters,
    browserRequests,
    signedReceipts,
    signingCalls: () => signingCalls,
  };
}

describe("staged Production verification", () => {
  it("creates one domainless deployment and receipts exact Chromium and WebKit evidence through the public orchestrator", async () => {
    const controlled = controlledAdapters();

    const result = await runStagedProductionVerification(
      { candidateSha, workflowRun: "57-1" },
      controlled.adapters,
    );
    if (result.outcome !== "passed") throw new Error("Expected a passed staged verification.");

    expect(controlled.browserRequests).toEqual([{
      deployment,
      projects: ["chromium", "webkit"],
    }]);
    expect(result).toMatchObject({
      attestation: { id: "attestation-57" },
      deployment,
      inspectionUrl: deployment.url,
      outcome: "passed",
      receipt: {
        artifact: sourceIdentity.artifact,
        browsers: sourceIdentity.browsers,
        catalog: {
          after: `sha256:${"3".repeat(64)}`,
          before: `sha256:${"3".repeat(64)}`,
        },
        deployment: {
          ...deployment,
          productionDomainAssignment: "none",
        },
        predicateType: STAGED_PRODUCTION_RECEIPT_PREDICATE_TYPE,
        source: { candidateSha },
        workflowRun: "57-1",
      },
      reusable: true,
    });
    expect(controlled.signedReceipts).toEqual([result.receipt]);
  });

  it("rejects malformed source requests before creating a remote deployment", async () => {
    const controlled = controlledAdapters();
    let deploymentCalls = 0;
    controlled.adapters.deployment.create = async () => {
      deploymentCalls += 1;
      return deployment;
    };

    await expect(runStagedProductionVerification(
      { candidateSha: "dev", workflowRun: "" },
      controlled.adapters,
    )).rejects.toThrow("requires an exact candidate SHA");
    expect(deploymentCalls).toBe(0);
  });

  it("independently reconstructs every reusable receipt input and rejects substitution", async () => {
    const result = await runStagedProductionVerification(
      { candidateSha, workflowRun: "57-1" },
      controlledAdapters().adapters,
    );
    if (result.outcome !== "passed") throw new Error("Expected a passed staged verification.");
    const current = {
      catalogFingerprint: `sha256:${"3".repeat(64)}` as const,
      deployment: { ...deployment, productionDomains: [], ready: true },
      source: sourceIdentity,
      workflowRun: "57-1",
    };

    expect(() => verifyPreparedStagedProductionReceipt(result.receipt, current)).not.toThrow();
    expect(() => verifyPreparedStagedProductionReceipt(result.receipt, {
      ...current,
      source: {
        ...sourceIdentity,
        artifact: { ...sourceIdentity.artifact, buildId: "substituted-build" },
      },
    })).toThrow("independently reconstructed");
    expect(() => verifySignedStagedProductionPredicate(result.receipt, {
      ...result.receipt,
      source: { candidateSha: "d".repeat(40) },
    })).toThrow("substituted or tampered");
  });

  it.each([
    [
      "Catalog changes",
      { catalog: [`sha256:${"3".repeat(64)}`, `sha256:${"9".repeat(64)}`] },
      { outcome: "changed-input", reason: "catalog-changed" },
    ],
    [
      "source changes",
      { sourceAfter: { candidateSha: "d".repeat(40) } },
      { outcome: "changed-input", reason: "source-changed" },
    ],
    [
      "deployment changes",
      { deploymentAfter: { url: "https://substituted.vercel.app" } },
      { outcome: "changed-input", reason: "deployment-changed" },
    ],
    [
      "a Production domain is assigned",
      { deploymentAfter: { productionDomains: ["meipelle.com"] } },
      { outcome: "domain-assigned" },
    ],
    [
      "Chromium retries",
      { browser: { attempts: { chromium: 2, webkit: 1 }, outcome: "passed" } },
      { outcome: "retry-passed" },
    ],
    [
      "WebKit retries",
      { browser: { attempts: { chromium: 1, webkit: 2 }, outcome: "passed" } },
      { outcome: "retry-passed" },
    ],
    [
      "browser failure",
      { browser: { attempts: { chromium: 1, webkit: 0 }, outcome: "failed" } },
      { outcome: "failed" },
    ],
    [
      "browser timeout",
      { browser: { attempts: { chromium: 1, webkit: 0 }, outcome: "timed-out" } },
      { outcome: "timed-out" },
    ],
    [
      "browser cancellation",
      { browser: { attempts: { chromium: 1, webkit: 0 }, outcome: "cancelled" } },
      { outcome: "cancelled" },
    ],
  ] as const)("creates diagnostics but no receipt when %s", async (_name, scenario, expected) => {
    const controlled = controlledAdapters(scenario as Scenario);

    const result = await runStagedProductionVerification(
      { candidateSha, workflowRun: "57-failed-evidence" },
      controlled.adapters,
    );

    expect(result).toMatchObject({
      deployment,
      ...expected,
      reusable: false,
    });
    expect(result).not.toHaveProperty("receipt");
    expect(controlled.signingCalls()).toBe(0);
  });
});
