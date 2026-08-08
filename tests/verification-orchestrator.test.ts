import { describe, expect, it } from "vitest";

import {
  evaluateProductionPromotion,
  runWindowsLifecycleVerification,
  runScheduledBrowserVerification,
  runIntegrationLine,
  type OperationalVerificationIssueAdapter,
  type ScheduledBrowserVerificationAdapter,
  type ScheduledVerificationIdentity,
  type GitAdapter,
  type IntegrationCandidate,
  type MergeAdapter,
  type RepositoryAdapter,
  type VerificationAdapter,
} from "@/scripts/github/verification-orchestrator";

const scheduledIdentity: ScheduledVerificationIdentity = {
  browser: { name: "webkit", version: "playwright-webkit-1.55.1" },
  catalogFingerprint: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
  planFingerprint: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
  runtimeFingerprint: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
};

describe("Verification Orchestrator", () => {
  it("creates one active operational issue for a failed scheduled WebKit run", async () => {
    const created: unknown[] = [];
    const issues: OperationalVerificationIssueAdapter = {
      async findActive() {
        return undefined;
      },
      async create(failure) {
        created.push(failure);
        return { number: 154 };
      },
      async update() {
        throw new Error("a first failure must not update an issue");
      },
      async close() {
        throw new Error("a failure must not close an issue");
      },
    };
    const verification: ScheduledBrowserVerificationAdapter = {
      async verifyCompleteWebkit() {
        return { failureKind: "browser-failed", identity: scheduledIdentity, outcome: "failed" };
      },
    };

    const report = await runScheduledBrowserVerification({ issues, verification });

    expect(report).toEqual({
      identity: scheduledIdentity,
      issueNumber: 154,
      outcome: "failed",
      productionPromotion: "blocked",
    });
    expect(created).toEqual([
      {
        kind: "browser-failed",
        identity: scheduledIdentity,
        summary: "Complete WebKit verification failed for current dev and Catalog facts.",
      },
    ]);
  });

  it("reports a Catalog outage without claiming that WebKit ran", async () => {
    const created: unknown[] = [];
    await runScheduledBrowserVerification({
      issues: {
        async findActive() { return undefined; },
        async create(failure) { created.push(failure); return { number: 154 }; },
        async update() {},
        async close() {},
      },
      verification: {
        async verifyCompleteWebkit() {
          return { failureKind: "catalog-unavailable", identity: scheduledIdentity, outcome: "failed" };
        },
      },
    });

    expect(created).toEqual([{
      kind: "catalog-unavailable",
      identity: scheduledIdentity,
      summary: "Scheduled verification could not read current Catalog facts, so WebKit did not run.",
    }]);
  });

  it("updates the active WebKit failure issue instead of creating a duplicate", async () => {
    const updated: unknown[] = [];
    const issues: OperationalVerificationIssueAdapter = {
      async findActive() {
        return {
          identity: { ...scheduledIdentity, catalogFingerprint: "sha256:3333333333333333333333333333333333333333333333333333333333333333" },
          kind: "browser-failed",
          number: 154,
          summary: "Earlier WebKit failure.",
        };
      },
      async create() {
        throw new Error("an active failure issue must be reused");
      },
      async update(number, failure) {
        updated.push({ number, failure });
      },
      async close() {
        throw new Error("a failure must not close an issue");
      },
    };

    const report = await runScheduledBrowserVerification({
      issues,
      verification: {
        async verifyCompleteWebkit() {
          return { failureKind: "browser-failed", identity: scheduledIdentity, outcome: "failed" };
        },
      },
    });

    expect(report).toMatchObject({ issueNumber: 154, outcome: "failed" });
    expect(updated).toEqual([
      {
        number: 154,
        failure: {
          kind: "browser-failed",
          identity: scheduledIdentity,
          summary: "Complete WebKit verification failed for current dev and Catalog facts.",
        },
      },
    ]);
  });

  it("closes the active failure only when a clean run matches every verification identity", async () => {
    const closed: unknown[] = [];
    const issues: OperationalVerificationIssueAdapter = {
      async findActive() {
        return { identity: scheduledIdentity, kind: "browser-failed", number: 154, summary: "WebKit failed." };
      },
      async create() {
        throw new Error("a clean run must not create an issue");
      },
      async update() {
        throw new Error("a clean run must not update a failure");
      },
      async close(number, recovery) {
        closed.push({ number, recovery });
      },
    };

    const report = await runScheduledBrowserVerification({
      issues,
      verification: {
        async verifyCompleteWebkit() {
          return { identity: structuredClone(scheduledIdentity), outcome: "passed" };
        },
      },
    });

    expect(report).toEqual({
      identity: scheduledIdentity,
      issueNumber: 154,
      outcome: "passed",
      productionPromotion: "unblocked",
    });
    expect(closed).toEqual([{ number: 154, recovery: scheduledIdentity }]);
  });

  it("keeps Production blocked when a clean run does not match the active failure", async () => {
    const failedIdentity: ScheduledVerificationIdentity = {
      ...scheduledIdentity,
      catalogFingerprint: "sha256:4444444444444444444444444444444444444444444444444444444444444444",
    };
    const issues: OperationalVerificationIssueAdapter = {
      async findActive() {
        return { identity: failedIdentity, kind: "browser-failed", number: 154, summary: "WebKit failed." };
      },
      async create() {
        throw new Error("a clean run must not create an issue");
      },
      async update() {
        throw new Error("a clean run must not update a failure");
      },
      async close() {
        throw new Error("nonmatching evidence must not clear an active failure");
      },
    };

    const report = await runScheduledBrowserVerification({
      issues,
      verification: {
        async verifyCompleteWebkit() {
          return { identity: scheduledIdentity, outcome: "passed" };
        },
      },
    });

    expect(report).toEqual({
      identity: scheduledIdentity,
      issueNumber: 154,
      outcome: "nonmatching-recovery",
      productionPromotion: "blocked",
    });
  });

  it("fails Production promotion closed while any scheduled WebKit failure is active", () => {
    const active = {
      identity: scheduledIdentity,
      kind: "browser-failed" as const,
      number: 154,
      summary: "WebKit failed.",
    };

    expect(evaluateProductionPromotion(active, scheduledIdentity)).toEqual({
      issueNumber: 154,
      reason: "matching scheduled WebKit failure is active",
      status: "blocked",
    });
    expect(
      evaluateProductionPromotion(active, {
        ...scheduledIdentity,
        runtimeFingerprint: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      }),
    ).toEqual({
      issueNumber: 154,
      reason: "scheduled WebKit failure has not been cleared by matching evidence",
      status: "blocked",
    });
    expect(evaluateProductionPromotion(undefined, scheduledIdentity)).toEqual({
      status: "allowed",
    });
  });

  it.each([
    ["schedule", ["docs/operator-guide.md"], "scheduled"],
    ["workflow_dispatch", [], "manually requested"],
    ["pull_request", ["scripts/production-verification-node.ts"], "production-verification process control changed"],
    ["pull_request", ["pnpm-lock.yaml"], "verification dependency inputs changed"],
    ["pull_request", [".nvmrc"], "verification dependency inputs changed"],
    ["pull_request", ["scripts/github/verification-orchestrator.ts"], "verification-system orchestration changed"],
  ] as const)(
    "runs Windows lifecycle verification for %s evidence",
    async (source, changedFiles, reason) => {
      const calls: unknown[] = [];
      const report = await runWindowsLifecycleVerification(
        { changedFiles, source },
        {
          async verifyLifecycle(input) {
            calls.push(input);
            return { outcome: "passed" };
          },
        },
      );

      expect(report).toEqual({ outcome: "passed", reason });
      expect(calls).toEqual([{ reason }]);
    },
  );

  it.each([
    ["app/page.tsx"],
    ["components/product/ProductCard.tsx"],
    ["docs/operator-guide.md"],
  ])("skips Windows lifecycle verification for ordinary %s work", async (path) => {
    const report = await runWindowsLifecycleVerification(
      { changedFiles: [path], source: "pull_request" },
      {
        async verifyLifecycle() {
          throw new Error("ordinary work must not start Windows verification");
        },
      },
    );

    expect(report).toEqual({ outcome: "skipped", reason: "no Windows lifecycle input changed" });
  });

  it("queues, freezes, verifies, and merges one ready dev candidate", async () => {
    const candidate: IntegrationCandidate = {
      number: 52,
      target: "dev",
      headSha: "candidate-52",
      readyAt: "2026-08-08T08:00:00.000Z",
      workClass: "standalone",
      changedFiles: ["app/page.tsx"],
      labels: [],
      ready: true,
    };
    let devSha = "dev-1";
    let current = structuredClone(candidate);
    const transitions: string[] = [];

    const repository: RepositoryAdapter = {
      async read() {
        return { devSha, candidates: current ? [structuredClone(current)] : [] };
      },
      async queue(expected) {
        if (current.headSha !== expected.headSha) return false;
        current.labels = ["workflow:integration-queued"];
        transitions.push("queued");
        return true;
      },
      async claim(expected) {
        if (
          devSha !== expected.baseSha ||
          current.headSha !== expected.headSha ||
          !current.labels.includes("workflow:integration-queued")
        ) {
          return false;
        }
        current.labels = ["workflow:integration-active"];
        transitions.push("active");
        return true;
      },
      async release(_expected, outcome) {
        transitions.push(outcome);
        current = undefined as never;
      },
    };
    const git: GitAdapter = {
      async prepare(input) {
        expect(input).toMatchObject({ baseSha: "dev-1", headSha: "candidate-52" });
        return { candidateSha: "merge-tree-52" };
      },
    };
    const verification: VerificationAdapter = {
      async verify(input) {
        expect(input.gate).toBe("complete-behavioral");
        return { outcome: "passed" };
      },
    };
    const merge: MergeAdapter = {
      async merge(input) {
        expect(input).toMatchObject({
          number: 52,
          baseSha: "dev-1",
          headSha: "candidate-52",
          candidateSha: "merge-tree-52",
          mergeMethod: "squash",
        });
        devSha = "dev-2";
        return { mergeSha: devSha };
      },
    };

    const report = await runIntegrationLine({ repository, git, verification, merge });

    expect(report).toMatchObject({
      outcome: "merged",
      attempts: [
        {
          number: 52,
          baseSha: "dev-1",
          headSha: "candidate-52",
          candidateSha: "merge-tree-52",
          gate: "complete-behavioral",
          outcome: "merged",
          mergeSha: "dev-2",
        },
      ],
    });
    expect(transitions).toEqual(["queued", "active", "merged"]);
  });

  it("retains the completed spec boundary with a regular dev merge", async () => {
    let candidate: IntegrationCandidate | undefined = {
      number: 53,
      target: "dev",
      headSha: "candidate-53",
      readyAt: "2026-08-08T08:00:00.000Z",
      workClass: "completed-spec",
      changedFiles: ["app/page.tsx"],
      labels: ["workflow:integration-queued"],
      ready: true,
    };
    const repository: RepositoryAdapter = {
      async read() {
        return { devSha: "dev-1", candidates: candidate ? [structuredClone(candidate)] : [] };
      },
      async queue() {
        return true;
      },
      async claim() {
        candidate!.labels = ["workflow:integration-active"];
        return true;
      },
      async release() {
        candidate = undefined;
      },
    };
    let mergeMethod: unknown;

    const report = await runIntegrationLine({
      repository,
      git: { async prepare() { return { candidateSha: "merge-tree" }; } },
      verification: { async verify() { return { outcome: "passed" }; } },
      merge: {
        async merge(input) {
          mergeMethod = input.mergeMethod;
          return { mergeSha: "dev-2" };
        },
      },
    });

    expect(report.outcome).toBe("merged");
    expect(mergeMethod).toBe("merge");
  });

  it("selects approved urgent work before older normal waiting work", async () => {
    const candidates: IntegrationCandidate[] = [
      {
        number: 60,
        target: "dev",
        headSha: "normal-head",
        readyAt: "2026-08-08T08:00:00.000Z",
        workClass: "standalone",
        changedFiles: ["app/page.tsx"],
        labels: ["workflow:integration-queued"],
        ready: true,
      },
      {
        number: 61,
        target: "dev",
        headSha: "urgent-head",
        readyAt: "2026-08-08T08:05:00.000Z",
        workClass: "urgent",
        changedFiles: ["app/checkout/page.tsx"],
        labels: ["workflow:urgent", "workflow:integration-queued"],
        ready: true,
      },
    ];
    let selectedNumber: number | undefined;
    const repository: RepositoryAdapter = {
      async read() {
        return { devSha: "dev-1", candidates: structuredClone(candidates) };
      },
      async queue() {
        return true;
      },
      async claim(expected) {
        selectedNumber = expected.number;
        const selected = candidates.find((candidate) => candidate.number === expected.number)!;
        selected.labels = ["workflow:integration-active"];
        return true;
      },
      async release() {},
    };

    const report = await runIntegrationLine({
      repository,
      git: { async prepare() { return { candidateSha: "merge-tree" }; } },
      verification: { async verify() { return { outcome: "passed" }; } },
      merge: { async merge() { return { mergeSha: "dev-2" }; } },
    });

    expect(selectedNumber).toBe(61);
    expect(report.attempts[0]?.number).toBe(61);
  });

  it("reports the active candidate without preempting it when urgent work arrives", async () => {
    const candidates: IntegrationCandidate[] = [
      {
        number: 70,
        target: "dev",
        headSha: "normal-active",
        readyAt: "2026-08-08T08:00:00.000Z",
        workClass: "standalone",
        changedFiles: ["app/page.tsx"],
        labels: ["workflow:integration-active"],
        ready: true,
      },
      {
        number: 71,
        target: "dev",
        headSha: "urgent-new",
        readyAt: "2026-08-08T08:05:00.000Z",
        workClass: "urgent",
        changedFiles: ["app/checkout/page.tsx"],
        labels: ["workflow:urgent"],
        ready: true,
      },
    ];
    let verificationCalls = 0;
    const repository: RepositoryAdapter = {
      async read() {
        return { devSha: "dev-1", candidates: structuredClone(candidates) };
      },
      async queue(expected) {
        const candidate = candidates.find((entry) => entry.number === expected.number)!;
        candidate.labels.push("workflow:integration-queued");
        return true;
      },
      async claim() {
        throw new Error("the active candidate already owns the slot");
      },
      async release() {
        throw new Error("the active candidate must not be released by a new run");
      },
    };

    const report = await runIntegrationLine({
      repository,
      git: { async prepare() { throw new Error("must not prepare"); } },
      verification: {
        async verify() {
          verificationCalls += 1;
          return { outcome: "passed" };
        },
      },
      merge: { async merge() { throw new Error("must not merge"); } },
    });

    expect(report).toMatchObject({ outcome: "busy", activeNumber: 70, attempts: [] });
    expect(candidates[1]?.labels).toContain("workflow:integration-queued");
    expect(verificationCalls).toBe(0);
  });

  it("exposes one atomic winner when two integration attempts race", async () => {
    let candidate: IntegrationCandidate | undefined = {
      number: 80,
      target: "dev",
      headSha: "candidate-80",
      readyAt: "2026-08-08T08:00:00.000Z",
      workClass: "standalone",
      changedFiles: ["app/page.tsx"],
      labels: ["workflow:integration-queued"],
      ready: true,
    };
    let readCount = 0;
    let waitingReads: Array<() => void> = [];
    let mergeCalls = 0;
    const repository: RepositoryAdapter = {
      async read() {
        readCount += 1;
        if (readCount <= 4) {
          await new Promise<void>((resolve) => {
            waitingReads.push(resolve);
            if (waitingReads.length === 2) {
              const pair = waitingReads;
              waitingReads = [];
              for (const release of pair) release();
            }
          });
        }
        return {
          devSha: "dev-1",
          candidates: candidate ? [structuredClone(candidate)] : [],
        };
      },
      async queue() {
        return true;
      },
      async claim(expected) {
        if (!candidate || candidate.labels.includes("workflow:integration-active")) return false;
        if (candidate.headSha !== expected.headSha) return false;
        candidate.labels = ["workflow:integration-active"];
        return true;
      },
      async release() {
        candidate = undefined;
      },
    };
    const adapters = {
      repository,
      git: { async prepare() { return { candidateSha: "merge-tree" }; } },
      verification: { async verify() { return { outcome: "passed" as const }; } },
      merge: {
        async merge() {
          mergeCalls += 1;
          return { mergeSha: "dev-2" };
        },
      },
    };

    const reports = await Promise.all([
      runIntegrationLine(adapters),
      runIntegrationLine(adapters),
    ]);

    expect(reports.map((report) => report.outcome).sort()).toEqual([
      "claim-lost",
      "merged",
    ]);
    expect(mergeCalls).toBe(1);
  });

  it("returns a failed candidate to review and hands off to a fresh coordinator run", async () => {
    let devSha = "dev-1";
    const candidates: IntegrationCandidate[] = [90, 91].map((number) => ({
      number,
      target: "dev",
      headSha: `candidate-${number}`,
      readyAt: `2026-08-08T08:0${number - 90}:00.000Z`,
      workClass: "standalone",
      changedFiles: ["app/page.tsx"],
      labels: ["workflow:integration-queued"],
      ready: true,
    }));
    const transitions: string[] = [];
    const repository: RepositoryAdapter = {
      async read() {
        return { devSha, candidates: structuredClone(candidates) };
      },
      async queue() {
        return true;
      },
      async claim(expected) {
        const candidate = candidates.find((entry) => entry.number === expected.number);
        if (!candidate || candidate.labels.includes("workflow:integration-active")) return false;
        candidate.labels = ["workflow:integration-active"];
        transitions.push(`${candidate.number}:active`);
        return true;
      },
      async release(expected, outcome) {
        const index = candidates.findIndex((entry) => entry.number === expected.number);
        transitions.push(`${expected.number}:${outcome}`);
        if (outcome === "review") {
          candidates[index] = {
            ...candidates[index]!,
            labels: ["workflow:review"],
            ready: false,
          };
        } else {
          candidates.splice(index, 1);
        }
      },
    };

    const adapters = {
      repository,
      git: {
        async prepare(input) {
          return { candidateSha: `merge-tree-${input.number}` };
        },
      } satisfies GitAdapter,
      verification: {
        async verify(input) {
          return { outcome: input.number === 90 ? "failed" : "passed" };
        },
      } satisfies VerificationAdapter,
      merge: {
        async merge() {
          devSha = "dev-2";
          return { mergeSha: devSha };
        },
      } satisfies MergeAdapter,
    };
    const report = await runIntegrationLine(adapters);

    expect(report).toMatchObject({
      outcome: "handoff",
      attempts: [{ number: 90, outcome: "failed" }],
    });
    expect(transitions).toEqual(["90:active", "90:review"]);

    const nextReport = await runIntegrationLine(adapters);

    expect(nextReport).toMatchObject({
      outcome: "merged",
      attempts: [{ number: 91, outcome: "merged", mergeSha: "dev-2" }],
    });
    expect(transitions).toEqual([
      "90:active",
      "90:review",
      "91:active",
      "91:merged",
    ]);
  });

  it("reports an exhausted line after the last candidate fails", async () => {
    let candidate: IntegrationCandidate | undefined = {
      number: 92,
      target: "dev",
      headSha: "candidate-92",
      readyAt: "2026-08-08T08:00:00.000Z",
      workClass: "standalone",
      changedFiles: ["app/page.tsx"],
      labels: ["workflow:integration-queued"],
      ready: true,
    };
    const repository: RepositoryAdapter = {
      async read() {
        return { devSha: "dev-1", candidates: candidate ? [structuredClone(candidate)] : [] };
      },
      async queue() {
        return true;
      },
      async claim() {
        candidate!.labels = ["workflow:integration-active"];
        return true;
      },
      async release() {
        candidate = undefined;
      },
    };

    const report = await runIntegrationLine({
      repository,
      git: { async prepare() { return { candidateSha: "merge-tree" }; } },
      verification: { async verify() { return { outcome: "failed" }; } },
      merge: { async merge() { throw new Error("failed work must not merge"); } },
    });

    expect(report).toMatchObject({
      outcome: "handoff",
      attempts: [{ number: 92, outcome: "failed" }],
    });
  });

  it.each([
    ["base-changed", "dev"],
    ["head-changed", "candidate"],
  ] as const)("releases the slot without merging when the frozen %s input changes", async (reason, changed) => {
    let devSha = "dev-1";
    const candidate: IntegrationCandidate = {
      number: 100,
      target: "dev",
      headSha: "candidate-100",
      readyAt: "2026-08-08T08:00:00.000Z",
      workClass: "standalone",
      changedFiles: ["app/page.tsx"],
      labels: ["workflow:integration-queued"],
      ready: true,
    };
    let released = false;
    const repository: RepositoryAdapter = {
      async read() {
        return {
          devSha,
          candidates: released ? [] : [structuredClone(candidate)],
        };
      },
      async queue() {
        return true;
      },
      async claim() {
        candidate.labels = ["workflow:integration-active"];
        return true;
      },
      async release(_expected, outcome) {
        expect(outcome).toBe("review");
        released = true;
      },
    };

    const report = await runIntegrationLine({
      repository,
      git: { async prepare() { return { candidateSha: "merge-tree" }; } },
      verification: {
        async verify() {
          if (changed === "dev") devSha = "dev-2";
          else candidate.headSha = "candidate-100-new";
          return { outcome: "passed" };
        },
      },
      merge: { async merge() { throw new Error("changed inputs must not merge"); } },
    });

    expect(report).toMatchObject({
      outcome: "handoff",
      attempts: [{ number: 100, outcome: "changed-input", reason }],
    });
    expect(released).toBe(true);
  });

  it("times out and releases a cancellation-disabled slot after the policy limit", async () => {
    const candidate: IntegrationCandidate = {
      number: 110,
      target: "dev",
      headSha: "candidate-110",
      readyAt: "2026-08-08T08:00:00.000Z",
      workClass: "standalone",
      changedFiles: ["app/page.tsx"],
      labels: ["workflow:integration-queued"],
      ready: true,
    };
    let released = false;
    let mergeCalls = 0;
    const repository: RepositoryAdapter = {
      async read() {
        return { devSha: "dev-1", candidates: released ? [] : [structuredClone(candidate)] };
      },
      async queue() {
        return true;
      },
      async claim() {
        candidate.labels = ["workflow:integration-active"];
        return true;
      },
      async release(_expected, outcome) {
        expect(outcome).toBe("review");
        released = true;
      },
    };

    const report = await runIntegrationLine(
      {
        repository,
        git: { async prepare() { return { candidateSha: "merge-tree" }; } },
        verification: {
          async verify() {
            await new Promise((resolve) => setTimeout(resolve, 15));
            return { outcome: "passed" };
          },
        },
        merge: {
          async merge() {
            mergeCalls += 1;
            return { mergeSha: "dev-2" };
          },
        },
      },
      { timeoutMs: 1 },
    );

    expect(report).toMatchObject({
      outcome: "handoff",
      attempts: [{ number: 110, outcome: "timed-out" }],
    });
    expect(released).toBe(true);
    expect(mergeCalls).toBe(0);
  });

  it("releases the slot when the coordinator run is cancelled", async () => {
    const candidate: IntegrationCandidate = {
      number: 111,
      target: "dev",
      headSha: "candidate-111",
      readyAt: "2026-08-08T08:00:00.000Z",
      workClass: "standalone",
      changedFiles: ["app/page.tsx"],
      labels: ["workflow:integration-queued"],
      ready: true,
    };
    let released = false;
    const repository: RepositoryAdapter = {
      async read() {
        return { devSha: "dev-1", candidates: released ? [] : [structuredClone(candidate)] };
      },
      async queue() {
        return true;
      },
      async claim() {
        candidate.labels = ["workflow:integration-active"];
        return true;
      },
      async release(_expected, outcome) {
        expect(outcome).toBe("review");
        released = true;
      },
    };
    const cancellation = new AbortController();
    setTimeout(() => cancellation.abort("workflow cancelled"), 1);

    const report = await runIntegrationLine(
      {
        repository,
        git: { async prepare() { return { candidateSha: "merge-tree" }; } },
        verification: {
          async verify() {
            await new Promise((resolve) => setTimeout(resolve, 15));
            return { outcome: "passed" };
          },
        },
        merge: { async merge() { throw new Error("cancelled work must not merge"); } },
      },
      { signal: cancellation.signal },
    );

    expect(report).toMatchObject({
      outcome: "exhausted",
      attempts: [{ number: 111, outcome: "cancelled" }],
    });
    expect(released).toBe(true);
  });

  it("uses the non-runtime fast gate only for reviewed documentation paths", async () => {
    let candidate: IntegrationCandidate | undefined = {
      number: 120,
      target: "dev",
      headSha: "candidate-120",
      readyAt: "2026-08-08T08:00:00.000Z",
      workClass: "documentation",
      changedFiles: ["docs/operator-guide.md"],
      labels: ["workflow:integration-queued"],
      ready: true,
    };
    let observedGate: unknown;
    let observedReasons: unknown;
    const repository: RepositoryAdapter = {
      async read() {
        return { devSha: "dev-1", candidates: candidate ? [structuredClone(candidate)] : [] };
      },
      async queue() {
        return true;
      },
      async claim() {
        candidate!.labels = ["workflow:integration-active"];
        return true;
      },
      async release() {
        candidate = undefined;
      },
    };

    await runIntegrationLine({
      repository,
      git: { async prepare() { return { candidateSha: "merge-tree" }; } },
      verification: {
        async verify(input) {
          observedGate = input.gate;
          observedReasons = input.reasons;
          return { outcome: "passed" };
        },
      },
      merge: { async merge() { return { mergeSha: "dev-2" }; } },
    });

    expect(observedGate).toBe("fast-non-runtime");
    expect(observedReasons).toEqual([
      "documentation declares only reviewed non-runtime paths",
    ]);
  });

  it("rejects uncertain trivial work from the fast path", async () => {
    let candidate: IntegrationCandidate | undefined = {
      number: 121,
      target: "dev",
      headSha: "candidate-121",
      readyAt: "2026-08-08T08:00:00.000Z",
      workClass: "trivial",
      changedFiles: ["app/page.tsx"],
      labels: ["workflow:integration-queued"],
      ready: true,
    };
    const repository: RepositoryAdapter = {
      async read() {
        return { devSha: "dev-1", candidates: candidate ? [structuredClone(candidate)] : [] };
      },
      async queue() {
        return true;
      },
      async claim() {
        candidate!.labels = ["workflow:integration-active"];
        return true;
      },
      async release(_expected, outcome) {
        expect(outcome).toBe("review");
        candidate = undefined;
      },
    };

    const report = await runIntegrationLine({
      repository,
      git: { async prepare() { throw new Error("rejected work must not prepare"); } },
      verification: { async verify() { throw new Error("rejected work must not verify"); } },
      merge: { async merge() { throw new Error("rejected work must not merge"); } },
    });

    expect(report).toMatchObject({
      outcome: "handoff",
      attempts: [
        {
          number: 121,
          outcome: "rejected",
          reason: "trivial-path-not-proven",
        },
      ],
    });
  });

  it("rejects trivial work whose proof does not exactly cover the changed paths", async () => {
    let candidate: IntegrationCandidate | undefined = {
      number: 124,
      target: "dev",
      headSha: "candidate-124",
      readyAt: "2026-08-08T08:00:00.000Z",
      workClass: "trivial",
      changedFiles: ["README.md", "docs/operator-guide.md"],
      fastPathProof: ["README.md"],
      labels: ["workflow:integration-queued"],
      ready: true,
    };
    const repository: RepositoryAdapter = {
      async read() {
        return { devSha: "dev-1", candidates: candidate ? [structuredClone(candidate)] : [] };
      },
      async queue() { return true; },
      async claim() {
        candidate!.labels = ["workflow:integration-active"];
        return true;
      },
      async release() { candidate = undefined; },
    };

    const report = await runIntegrationLine({
      repository,
      git: { async prepare() { throw new Error("unproven work must not prepare"); } },
      verification: { async verify() { throw new Error("unproven work must not verify"); } },
      merge: { async merge() { throw new Error("unproven work must not merge"); } },
    });

    expect(report).toMatchObject({
      outcome: "handoff",
      attempts: [{ number: 124, outcome: "rejected", reason: "trivial-path-not-proven" }],
    });
  });

  it("starts the slot deadline at claim, including candidate preparation", async () => {
    let candidate: IntegrationCandidate | undefined = {
      number: 125,
      target: "dev",
      headSha: "candidate-125",
      readyAt: "2026-08-08T08:00:00.000Z",
      workClass: "standalone",
      changedFiles: ["app/page.tsx"],
      labels: ["workflow:integration-queued"],
      ready: true,
    };
    let released = false;
    const repository: RepositoryAdapter = {
      async read() {
        return { devSha: "dev-1", candidates: candidate ? [structuredClone(candidate)] : [] };
      },
      async queue() { return true; },
      async claim() {
        candidate!.labels = ["workflow:integration-active"];
        return true;
      },
      async release() {
        released = true;
        candidate = undefined;
      },
    };

    const report = await runIntegrationLine(
      {
        repository,
        git: {
          async prepare() {
            await new Promise((resolve) => setTimeout(resolve, 15));
            return { candidateSha: "merge-tree" };
          },
        },
        verification: { async verify() { throw new Error("timed out work must not verify"); } },
        merge: { async merge() { throw new Error("timed out work must not merge"); } },
      },
      { timeoutMs: 1 },
    );

    expect(report).toMatchObject({
      outcome: "handoff",
      attempts: [{ number: 125, outcome: "timed-out", stage: "git" }],
    });
    expect(released).toBe(true);
  });

  it("retains broader complete checks for every declared high-risk area", async () => {
    let candidate: IntegrationCandidate | undefined = {
      number: 122,
      target: "dev",
      headSha: "candidate-122",
      readyAt: "2026-08-08T08:00:00.000Z",
      workClass: "standalone",
      changedFiles: ["app/api/checkout/route.ts"],
      riskAreas: ["security", "payment", "data", "provider", "cross-cutting"],
      labels: ["workflow:integration-queued"],
      ready: true,
    };
    let observed: { gate: unknown; reasons: unknown } | undefined;
    const repository: RepositoryAdapter = {
      async read() {
        return { devSha: "dev-1", candidates: candidate ? [structuredClone(candidate)] : [] };
      },
      async queue() {
        return true;
      },
      async claim() {
        candidate!.labels = ["workflow:integration-active"];
        return true;
      },
      async release() {
        candidate = undefined;
      },
    };

    await runIntegrationLine({
      repository,
      git: { async prepare() { return { candidateSha: "merge-tree" }; } },
      verification: {
        async verify(input) {
          observed = { gate: input.gate, reasons: input.reasons };
          return { outcome: "passed" };
        },
      },
      merge: { async merge() { return { mergeSha: "dev-2" }; } },
    });

    expect(observed).toEqual({
      gate: "complete-behavioral",
      reasons: [
        "security risk retains proportional broader checks",
        "payment risk retains proportional broader checks",
        "data risk retains proportional broader checks",
        "provider risk retains proportional broader checks",
        "cross-cutting risk retains proportional broader checks",
      ],
    });
  });

  it.each(["git", "verification", "merge"] as const)(
    "releases the slot when the %s adapter fails",
    async (stage) => {
      let candidate: IntegrationCandidate | undefined = {
        number: 123,
        target: "dev",
        headSha: "candidate-123",
        readyAt: "2026-08-08T08:00:00.000Z",
        workClass: "standalone",
        changedFiles: ["app/page.tsx"],
        labels: ["workflow:integration-queued"],
        ready: true,
      };
      let released = false;
      const repository: RepositoryAdapter = {
        async read() {
          return { devSha: "dev-1", candidates: candidate ? [structuredClone(candidate)] : [] };
        },
        async queue() {
          return true;
        },
        async claim() {
          candidate!.labels = ["workflow:integration-active"];
          return true;
        },
        async release(_expected, outcome) {
          expect(outcome).toBe("review");
          released = true;
          candidate = undefined;
        },
      };

      const report = await runIntegrationLine({
        repository,
        git: {
          async prepare() {
            if (stage === "git") throw new Error("controlled Git failure");
            return { candidateSha: "merge-tree" };
          },
        },
        verification: {
          async verify() {
            if (stage === "verification") throw new Error("controlled verification failure");
            return { outcome: "passed" };
          },
        },
        merge: {
          async merge() {
            if (stage === "merge") throw new Error("controlled merge failure");
            return { mergeSha: "dev-2" };
          },
        },
      });

      expect(report).toMatchObject({
        outcome: "handoff",
        attempts: [{ number: 123, outcome: "execution-failed", stage }],
      });
      expect(released).toBe(true);
    },
  );
});
