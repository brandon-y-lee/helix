import {
  verifyPreparedStagedProductionReceipt,
  verifySignedStagedProductionPredicate,
  type StagedProductionReceipt,
  type StagedProductionReceiptCurrentInputs,
} from "./staged-production-verification";
import type {
  ActiveOperationalVerificationIssue,
  ScheduledVerificationIdentity,
} from "./verification-orchestrator";
import type { Sha256Fingerprint } from "./routine-browser-verification";
import { canonicalizeVerificationValue, sha256Fingerprint } from "./verification-fingerprints";

export type ProductionDeployment = {
  id: string;
  target?: "production";
  url: string;
};

export type ProductionReleaseEvidence = {
  attestation: { id: string; url: string };
  current: StagedProductionReceiptCurrentInputs;
  inspected: boolean;
  receipt: StagedProductionReceipt;
  requiredChecks: Array<{
    conclusion: "success" | "failure" | "cancelled" | "pending";
    link?: string;
    name: string;
    workflow?: string;
  }>;
  signedPredicate: unknown;
};

export type ProductionPromotionAudit = {
  attestation: ProductionReleaseEvidence["attestation"];
  devSha: string;
  mainBefore: string;
  mainSha: string;
  mergeMethod: "merge";
  mergeSha: string;
  previousDeployment: ProductionDeployment;
  observedDeployment: ProductionDeployment;
  promotedAt: string;
  promotedDeployment: ProductionDeployment;
  rebuild: false;
  runtimeFingerprint: Sha256Fingerprint;
};

export type ProductionPromotionAdapters = {
  clock: { now(): string };
  deployment: {
    current(): Promise<ProductionDeployment>;
    promote(
      deployment: ProductionDeployment,
      policy: { rebuild: false },
    ): Promise<ProductionDeployment>;
  };
  evidence: {
    load(input: {
      attestationId: string;
      deploymentId: string;
    }): Promise<ProductionReleaseEvidence | undefined>;
  };
  repository: {
    prepareDevToMain(input: {
      expectedDevSha: string;
      expectedMainSha: string;
    }): Promise<{
      number: number;
      requiredChecks: ProductionReleaseEvidence["requiredChecks"];
      url: string;
    }>;
    mergeDevToMain(input: {
      expectedDevSha: string;
      expectedMainSha: string;
      expectedRuntimeFingerprint: Sha256Fingerprint;
      method: "merge";
      pullRequestNumber: number;
    }): Promise<{
      mainSha: string;
      mergeSha: string;
      runtimeFingerprint: Sha256Fingerprint;
    }>;
    readBranches(): Promise<{ devSha: string; mainSha: string }>;
  };
  scheduled: {
    findActive(): Promise<ActiveOperationalVerificationIssue | undefined>;
  };
};

export type ProductionRollbackAdapters = {
  deployment: {
    current(): Promise<ProductionDeployment>;
    restore(
      deployment: ProductionDeployment,
      policy: { rebuild: false },
    ): Promise<ProductionDeployment>;
  };
  reconciliation: {
    create(input: {
      audit: ProductionPromotionAudit;
      devSha: string;
      mainSha: string;
      reason: string;
      servedDeployment: ProductionDeployment;
    }): Promise<{ number: number; url: string }>;
  };
};

type PromotionIdentityInput = {
  attestationId: string;
  deploymentId: string;
};

function sameScheduledIdentity(
  left: ScheduledVerificationIdentity,
  right: ScheduledVerificationIdentity,
): boolean {
  return (
    left.browser.name === right.browser.name &&
    left.browser.version === right.browser.version &&
    left.catalogFingerprint === right.catalogFingerprint &&
    left.planFingerprint === right.planFingerprint &&
    left.runtimeFingerprint === right.runtimeFingerprint
  );
}

function sameDeployment(left: ProductionDeployment, right: ProductionDeployment): boolean {
  return left.id === right.id && left.url === right.url;
}

function scheduledIdentityFromEvidence(
  evidence: ProductionReleaseEvidence,
): ScheduledVerificationIdentity {
  return {
    browser: { name: "webkit", version: evidence.receipt.browsers.webkit },
    catalogFingerprint: evidence.receipt.catalog.after,
    planFingerprint: evidence.receipt.planFingerprint,
    runtimeFingerprint: evidence.receipt.artifact.runtimeFingerprint,
  };
}

function authorizationChallenge(candidate: object): string {
  const planFingerprint = sha256Fingerprint(canonicalizeVerificationValue(candidate));
  return `I explicitly authorize Production promotion plan ${planFingerprint}`;
}

