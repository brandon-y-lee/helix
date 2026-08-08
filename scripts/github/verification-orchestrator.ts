import {
  recordScheduledVerificationFailure,
  scheduledFailureFromClassifiedEvidence,
} from "./scheduled-verification-issue.mjs";
export * from "./spec-integration-lifecycle";

export const INTEGRATION_TIMEOUT_MS = 20 * 60 * 1_000;

export type WorkClass =
  | "completed-spec"
  | "standalone"
  | "urgent"
  | "planning"
  | "documentation"
  | "trivial"
  | "verification-system";

export type VerificationGate = "complete-behavioral" | "fast-non-runtime";
export type RiskArea = "security" | "payment" | "data" | "provider" | "cross-cutting";

export type Sha256Fingerprint = `sha256:${string}`;

export type ScheduledVerificationIdentity = {
  browser: { name: "webkit"; version: string };
  catalogFingerprint: Sha256Fingerprint;
  planFingerprint: Sha256Fingerprint;
  runtimeFingerprint: Sha256Fingerprint;
};

export type ScheduledVerificationFailure = {
  kind: "browser-failed" | "catalog-unavailable" | "reconciliation-failed" | "setup-failed";
  identity: ScheduledVerificationIdentity;
  summary: string;
};

export type ActiveOperationalVerificationIssue = ScheduledVerificationFailure & {
  number: number;
};

export interface OperationalVerificationIssueAdapter {
  findActive(): Promise<ActiveOperationalVerificationIssue | undefined>;
  create(failure: ScheduledVerificationFailure): Promise<{ number: number }>;
  update(number: number, failure: ScheduledVerificationFailure): Promise<void>;
  close(number: number, recovery: ScheduledVerificationIdentity): Promise<void>;
}

export interface ScheduledBrowserVerificationAdapter {
  verifyCompleteWebkit(): Promise<
    | { identity: ScheduledVerificationIdentity; outcome: "passed" }
    | {
        failureKind: "browser-failed" | "catalog-unavailable";
        identity: ScheduledVerificationIdentity;
        outcome: "failed";
      }
  >;
}

export type ScheduledBrowserVerificationReport = {
  identity: ScheduledVerificationIdentity;
  issueNumber?: number;
  outcome: "failed" | "passed" | "nonmatching-recovery";
  productionPromotion: "blocked" | "unblocked";
};

