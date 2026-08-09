import { describe, expect, it } from "vitest";

import {
  prepareProductionPromotion,
  runProductionPromotion,
  runProductionRollback,
  type ProductionDeployment,
  type ProductionPromotionAdapters,
  type ProductionReleaseEvidence,
  type ProductionRollbackAdapters,
  type ProductionPromotionAudit,
  type ScheduledVerificationIdentity,
} from "@/scripts/github/verification-orchestrator";

const devSha = "d".repeat(40);
const mainSha = "m".repeat(40);
const mergeSha = "e".repeat(40);
const runtimeFingerprint = `sha256:${"1".repeat(64)}` as const;
const configurationFingerprint = `sha256:${"2".repeat(64)}` as const;
const catalogFingerprint = `sha256:${"3".repeat(64)}` as const;
const planFingerprint = `sha256:${"4".repeat(64)}` as const;

const stagedDeployment = {
  id: "dpl_staged_58",
  target: "production" as const,
  url: "https://mei-pelle-staged-58.vercel.app",
};
const previousDeployment: ProductionDeployment = {
  id: "dpl_previous_known_good",
  url: "https://mei-pelle-previous.vercel.app",
};

const evidence: ProductionReleaseEvidence = {
  attestation: {
    id: "attestation-58",
    url: "https://github.com/brandon-y-lee/mei-pelle/attestations/58",
  },
  current: {
    catalogFingerprint,
    deployment: {
      ...stagedDeployment,
      productionDomains: [],
      ready: true,
    },
    source: {
      artifact: {
        buildId: "build-staged-58",
        configurationFingerprint,
        runtimeFingerprint,
      },
      browsers: {
        chromium: "Chromium 140",
        webkit: "Playwright WebKit 1.55.1",
      },
      candidateSha: devSha,
      planFingerprint,
      tools: {
        framework: "15.5.19",
        node: "v24.5.0",
        packageManager: "pnpm@9.15.4",
        playwright: "1.55.1",
      },
    },
    workflowRun: "58-1",
  },
  inspected: true,
  receipt: {
    artifact: {
      buildId: "build-staged-58",
      configurationFingerprint,
      runtimeFingerprint,
    },
    browsers: {
      chromium: "Chromium 140",
      webkit: "Playwright WebKit 1.55.1",
    },
    catalog: { after: catalogFingerprint, before: catalogFingerprint },
    completedAt: "2026-08-09T02:00:00.000Z",
    deployment: {
      ...stagedDeployment,
      productionDomainAssignment: "none",
    },
    planFingerprint,
    predicateType: "https://mei-pelle.com/attestations/staged-production-verification/v1",
    result: "passed",
    source: { candidateSha: devSha },
    tools: {
      framework: "15.5.19",
      node: "v24.5.0",
      packageManager: "pnpm@9.15.4",
      playwright: "1.55.1",
    },
    workflowRun: "58-1",
  },
  requiredChecks: [
    { conclusion: "success", name: "ci" },
    { conclusion: "success", name: "verification-system-browser-gate" },
    { conclusion: "success", name: "verification-lifecycle-gate" },
  ],
  signedPredicate: undefined,
};
evidence.signedPredicate = structuredClone(evidence.receipt);

const scheduledIdentity: ScheduledVerificationIdentity = {
  browser: { name: "webkit", version: evidence.receipt.browsers.webkit },
  catalogFingerprint,
  planFingerprint,
  runtimeFingerprint,
};

function promotionAdapters(input: {
  activeFailure?: Awaited<ReturnType<ProductionPromotionAdapters["scheduled"]["findActive"]>>;
  evidence?: ProductionReleaseEvidence;
  promoted?: ProductionDeployment;
} = {}) {
  const calls: string[] = [];
  const adapters: ProductionPromotionAdapters = {
    clock: { now: () => "2026-08-09T03:00:00.000Z" },
    deployment: {
      async current() {
        calls.push("record-previous");
        return previousDeployment;
      },
      async promote(deployment) {
        calls.push(`promote:${deployment.id}`);
        return input.promoted ?? deployment;
      },
    },
    evidence: {
      async load() {
        calls.push("load-evidence");
        return input.evidence === undefined ? evidence : input.evidence;
      },
    },
    repository: {
      async prepareDevToMain() {
        calls.push("prepare-production-pr");
        return {
          number: 158,
          requiredChecks: evidence.requiredChecks,
          url: "https://github.com/brandon-y-lee/mei-pelle/pull/158",
        };
      },
      async mergeDevToMain(release) {
        calls.push(`merge:${release.method}`);
        return { mainSha: mergeSha, mergeSha, runtimeFingerprint };
      },
      async readBranches() {
        calls.push("read-branches");
        return { devSha, mainSha };
      },
    },
    scheduled: {
      async findActive() {
        calls.push("read-scheduled-state");
        return input.activeFailure;
      },
    },
  };
  return { adapters, calls };
}