export async function prepareProductionPromotion(
  input: PromotionIdentityInput,
  adapters: ProductionPromotionAdapters,
) {
  const [branches, releaseEvidence, activeFailure] = await Promise.all([
    adapters.repository.readBranches(),
    adapters.evidence.load(input),
    adapters.scheduled.findActive(),
  ]);
  if (!releaseEvidence) {
    return { outcome: "blocked" as const, reason: "missing signed Production evidence" };
  }
  if (
    releaseEvidence.attestation.id !== input.attestationId ||
    releaseEvidence.receipt.deployment.id !== input.deploymentId
  ) {
    return { outcome: "blocked" as const, reason: "Production Receipt does not match" };
  }
  try {
    verifyPreparedStagedProductionReceipt(releaseEvidence.receipt, releaseEvidence.current);
    verifySignedStagedProductionPredicate(
      releaseEvidence.receipt,
      releaseEvidence.signedPredicate,
    );
  } catch {
    return { outcome: "blocked" as const, reason: "Production Receipt does not match" };
  }
  if (!releaseEvidence.inspected) {
    return { outcome: "blocked" as const, reason: "staged deployment has not been inspected" };
  }
  if (
    releaseEvidence.requiredChecks.length === 0 ||
    releaseEvidence.requiredChecks.some((check) => check.conclusion !== "success")
  ) {
    return { outcome: "blocked" as const, reason: "required checks are not all successful" };
  }
  if (branches.devSha !== releaseEvidence.receipt.source.candidateSha) {
    return { outcome: "blocked" as const, reason: "current dev does not match the Production Receipt" };
  }

  const scheduledIdentity = scheduledIdentityFromEvidence(releaseEvidence);
  if (activeFailure) {
    return {
      issueNumber: activeFailure.number,
      outcome: "blocked" as const,
      reason: sameScheduledIdentity(activeFailure.identity, scheduledIdentity)
        ? "matching scheduled WebKit failure is active"
        : "scheduled WebKit failure has not been cleared by matching evidence",
    };
  }

  const deployment: ProductionDeployment = {
    id: releaseEvidence.receipt.deployment.id,
    target: releaseEvidence.receipt.deployment.target,
    url: releaseEvidence.receipt.deployment.url,
  };
  const releasePullRequest = await adapters.repository.prepareDevToMain({
    expectedDevSha: branches.devSha,
    expectedMainSha: branches.mainSha,
  });
  if (
    releasePullRequest.requiredChecks.length === 0 ||
    releasePullRequest.requiredChecks.some((check) => check.conclusion !== "success")
  ) {
    return { outcome: "blocked" as const, reason: "Production pull request checks are not all successful" };
  }
  const candidate = {
    attestation: releaseEvidence.attestation,
    browserEvidence: releaseEvidence.receipt.browsers,
    catalogFingerprints: releaseEvidence.receipt.catalog,
    configurationFingerprint: releaseEvidence.receipt.artifact.configurationFingerprint,
    deployment,
    devSha: branches.devSha,
    inspectionUrl: deployment.url,
    mainSha: branches.mainSha,
    receipt: releaseEvidence.receipt,
    releasePullRequest,
    runtimeFingerprint: releaseEvidence.receipt.artifact.runtimeFingerprint,
    scheduledWebkit: { identity: scheduledIdentity, status: "clear" as const },
    source: {
      candidateSha: releaseEvidence.receipt.source.candidateSha,
      requiredChecks: releaseEvidence.requiredChecks,
      workflowRun: releaseEvidence.receipt.workflowRun,
    },
    toolEvidence: releaseEvidence.receipt.tools,
  };
  const challenge = authorizationChallenge(candidate);
  return {
    authorization: { challenge, status: "required" as const },
    candidate,
    outcome: "authorization-required" as const,
  };
}

export async function runProductionPromotion(
  input: PromotionIdentityInput & { authorization?: string },
  adapters: ProductionPromotionAdapters,
) {
  const plan = await prepareProductionPromotion(input, adapters);
  if (plan.outcome !== "authorization-required") return plan;
  if (input.authorization !== plan.authorization.challenge) {
    return {
      authorizationChallenge: plan.authorization.challenge,
      outcome: "authorization-refused" as const,
    };
  }

  const merged = await adapters.repository.mergeDevToMain({
    expectedDevSha: plan.candidate.devSha,
    expectedMainSha: plan.candidate.mainSha,
    expectedRuntimeFingerprint: plan.candidate.runtimeFingerprint,
    method: "merge",
    pullRequestNumber: plan.candidate.releasePullRequest.number,
  });
  if (merged.runtimeFingerprint !== plan.candidate.runtimeFingerprint) {
    return {
      mainSha: merged.mainSha,
      outcome: "main-runtime-mismatch" as const,
      reason: "regular-merged main does not match the Production Receipt Runtime Fingerprint",
    };
  }

  const previousDeployment = await adapters.deployment.current();
  const observedDeployment = await adapters.deployment.promote(
    plan.candidate.deployment,
    { rebuild: false },
  );
  const audit: ProductionPromotionAudit = {
    attestation: plan.candidate.attestation,
    devSha: plan.candidate.devSha,
    mainBefore: plan.candidate.mainSha,
    mainSha: merged.mainSha,
    mergeMethod: "merge",
    mergeSha: merged.mergeSha,
    observedDeployment,
    previousDeployment,
    promotedAt: adapters.clock.now(),
    promotedDeployment: plan.candidate.deployment,
    rebuild: false,
    runtimeFingerprint: merged.runtimeFingerprint,
  };
  if (!sameDeployment(observedDeployment, plan.candidate.deployment)) {
    return {
      audit,
      observedDeployment,
      outcome: "promotion-substituted" as const,
      previousDeployment,
    };
  }

  return { audit, outcome: "promoted" as const };
}

export async function runProductionRollback(
  input: { audit: ProductionPromotionAudit; reason: string },
  adapters: ProductionRollbackAdapters,
) {
  const served = await adapters.deployment.current();
  if (!sameDeployment(served, input.audit.observedDeployment)) {
    return {
      outcome: "rollback-refused" as const,
      reason: "served deployment does not match the recorded promotion",
    };
  }
  const restored = await adapters.deployment.restore(
    input.audit.previousDeployment,
    { rebuild: false },
  );
  if (!sameDeployment(restored, input.audit.previousDeployment)) {
    return {
      observedDeployment: restored,
      outcome: "rollback-substituted" as const,
      reason: "Vercel did not restore the recorded known-good deployment",
    };
  }
  const issue = await adapters.reconciliation.create({
    audit: input.audit,
    devSha: input.audit.devSha,
    mainSha: input.audit.mainSha,
    reason: input.reason,
    servedDeployment: restored,
  });
  return {
    issue,
    outcome: "rolled-back" as const,
    restoredDeployment: restored,
  };
}
