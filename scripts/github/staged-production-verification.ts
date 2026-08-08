import type { Sha256Fingerprint } from "./routine-browser-verification";

export const STAGED_PRODUCTION_RECEIPT_PREDICATE_TYPE =
  "https://mei-pelle.com/attestations/staged-production-verification/v1";

export type StagedProductionDeployment = {
  id: string;
  target: "production";
  url: string;
};

export type StagedProductionSourceIdentity = {
  artifact: {
    buildId: string;
    configurationFingerprint: Sha256Fingerprint;
    runtimeFingerprint: Sha256Fingerprint;
  };
  browsers: { chromium: string; webkit: string };
  candidateSha: string;
  planFingerprint: Sha256Fingerprint;
  tools: {
    framework: string;
    node: string;
    packageManager: string;
    playwright: string;
  };
};

export type StagedProductionReceipt = {
  artifact: StagedProductionSourceIdentity["artifact"];
  browsers: StagedProductionSourceIdentity["browsers"];
  catalog: { after: Sha256Fingerprint; before: Sha256Fingerprint };
  completedAt: string;
  deployment: StagedProductionDeployment & {
    productionDomainAssignment: "none";
  };
  planFingerprint: Sha256Fingerprint;
  predicateType: typeof STAGED_PRODUCTION_RECEIPT_PREDICATE_TYPE;
  result: "passed";
  source: { candidateSha: string };
  tools: StagedProductionSourceIdentity["tools"];
  workflowRun: string;
};

export type StagedProductionReceiptCurrentInputs = {
  catalogFingerprint: Sha256Fingerprint;
  deployment: StagedProductionDeployment & { productionDomains: string[]; ready: boolean };
  source: StagedProductionSourceIdentity;
  workflowRun: string;
};

export type StagedProductionVerificationAdapters = {
  attestation: {
    sign(receipt: StagedProductionReceipt): Promise<{ id: string; url: string }>;
  };
  browser: {
    verify(input: {
      deployment: StagedProductionDeployment;
      projects: readonly ["chromium", "webkit"];
    }): Promise<{
      attempts: { chromium: number; webkit: number };
      outcome: "passed" | "failed" | "partial" | "cancelled" | "timed-out";
    }>;
  };
  catalog: { fingerprint(): Promise<Sha256Fingerprint> };
  clock: { now(): string };
  deployment: {
    create(input: {
      candidateSha: string;
      skipDomain: true;
      target: "production";
    }): Promise<StagedProductionDeployment>;
    inspect(id: string): Promise<StagedProductionDeployment & {
      productionDomains: string[];
      ready: boolean;
    }>;
  };
  source: { read(deployment: StagedProductionDeployment): Promise<StagedProductionSourceIdentity> };
};

function sameDeployment(
  expected: StagedProductionDeployment,
  observed: StagedProductionDeployment,
): boolean {
  return (
    expected.id === observed.id &&
    expected.target === observed.target &&
    expected.url === observed.url
  );
}

function sameSource(
  expected: StagedProductionSourceIdentity,
  observed: StagedProductionSourceIdentity,
): boolean {
  return JSON.stringify(expected) === JSON.stringify(observed);
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => (
      `${JSON.stringify(key)}:${canonicalJson(record[key])}`
    )).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function verifyPreparedStagedProductionReceipt(
  receipt: StagedProductionReceipt,
  current: StagedProductionReceiptCurrentInputs,
): void {
  const deploymentMatches =
    current.deployment.ready &&
    current.deployment.productionDomains.length === 0 &&
    sameDeployment(receipt.deployment, current.deployment);
  const sourceMatches =
    receipt.source.candidateSha === current.source.candidateSha &&
    canonicalJson(receipt.artifact) === canonicalJson(current.source.artifact) &&
    canonicalJson(receipt.browsers) === canonicalJson(current.source.browsers) &&
    receipt.planFingerprint === current.source.planFingerprint &&
    canonicalJson(receipt.tools) === canonicalJson(current.source.tools);
  const receiptIsCanonical =
    receipt.predicateType === STAGED_PRODUCTION_RECEIPT_PREDICATE_TYPE &&
    receipt.result === "passed" &&
    receipt.deployment.productionDomainAssignment === "none" &&
    receipt.catalog.before === current.catalogFingerprint &&
    receipt.catalog.after === current.catalogFingerprint &&
    /^\d+-\d+$/.test(receipt.workflowRun) && receipt.workflowRun === current.workflowRun &&
    !Number.isNaN(Date.parse(receipt.completedAt));
  if (!deploymentMatches || !sourceMatches || !receiptIsCanonical) {
    throw new Error("Production Receipt does not match independently reconstructed staged inputs.");
  }
}

