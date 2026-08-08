import { describe, expect, it } from "vitest";

import {
  runSpecLifecycle,
  type SpecLifecycleAdapters,
  type WorkflowBranch,
  type WorkflowIssue,
  type WorkflowPullRequest,
} from "@/scripts/github/verification-orchestrator";

function issue(number: number, overrides: Partial<WorkflowIssue> = {}): WorkflowIssue {
  return {
    number,
    state: "open",
    labels: number === 60 ? ["type:spec", "workflow:planned"] : ["type:ticket", "ready-for-agent"],
    assignees: [],
    parentNumber: number === 60 ? undefined : 60,
    blockedBy: [],
    ...overrides,
  };
}

describe("future spec integration lifecycle", () => {
  it("creates one protected spec branch from the exact current dev tip", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const issues = new Map([[60, issue(60)]]);
    const branches = new Map<string, WorkflowBranch>([["dev", { name: "dev", sha: "dev-1", parent: null }]]);
    const adapters: SpecLifecycleAdapters = {
      github: {
        async protectSpecBranch(input) {
          calls.push({ protect: input });
        },
      },
      git: {
        async readBranch(name) {
          return branches.get(name) ?? null;
        },
        async createBranch(input) {
          calls.push({ create: input });
          branches.set(input.name, { name: input.name, sha: input.fromSha, parent: input.fromBranch });
        },
        async deleteBranch() {},
      },
      issues: {
        async read(number) {
          return structuredClone(issues.get(number)!);
        },
        async listChildren() {
          return [];
        },
        async update() {},
        async comment() {},
      },
      pullRequests: {
        async find() {
          return null;
        },
        async read() {
          throw new Error("creation must not read a pull request");
        },
        async create() {
          throw new Error("creation must not create a pull request");
        },
        async update() {},
        async merge() {
          throw new Error("creation must not merge");
        },
      },
    };

    const report = await runSpecLifecycle(
      { kind: "create-spec", specNumber: 60, specSlug: "catalog-refresh" },
      adapters,
    );

    expect(report).toEqual({
      outcome: "spec-created",
      specNumber: 60,
      branch: "codex/spec-60-catalog-refresh",
      devSha: "dev-1",
    });
    expect(calls).toEqual([
      {
        create: {
          name: "codex/spec-60-catalog-refresh",
          fromBranch: "dev",
          fromSha: "dev-1",
        },
      },
      {
        protect: {
          branch: "codex/spec-60-catalog-refresh",
          directPushes: false,
          allowedMergeMethods: ["squash"],
          requiredChecks: ["ci", "affected-browser-verification"],
        },
      },
    ]);
  });

  it("keeps spec #50 on the previously executable workflow", async () => {
    const adapters = {} as SpecLifecycleAdapters;
    await expect(
      runSpecLifecycle(
        { kind: "create-spec", specNumber: 50, specSlug: "browser-verification" },
        adapters,
      ),
    ).rejects.toThrow("spec #50 remains on the previously executable workflow");
  });

  it("removes a newly created spec branch when protection cannot be proven", async () => {
    const branches = new Map<string, WorkflowBranch>([
      ["dev", { name: "dev", sha: "dev-1", parent: null }],
    ]);
    const deleted: string[] = [];
    const adapters = {
      github: { async protectSpecBranch() { throw new Error("ruleset unavailable"); } },
      git: {
        async readBranch(name: string) { return branches.get(name) ?? null; },
        async createBranch(input: { name: string; fromBranch: string; fromSha: string }) {
          branches.set(input.name, { name: input.name, sha: input.fromSha, parent: input.fromBranch });
        },
        async deleteBranch(name: string) { deleted.push(name); branches.delete(name); },
      },
      issues: { async read() { return issue(60); } },
    } as unknown as SpecLifecycleAdapters;

    await expect(
      runSpecLifecycle(
        { kind: "create-spec", specNumber: 60, specSlug: "catalog-refresh" },
        adapters,
      ),
    ).rejects.toThrow("ruleset unavailable");
    expect(deleted).toEqual(["codex/spec-60-catalog-refresh"]);
    expect(branches.has("codex/spec-60-catalog-refresh")).toBe(false);
  });

  it("leaves blocked children unclaimed and starts them as flat siblings after native blockers integrate", async () => {
    const issues = new Map([
      [60, issue(60)],
      [61, issue(61)],
      [62, issue(62, { blockedBy: [61] })],
    ]);
    const branches = new Map([
      ["dev", { name: "dev", sha: "dev-1", parent: null }],
      [
        "codex/spec-60-catalog-refresh",
        { name: "codex/spec-60-catalog-refresh", sha: "spec-1", parent: "dev" },
      ],
    ]);
    const updates: Array<Record<string, unknown>> = [];
    const adapters: SpecLifecycleAdapters = {
      github: { async protectSpecBranch() {} },
      git: {
        async readBranch(name) {
          return branches.get(name) ?? null;
        },
        async createBranch(input) {
          branches.set(input.name, { name: input.name, sha: input.fromSha, parent: input.fromBranch });
        },
        async deleteBranch() {},
      },
      issues: {
        async read(number) {
          return structuredClone(issues.get(number)!);
        },
        async listChildren() {
          return [...issues.values()].filter((entry) => entry.parentNumber === 60);
        },
        async update(number, update) {
          updates.push({ number, update });
          Object.assign(issues.get(number)!, update);
        },
        async comment() {},
      },
      pullRequests: {
        async find() {
          return null;
        },
        async read() {
          throw new Error("starting work must not read pull requests");
        },
        async create() {
          throw new Error("starting work must not create pull requests");
        },
        async update() {},
        async merge() {
          throw new Error("starting work must not merge");
        },
      },
    };

    await expect(
      runSpecLifecycle(
        {
          kind: "start-child",
          specNumber: 60,
          specSlug: "catalog-refresh",
          childNumber: 62,
          childSlug: "dependent-slice",
          assignee: "agent",
        },
        adapters,
      ),
    ).rejects.toThrow("blocker #61 has not entered the spec branch");
    expect(updates).toEqual([]);
    expect(branches.has("codex/62-dependent-slice")).toBe(false);

    issues.set(61, issue(61, { state: "closed", labels: ["type:ticket", "workflow:spec-integrated"] }));
    branches.set("codex/spec-60-catalog-refresh", {
      name: "codex/spec-60-catalog-refresh",
      sha: "spec-after-61",
      parent: "dev",
    });
    const report = await runSpecLifecycle(
      {
        kind: "start-child",
        specNumber: 60,
        specSlug: "catalog-refresh",
        childNumber: 62,
        childSlug: "dependent-slice",
        assignee: "agent",
      },
      adapters,
    );

    expect(report).toEqual({
      outcome: "child-started",
      specNumber: 60,
      childNumber: 62,
      branch: "codex/62-dependent-slice",
      baseBranch: "codex/spec-60-catalog-refresh",
      baseSha: "spec-after-61",
    });
    expect(branches.get("codex/62-dependent-slice")).toMatchObject({
      parent: "codex/spec-60-catalog-refresh",
      sha: "spec-after-61",
    });
    expect(updates).toEqual([
      {
        number: 62,
        update: {
          assignees: ["agent"],
          labels: ["type:ticket", "workflow:in-progress"],
        },
      },
      {
        number: 60,
        update: {
          labels: ["type:spec", "workflow:in-progress"],
        },
      },
    ]);
  });

  it("squash-integrates children, maintains a draft checklist, and readies the final PR only after combined review", async () => {
    const issues = new Map([
      [60, issue(60, { labels: ["type:spec", "workflow:in-progress"] })],
      [61, issue(61, { labels: ["type:ticket", "workflow:review"] })],
      [62, issue(62, { labels: ["type:ticket", "workflow:review"], blockedBy: [61] })],
    ]);
    const branches = new Map([
      ["dev", { name: "dev", sha: "dev-1", parent: null }],
      [
        "codex/spec-60-catalog-refresh",
        { name: "codex/spec-60-catalog-refresh", sha: "spec-1", parent: "dev" },
      ],
      [
        "codex/61-foundation",
        { name: "codex/61-foundation", sha: "child-61", parent: "codex/spec-60-catalog-refresh" },
      ],
      [
        "codex/62-dependent",
        { name: "codex/62-dependent", sha: "child-62", parent: "codex/spec-60-catalog-refresh" },
      ],
    ]);
    const pullRequests = new Map<number, WorkflowPullRequest>([
      [
        101,
        {
          number: 101,
          state: "open" as const,
          headBranch: "codex/61-foundation",
          baseBranch: "codex/spec-60-catalog-refresh",
          headSha: "child-61",
          draft: false,
          checks: { ci: "passed" as const, "affected-browser-verification": "passed" as const },
          body: "",
          ticketNumber: 61,
          reviewPassed: true,
          mergeable: true,
        },
      ],
      [
        102,
        {
          number: 102,
          state: "open" as const,
          headBranch: "codex/62-dependent",
          baseBranch: "codex/spec-60-catalog-refresh",
          headSha: "child-62",
          draft: false,
          checks: { ci: "passed" as const, "affected-browser-verification": "passed" as const },
          body: "",
          ticketNumber: 62,
          reviewPassed: true,
          mergeable: true,
        },
      ],
    ]);
    const merges: Array<Record<string, unknown>> = [];
    const comments: string[] = [];
    let nextPullRequest = 200;
    const adapters: SpecLifecycleAdapters = {
      github: { async protectSpecBranch() {} },
      git: {
        async readBranch(name) {
          return branches.get(name) ?? null;
        },
        async createBranch() {},
        async deleteBranch() {},
      },
      issues: {
        async read(number) {
          return structuredClone(issues.get(number)!);
        },
        async listChildren() {
          return [structuredClone(issues.get(61)!), structuredClone(issues.get(62)!)];
        },
        async update(number, update) {
          Object.assign(issues.get(number)!, update);
        },
        async comment(number, body) {
          comments.push(`${number}:${body}`);
        },
      },
      pullRequests: {
        async find(headBranch, baseBranch) {
          return (
            [...pullRequests.values()].find(
              (pull) =>
                pull.headBranch === headBranch &&
                pull.baseBranch === baseBranch &&
                pull.state === "open",
            ) ?? null
          );
        },
        async read(number) {
          return structuredClone(pullRequests.get(number)!);
        },
        async create(input) {
          const created = { number: nextPullRequest++, state: "open" as const, headSha: "spec-1", checks: {}, reviewPassed: false, mergeable: true, ...input };
          pullRequests.set(created.number, created);
          return structuredClone(created);
        },
        async update(number, update) {
          Object.assign(pullRequests.get(number)!, update);
        },
        async merge(number, input) {
          merges.push({ number, ...input });
          Object.assign(pullRequests.get(number)!, { state: "merged", mergeMethod: input.method });
          return { mergeSha: `spec-after-${number}` };
        },
      },
    };

    issues.set(61, issue(61));
    await expect(
      runSpecLifecycle(
        {
          kind: "integrate-child",
          specNumber: 60,
          specSlug: "catalog-refresh",
          childNumber: 61,
          pullRequestNumber: 101,
        },
        adapters,
      ),
    ).rejects.toThrow("child ticket must be in workflow:review");
    expect(merges).toEqual([]);
    issues.set(61, issue(61, { labels: ["type:ticket", "workflow:review"] }));

    const first = await runSpecLifecycle(
      {
        kind: "integrate-child",
        specNumber: 60,
        specSlug: "catalog-refresh",
        childNumber: 61,
        pullRequestNumber: 101,
      },
      adapters,
    );
    expect(first).toMatchObject({ outcome: "child-integrated", childNumber: 61, finalPullRequest: 200, finalDraft: true });
    expect(merges).toEqual([{ number: 101, expectedHeadSha: "child-61", method: "squash" }]);
    expect(issues.get(61)).toMatchObject({ state: "closed", labels: ["type:ticket", "workflow:spec-integrated"] });
    expect(issues.get(60)?.state).toBe("open");
    expect(comments[0]).toContain("squash-integrated by PR #101");
    expect(pullRequests.get(200)).toMatchObject({ baseBranch: "dev", draft: true });
    expect(pullRequests.get(200)?.body).toContain("- Path: completed spec");
    expect(pullRequests.get(200)?.body).toContain('"children":[{"number":61,"blockers":[],"integrated":true},{"number":62,"blockers":[61],"integrated":false}]');

    await expect(
      runSpecLifecycle(
        { kind: "ready-spec", specNumber: 60, specSlug: "catalog-refresh" },
        adapters,
      ),
    ).rejects.toThrow("every required child must be spec-integrated");

    await runSpecLifecycle(
      {
        kind: "integrate-child",
        specNumber: 60,
        specSlug: "catalog-refresh",
        childNumber: 62,
        pullRequestNumber: 102,
      },
      adapters,
    );
    await expect(
      runSpecLifecycle(
        { kind: "ready-spec", specNumber: 60, specSlug: "catalog-refresh" },
        adapters,
      ),
    ).rejects.toThrow("combined code review must pass");
    Object.assign(pullRequests.get(200)!, { reviewPassed: true });
    const ready = await runSpecLifecycle(
      { kind: "ready-spec", specNumber: 60, specSlug: "catalog-refresh" },
      adapters,
    );
    expect(ready).toEqual({ outcome: "spec-ready", specNumber: 60, pullRequestNumber: 200 });
    expect(pullRequests.get(200)?.draft).toBe(false);
    expect(issues.get(60)?.state).toBe("open");
  });

  it("rolls back the issue claim and ticket branch when startup evidence cannot be recorded", async () => {
    const child = issue(61);
    const spec = issue(60);
    const deleted: string[] = [];
    const updates: Array<{ number: number; update: Partial<WorkflowIssue> }> = [];
    const adapters = {
      git: {
        async readBranch(name: string) {
          return name === "codex/spec-60-catalog-refresh"
            ? { name, sha: "spec-1", parent: "dev" }
            : null;
        },
        async createBranch() {},
        async deleteBranch(name: string) { deleted.push(name); },
      },
      issues: {
        async read(number: number) { return structuredClone(number === 60 ? spec : child); },
        async update(number: number, update: Partial<WorkflowIssue>) { updates.push({ number, update }); },
        async comment() { throw new Error("comment unavailable"); },
      },
    } as unknown as SpecLifecycleAdapters;

    await expect(
      runSpecLifecycle(
        {
          kind: "start-child",
          specNumber: 60,
          specSlug: "catalog-refresh",
          childNumber: 61,
          childSlug: "foundation",
          assignee: "agent",
        },
        adapters,
      ),
    ).rejects.toThrow("comment unavailable");

    expect(deleted).toEqual(["codex/61-foundation"]);
    expect(updates.at(-2)).toEqual({ number: 61, update: { assignees: [], labels: ["type:ticket", "ready-for-agent"] } });
    expect(updates.at(-1)).toEqual({ number: 60, update: { labels: ["type:spec", "workflow:planned"] } });
  });

  it("reopens an owned child failure but keeps cross-ticket failures with integration", async () => {
    const issues = new Map([
      [60, issue(60, { labels: ["type:spec", "workflow:review"] })],
      [61, issue(61, { state: "closed", labels: ["type:ticket", "workflow:spec-integrated"], assignees: ["agent"] })],
    ]);
    const finalPull = {
      number: 200,
      state: "open" as const,
      headBranch: "codex/spec-60-catalog-refresh",
      baseBranch: "dev",
      headSha: "spec-2",
      draft: false,
      checks: {},
      body: "status",
      reviewPassed: true,
      mergeable: true,
    };
    const comments: string[] = [];
    const adapters = {
      issues: {
        async read(number: number) { return structuredClone(issues.get(number)!); },
        async listChildren() { return [structuredClone(issues.get(61)!)]; },
        async update(number: number, update: Partial<WorkflowIssue>) { Object.assign(issues.get(number)!, update); },
        async comment(number: number, body: string) { comments.push(`${number}:${body}`); },
      },
      pullRequests: {
        async find() { return structuredClone(finalPull); },
        async update(_number: number, update: Partial<typeof finalPull>) { Object.assign(finalPull, update); },
      },
      verification: {
        async readCombinedFailure() {
          return { reason: "checkout journey failed", responsibleChildNumber: 61 };
        },
      },
    } as unknown as SpecLifecycleAdapters;

    const owned = await runSpecLifecycle(
      { kind: "combined-failure", specNumber: 60, specSlug: "catalog-refresh" },
      adapters,
    );
    expect(owned).toEqual({ outcome: "child-reopened", specNumber: 60, childNumber: 61, pullRequestNumber: 200 });
    expect(issues.get(61)).toMatchObject({ state: "open", labels: ["type:ticket", "workflow:review"], assignees: ["agent"] });
    expect(finalPull.draft).toBe(true);

    issues.set(61, issue(61, { state: "closed", labels: ["type:ticket", "workflow:spec-integrated"] }));
    adapters.verification = {
      async readCombinedFailure() {
        return { reason: "combined navigation failure" };
      },
    };
    const crossTicket = await runSpecLifecycle(
      { kind: "combined-failure", specNumber: 60, specSlug: "catalog-refresh" },
      adapters,
    );
    expect(crossTicket).toEqual({ outcome: "integration-owned-failure", specNumber: 60, pullRequestNumber: 200 });
    expect(issues.get(61)?.state).toBe("closed");
    expect(comments.at(-1)).toContain("ownership remains with spec integration");
  });

  it("cancels without merging remnants and completes only an observed regular dev merge", async () => {
    const makeAdapters = (finalState: "open" | "merged", mergeMethod?: "squash" | "merge") => {
      const issues = new Map([
        [60, issue(60, { labels: ["type:spec", "workflow:review"] })],
        [61, issue(61, { state: "closed", labels: ["type:ticket", "workflow:spec-integrated"] })],
      ]);
      const deleted: string[] = [];
      let mergeCalls = 0;
      const finalPull = {
        number: 200,
        state: finalState,
        headBranch: "codex/spec-60-catalog-refresh",
        baseBranch: "dev",
        headSha: "spec-2",
        draft: false,
        checks: {},
        body: "status",
        mergeMethod,
        mergeSha: finalState === "merged" ? "dev-2" : undefined,
        reviewPassed: true,
        mergeable: true,
      };
      const adapters = {
        git: { async deleteBranch(name: string) { deleted.push(name); } },
        issues: {
          async read(number: number) { return structuredClone(issues.get(number)!); },
          async listChildren() { return [structuredClone(issues.get(61)!)]; },
          async update(number: number, update: Partial<WorkflowIssue>) { Object.assign(issues.get(number)!, update); },
          async comment() {},
        },
        pullRequests: {
          async find() { return structuredClone(finalPull); },
          async read() { return structuredClone(finalPull); },
          async update(_number: number, update: Partial<typeof finalPull>) { Object.assign(finalPull, update); },
          async merge() { mergeCalls += 1; return { mergeSha: "unexpected" }; },
        },
      } as unknown as SpecLifecycleAdapters;
      return { adapters, issues, deleted, finalPull, mergeCalls: () => mergeCalls };
    };

    const cancelled = makeAdapters("open");
    const cancellation = await runSpecLifecycle(
      { kind: "cancel-spec", specNumber: 60, specSlug: "catalog-refresh", reason: "requirements superseded", replacementIssues: [75] },
      cancelled.adapters,
    );
    expect(cancellation).toEqual({ outcome: "spec-cancelled", specNumber: 60, pullRequestNumber: 200, replacements: [75] });
    expect(cancelled.finalPull.state).toBe("closed");
    expect(cancelled.mergeCalls()).toBe(0);
    expect(cancelled.issues.get(60)).toMatchObject({ state: "closed", labels: ["type:spec", "wontfix"] });
    expect(cancelled.deleted).toEqual(["codex/spec-60-catalog-refresh"]);

    const completed = makeAdapters("merged", "merge");
    const completion = await runSpecLifecycle(
      { kind: "complete-spec", specNumber: 60, specSlug: "catalog-refresh", pullRequestNumber: 200 },
      completed.adapters,
    );
    expect(completion).toEqual({ outcome: "spec-completed", specNumber: 60, pullRequestNumber: 200, mergeSha: "dev-2" });
    expect(completed.issues.get(60)?.state).toBe("closed");
    expect(completed.deleted).toEqual(["codex/spec-60-catalog-refresh"]);

    const squashed = makeAdapters("merged", "squash");
    await expect(
      runSpecLifecycle(
        { kind: "complete-spec", specNumber: 60, specSlug: "catalog-refresh", pullRequestNumber: 200 },
        squashed.adapters,
      ),
    ).rejects.toThrow("final spec pull request must be regular-merged into dev");
  });

  it("allows an early dev update only for an explicit dependency or urgent assumption break", async () => {
    const updates: Array<Record<string, unknown>> = [];
    const adapters = {
      git: {
        async readBranch(name: string) {
          return name === "dev"
            ? { name, sha: "dev-2", parent: null }
            : { name, sha: "spec-1", parent: "dev" };
        },
        async updateSpecFromDev(input: Record<string, unknown>) {
          updates.push(input);
          return { sha: "spec-with-dev-2" };
        },
      },
      issues: {
        async read() { return issue(60); },
        async comment() {},
      },
    } as unknown as SpecLifecycleAdapters;

    const report = await runSpecLifecycle(
      { kind: "sync-spec", specNumber: 60, specSlug: "catalog-refresh", reason: "declared-dependency" },
      adapters,
    );
    expect(report).toEqual({ outcome: "spec-synced", specNumber: 60, previousSpecSha: "spec-1", devSha: "dev-2", specSha: "spec-with-dev-2", reason: "declared-dependency" });
    expect(updates).toEqual([{ branch: "codex/spec-60-catalog-refresh", expectedSpecSha: "spec-1", devSha: "dev-2", reason: "declared-dependency" }]);

    await expect(
      runSpecLifecycle(
        { kind: "sync-spec", specNumber: 60, specSlug: "catalog-refresh", reason: "routine-dev-movement" } as never,
        adapters,
      ),
    ).rejects.toThrow("early spec updates require a declared dependency or urgent assumption break");
  });
});
