import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  WORKFLOW_CUTOVER_CONTRACTS,
  evaluateWorkflowCutover,
  runIntegrationLine,
  runProductionPromotion,
  runProductionRollback,
  runScheduledBrowserVerification,
  runSpecLifecycle,
  runStagedProductionVerification,
  runWorkflowCutoverAcceptance,
  type IntegrationCandidate,
  type RepositoryAdapter,
  type WorkflowCutoverAcceptanceAdapters,
} from "@/scripts/github/verification-orchestrator";

describe("complete verification workflow cutover", () => {
  it("defines the 30-day evaluation without authorizing more workers or shards", () => {
    const audit = readFileSync(
      resolve(process.cwd(), "docs/agents/efficiency-audit.md"),
      "utf8",
    );
    for (const metric of [
      "implementation-to-integration",
      "preflight",
      "queue wait",
      "test duration",
      "retries",
      "browser-case executions",
      "selected capabilities",
      "build reuse",
      "complete-plan runs",
      "failure classification",
    ]) {
      expect(audit.toLowerCase()).toContain(metric);
    }
    expect(audit).toContain("30 calendar days");
    expect(audit).toContain("No sharding or additional workers");
  });

  it("traces every public plan, transition, evidence record, and outcome as one workflow", async () => {
    const transitions: string[] = [];
    let candidate: IntegrationCandidate | undefined = {
      number: 59, target: "dev", headSha: "candidate-59",
      implementationCompletedAt: "2026-08-09T00:00:00.000Z",
      queuedAt: "2026-08-09T00:01:00.000Z", readyAt: "2026-08-09T00:01:00.000Z",
      workClass: "verification-system", changedFiles: ["scripts/github/verification-orchestrator.ts"],
      labels: ["workflow:integration-queued"], ready: true,
    };
    const repository: RepositoryAdapter = {
      async read() { return { devSha: "dev-1", candidates: candidate ? [candidate] : [] }; },
      async queue() { return true; },
      async claim() { transitions.push("slot:claimed"); candidate!.labels = ["workflow:integration-active"]; return true; },
      async release() { transitions.push("slot:released"); candidate = undefined; },
    };
    const integration = await runIntegrationLine({
      repository,
      git: { async prepare() { transitions.push("candidate:frozen"); return { candidateSha: "merge-tree" }; } },
      verification: { async verify(input) {
        transitions.push(`verification:${input.gate}`);
        return { outcome: "passed", telemetry: {
          browserCaseExecutions: 9, buildReuse: "new", completePlanRuns: 1,
          retries: 0, selectedCapabilities: ["complete-plan"], testTimeMs: 900,
          workflowRunId: 590,
        } };
      } },
      merge: { async merge() { transitions.push("candidate:merged"); return { mergeSha: "dev-2" }; } },
    });
    expect(integration.outcome).toBe("merged");
    if (integration.outcome !== "merged") throw new Error("controlled Integration failed");
    const integrationAttempt = integration.attempts[0]!;
    if (integrationAttempt.outcome !== "merged") throw new Error("controlled attempt did not merge");

    const activeCandidate = {
      ...structuredClone(candidate ?? {
        number: 70, target: "dev" as const, headSha: "active", readyAt: "2026-08-09T00:00:00Z",
        workClass: "standalone" as const, changedFiles: ["app/page.tsx"], ready: true,
      }),
      number: 70, labels: ["workflow:integration-active"],
    } as IntegrationCandidate;
    const waitingUrgent = {
      ...activeCandidate, number: 71, headSha: "urgent", workClass: "urgent" as const,
      labels: ["workflow:urgent", "workflow:integration-queued"],
    };
    const busy = await runIntegrationLine({
      repository: {
        async read() { return { devSha: "dev-2", candidates: [activeCandidate, waitingUrgent] }; },
        async queue() { return true; }, async claim() { throw new Error("must not preempt"); }, async release() {},
      },
      git: { async prepare() { throw new Error("must not prepare"); } },
      verification: { async verify() { throw new Error("must not verify"); } },
      merge: { async merge() { throw new Error("must not merge"); } },
    });

    const normal = { ...waitingUrgent, number: 72, headSha: "normal", workClass: "standalone" as const, labels: ["workflow:integration-queued"], readyAt: "2026-08-09T00:00:00Z" };
    const urgent = { ...waitingUrgent, number: 73, readyAt: "2026-08-09T00:05:00Z" };
    let urgentSelection = 0;
    const priority = await runIntegrationLine({
      repository: {
        async read() { return { devSha: "dev-2", candidates: [normal, urgent] }; }, async queue() { return true; },
        async claim(input) { urgentSelection = input.number; return false; }, async release() {},
      },
      git: { async prepare() { throw new Error("claim must fail"); } },
      verification: { async verify() { throw new Error("claim must fail"); } },
      merge: { async merge() { throw new Error("claim must fail"); } },
    });

    let timedCandidate: IntegrationCandidate | undefined = {
      ...normal, number: 74, headSha: "timed", labels: ["workflow:integration-queued"],
    };
    const timedOut = await runIntegrationLine({
      repository: {
        async read() { return { devSha: "dev-2", candidates: timedCandidate ? [timedCandidate] : [] }; },
        async queue() { return true; }, async claim() { timedCandidate!.labels = ["workflow:integration-active"]; return true; },
        async release() { timedCandidate = undefined; transitions.push("timeout:handoff"); },
      },
      git: { async prepare() { return { candidateSha: "timed-tree" }; } },
      verification: { async verify() { await new Promise((resolve) => setTimeout(resolve, 10)); return { outcome: "passed" }; } },
      merge: { async merge() { throw new Error("timed work must not merge"); } },
    }, { timeoutMs: 1 });

    const identity = {
      browser: { name: "webkit" as const, version: "WebKit 1" },
      catalogFingerprint: `sha256:${"3".repeat(64)}` as const,
      planFingerprint: `sha256:${"4".repeat(64)}` as const,
      runtimeFingerprint: `sha256:${"1".repeat(64)}` as const,
    };
    let activeFailure: any;
    const issues = {
      async findActive() { return activeFailure; },
      async create(failure: any) { activeFailure = { ...failure, number: 59 }; transitions.push("scheduled:failed"); return { number: 59 }; },
      async update(_number: number, failure: any) { activeFailure = { ...failure, number: 59 }; },
      async close() { activeFailure = undefined; transitions.push("scheduled:recovered"); },
    };
    const scheduledFailure = await runScheduledBrowserVerification({
      issues,
      verification: { async verifyCompleteWebkit() {
        return { failureKind: "browser-failed" as const, identity, outcome: "failed" as const };
      } },
    });
    const scheduledRecovery = await runScheduledBrowserVerification({
      issues,
      verification: { async verifyCompleteWebkit() { return { identity, outcome: "passed" as const }; } },
    });

    const spec = await runSpecLifecycle(
      { kind: "create-spec", specNumber: 60, specSlug: "controlled-cutover" },
      {
        github: { async protectSpecBranch() { transitions.push("spec:protected"); } },
        git: {
          async readBranch(name: string) { return name === "dev" ? { name, sha: "dev-1", parent: null } : null; },
          async createBranch() { transitions.push("spec:created"); }, async deleteBranch() {},
          async verifyFlatTicketBranch() { return true; },
        },
        issues: {
          async read() { return { number: 60, state: "open", labels: ["type:spec", "workflow:planned"], assignees: [], blockedBy: [] }; },
          async listChildren() { return []; }, async update() {}, async comment() {},
        },
        pullRequests: {
          async find() { return null; }, async read() { throw new Error("unused"); },
          async create() { throw new Error("unused"); }, async update() {}, async merge() { throw new Error("unused"); },
        },
      } as any,
    );
    const specIssues = new Map<number, any>([
      [60, { number: 60, state: "open", labels: ["type:spec", "workflow:in-progress"], assignees: [], blockedBy: [] }],
      [61, { number: 61, state: "open", labels: ["type:ticket", "ready-for-agent"], assignees: [], parentNumber: 60, blockedBy: [62] }],
      [62, { number: 62, state: "closed", labels: ["type:ticket", "workflow:spec-integrated"], assignees: [], parentNumber: 60, blockedBy: [] }],
    ]);
    const dependency = await runSpecLifecycle(
      { kind: "start-child", specNumber: 60, specSlug: "controlled-cutover", childNumber: 61, childSlug: "dependent", assignee: "agent" },
      {
        github: { async protectSpecBranch() {} },
        git: {
          async readBranch(name: string) { return name === "codex/spec-60-controlled-cutover" ? { name, sha: "spec-1", parent: "dev" } : null; },
          async createBranch() { transitions.push("dependency:flat-child"); }, async deleteBranch() {}, async verifyFlatTicketBranch() { return true; },
        },
        issues: {
          async read(number: number) { return structuredClone(specIssues.get(number)); }, async listChildren() { return []; },
          async update() {}, async comment() { transitions.push("dependency:recorded"); },
        },
        pullRequests: { async find() { return null; }, async read() { throw new Error("unused"); }, async create() { throw new Error("unused"); }, async update() {}, async merge() { throw new Error("unused"); } },
      } as any,
    );
    expect(busy).toMatchObject({ outcome: "busy", activeNumber: 70 });
    expect(priority.outcome).toBe("claim-lost");
    expect(urgentSelection).toBe(73);
    expect(timedOut).toMatchObject({
      outcome: "handoff",
      attempts: [{ outcome: "timed-out", stage: "verification" }],
    });
    expect(dependency).toMatchObject({
      outcome: "child-started",
      branch: "codex/61-dependent",
      baseBranch: "codex/spec-60-controlled-cutover",
    });

    const candidateSha = "d".repeat(40);
    const deployment = { id: "dpl-59", target: "production" as const, url: "https://staged.example.com" };
    const source = {
      artifact: { buildId: "build-59", configurationFingerprint: `sha256:${"2".repeat(64)}` as const, runtimeFingerprint: identity.runtimeFingerprint },
      browsers: { chromium: "Chromium 1", webkit: "WebKit 1" }, candidateSha,
      planFingerprint: identity.planFingerprint,
      tools: { framework: "15", node: "24", packageManager: "pnpm", playwright: "1" },
    };
    const staged = await runStagedProductionVerification(
      { candidateSha, workflowRun: "59-1" },
      {
        attestation: { async sign() { transitions.push("staged:signed"); return { id: "att-59", url: "https://example.com/att-59" }; } },
        browser: { async verify() { transitions.push("staged:browsers"); return { attempts: { chromium: 1, webkit: 1 }, outcome: "passed" }; } },
        catalog: { async fingerprint() { return identity.catalogFingerprint; } },
        clock: { now: () => "2026-08-09T02:00:00.000Z" },
        deployment: {
          async create() { transitions.push("staged:created"); return deployment; },
          async inspect() { return { ...deployment, productionDomains: [], ready: true }; },
        },
        source: { async read() { return source; } },
      },
    );
    expect(staged.outcome).toBe("passed");
    if (staged.outcome !== "passed") throw new Error("controlled staged verification failed");
    const releaseEvidence = {
      attestation: staged.attestation, current: {
        catalogFingerprint: identity.catalogFingerprint,
        deployment: { ...deployment, productionDomains: [], ready: true }, source, workflowRun: "59-1",
      }, inspected: true, receipt: staged.receipt,
      requiredChecks: [{ conclusion: "success", name: "ci" }],
      signedPredicate: structuredClone(staged.receipt),
    };
    const previous = { id: "dpl-previous", url: "https://previous.example.com" };
    const promotionAdapters = {
      clock: { now: () => "2026-08-09T03:00:00.000Z" },
      deployment: {
        async current() { return previous; },
        async promote(exact: any, options: any) { transitions.push(`promote:rebuild-${options.rebuild}`); return exact; },
      },
      evidence: { async load() { return releaseEvidence; } },
      repository: {
        async readBranches() { return { devSha: candidateSha, mainSha: "m".repeat(40) }; },
        async prepareDevToMain() { return { number: 159, requiredChecks: releaseEvidence.requiredChecks, url: "https://example.com/pr/159" }; },
        async mergeDevToMain(input: any) { transitions.push(`main:${input.method}`); return { mainSha: "e".repeat(40), mergeSha: "e".repeat(40), runtimeFingerprint: identity.runtimeFingerprint }; },
      },
      scheduled: { async findActive() { return undefined; } },
    } as any;
    const authorization = await runProductionPromotion(
      { attestationId: "att-59", deploymentId: "dpl-59" }, promotionAdapters,
    );
    expect(authorization.outcome).toBe("authorization-refused");
    if (authorization.outcome !== "authorization-refused") throw new Error("authorization challenge missing");
    const promoted = await runProductionPromotion({
      attestationId: "att-59", deploymentId: "dpl-59",
      authorization: authorization.authorizationChallenge,
    }, promotionAdapters);
    expect(promoted.outcome).toBe("promoted");
    if (promoted.outcome !== "promoted") throw new Error("controlled promotion failed");
    const rolledBack = await runProductionRollback(
      { audit: promoted.audit, reason: "controlled acceptance" },
      {
        deployment: {
          async current() { return promoted.audit.observedDeployment; },
          async restore(exact, options) { transitions.push(`rollback:rebuild-${options.rebuild}`); return exact; },
        },
        reconciliation: { async create() { transitions.push("rollback:reconcile"); return { number: 160, url: "https://example.com/issues/160" }; } },
      },
    );

    const observed = (contracts: string[], evidence: string[]) => async () => ({
      evidence, outcome: "passed" as const, plan: contracts, transitions: [...transitions],
    });
    const adapters = {
      "work-classification": observed([integrationAttempt.gate], [integration.outcome]),
      "affected-browser-verification": observed(["complete-behavioral"], [String(integrationAttempt.telemetry.browserCaseExecutions)]),
      "local-build-reuse": observed(["receipted-build"], [String(integrationAttempt.telemetry.buildReuse)]),
      "integration-slot-concurrency": observed(["atomic-slot"], [busy.outcome, String(busy.outcome === "busy" ? busy.activeNumber : "missing")]),
      "non-preemptive-urgent-priority": observed(["non-preemptive", "urgent-first"], [busy.outcome, priority.outcome, String(urgentSelection)]),
      "timeout-and-failure-handoff": observed(["bounded-slot"], [timedOut.outcome, timedOut.attempts[0]?.outcome ?? "missing"]),
      "verification-receipts": observed(["signed-receipt"], [staged.receipt.predicateType]),
      "spec-dependencies": observed(["flat-spec", "native-blocker"], [spec.outcome, dependency.outcome]),
      "scheduled-failure-and-recovery": observed([scheduledFailure.outcome], [scheduledRecovery.outcome]),
      "staged-production-verification": observed(["chromium", "webkit"], [staged.outcome]),
      "exact-production-promotion": observed(["rebuild:false"], [promoted.outcome]),
      "rollback-first-recovery": observed(["restore-exact"], [rolledBack.outcome]),
      "efficiency-telemetry": observed(["workflow-run-590"], [String(integrationAttempt.telemetry.workflowRunId)]),
      "repository-cutover": observed(["controlled-rules"], ["repository-cutover-evidence"]),
      "deployment-controls": observed(["domainless-staged"], [staged.receipt.deployment.productionDomainAssignment]),
    } satisfies WorkflowCutoverAcceptanceAdapters;

    const result = await runWorkflowCutoverAcceptance(adapters);

    expect(result.decision).toEqual({
      acceptance: "clean", adrs: "accepted", gaps: [], remoteCutover: "active",
    });
    for (const contract of WORKFLOW_CUTOVER_CONTRACTS) {
      expect(result.observations[contract].outcome).toBe("passed");
    }
  });

  it("keeps the ADRs proposed and names every unproven or failed contract", () => {
    const evidence = Object.fromEntries(
      WORKFLOW_CUTOVER_CONTRACTS.map((contract) => [contract, "passed"]),
    );
    evidence["repository-cutover"] = "pending";
    evidence["deployment-controls"] = "failed";

    expect(evaluateWorkflowCutover(evidence)).toEqual({
      acceptance: "blocked",
      adrs: "proposed",
      gaps: [
        "repository-cutover is pending",
        "deployment-controls failed",
      ],
      remoteCutover: "pending",
    });
  });

  it("covers every approved high-impact acceptance seam", () => {
    expect(WORKFLOW_CUTOVER_CONTRACTS).toEqual([
      "work-classification",
      "affected-browser-verification",
      "local-build-reuse",
      "integration-slot-concurrency",
      "non-preemptive-urgent-priority",
      "timeout-and-failure-handoff",
      "verification-receipts",
      "spec-dependencies",
      "scheduled-failure-and-recovery",
      "staged-production-verification",
      "exact-production-promotion",
      "rollback-first-recovery",
      "efficiency-telemetry",
      "repository-cutover",
      "deployment-controls",
    ]);
  });
});
