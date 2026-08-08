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

export type IntegrationCandidate = {
  number: number;
  target: "dev";
  headSha: string;
  readyAt: string;
  workClass: WorkClass;
  changedFiles: string[];
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
  read(): Promise<RepositorySnapshot>;
  queue(candidate: Pick<IntegrationCandidate, "number" | "headSha">): Promise<boolean>;
  claim(candidate: FrozenCandidate): Promise<boolean>;
  release(candidate: FrozenCandidate, outcome: "merged" | "review"): Promise<void>;
}

export interface GitAdapter {
  prepare(candidate: FrozenCandidate): Promise<{ candidateSha: string }>;
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
  }): Promise<{ mergeSha: string }>;
}

export type IntegrationAttempt = FrozenCandidate &
  (
    | { outcome: "rejected"; reason: "trivial-path-not-proven" }
    | { outcome: "execution-failed"; stage: "git" | "verification" | "merge" }
    | ({ candidateSha: string; gate: VerificationGate; reasons: string[] } &
        (
          | { outcome: "merged"; mergeSha: string; mergeMethod: "squash" | "merge" }
          | { outcome: "failed" }
          | { outcome: "timed-out" }
          | { outcome: "cancelled" }
          | {
              outcome: "changed-input";
              reason: "base-changed" | "head-changed" | "ownership-lost";
            }
        ))
  );

export type IntegrationReport =
  | {
      outcome: "merged" | "idle" | "claim-lost" | "exhausted";
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

function isQueued(candidate: IntegrationCandidate): boolean {
  return candidate.labels.includes("workflow:integration-queued");
}

function isActive(candidate: IntegrationCandidate): boolean {
  return candidate.labels.includes("workflow:integration-active");
}

function isApprovedUrgent(candidate: IntegrationCandidate): boolean {
  return candidate.workClass === "urgent" && candidate.labels.includes("workflow:urgent");
}

async function advanceAfterAttempt(
  adapters: IntegrationAdapters,
  options: IntegrationOptions,
  attempt: IntegrationAttempt,
): Promise<IntegrationReport> {
  const next = await runIntegrationLine(adapters, options);
  const attempts = [attempt, ...next.attempts];
  if (next.outcome === "busy") return { ...next, attempts };
  return {
    outcome: next.outcome === "idle" ? "exhausted" : next.outcome,
    attempts,
  };
}

async function handOffExecutionFailure(
  adapters: IntegrationAdapters,
  options: IntegrationOptions,
  frozen: FrozenCandidate,
  stage: "git" | "verification" | "merge",
): Promise<IntegrationReport> {
  await adapters.repository.release(frozen, "review");
  return advanceAfterAttempt(adapters, options, {
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
    candidate.workClass === "trivial" &&
    (candidate.changedFiles.length === 0 || !candidate.changedFiles.every(isReviewedNonRuntimePath))
  ) {
    await repository.release(frozen, "review");
    return advanceAfterAttempt(adapters, options, {
      ...frozen,
      outcome: "rejected",
      reason: "trivial-path-not-proven",
    });
  }

  let prepared: { candidateSha: string };
  try {
    prepared = await git.prepare(frozen);
  } catch {
    return handOffExecutionFailure(adapters, options, frozen, "git");
  }
  const { gate, reasons } = planFor(candidate);
  const controller = new AbortController();
  const timeoutMs = Math.min(options.timeoutMs ?? INTEGRATION_TIMEOUT_MS, INTEGRATION_TIMEOUT_MS);
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => controller.abort(options.signal?.reason ?? "integration run cancelled");
  let cancelListener: (() => void) | undefined;
  const cancellation = new Promise<{ outcome: "cancelled" }>((resolve) => {
    if (options.signal?.aborted) {
      cancel();
      resolve({ outcome: "cancelled" });
      return;
    }
    cancelListener = () => {
      cancel();
      resolve({ outcome: "cancelled" });
    };
    options.signal?.addEventListener("abort", cancelListener, { once: true });
  });
  let verificationResult:
    | { outcome: "passed" | "failed" }
    | { outcome: "timed-out" }
    | { outcome: "cancelled" };
  try {
    verificationResult = await Promise.race([
      verification.verify({
        ...frozen,
        ...prepared,
        gate,
        reasons,
        timeoutMs,
        signal: controller.signal,
      }),
      new Promise<{ outcome: "timed-out" }>((resolve) => {
        timeout = setTimeout(() => {
          controller.abort("integration slot timed out");
          resolve({ outcome: "timed-out" });
        }, timeoutMs);
      }),
      cancellation,
    ]);
  } catch {
    controller.abort("verification adapter failed");
    if (timeout) clearTimeout(timeout);
    if (cancelListener) options.signal?.removeEventListener("abort", cancelListener);
    return handOffExecutionFailure(adapters, options, frozen, "verification");
  }
  if (timeout) clearTimeout(timeout);
  if (cancelListener) options.signal?.removeEventListener("abort", cancelListener);
  if (verificationResult.outcome === "cancelled") {
    await repository.release(frozen, "review");
    return {
      outcome: "exhausted",
      attempts: [
        {
          ...frozen,
          ...prepared,
          gate,
          reasons,
          outcome: "cancelled",
        },
      ],
    };
  }
  if (verificationResult.outcome === "timed-out") {
    await repository.release(frozen, "review");
    return advanceAfterAttempt(adapters, options, {
      ...frozen,
      ...prepared,
      gate,
      reasons,
      outcome: "timed-out",
    });
  }
  if (verificationResult.outcome !== "passed") {
    await repository.release(frozen, "review");
    return advanceAfterAttempt(adapters, options, {
      ...frozen,
      ...prepared,
      gate,
      reasons,
      outcome: "failed",
    });
  }

  const current = await repository.read();
  const currentCandidate = current.candidates.find((entry) => entry.number === frozen.number);
  if (
    current.devSha !== frozen.baseSha ||
    currentCandidate?.headSha !== frozen.headSha ||
    !currentCandidate.labels.includes("workflow:integration-active")
  ) {
    await repository.release(frozen, "review");
    const reason =
      current.devSha !== frozen.baseSha
        ? "base-changed"
        : currentCandidate?.headSha !== frozen.headSha
          ? "head-changed"
          : "ownership-lost";
    return advanceAfterAttempt(adapters, options, {
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
    merged = await merge.merge({ ...frozen, ...prepared, mergeMethod });
  } catch {
    return handOffExecutionFailure(adapters, options, frozen, "merge");
  }
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