describe("Production release orchestrator", () => {
  it("shows the exact inspected candidate and refuses promotion without its explicit authorization", async () => {
    const controlled = promotionAdapters();
    const plan = await prepareProductionPromotion({
      attestationId: evidence.attestation.id,
      deploymentId: stagedDeployment.id,
    }, controlled.adapters);

    expect(plan).toMatchObject({
      authorization: { status: "required" },
      candidate: {
        attestation: evidence.attestation,
        browserEvidence: evidence.receipt.browsers,
        catalogFingerprints: evidence.receipt.catalog,
        configurationFingerprint,
        deployment: stagedDeployment,
        devSha,
        inspectionUrl: stagedDeployment.url,
        mainSha,
        receipt: evidence.receipt,
        releasePullRequest: {
          number: 158,
          requiredChecks: evidence.requiredChecks,
        },
        runtimeFingerprint,
        scheduledWebkit: { status: "clear" },
        source: {
          candidateSha: devSha,
          requiredChecks: evidence.requiredChecks,
          workflowRun: "58-1",
        },
        toolEvidence: evidence.receipt.tools,
      },
      outcome: "authorization-required",
    });
    if (plan.outcome !== "authorization-required") throw new Error("Expected an authorization plan.");

    const refused = await runProductionPromotion({
      attestationId: evidence.attestation.id,
      authorization: "workflow:approved",
      deploymentId: stagedDeployment.id,
    }, controlled.adapters);
    expect(refused).toMatchObject({
      authorizationChallenge: plan.authorization.challenge,
      outcome: "authorization-refused",
    });
    expect(controlled.calls).not.toContain("merge:merge");
    expect(controlled.calls).toContain("prepare-production-pr");
    expect(controlled.calls.every((call) => !call.startsWith("promote:"))).toBe(true);
  });

  it("regular-merges the exact dev state and promotes the receipted deployment without rebuilding", async () => {
    const controlled = promotionAdapters();
    const plan = await prepareProductionPromotion({
      attestationId: evidence.attestation.id,
      deploymentId: stagedDeployment.id,
    }, controlled.adapters);
    if (plan.outcome !== "authorization-required") throw new Error("Expected an authorization plan.");

    const result = await runProductionPromotion({
      attestationId: evidence.attestation.id,
      authorization: plan.authorization.challenge,
      deploymentId: stagedDeployment.id,
    }, controlled.adapters);

    expect(result).toMatchObject({
      audit: {
        attestation: evidence.attestation,
        devSha,
        mainBefore: mainSha,
        mainSha: mergeSha,
        mergeMethod: "merge",
        mergeSha,
        observedDeployment: stagedDeployment,
        previousDeployment,
        promotedDeployment: stagedDeployment,
        promotedAt: "2026-08-09T03:00:00.000Z",
        rebuild: false,
      },
      outcome: "promoted",
    });
    expect(controlled.calls).toContain("merge:merge");
    expect(controlled.calls).toContain(`promote:${stagedDeployment.id}`);
    expect(controlled.calls).toContain("record-previous");
  });

  it("blocks missing, mismatched, uninspected, or failing evidence before authorization", async () => {
    const scenarios: Array<[string, ProductionReleaseEvidence | undefined]> = [
      ["missing signed Production evidence", undefined],
      ["Production Receipt does not match", {
        ...evidence,
        signedPredicate: { ...evidence.receipt, source: { candidateSha: "c".repeat(40) } },
      }],
      ["staged deployment has not been inspected", { ...evidence, inspected: false }],
      ["required checks are not all successful", {
        ...evidence,
        requiredChecks: [{ conclusion: "failure", name: "ci" }],
      }],
    ];

    for (const [reason, candidateEvidence] of scenarios) {
      const controlled = promotionAdapters({
        evidence: candidateEvidence as ProductionReleaseEvidence,
      });
      if (candidateEvidence === undefined) {
        controlled.adapters.evidence.load = async () => undefined;
      }
      await expect(prepareProductionPromotion({
        attestationId: evidence.attestation.id,
        deploymentId: stagedDeployment.id,
      }, controlled.adapters)).resolves.toMatchObject({ outcome: "blocked", reason });
      expect(controlled.calls).not.toContain("merge:merge");
    }
  });

  it("blocks while matching scheduled WebKit failure state is active", async () => {
    const controlled = promotionAdapters({
      activeFailure: {
        identity: scheduledIdentity,
        kind: "browser-failed",
        number: 154,
        summary: "WebKit failed.",
      },
    });

    await expect(prepareProductionPromotion({
      attestationId: evidence.attestation.id,
      deploymentId: stagedDeployment.id,
    }, controlled.adapters)).resolves.toMatchObject({
      issueNumber: 154,
      outcome: "blocked",
      reason: "matching scheduled WebKit failure is active",
    });
  });

  it("rejects a substituted deployment after promotion", async () => {
    const substituted = {
      id: "dpl_substituted",
      url: "https://mei-pelle-substituted.vercel.app",
    };
    const controlled = promotionAdapters({ promoted: substituted });
    const plan = await prepareProductionPromotion({
      attestationId: evidence.attestation.id,
      deploymentId: stagedDeployment.id,
    }, controlled.adapters);
    if (plan.outcome !== "authorization-required") throw new Error("Expected an authorization plan.");

    const result = await runProductionPromotion({
      attestationId: evidence.attestation.id,
      authorization: plan.authorization.challenge,
      deploymentId: stagedDeployment.id,
    }, controlled.adapters);
    expect(result).toMatchObject({
      audit: {
        observedDeployment: substituted,
        previousDeployment,
        promotedDeployment: stagedDeployment,
      },
      observedDeployment: substituted,
      outcome: "promotion-substituted",
      previousDeployment,
    });
    if (!("audit" in result) || !result.audit) throw new Error("Expected recovery audit evidence.");
    const recoveryCalls: string[] = [];
    await expect(runProductionRollback({ audit: result.audit, reason: "Provider substitution" }, {
      deployment: {
        async current() { return substituted; },
        async restore(deployment) {
          recoveryCalls.push(`restore:${deployment.id}`);
          return deployment;
        },
      },
      reconciliation: {
        async create() {
          recoveryCalls.push("create-reconciliation");
          return { number: 160, url: "https://github.com/brandon-y-lee/mei-pelle/issues/160" };
        },
      },
    })).resolves.toMatchObject({ outcome: "rolled-back", restoredDeployment: previousDeployment });
    expect(recoveryCalls).toEqual([`restore:${previousDeployment.id}`, "create-reconciliation"]);
  });

  it("restores the recorded deployment before opening reconciliation", async () => {
    const promotion = promotionAdapters();
    const plan = await prepareProductionPromotion({
      attestationId: evidence.attestation.id,
      deploymentId: stagedDeployment.id,
    }, promotion.adapters);
    if (plan.outcome !== "authorization-required") throw new Error("Expected an authorization plan.");
    const promoted = await runProductionPromotion({
      attestationId: evidence.attestation.id,
      authorization: plan.authorization.challenge,
      deploymentId: stagedDeployment.id,
    }, promotion.adapters);
    if (promoted.outcome !== "promoted") throw new Error("Expected promotion audit evidence.");

    const calls: string[] = [];
    const rollbackAdapters: ProductionRollbackAdapters = {
      deployment: {
        async current() { return stagedDeployment; },
        async restore(deployment) {
          calls.push(`restore:${deployment.id}`);
          return deployment;
        },
      },
      reconciliation: {
        async create(input) {
          calls.push(`issue-after:${input.servedDeployment.id}`);
          expect(calls[0]).toBe(`restore:${previousDeployment.id}`);
          return { number: 159, url: "https://github.com/brandon-y-lee/mei-pelle/issues/159" };
        },
      },
    };

    const result = await runProductionRollback({
      audit: promoted.audit,
      reason: "Production health verification failed.",
    }, rollbackAdapters);

    expect(result).toEqual({
      issue: { number: 159, url: "https://github.com/brandon-y-lee/mei-pelle/issues/159" },
      outcome: "rolled-back",
      restoredDeployment: previousDeployment,
    });
    expect(calls).toEqual([
      `restore:${previousDeployment.id}`,
      `issue-after:${previousDeployment.id}`,
    ]);
  });

  it("refuses rollback when the served deployment is not the recorded promotion", async () => {
    const audit: ProductionPromotionAudit = {
      attestation: evidence.attestation,
      devSha,
      mainBefore: mainSha,
      mainSha: mergeSha,
      mergeMethod: "merge",
      mergeSha,
      observedDeployment: stagedDeployment,
      previousDeployment,
      promotedAt: "2026-08-09T03:00:00.000Z",
      promotedDeployment: stagedDeployment,
      rebuild: false,
      runtimeFingerprint,
    };
    const adapters: ProductionRollbackAdapters = {
      deployment: {
        async current() {
          return { id: "dpl_unknown", url: "https://unknown.vercel.app" };
        },
        async restore() { throw new Error("must not restore from mismatched audit"); },
      },
      reconciliation: {
        async create() { throw new Error("must not create issue before restoration"); },
      },
    };

    await expect(runProductionRollback({ audit, reason: "Failure" }, adapters)).resolves.toMatchObject({
      outcome: "rollback-refused",
      reason: "served deployment does not match the recorded promotion",
    });
  });
});
