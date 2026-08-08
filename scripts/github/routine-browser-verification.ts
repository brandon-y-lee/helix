export const VERIFICATION_RECEIPT_PREDICATE_TYPE =
  "https://mei-pelle.com/attestations/browser-verification/v1";

export const VERIFICATION_RETENTION_POLICY = {
  failureDiagnosticsDays: 90,
  receipt: "repository-lifetime",
  successfulReportsDays: 30,
  telemetryDays: 30,
} as const;

export type Sha256Fingerprint = `sha256:${string}`;

export type VerificationReceipt = {
  artifact: {
    buildId: string;
    configurationFingerprint: Sha256Fingerprint;
    runtimeFingerprint: Sha256Fingerprint;
  };
  browsers: { chromium: string };
  catalog: {
    before: Sha256Fingerprint;
    after: Sha256Fingerprint;
  };
  completedAt: string;
  integration: {
    baseSha: string;
    candidateSha: string;
    pullRequest: number;
  };
  planFingerprint: Sha256Fingerprint;
  result: "passed";
  tools: {
    framework: string;
    node: string;
    packageManager: string;
    playwright: string;
  };
  workflowRun: string;
};

export type RoutineBrowserVerificationInput = {
  baseSha: string;
  browserVersions: { chromium: string };
  candidateSha: string;
  frameworkVersion: string;
  nodeVersion: string;
  packageManagerVersion: string;
  planFingerprint: Sha256Fingerprint;
  playwrightVersion: string;
  pullRequest: number;
  workflowRun: string;
};

export type RoutineBrowserVerificationAdapters = {
  artifact: {
    prepare(): Promise<VerificationReceipt["artifact"]>;
  };
  attestation: {
    lookup(runtimeFingerprint: Sha256Fingerprint): Promise<Array<{
      id: string;
      receipt: VerificationReceipt;
    }>>;
    sign(receipt: VerificationReceipt): Promise<{
      id: string;
      receipt: VerificationReceipt;
    }>;
  };
  browser: {
    verify(input: {
      buildId: string;
      projects: readonly ["chromium"];
    }): Promise<{
      attempts: number;
      outcome: "passed" | "failed" | "partial" | "cancelled" | "timed-out";
    }>;
  };
  catalog: {
    fingerprint(): Promise<Sha256Fingerprint>;
  };
  clock: {
    now(): string;
  };
};

export type CurrentVerificationInputs = {
  artifact: VerificationReceipt["artifact"];
  browsers: VerificationReceipt["browsers"];
  catalogFingerprint: Sha256Fingerprint;
  integration: VerificationReceipt["integration"];
  planFingerprint: Sha256Fingerprint;
  tools: VerificationReceipt["tools"];
};

export type ProtectedPushVerificationInputs = Omit<
  CurrentVerificationInputs,
  "artifact" | "browsers"
> & {
  artifact: Omit<CurrentVerificationInputs["artifact"], "buildId">;
};

function requireCommitSha(value: string, label: string): void {
  if (!/^[0-9a-f]{40}$/.test(value)) {
    throw new Error(`Routine Browser Verification requires an exact ${label} SHA.`);
  }
}

function requireFingerprint(value: string, label: string): void {
  if (!/^sha256:[0-9a-f]{64}$/.test(value)) {
    throw new Error(`Routine Browser Verification requires a valid ${label}.`);
  }
}

function validateInput(input: RoutineBrowserVerificationInput): void {
  requireCommitSha(input.baseSha, "base");
  requireCommitSha(input.candidateSha, "candidate");
  requireFingerprint(input.planFingerprint, "Browser Verification Plan fingerprint");
  if (!Number.isSafeInteger(input.pullRequest) || input.pullRequest < 1) {
    throw new Error("Routine Browser Verification requires a valid pull request number.");
  }
  for (const [label, value] of Object.entries({
    Chromium: input.browserVersions.chromium,
    Framework: input.frameworkVersion,
    Node: input.nodeVersion,
    "package manager": input.packageManagerVersion,
    Playwright: input.playwrightVersion,
    "workflow run": input.workflowRun,
  })) {
    if (!value.trim()) {
      throw new Error(`Routine Browser Verification requires ${label} identity.`);
    }
  }
}