export function verifySignedStagedProductionPredicate(
  receipt: StagedProductionReceipt,
  verifiedPredicate: unknown,
): void {
  if (canonicalJson(receipt) !== canonicalJson(verifiedPredicate)) {
    throw new Error("Verified Production Receipt predicate was substituted or tampered with.");
  }
}

function domainAssigned(deployment: StagedProductionDeployment, productionDomains: string[]) {
  if (productionDomains.length === 0) return null;
  return {
    deployment,
    diagnostics: { reason: "Production domains were assigned to the staged deployment." },
    outcome: "domain-assigned" as const,
    reusable: false as const,
  };
}

export async function prepareStagedProductionVerification(
  input: { candidateSha: string; workflowRun: string },
  adapters: Omit<StagedProductionVerificationAdapters, "attestation">,
) {
  if (!/^[0-9a-f]{40}$/.test(input.candidateSha)) {
    throw new Error("Staged Production verification requires an exact candidate SHA.");
  }
  if (!input.workflowRun.trim()) {
    throw new Error("Staged Production verification requires a workflow run identity.");
  }
  const deployment = await adapters.deployment.create({
    candidateSha: input.candidateSha,
    skipDomain: true,
    target: "production",
  });
  const initialDeployment = await adapters.deployment.inspect(deployment.id);
  const initialDomainFailure = domainAssigned(deployment, initialDeployment.productionDomains);
  if (initialDomainFailure) return initialDomainFailure;
  if (!initialDeployment.ready || !sameDeployment(deployment, initialDeployment)) {
    return {
      deployment,
      diagnostics: { reason: "Vercel did not expose the exact ready staged deployment." },
      outcome: "deployment-invalid" as const,
      reusable: false as const,
    };
  }
  const source = await adapters.source.read(deployment);
  if (source.candidateSha !== input.candidateSha) {
    return {
      deployment,
      diagnostics: { reason: "The staged source does not match the requested candidate." },
      outcome: "changed-input" as const,
      reason: "source-changed" as const,
      reusable: false as const,
    };
  }
  const before = await adapters.catalog.fingerprint();
  const browser = await adapters.browser.verify({
    deployment,
    projects: ["chromium", "webkit"],
  });
  const after = await adapters.catalog.fingerprint();
  const finalSource = await adapters.source.read(deployment);
  const finalDeployment = await adapters.deployment.inspect(deployment.id);

  const finalDomainFailure = domainAssigned(deployment, finalDeployment.productionDomains);
  if (finalDomainFailure) return finalDomainFailure;
  if (!sameDeployment(deployment, finalDeployment)) {
    return {
      deployment,
      diagnostics: { reason: "The staged deployment identity changed during verification." },
      outcome: "changed-input" as const,
      reason: "deployment-changed" as const,
      reusable: false as const,
    };
  }
  if (!sameSource(source, finalSource)) {
    return {
      deployment,
      diagnostics: { reason: "The staged source identity changed during verification." },
      outcome: "changed-input" as const,
      reason: "source-changed" as const,
      reusable: false as const,
    };
  }
  if (before !== after) {
    return {
      deployment,
      diagnostics: { reason: "Catalog facts changed during verification." },
      outcome: "changed-input" as const,
      reason: "catalog-changed" as const,
      reusable: false as const,
    };
  }

  if (browser.outcome !== "passed") {
    return {
      deployment,
      diagnostics: { attempts: browser.attempts },
      outcome: browser.outcome,
      reusable: false as const,
    };
  }
  if (browser.attempts.chromium !== 1 || browser.attempts.webkit !== 1) {
    return {
      deployment,
      diagnostics: { attempts: browser.attempts },
      outcome: "retry-passed" as const,
      reusable: false as const,
    };
  }

  const receipt: StagedProductionReceipt = {
    artifact: source.artifact,
    browsers: source.browsers,
    catalog: { after, before },
    completedAt: adapters.clock.now(),
    deployment: { ...deployment, productionDomainAssignment: "none" },
    planFingerprint: source.planFingerprint,
    predicateType: STAGED_PRODUCTION_RECEIPT_PREDICATE_TYPE,
    result: "passed",
    source: { candidateSha: source.candidateSha },
    tools: source.tools,
    workflowRun: input.workflowRun,
  };
  return {
    deployment,
    inspectionUrl: deployment.url,
    outcome: "passed" as const,
    receipt,
    reusable: false as const,
  };
}

export async function runStagedProductionVerification(
  input: { candidateSha: string; workflowRun: string },
  adapters: StagedProductionVerificationAdapters,
) {
  const prepared = await prepareStagedProductionVerification(input, adapters);
  if (prepared.outcome !== "passed") return prepared;
  const attestation = await adapters.attestation.sign(prepared.receipt);
  return { ...prepared, attestation, reusable: true as const };
}