function sameScheduledVerificationIdentity(
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

export function evaluateProductionPromotion(
  active: ActiveOperationalVerificationIssue | undefined,
  candidate: ScheduledVerificationIdentity,
):
  | { status: "allowed" }
  | { status: "blocked"; issueNumber: number; reason: string } {
  if (!active) return { status: "allowed" };
  return {
    issueNumber: active.number,
    reason: sameScheduledVerificationIdentity(active.identity, candidate)
      ? "matching scheduled WebKit failure is active"
      : "scheduled WebKit failure has not been cleared by matching evidence",
    status: "blocked",
  };
}

export async function runScheduledBrowserVerification(adapters: {
  issues: OperationalVerificationIssueAdapter;
  onEvidenceClassified?(result: Awaited<ReturnType<ScheduledBrowserVerificationAdapter["verifyCompleteWebkit"]>>): Promise<void>;
  verification: ScheduledBrowserVerificationAdapter;
}): Promise<ScheduledBrowserVerificationReport> {
  const result = await adapters.verification.verifyCompleteWebkit();
  await adapters.onEvidenceClassified?.(result);
  if (result.outcome === "failed") {
    const failure = scheduledFailureFromClassifiedEvidence(result) as ScheduledVerificationFailure;
    const issueNumber = await recordScheduledVerificationFailure(adapters.issues, failure);
    return {
      identity: result.identity,
      issueNumber,
      outcome: "failed",
      productionPromotion: "blocked",
    };
  }

  const active = await adapters.issues.findActive();
  if (active && sameScheduledVerificationIdentity(active.identity, result.identity)) {
    await adapters.issues.close(active.number, result.identity);
    return {
      identity: result.identity,
      issueNumber: active.number,
      outcome: "passed",
      productionPromotion: "unblocked",
    };
  }
  if (active) {
    return {
      identity: result.identity,
      issueNumber: active.number,
      outcome: "nonmatching-recovery",
      productionPromotion: "blocked",
    };
  }
  return {
    identity: result.identity,
    outcome: "passed",
    productionPromotion: "unblocked",
  };
}

export type WindowsLifecycleSource =
  | "pull_request"
  | "schedule"
  | "workflow_dispatch";

export interface WindowsLifecycleVerificationAdapter {
  verifyLifecycle(input: { reason: string }): Promise<{ outcome: "passed" | "failed" }>;
}

export const WINDOWS_LIFECYCLE_PATH_PATTERNS = [
  ".github/workflows/**",
  "scripts/github/**",
  "scripts/affected-browser-verification*",
  "scripts/browser-verification-plan*",
  "scripts/production-verification*",
  "scripts/verify-affected*",
  "scripts/verify-production*",
  "tests/affected-browser-verification*",
  "tests/integration-workflow*",
  "tests/production-verification*",
  "tests/scheduled-*",
  "tests/verification-orchestrator*",
  "e2e/**",
  "playwright-global-setup.ts",
  "test-support/**",
  ".nvmrc",
  "package.json",
  "pnpm-lock.yaml",
  "playwright.config.ts",
  "tsconfig.json",
] as const;

function matchesWindowsLifecyclePath(path: string): boolean {
  return WINDOWS_LIFECYCLE_PATH_PATTERNS.some((pattern) => {
    if (pattern.endsWith("/**")) return path.startsWith(pattern.slice(0, -2));
    if (pattern.endsWith("*")) return path.startsWith(pattern.slice(0, -1));
    return path === pattern;
  });
}

function windowsLifecycleReason(input: {
  changedFiles: readonly string[];
  source: WindowsLifecycleSource;
}): string | undefined {
  if (input.source === "schedule") return "scheduled";
  if (input.source === "workflow_dispatch") return "manually requested";
  if (
    input.changedFiles.some(
      (path) =>
        path.startsWith("scripts/production-verification") ||
        path.startsWith("scripts/verify-production") ||
        path.startsWith("tests/production-verification"),
    )
  ) {
    return "production-verification process control changed";
  }
  if (
    input.changedFiles.some((path) =>
      [".nvmrc", "package.json", "pnpm-lock.yaml", "playwright.config.ts", "tsconfig.json"].includes(path),
    )
  ) {
    return "verification dependency inputs changed";
  }
  if (
    input.changedFiles.some(matchesWindowsLifecyclePath)
  ) {
    return "verification-system orchestration changed";
  }
  return undefined;
}

export async function runWindowsLifecycleVerification(
  input: { changedFiles: readonly string[]; source: WindowsLifecycleSource },
  adapter: WindowsLifecycleVerificationAdapter,
): Promise<{ outcome: "passed" | "failed" | "skipped"; reason: string }> {
  const reason = windowsLifecycleReason(input);
  if (!reason) {
    return { outcome: "skipped", reason: "no Windows lifecycle input changed" };
  }
  const result = await adapter.verifyLifecycle({ reason });
  return { outcome: result.outcome, reason };
}

export type IntegrationCandidate = {
  number: number;
  target: "dev";
  headSha: string;
  readyAt: string;
  workClass: WorkClass;
  changedFiles: string[];
  fastPathProof?: string[];
  riskAreas?: RiskArea[];
  labels: string[];
  ready: boolean;
};

export type RepositorySnapshot = {
  devSha: string;
  candidates: IntegrationCandidate[];
};

export type FrozenCandidate = {
  number: number;
  baseSha: string;
  headSha: string;
};

export interface RepositoryAdapter {
  read(signal?: AbortSignal): Promise<RepositorySnapshot>;
  queue(candidate: Pick<IntegrationCandidate, "number" | "headSha">): Promise<boolean>;
  claim(candidate: FrozenCandidate): Promise<boolean>;
  release(candidate: FrozenCandidate, outcome: "merged" | "review"): Promise<void>;
}

export interface GitAdapter {
  prepare(candidate: FrozenCandidate & { signal: AbortSignal }): Promise<{ candidateSha: string }>;
}

export interface VerificationAdapter {
  verify(input: FrozenCandidate & {
    candidateSha: string;
    gate: VerificationGate;
    reasons: string[];
    timeoutMs: number;
    signal: AbortSignal;
  }): Promise<{ outcome: "passed" | "failed" }>;
}

export interface MergeAdapter {
  merge(input: FrozenCandidate & {
    candidateSha: string;
    mergeMethod: "squash" | "merge";
    signal: AbortSignal;
  }): Promise<{ mergeSha: string }>;
}

export type IntegrationAttempt = FrozenCandidate &
  (
    | { outcome: "rejected"; reason: "trivial-path-not-proven" }
    | { outcome: "execution-failed"; stage: "git" | "verification" | "merge" }
    | {
        outcome: "timed-out" | "cancelled";
        stage: "git" | "verification" | "merge";
        candidateSha?: string;
        gate: VerificationGate;
        reasons: string[];
      }
    | ({ candidateSha: string; gate: VerificationGate; reasons: string[] } &
        (
          | { outcome: "merged"; mergeSha: string; mergeMethod: "squash" | "merge" }
          | { outcome: "failed" }
          | {
              outcome: "changed-input";
              reason: "base-changed" | "head-changed" | "ownership-lost";
            }
        ))
  );

export type IntegrationReport =
  | {
      outcome: "merged" | "idle" | "claim-lost" | "exhausted" | "handoff";
      attempts: IntegrationAttempt[];
    }
  | { outcome: "busy"; activeNumber: number; attempts: IntegrationAttempt[] };

type IntegrationAdapters = {
  repository: RepositoryAdapter;
  git: GitAdapter;
  verification: VerificationAdapter;
  merge: MergeAdapter;
};

type IntegrationOptions = {
  timeoutMs?: number;
  signal?: AbortSignal;
};

function isReviewedNonRuntimePath(path: string): boolean {
  return path.endsWith(".md") || path.startsWith("docs/");
}

function planFor(candidate: IntegrationCandidate): {
  gate: VerificationGate;
  reasons: string[];
} {
  if (candidate.riskAreas?.length) {
    return {
      gate: "complete-behavioral",
      reasons: candidate.riskAreas.map(
        (risk) => `${risk} risk retains proportional broader checks`,
      ),
    };
  }
  if (
    ["planning", "documentation", "trivial"].includes(candidate.workClass) &&
    candidate.changedFiles.length > 0 &&
    candidate.changedFiles.every(isReviewedNonRuntimePath)
  ) {
    return {
      gate: "fast-non-runtime",
      reasons: [`${candidate.workClass} declares only reviewed non-runtime paths`],
    };
  }
  return {
    gate: "complete-behavioral",
    reasons: [`${candidate.workClass} retains the complete behavioral gate`],
  };
}

function hasExactTrivialProof(candidate: IntegrationCandidate): boolean {
  if (candidate.workClass !== "trivial") return true;
  const changed = [...candidate.changedFiles].sort();
  const proof = [...(candidate.fastPathProof ?? [])].sort();
  return (
    changed.length > 0 &&
    changed.every(isReviewedNonRuntimePath) &&
    changed.length === proof.length &&
    changed.every((path, index) => path === proof[index])
  );
}

type SlotInterruption = { kind: "interrupted"; outcome: "timed-out" | "cancelled" };

function startSlot(options: IntegrationOptions) {
  const controller = new AbortController();
  const timeoutMs = Math.min(options.timeoutMs ?? INTEGRATION_TIMEOUT_MS, INTEGRATION_TIMEOUT_MS);
  let settle!: (result: SlotInterruption) => void;
  let settled = false;
  const interruption = new Promise<SlotInterruption>((resolve) => {
    settle = resolve;
  });
  const interrupt = (outcome: SlotInterruption["outcome"], reason: unknown) => {
    if (settled) return;
    settled = true;
    settle({ kind: "interrupted", outcome });
    controller.abort(reason);
  };
  const timeout = setTimeout(
    () => interrupt("timed-out", "integration slot timed out"),
    timeoutMs,
  );
  const cancel = () => interrupt("cancelled", options.signal?.reason ?? "integration run cancelled");
  if (options.signal?.aborted) cancel();
  else options.signal?.addEventListener("abort", cancel, { once: true });
  return {
    signal: controller.signal,
    timeoutMs,
    interruption,
    close() {
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", cancel);
    },
  };
}

async function inSlot<T>(operation: Promise<T>, interruption: Promise<SlotInterruption>) {
  return Promise.race([
    operation.then((value) => ({ kind: "completed" as const, value })),
    interruption,
  ]);
}

function isQueued(candidate: IntegrationCandidate): boolean {
  return candidate.labels.includes("workflow:integration-queued");
}

function isActive(candidate: IntegrationCandidate): boolean {
  return candidate.labels.includes("workflow:integration-active");
}

function isApprovedUrgent(candidate: IntegrationCandidate): boolean {
  return candidate.workClass === "urgent" && candidate.labels.includes("workflow:urgent");
}

function advanceAfterAttempt(attempt: IntegrationAttempt): IntegrationReport {
  return { outcome: "handoff", attempts: [attempt] };
}

async function handOffExecutionFailure(
  adapters: IntegrationAdapters,
  frozen: FrozenCandidate,
  stage: "git" | "verification" | "merge",
): Promise<IntegrationReport> {
  await adapters.repository.release(frozen, "review");
  return advanceAfterAttempt({
    ...frozen,
    outcome: "execution-failed",
    stage,
  });
}

export async function runIntegrationLine(
  adapters: IntegrationAdapters,
  options: IntegrationOptions = {},
): Promise<IntegrationReport> {
  const { repository, git, verification, merge } = adapters;
  const initial = await repository.read();
  for (const candidate of initial.candidates) {
    if (candidate.ready && !isQueued(candidate) && !isActive(candidate)) {
      await repository.queue(candidate);
    }
  }

  const queued = await repository.read();
  const active = queued.candidates.find(isActive);
  if (active) return { outcome: "busy", activeNumber: active.number, attempts: [] };

  const candidate = queued.candidates
    .filter((entry) => entry.ready && isQueued(entry))
    .sort((left, right) => {
      const urgency = Number(isApprovedUrgent(right)) - Number(isApprovedUrgent(left));
      return urgency || left.readyAt.localeCompare(right.readyAt) || left.number - right.number;
    })[0];
  if (!candidate) return { outcome: "idle", attempts: [] };

  const frozen: FrozenCandidate = {
    number: candidate.number,
    baseSha: queued.devSha,
    headSha: candidate.headSha,
  };
  if (!(await repository.claim(frozen))) return { outcome: "claim-lost", attempts: [] };

  if (
    candidate.workClass === "trivial" && !hasExactTrivialProof(candidate)
  ) {
    await repository.release(frozen, "review");
    return advanceAfterAttempt({
      ...frozen,
      outcome: "rejected",
      reason: "trivial-path-not-proven",
    });
  }

  const { gate, reasons } = planFor(candidate);
  const slot = startSlot(options);
  const interrupted = async (
    stage: "git" | "verification" | "merge",
    result: SlotInterruption,
    prepared?: { candidateSha: string },
  ): Promise<IntegrationReport> => {
    slot.close();
    await repository.release(frozen, "review");
    const attempt: IntegrationAttempt = {
      ...frozen,
      ...prepared,
      gate,
      reasons,
      outcome: result.outcome,
      stage,
    };
    if (result.outcome === "cancelled") {
      return { outcome: "exhausted", attempts: [attempt] };
    }
    return advanceAfterAttempt(attempt);
  };

  let prepared: { candidateSha: string };
  try {
    const result = await inSlot(
      git.prepare({ ...frozen, signal: slot.signal }),
      slot.interruption,
    );
    if (result.kind === "interrupted") return interrupted("git", result);
    prepared = result.value;
  } catch {
    slot.close();
    return handOffExecutionFailure(adapters, frozen, "git");
  }
  let verificationResult: { outcome: "passed" | "failed" };
  try {
    const result = await inSlot(
      verification.verify({
        ...frozen,
        ...prepared,
        gate,
        reasons,
        timeoutMs: slot.timeoutMs,
        signal: slot.signal,
      }),
      slot.interruption,
    );
    if (result.kind === "interrupted") return interrupted("verification", result, prepared);
    verificationResult = result.value;
  } catch {
    slot.close();
    return handOffExecutionFailure(adapters, frozen, "verification");
  }
  if (verificationResult.outcome !== "passed") {
    slot.close();
    await repository.release(frozen, "review");
    return advanceAfterAttempt({
      ...frozen,
      ...prepared,
      gate,
      reasons,
      outcome: "failed",
    });
  }

  let current: RepositorySnapshot;
  try {
    const result = await inSlot(repository.read(slot.signal), slot.interruption);
    if (result.kind === "interrupted") return interrupted("merge", result, prepared);
    current = result.value;
  } catch {
    slot.close();
    return handOffExecutionFailure(adapters, frozen, "merge");
  }
  const currentCandidate = current.candidates.find((entry) => entry.number === frozen.number);
  if (
    current.devSha !== frozen.baseSha ||
    currentCandidate?.headSha !== frozen.headSha ||
    !currentCandidate.labels.includes("workflow:integration-active")
  ) {
    slot.close();
    await repository.release(frozen, "review");
    const reason =
      current.devSha !== frozen.baseSha
        ? "base-changed"
        : currentCandidate?.headSha !== frozen.headSha
          ? "head-changed"
          : "ownership-lost";
    return advanceAfterAttempt({
      ...frozen,
      ...prepared,
      gate,
      reasons,
      outcome: "changed-input",
      reason,
    });
  }

  let merged: { mergeSha: string };
  const mergeMethod = candidate.workClass === "completed-spec" ? "merge" : "squash";
  try {
    const result = await inSlot(
      merge.merge({ ...frozen, ...prepared, mergeMethod, signal: slot.signal }),
      slot.interruption,
    );
    if (result.kind === "interrupted") return interrupted("merge", result, prepared);
    merged = result.value;
  } catch {
    slot.close();
    return handOffExecutionFailure(adapters, frozen, "merge");
  }
  slot.close();
  await repository.release(frozen, "merged");
  return {
    outcome: "merged",
    attempts: [
      {
        ...frozen,
        ...prepared,
        gate,
        reasons,
        outcome: "merged",
        mergeMethod,
        mergeSha: merged.mergeSha,
      },
    ],
  };
}