function matchesCurrentInputs(
  receipt: VerificationReceipt,
  current: CurrentVerificationInputs,
): boolean {
  return (
    receipt.result === "passed" &&
    receipt.catalog.before === current.catalogFingerprint &&
    receipt.catalog.after === current.catalogFingerprint &&
    receipt.artifact.buildId === current.artifact.buildId &&
    receipt.artifact.runtimeFingerprint === current.artifact.runtimeFingerprint &&
    receipt.artifact.configurationFingerprint === current.artifact.configurationFingerprint &&
    receipt.browsers.chromium === current.browsers.chromium &&
    receipt.integration.baseSha === current.integration.baseSha &&
    receipt.integration.candidateSha === current.integration.candidateSha &&
    receipt.integration.pullRequest === current.integration.pullRequest &&
    receipt.planFingerprint === current.planFingerprint &&
    receipt.tools.node === current.tools.node &&
    receipt.tools.framework === current.tools.framework &&
    receipt.tools.packageManager === current.tools.packageManager &&
    receipt.tools.playwright === current.tools.playwright
  );
}

export async function findReusableVerificationReceipt(
  current: CurrentVerificationInputs,
  attestation: Pick<RoutineBrowserVerificationAdapters["attestation"], "lookup">,
) {
  const candidates = await attestation.lookup(current.artifact.runtimeFingerprint);
  const match = candidates.find(({ receipt }) => matchesCurrentInputs(receipt, current));
  if (!match) return { outcome: "missing" as const, reusable: false as const };
  return {
    attestationId: match.id,
    outcome: "reused" as const,
    receipt: match.receipt,
  };
}

export async function findReusableProtectedPushReceipt(
  current: ProtectedPushVerificationInputs,
  attestation: Pick<RoutineBrowserVerificationAdapters["attestation"], "lookup">,
) {
  const candidates = await attestation.lookup(current.artifact.runtimeFingerprint);
  for (const candidate of candidates) {
    const result = await findReusableVerificationReceipt(
      {
        ...current,
        artifact: { ...current.artifact, buildId: candidate.receipt.artifact.buildId },
        browsers: candidate.receipt.browsers,
      },
      { async lookup() { return [candidate]; } },
    );
    if (result.outcome === "reused") return result;
  }
  return { outcome: "missing" as const, reusable: false as const };
}

export async function runRoutineBrowserVerification(
  input: RoutineBrowserVerificationInput,
  adapters: RoutineBrowserVerificationAdapters,
) {
  validateInput(input);
  const preparedArtifact = await adapters.artifact.prepare();
  if (!preparedArtifact.buildId.trim()) {
    throw new Error("Routine Browser Verification requires a production build ID.");
  }
  requireFingerprint(preparedArtifact.runtimeFingerprint, "Runtime fingerprint");
  requireFingerprint(
    preparedArtifact.configurationFingerprint,
    "configuration fingerprint",
  );
  const artifact: VerificationReceipt["artifact"] = {
    buildId: preparedArtifact.buildId,
    configurationFingerprint: preparedArtifact.configurationFingerprint,
    runtimeFingerprint: preparedArtifact.runtimeFingerprint,
  };
  const before = await adapters.catalog.fingerprint();
  const browser = await adapters.browser.verify({
    buildId: artifact.buildId,
    projects: ["chromium"],
  });
  const after = await adapters.catalog.fingerprint();
  if (before !== after) {
    return {
      outcome: "changed-input" as const,
      reason: "catalog-changed" as const,
      reusable: false as const,
    };
  }
  if (browser.outcome !== "passed") {
    return { outcome: browser.outcome, reusable: false as const };
  }
  if (browser.attempts !== 1) {
    return { outcome: "retry-passed" as const, reusable: false as const };
  }

  const receipt: VerificationReceipt = {
    artifact,
    browsers: input.browserVersions,
    catalog: { after, before },
    completedAt: adapters.clock.now(),
    integration: {
      baseSha: input.baseSha,
      candidateSha: input.candidateSha,
      pullRequest: input.pullRequest,
    },
    planFingerprint: input.planFingerprint,
    result: "passed",
    tools: {
      framework: input.frameworkVersion,
      node: input.nodeVersion,
      packageManager: input.packageManagerVersion,
      playwright: input.playwrightVersion,
    },
    workflowRun: input.workflowRun,
  };
  const attestation = await adapters.attestation.sign(receipt);
  return {
    attestationId: attestation.id,
    outcome: "passed" as const,
    receipt,
    reusable: true as const,
  };
}
