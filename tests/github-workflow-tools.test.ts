import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { describe, expect, it } from "vitest";

const projectRoot = process.cwd();
const taskHelper = resolve(projectRoot, "scripts/git/codex-task.sh");
const bootstrapTool = resolve(projectRoot, "scripts/github/bootstrap-workflow.mjs");
const ciWorkflow = readFileSync(
  resolve(projectRoot, ".github/workflows/ci.yml"),
  "utf8",
);

const ciPublicRuntimeSecrets = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_ALGOLIA_APP_ID",
  "NEXT_PUBLIC_ALGOLIA_SEARCH_API_KEY",
  "NEXT_PUBLIC_ALGOLIA_INDEX_NAME",
] as const;

function workflowStep(name: string): string {
  const marker = `      - name: ${name}`;
  const start = ciWorkflow.indexOf(marker);
  expect(start, `Missing CI step: ${name}`).toBeGreaterThanOrEqual(0);
  const nextStep = ciWorkflow.indexOf("\n      - ", start + marker.length);
  return ciWorkflow.slice(start, nextStep < 0 ? undefined : nextStep);
}

type CommandResult = SpawnSyncReturns<string>;
type RunOptions = {
  env?: Record<string, string | undefined>;
  input?: string;
};

function run(
  command: string,
  args: string[],
  cwd: string,
  options: RunOptions = {},
): CommandResult {
  return spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...options.env } as NodeJS.ProcessEnv,
    input: options.input,
  });
}

function expectSuccess(result: CommandResult): void {
  expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
}

function git(cwd: string, ...args: string[]): CommandResult {
  return run("git", args, cwd);
}

function initialiseRepository(): { root: string; tempRoot: string } {
  const tempRoot = mkdtempSync(join(tmpdir(), "helix-workflow-test-"));
  const root = join(tempRoot, "repo");
  mkdirSync(root);
  expectSuccess(git(root, "init", "-b", "main"));
  expectSuccess(git(root, "config", "user.name", "Workflow Test"));
  expectSuccess(git(root, "config", "user.email", "workflow@example.test"));
  writeFileSync(join(root, "README.md"), "fixture\n");
  expectSuccess(git(root, "add", "README.md"));
  expectSuccess(git(root, "commit", "-m", "Initial fixture"));
  expectSuccess(git(root, "branch", "dev"));
  mkdirSync(join(tempRoot, "tasks"));
  return { root, tempRoot };
}

function startTask(
  root: string,
  tempRoot: string,
  slug: string,
): { result: CommandResult; worktree?: string } {
  const result = run(taskHelper, ["start", slug], root, {
    env: { TMPDIR: join(tempRoot, "tasks") },
  });
  const worktree = result.stdout.match(/^Task worktree: (.+)$/m)?.[1];
  return { result, worktree };
}

function commitTicket(worktree: string, ticket = 123, spec?: number): void {
  writeFileSync(join(worktree, "change.txt"), "implemented\n");
  expectSuccess(git(worktree, "add", "change.txt"));
  const footers = spec ? `Refs #${ticket}\nSpec #${spec}` : `Refs #${ticket}`;
  expectSuccess(
    git(
      worktree,
      "commit",
      "-m",
      "Implement ticket",
      "-m",
      footers,
    ),
  );
}

function cleanupFixture(tempRoot: string): void {
  rmSync(tempRoot, { recursive: true, force: true });
}

function writeCleanupFakeGh(tempRoot: string): string {
  const fakeGh = join(tempRoot, "fake-cleanup-gh");
  writeFileSync(
    fakeGh,
    `#!/bin/sh
if [ -n "\${FAKE_CLEANUP_FAILURE:-}" ]; then
  printf '%s\\n' "$FAKE_CLEANUP_FAILURE" >&2
  exit 1
fi
printf '%s\\t%s\\t%s\\t%s\\n' \
  "\${FAKE_PR_STATE:-MERGED}" \
  "\${FAKE_PR_BASE:-dev}" \
  "\${FAKE_PR_MERGED_AT:-2026-08-19T12:00:00Z}" \
  "\${FAKE_PR_HEAD:-missing}"
`,
  );
  chmodSync(fakeGh, 0o755);
  return fakeGh;
}

type TaskPullRequest = {
  number: number;
  state: "open" | "closed";
  merged_at: string | null;
  base: { ref: string };
  head: { ref: string; sha: string };
};

function mergedTaskPr(number: number, branch: string, head: string): TaskPullRequest {
  return {
    number,
    state: "closed",
    merged_at: "2026-08-19T12:00:00Z",
    base: { ref: "dev" },
    head: { ref: branch, sha: head },
  };
}

function openTaskPr(number: number, branch: string, head: string): TaskPullRequest {
  return {
    number,
    state: "open",
    merged_at: null,
    base: { ref: "dev" },
    head: { ref: branch, sha: head },
  };
}

function writeRemoteRaceHook(root: string, tempRoot: string): string {
  const markerPath = join(tempRoot, "remote-race-triggered");
  const hook = join(root, ".git", "hooks", "pre-push");
  writeFileSync(
    hook,
    `#!/bin/sh
if [ ! -f "$RACE_MARKER" ]; then
  git --git-dir="$RACE_REMOTE" update-ref "$RACE_REF" "$RACE_HEAD" || exit 1
  printf 'triggered\\n' > "$RACE_MARKER"
fi
`,
  );
  chmodSync(hook, 0o755);
  return markerPath;
}

function writeTaskLifecycleFakeGh(tempRoot: string): string {
  const fakeGh = join(tempRoot, "fake-task-gh.mjs");
  writeFileSync(
    fakeGh,
    `#!/usr/bin/env node
import { appendFileSync } from "node:fs";
const args = process.argv.slice(2);
if (process.env.FAKE_TASK_GH_LOG) {
  appendFileSync(process.env.FAKE_TASK_GH_LOG, args.join(" ") + "\\n");
}
if (process.env.FAKE_TASK_GH_FAILURE) {
  process.stderr.write(process.env.FAKE_TASK_GH_FAILURE + "\\n");
  process.exit(1);
}
if (args[0] !== "api" || !args.includes("--paginate") || !args.includes("--slurp")) {
  process.stderr.write("GitHub inventory must use complete pagination\\n");
  process.exit(2);
}
const endpoint = args.find((arg) => arg.startsWith("repos/")) || "";
if (endpoint.includes("/pulls?")) {
  const records = JSON.parse(process.env.FAKE_TASK_PRS || "[]");
  process.stdout.write(JSON.stringify([records]));
  process.exit(0);
}
if (endpoint.includes("/issues?")) {
  const records = JSON.parse(process.env.FAKE_TASK_ISSUES || "[]");
  process.stdout.write(JSON.stringify([records]));
  process.exit(0);
}
process.stderr.write("unexpected fake gh call: " + args.join(" ") + "\\n");
process.exit(2);
`,
  );
  chmodSync(fakeGh, 0o755);
  return fakeGh;
}

describe("GitHub Actions CI", () => {
  it("receives the approved public runtime configuration from repository secrets", () => {
    for (const key of ciPublicRuntimeSecrets) {
      expect(ciWorkflow).toContain(`${key}: \${{ secrets.${key} }}`);
    }

    expect(ciWorkflow).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(ciWorkflow).not.toContain("ALGOLIA_WRITE_API_KEY");
    expect(ciWorkflow).not.toContain("ALGOLIA_ADMIN_API_KEY");
  });

  it("runs production browser verification only for pull-request merge trees", () => {
    for (const name of [
      "Install Playwright browsers",
      "Build receipted production artifact",
      "Verify receipted production artifact",
    ]) {
      expect(workflowStep(name)).toContain(
        "if: ${{ github.event_name == 'pull_request' }}",
      );
    }

    expect(workflowStep("Upload Playwright report")).toContain(
      "if: ${{ failure() && github.event_name == 'pull_request' }}",
    );

    for (const name of ["Lint", "Typecheck", "Unit tests"]) {
      expect(workflowStep(name)).not.toContain("github.event_name");
    }
  });
});

describe("Codex workflow task helper", () => {
  it("starts ticket and planning worktrees with recorded review bases", () => {
    for (const slug of [
      "123-checkout-state",
      "plan-checkout-state",
      "trivial-copy-edit",
    ]) {
      const { root, tempRoot } = initialiseRepository();
      try {
        const devSha = git(root, "rev-parse", "dev").stdout.trim();
        const started = startTask(root, tempRoot, slug);
        expectSuccess(started.result);
        expect(started.worktree).toBeTruthy();
        expect(started.result.stdout).toContain(`Review base: ${devSha}`);
        expect(
          git(root, "rev-parse", `refs/codex/review-base/${slug}`).stdout.trim(),
        ).toBe(devSha);
      } finally {
        cleanupFixture(tempRoot);
      }
    }
  });

  it("rejects branches outside the ticket, planning, and trivial fast paths", () => {
    const { root, tempRoot } = initialiseRepository();
    try {
      const started = startTask(root, tempRoot, "untyped-work");
      expect(started.result.status).not.toBe(0);
      expect(started.result.stderr).toContain(
        "slug must start with an issue number, 'plan-', or 'trivial-'",
      );
    } finally {
      cleanupFixture(tempRoot);
    }
  });

  it("prepares a traceable ticket branch without changing dev", () => {
    const { root, tempRoot } = initialiseRepository();
    try {
      const devBefore = git(root, "rev-parse", "dev").stdout.trim();
      const started = startTask(root, tempRoot, "123-checkout-state");
      expectSuccess(started.result);
      commitTicket(started.worktree!, 123, 45);

      const prepared = run(taskHelper, ["prepare", started.worktree!], root);
      expectSuccess(prepared);
      expect(prepared.stdout).toContain("Ready for code-review against dev");
      expect(prepared.stdout).toContain("Refs #123");
      expect(prepared.stdout).toContain("Spec #45");
      expect(git(root, "rev-parse", "dev").stdout.trim()).toBe(devBefore);
    } finally {
      cleanupFixture(tempRoot);
    }
  });

  it("refuses to prepare ticket commits without ticket and spec references", () => {
    const { root, tempRoot } = initialiseRepository();
    try {
      const started = startTask(root, tempRoot, "123-checkout-state");
      expectSuccess(started.result);
      writeFileSync(join(started.worktree!, "change.txt"), "untraceable\n");
      expectSuccess(git(started.worktree!, "add", "change.txt"));
      expectSuccess(git(started.worktree!, "commit", "-m", "Untraceable change"));

      const prepared = run(taskHelper, ["prepare", started.worktree!], root);
      expect(prepared.status).not.toBe(0);
      expect(prepared.stderr).toContain("must include a 'Refs #123' footer");
    } finally {
      cleanupFixture(tempRoot);
    }
  });

  it("prepares an abbreviated urgent ticket without inventing a parent spec", () => {
    const { root, tempRoot } = initialiseRepository();
    try {
      const started = startTask(root, tempRoot, "987-urgent-security-fix");
      expectSuccess(started.result);
      commitTicket(started.worktree!, 987);

      const prepared = run(taskHelper, ["prepare", started.worktree!], root);
      expectSuccess(prepared);
      expect(prepared.stdout).toContain("Urgent fast path: Refs #987; no parent spec");
    } finally {
      cleanupFixture(tempRoot);
    }
  });

  it("refuses to prepare a dirty worktree", () => {
    const { root, tempRoot } = initialiseRepository();
    try {
      const started = startTask(root, tempRoot, "plan-dirty-state");
      expectSuccess(started.result);
      writeFileSync(join(started.worktree!, "untracked.txt"), "dirty\n");

      const prepared = run(taskHelper, ["prepare", started.worktree!], root);
      expect(prepared.status).not.toBe(0);
      expect(prepared.stderr).toContain("the worktree must be clean");
    } finally {
      cleanupFixture(tempRoot);
    }
  });

  it("cleans up only after GitHub reports a merged PR into dev", () => {
    const { root, tempRoot } = initialiseRepository();
    try {
      const started = startTask(root, tempRoot, "123-checkout-state");
      expectSuccess(started.result);
      commitTicket(started.worktree!, 123, 45);
      const taskHead = git(started.worktree!, "rev-parse", "HEAD").stdout.trim();

      const fakeGh = writeCleanupFakeGh(tempRoot);

      const refused = run(taskHelper, ["cleanup", started.worktree!], root, {
        env: { GH_BIN: fakeGh, FAKE_PR_STATE: "OPEN", FAKE_PR_HEAD: taskHead },
      });
      expect(refused.status).not.toBe(0);
      expect(refused.stderr).toContain("PR must be merged into dev before cleanup");

      const stalePr = run(taskHelper, ["cleanup", started.worktree!], root, {
        env: {
          GH_BIN: fakeGh,
          FAKE_PR_STATE: "MERGED",
          FAKE_PR_HEAD: "0000000000000000000000000000000000000000",
        },
      });
      expect(stalePr.status).not.toBe(0);
      expect(stalePr.stderr).toContain("merged PR head does not match current task commit");

      const cleaned = run(taskHelper, ["cleanup", started.worktree!], root, {
        env: { GH_BIN: fakeGh, FAKE_PR_STATE: "MERGED", FAKE_PR_HEAD: taskHead },
      });
      expectSuccess(cleaned);
      expect(cleaned.stdout).toContain("Removed task worktree");
      expect(
        git(root, "show-ref", "--verify", "--quiet", "refs/heads/codex/123-checkout-state")
          .status,
      ).not.toBe(0);
      expect(
        git(root, "show-ref", "--verify", "--quiet", "refs/codex/review-base/123-checkout-state")
          .status,
      ).not.toBe(0);
    } finally {
      cleanupFixture(tempRoot);
    }
  });

  it("removes an app-managed worktree after its exact PR head merges", () => {
    const { root, tempRoot } = initialiseRepository();
    try {
      const started = startTask(root, tempRoot, "123-app-managed-cleanup");
      expectSuccess(started.result);
      commitTicket(started.worktree!, 123, 45);
      const taskHead = git(started.worktree!, "rev-parse", "HEAD").stdout.trim();

      rmSync(join(dirname(started.worktree!), ".helix-codex-task"));
      const fakeGh = writeCleanupFakeGh(tempRoot);

      const cleaned = run(taskHelper, ["cleanup", started.worktree!], root, {
        env: { GH_BIN: fakeGh, FAKE_PR_HEAD: taskHead },
      });

      expectSuccess(cleaned);
      expect(cleaned.stdout).toContain("Removed task worktree");
      expect(git(root, "worktree", "list", "--porcelain").stdout).not.toContain(
        started.worktree!,
      );
      expect(
        git(root, "show-ref", "--verify", "--quiet", "refs/heads/codex/123-app-managed-cleanup")
          .status,
      ).not.toBe(0);
    } finally {
      cleanupFixture(tempRoot);
    }
  });

  it("removes the current app-managed worktree when cleanup runs inside it", () => {
    const { root, tempRoot } = initialiseRepository();
    try {
      const started = startTask(root, tempRoot, "123-current-app-cleanup");
      expectSuccess(started.result);
      commitTicket(started.worktree!, 123, 45);
      const taskHead = git(started.worktree!, "rev-parse", "HEAD").stdout.trim();

      rmSync(join(dirname(started.worktree!), ".helix-codex-task"));
      const fakeGh = writeCleanupFakeGh(tempRoot);

      const cleaned = run(taskHelper, ["cleanup"], started.worktree!, {
        env: { GH_BIN: fakeGh, FAKE_PR_HEAD: taskHead },
      });

      expectSuccess(cleaned);
      expect(cleaned.stdout).toContain("Removed task worktree");
      expect(git(root, "worktree", "list", "--porcelain").stdout).not.toContain(
        started.worktree!,
      );
    } finally {
      cleanupFixture(tempRoot);
    }
  });

  it("surfaces GitHub failures that prevent cleanup verification", () => {
    const { root, tempRoot } = initialiseRepository();
    try {
      const started = startTask(root, tempRoot, "123-cleanup-outage");
      expectSuccess(started.result);
      commitTicket(started.worktree!, 123, 45);

      const fakeGh = join(tempRoot, "fake-gh");
      writeFileSync(
        fakeGh,
        "#!/bin/sh\nprintf 'GitHub inventory unavailable\\n' >&2\nexit 1\n",
      );
      chmodSync(fakeGh, 0o755);

      const cleaned = run(taskHelper, ["cleanup", started.worktree!], root, {
        env: { GH_BIN: fakeGh },
      });

      expect(cleaned.status).not.toBe(0);
      expect(cleaned.stderr).toContain("GitHub inventory unavailable");
      expect(cleaned.stderr).toContain("could not verify a GitHub PR");
    } finally {
      cleanupFixture(tempRoot);
    }
  });

  it("loads every GitHub inventory page before classifying cleanup state", () => {
    const { root, tempRoot } = initialiseRepository();
    try {
      const fakeGh = writeTaskLifecycleFakeGh(tempRoot);
      const logPath = join(tempRoot, "task-github-calls.log");
      writeFileSync(logPath, "");

      const planned = run(taskHelper, ["reconcile"], root, {
        env: { GH_BIN: fakeGh, FAKE_TASK_GH_LOG: logPath },
      });

      expectSuccess(planned);
      const calls = readFileSync(logPath, "utf8").trim().split("\n");
      expect(calls).toHaveLength(2);
      expect(calls.every((call) => call.includes("--paginate"))).toBe(true);
      expect(calls.every((call) => call.includes("--slurp"))).toBe(true);
      expect(calls.some((call) => call.includes("/pulls?state=all&per_page=100"))).toBe(true);
      expect(calls.some((call) => call.includes("/issues?state=open&per_page=100"))).toBe(true);
    } finally {
      cleanupFixture(tempRoot);
    }
  });

  it("plans exact merged detached worktree removal without mutating", () => {
    const { root, tempRoot } = initialiseRepository();
    try {
      const branch = "codex/123-detached-merged-task";
      expectSuccess(git(root, "switch", "-c", branch, "dev"));
      writeFileSync(join(root, "task.txt"), "merged task head\n");
      expectSuccess(git(root, "add", "task.txt"));
      expectSuccess(git(root, "commit", "-m", "Detached merged task head"));
      const detachedHead = git(root, "rev-parse", "HEAD").stdout.trim();
      expectSuccess(git(root, "switch", "main"));
      const detachedWorktree = join(tempRoot, "detached-app-worktree");
      const ancestorOnlyWorktree = join(tempRoot, "ancestor-only-worktree");
      expectSuccess(git(root, "worktree", "add", "--detach", detachedWorktree, detachedHead));
      expectSuccess(git(root, "worktree", "add", "--detach", ancestorOnlyWorktree, "dev"));
      const fakeGh = writeTaskLifecycleFakeGh(tempRoot);
      const env = {
        GH_BIN: fakeGh,
        FAKE_TASK_PRS: JSON.stringify([
          mergedTaskPr(320, branch, detachedHead),
        ]),
      };

      const planned = run(taskHelper, ["reconcile"], root, {
        env,
      });

      expectSuccess(planned);
      expect(planned.stdout).toContain("REMOVE worktree");
      expect(planned.stdout).toContain(detachedHead);
      expect(planned.stdout).toContain(detachedWorktree);
      expect(planned.stdout).toContain("merged by PR #320 into dev");
      expect(planned.stdout).toContain(`UNPROVEN worktree`);
      expect(planned.stdout).toContain(ancestorOnlyWorktree);
      expect(planned.stdout).toContain("PROTECTED worktree");
      expect(planned.stdout).toContain("invoking or primary worktree");
      expect(planned.stdout).toContain("Dry run only");
      expect(git(root, "worktree", "list", "--porcelain").stdout).toContain(
        detachedWorktree,
      );
      expect(git(root, "worktree", "list", "--porcelain").stdout).toContain(
        ancestorOnlyWorktree,
      );
    } finally {
      cleanupFixture(tempRoot);
    }
  });

  it("applies only proven clean worktree removals", () => {
    const { root, tempRoot } = initialiseRepository();
    try {
      const branch = "codex/123-duplicate-detached-task";
      expectSuccess(git(root, "switch", "-c", branch, "dev"));
      writeFileSync(join(root, "task.txt"), "duplicate detached head\n");
      expectSuccess(git(root, "add", "task.txt"));
      expectSuccess(git(root, "commit", "-m", "Duplicate detached task head"));
      const taskHead = git(root, "rev-parse", "HEAD").stdout.trim();
      expectSuccess(git(root, "switch", "main"));
      const safeWorktree = join(tempRoot, "safe-detached-worktree");
      const duplicateSafeWorktree = join(tempRoot, "duplicate-safe-detached-worktree");
      const dirtyWorktree = join(tempRoot, "dirty-detached-worktree");
      expectSuccess(git(root, "worktree", "add", "--detach", safeWorktree, taskHead));
      expectSuccess(git(root, "worktree", "add", "--detach", duplicateSafeWorktree, taskHead));
      expectSuccess(git(root, "worktree", "add", "--detach", dirtyWorktree, taskHead));
      writeFileSync(join(dirtyWorktree, "untracked.txt"), "preserve me\n");
      const fakeGh = writeTaskLifecycleFakeGh(tempRoot);
      const env = {
        GH_BIN: fakeGh,
        FAKE_TASK_PRS: JSON.stringify([
          mergedTaskPr(324, branch, taskHead),
        ]),
      };

      const applied = run(taskHelper, ["reconcile", "--apply"], root, {
        env,
      });

      expectSuccess(applied);
      expect(applied.stdout).toContain(`REMOVED worktree`);
      expect(applied.stdout).toContain(safeWorktree);
      expect(applied.stdout).toContain(duplicateSafeWorktree);
      expect(applied.stdout).toContain(`DIRTY worktree`);
      expect(applied.stdout).toContain(dirtyWorktree);
      const remaining = git(root, "worktree", "list", "--porcelain").stdout;
      expect(remaining).not.toContain(safeWorktree);
      expect(remaining).not.toContain(duplicateSafeWorktree);
      expect(remaining).toContain(dirtyWorktree);
      expect(remaining).toContain(root);
    } finally {
      cleanupFixture(tempRoot);
    }
  });

  it("reconciles exact merged task refs while preserving active tickets", () => {
    const { root, tempRoot, remote } = initialiseRemoteRepository();
    try {
      expectSuccess(git(root, "switch", "-c", "codex/123-merged-cleanup", "dev"));
      writeFileSync(join(root, "merged.txt"), "merged task\n");
      expectSuccess(git(root, "add", "merged.txt"));
      expectSuccess(git(root, "commit", "-m", "Merged task head"));
      const mergedHead = git(root, "rev-parse", "HEAD").stdout.trim();
      expectSuccess(git(root, "push", "-u", "origin", "codex/123-merged-cleanup"));
      expectSuccess(
        git(
          root,
          "update-ref",
          "refs/codex/review-base/123-merged-cleanup",
          git(root, "rev-parse", "dev").stdout.trim(),
        ),
      );

      expectSuccess(git(root, "switch", "-c", "codex/124-active-cleanup", "dev"));
      writeFileSync(join(root, "active.txt"), "active task\n");
      expectSuccess(git(root, "add", "active.txt"));
      expectSuccess(git(root, "commit", "-m", "Active task head"));
      const activeHead = git(root, "rev-parse", "HEAD").stdout.trim();
      expectSuccess(git(root, "push", "-u", "origin", "codex/124-active-cleanup"));
      expectSuccess(git(root, "switch", "main"));

      const fakeGh = writeTaskLifecycleFakeGh(tempRoot);
      const env = {
        GH_BIN: fakeGh,
        FAKE_TASK_PRS: JSON.stringify([
          mergedTaskPr(321, "codex/123-merged-cleanup", mergedHead),
        ]),
        FAKE_TASK_ISSUES: JSON.stringify([{ number: 124 }]),
      };

      const planned = run(taskHelper, ["reconcile"], root, { env });
      expectSuccess(planned);
      expect(planned.stdout).toContain(`REMOVE branch ${mergedHead} codex/123-merged-cleanup`);
      expect(planned.stdout).toContain(
        "REMOVE review-ref",
      );
      expect(planned.stdout).toContain(
        `REMOVE remote-branch ${mergedHead} origin/codex/123-merged-cleanup`,
      );
      expect(planned.stdout).toContain(`ACTIVE branch ${activeHead} codex/124-active-cleanup`);
      expectSuccess(git(root, "show-ref", "--verify", "refs/heads/codex/123-merged-cleanup"));

      const appliedLocally = run(taskHelper, ["reconcile", "--apply"], root, { env });
      expectSuccess(appliedLocally);
      expect(appliedLocally.stdout).toContain(
        `SKIPPED remote-branch ${mergedHead} origin/codex/123-merged-cleanup`,
      );
      expect(
        git(root, "show-ref", "--verify", "--quiet", "refs/heads/codex/123-merged-cleanup")
          .status,
      ).not.toBe(0);
      expect(
        git(
          root,
          "show-ref",
          "--verify",
          "--quiet",
          "refs/codex/review-base/123-merged-cleanup",
        ).status,
      ).not.toBe(0);
      expect(
        git(root, "ls-remote", "--heads", remote, "refs/heads/codex/123-merged-cleanup").stdout,
      ).toContain(mergedHead);

      const appliedRemotely = run(
        taskHelper,
        ["reconcile", "--apply", "--remote"],
        root,
        { env },
      );
      expectSuccess(appliedRemotely);
      expect(
        git(root, "ls-remote", "--heads", remote, "refs/heads/codex/123-merged-cleanup").stdout,
      ).toBe("");
      expectSuccess(git(root, "show-ref", "--verify", "refs/heads/codex/124-active-cleanup"));
      expectSuccess(
        git(root, "show-ref", "--verify", "refs/remotes/origin/codex/124-active-cleanup"),
      );
    } finally {
      cleanupFixture(tempRoot);
    }
  });

  it("preserves every ref associated with a dirty merged task worktree", () => {
    const { root, tempRoot, remote } = initialiseRemoteRepository();
    try {
      const branch = "codex/123-dirty-merged-task";
      expectSuccess(git(root, "switch", "-c", branch, "dev"));
      writeFileSync(join(root, "task.txt"), "merged task\n");
      expectSuccess(git(root, "add", "task.txt"));
      expectSuccess(git(root, "commit", "-m", "Dirty merged task head"));
      const taskHead = git(root, "rev-parse", "HEAD").stdout.trim();
      expectSuccess(git(root, "push", "-u", "origin", branch));
      expectSuccess(
        git(
          root,
          "update-ref",
          "refs/codex/review-base/123-dirty-merged-task",
          git(root, "rev-parse", "dev").stdout.trim(),
        ),
      );
      expectSuccess(git(root, "switch", "main"));
      const dirtyWorktree = join(tempRoot, "dirty-merged-task-worktree");
      expectSuccess(git(root, "worktree", "add", dirtyWorktree, branch));
      writeFileSync(join(dirtyWorktree, "untracked.txt"), "preserve me\n");
      const fakeGh = writeTaskLifecycleFakeGh(tempRoot);
      const env = {
        GH_BIN: fakeGh,
        FAKE_TASK_PRS: JSON.stringify([
          mergedTaskPr(323, branch, taskHead),
        ]),
      };

      const applied = run(taskHelper, ["reconcile", "--apply", "--remote"], root, { env });

      expectSuccess(applied);
      expect(applied.stdout).toContain(`DIRTY worktree ${taskHead}`);
      expect(applied.stdout).toContain(`DIRTY branch ${taskHead} ${branch}`);
      expect(applied.stdout).toContain(`DIRTY remote-branch ${taskHead} origin/${branch}`);
      expect(git(root, "worktree", "list", "--porcelain").stdout).toContain(dirtyWorktree);
      expectSuccess(git(root, "show-ref", "--verify", `refs/heads/${branch}`));
      expectSuccess(
        git(root, "show-ref", "--verify", "refs/codex/review-base/123-dirty-merged-task"),
      );
      expect(git(root, "ls-remote", "--heads", remote, `refs/heads/${branch}`).stdout).toContain(
        taskHead,
      );
    } finally {
      cleanupFixture(tempRoot);
    }
  });

  it("retires an assessed worktree and branch only at the expected SHA", () => {
    const { root, tempRoot, remote } = initialiseRemoteRepository();
    try {
      expectSuccess(git(root, "switch", "-c", "research/retired-prototype", "dev"));
      writeFileSync(join(root, "research.md"), "assessed and retired\n");
      expectSuccess(git(root, "add", "research.md"));
      expectSuccess(git(root, "commit", "-m", "Retired research artifact"));
      const expectedHead = git(root, "rev-parse", "HEAD").stdout.trim();
      expectSuccess(git(root, "push", "-u", "origin", "research/retired-prototype"));
      expectSuccess(git(root, "switch", "main"));
      const retiredWorktree = join(tempRoot, "retired-research-worktree");
      expectSuccess(git(root, "worktree", "add", retiredWorktree, "research/retired-prototype"));
      const fakeGh = writeTaskLifecycleFakeGh(tempRoot);

      const retired = run(
        taskHelper,
        ["retire", retiredWorktree, "--expect-head", expectedHead, "--remote"],
        root,
        { env: { GH_BIN: fakeGh } },
      );

      expectSuccess(retired);
      expect(retired.stdout).toContain(`RETIRED worktree ${expectedHead} ${retiredWorktree}`);
      expect(retired.stdout).toContain(
        `RETIRED branch ${expectedHead} research/retired-prototype`,
      );
      expect(retired.stdout).toContain(
        `RETIRED remote-branch ${expectedHead} origin/research/retired-prototype`,
      );
      expect(git(root, "worktree", "list", "--porcelain").stdout).not.toContain(retiredWorktree);
      expect(
        git(root, "show-ref", "--verify", "--quiet", "refs/heads/research/retired-prototype")
          .status,
      ).not.toBe(0);
      expect(
        git(root, "ls-remote", "--heads", remote, "refs/heads/research/retired-prototype").stdout,
      ).toBe("");
      expectSuccess(git(root, "show-ref", "--verify", "refs/heads/main"));
      expectSuccess(git(root, "show-ref", "--verify", "refs/heads/dev"));
    } finally {
      cleanupFixture(tempRoot);
    }
  });

  it("reports an already-absent remote branch as a retirement no-op", () => {
    const { root, tempRoot } = initialiseRemoteRepository();
    try {
      const branch = "prototype/already-removed-remote";
      expectSuccess(git(root, "switch", "-c", branch, "dev"));
      writeFileSync(join(root, "prototype.txt"), "retired prototype\n");
      expectSuccess(git(root, "add", "prototype.txt"));
      expectSuccess(git(root, "commit", "-m", "Retired prototype"));
      const expectedHead = git(root, "rev-parse", "HEAD").stdout.trim();
      expectSuccess(git(root, "push", "-u", "origin", branch));
      expectSuccess(git(root, "switch", "main"));
      expectSuccess(git(root, "push", "origin", "--delete", branch));
      const fakeGh = writeTaskLifecycleFakeGh(tempRoot);

      const retired = run(
        taskHelper,
        ["retire", branch, "--expect-head", expectedHead, "--remote"],
        root,
        { env: { GH_BIN: fakeGh } },
      );

      expectSuccess(retired);
      expect(retired.stdout).toContain(
        `ABSENT remote-branch ${expectedHead} origin/${branch} — no-op`,
      );
      expect(
        git(root, "show-ref", "--verify", "--quiet", `refs/heads/${branch}`).status,
      ).not.toBe(0);
    } finally {
      cleanupFixture(tempRoot);
    }
  });

  it("refuses retirement when the expected head is absent everywhere", () => {
    const { root, tempRoot } = initialiseRemoteRepository();
    try {
      const fakeGh = writeTaskLifecycleFakeGh(tempRoot);
      const retired = run(
        taskHelper,
        [
          "retire",
          "research/missing-retirement-target",
          "--expect-head",
          "0".repeat(40),
          "--remote",
        ],
        root,
        { env: { GH_BIN: fakeGh } },
      );

      expect(retired.status).not.toBe(0);
      expect(retired.stderr).toContain("no state found for 'research/missing-retirement-target'");
    } finally {
      cleanupFixture(tempRoot);
    }
  });

  it("refuses retirement when multiple worktrees own the same branch", () => {
    const { root, tempRoot } = initialiseRepository();
    try {
      const branch = "research/ambiguous-worktree-owner";
      expectSuccess(git(root, "switch", "-c", branch, "dev"));
      writeFileSync(join(root, "research.md"), "ambiguous ownership\n");
      expectSuccess(git(root, "add", "research.md"));
      expectSuccess(git(root, "commit", "-m", "Ambiguous ownership fixture"));
      const expectedHead = git(root, "rev-parse", "HEAD").stdout.trim();
      expectSuccess(git(root, "switch", "main"));
      const firstWorktree = join(tempRoot, "first-owner");
      const secondWorktree = join(tempRoot, "second-owner");
      expectSuccess(git(root, "worktree", "add", firstWorktree, branch));
      expectSuccess(git(root, "worktree", "add", "--force", secondWorktree, branch));
      const fakeGh = writeTaskLifecycleFakeGh(tempRoot);

      const retired = run(
        taskHelper,
        ["retire", firstWorktree, "--expect-head", expectedHead],
        root,
        { env: { GH_BIN: fakeGh } },
      );

      expect(retired.status).not.toBe(0);
      expect(retired.stderr).toContain(`branch '${branch}' is checked out in 2 worktrees`);
      const remaining = git(root, "worktree", "list", "--porcelain").stdout;
      expect(remaining).toContain(firstWorktree);
      expect(remaining).toContain(secondWorktree);
      expectSuccess(git(root, "show-ref", "--verify", `refs/heads/${branch}`));
    } finally {
      cleanupFixture(tempRoot);
    }
  });

  it("preserves local state when a remote branch races its deletion lease", () => {
    const { root, tempRoot, remote } = initialiseRemoteRepository();
    try {
      const branch = "research/remote-retirement-race";
      expectSuccess(git(root, "switch", "-c", branch, "dev"));
      writeFileSync(join(root, "research.md"), "retirement race\n");
      expectSuccess(git(root, "add", "research.md"));
      expectSuccess(git(root, "commit", "-m", "Remote retirement race fixture"));
      const expectedHead = git(root, "rev-parse", "HEAD").stdout.trim();
      expectSuccess(git(root, "push", "-u", "origin", branch));
      const tree = git(root, "rev-parse", `${expectedHead}^{tree}`).stdout.trim();
      const raceHead = git(
        root,
        "commit-tree",
        tree,
        "-p",
        expectedHead,
        "-m",
        "Concurrent remote update",
      ).stdout.trim();
      expectSuccess(git(root, "push", "origin", `${raceHead}:refs/heads/race-fixture`));
      expectSuccess(git(root, "switch", "main"));
      const worktree = join(tempRoot, "remote-race-worktree");
      expectSuccess(git(root, "worktree", "add", worktree, branch));
      const fakeGh = writeTaskLifecycleFakeGh(tempRoot);
      const markerPath = writeRemoteRaceHook(root, tempRoot);

      const retired = run(
        taskHelper,
        ["retire", worktree, "--expect-head", expectedHead, "--remote"],
        root,
        {
          env: {
            GH_BIN: fakeGh,
            RACE_MARKER: markerPath,
            RACE_REMOTE: remote,
            RACE_REF: `refs/heads/${branch}`,
            RACE_HEAD: raceHead,
          },
        },
      );

      expect(retired.status).not.toBe(0);
      expect(readFileSync(markerPath, "utf8")).toBe("triggered\n");
      expect(git(root, "worktree", "list", "--porcelain").stdout).toContain(worktree);
      expect(git(root, "rev-parse", `refs/heads/${branch}`).stdout.trim()).toBe(expectedHead);
      expect(git(root, "ls-remote", remote, `refs/heads/${branch}`).stdout).toContain(raceHead);
    } finally {
      cleanupFixture(tempRoot);
    }
  });

  it("refuses retirement when local, GitHub, or remote evidence changes", () => {
    const { root, tempRoot, remote } = initialiseRemoteRepository();
    try {
      const branch = "research/retirement-safety";
      expectSuccess(git(root, "switch", "-c", branch, "dev"));
      writeFileSync(join(root, "research.md"), "preserve until every check passes\n");
      expectSuccess(git(root, "add", "research.md"));
      expectSuccess(git(root, "commit", "-m", "Retirement safety fixture"));
      const expectedHead = git(root, "rev-parse", "HEAD").stdout.trim();
      expectSuccess(git(root, "push", "-u", "origin", branch));
      expectSuccess(git(root, "switch", "main"));
      const worktree = join(tempRoot, "retirement-safety-worktree");
      expectSuccess(git(root, "worktree", "add", worktree, branch));
      const fakeGh = writeTaskLifecycleFakeGh(tempRoot);
      const baseEnv = { GH_BIN: fakeGh };

      writeFileSync(join(worktree, "dirty.txt"), "do not delete\n");
      const dirty = run(
        taskHelper,
        ["retire", worktree, "--expect-head", expectedHead, "--remote"],
        root,
        { env: baseEnv },
      );
      expect(dirty.status).not.toBe(0);
      expect(dirty.stderr).toContain("worktree has local changes");
      rmSync(join(worktree, "dirty.txt"));

      const wrongHead = run(
        taskHelper,
        ["retire", worktree, "--expect-head", "0".repeat(40), "--remote"],
        root,
        { env: baseEnv },
      );
      expect(wrongHead.status).not.toBe(0);
      expect(wrongHead.stderr).toContain(`found ${expectedHead}; nothing was retired`);

      const openPr = run(
        taskHelper,
        ["retire", worktree, "--expect-head", expectedHead, "--remote"],
        root,
        {
          env: {
            ...baseEnv,
            FAKE_TASK_PRS: JSON.stringify([openTaskPr(322, branch, expectedHead)]),
          },
        },
      );
      expect(openPr.status).not.toBe(0);
      expect(openPr.stderr).toContain("state belongs to open PR #322");

      const tree = git(root, "rev-parse", `${expectedHead}^{tree}`).stdout.trim();
      const remoteAdvance = git(
        root,
        "commit-tree",
        tree,
        "-p",
        expectedHead,
        "-m",
        "Remote branch advanced",
      ).stdout.trim();
      expectSuccess(git(root, "push", "origin", `${remoteAdvance}:refs/heads/${branch}`));
      expectSuccess(git(root, "update-ref", `refs/remotes/origin/${branch}`, expectedHead));

      const changedRemote = run(
        taskHelper,
        ["retire", worktree, "--expect-head", expectedHead, "--remote"],
        root,
        { env: baseEnv },
      );
      expect(changedRemote.status).not.toBe(0);
      expect(changedRemote.stderr).toContain(`origin/${branch} is ${remoteAdvance}`);

      const protectedMain = run(
        taskHelper,
        ["retire", "main", "--expect-head", git(root, "rev-parse", "main").stdout.trim()],
        root,
        { env: baseEnv },
      );
      expect(protectedMain.status).not.toBe(0);
      expect(protectedMain.stderr).toContain("refusing to retire permanent branch 'main'");

      expect(git(root, "worktree", "list", "--porcelain").stdout).toContain(worktree);
      expectSuccess(git(root, "show-ref", "--verify", `refs/heads/${branch}`));
      expect(git(root, "ls-remote", "--heads", remote, `refs/heads/${branch}`).stdout).toContain(
        remoteAdvance,
      );
    } finally {
      cleanupFixture(tempRoot);
    }
  });

  it("does not reconcile anything when GitHub inventory is unavailable", () => {
    const { root, tempRoot } = initialiseRepository();
    try {
      const detachedWorktree = join(tempRoot, "uncertain-detached-worktree");
      expectSuccess(git(root, "worktree", "add", "--detach", detachedWorktree, "dev"));
      const fakeGh = writeTaskLifecycleFakeGh(tempRoot);

      const applied = run(taskHelper, ["reconcile", "--apply"], root, {
        env: {
          GH_BIN: fakeGh,
          FAKE_TASK_GH_FAILURE: "GitHub unavailable during reconciliation",
        },
      });

      expect(applied.status).not.toBe(0);
      expect(applied.stderr).toContain("GitHub unavailable during reconciliation");
      expect(git(root, "worktree", "list", "--porcelain").stdout).toContain(
        detachedWorktree,
      );
    } finally {
      cleanupFixture(tempRoot);
    }
  });
});

type FakeGithubState = {
  repo: Record<string, unknown>;
  labels: Array<{ name: string; color: string; description: string }>;
  protections: Record<string, unknown>;
  failAuth?: boolean;
  failIssues?: boolean;
  advanceDev?: boolean;
  advancedDev?: boolean;
};

function writeFakeGh(tempRoot: string, logPath: string): string {
  const executable = join(tempRoot, "fake-gh.mjs");
  writeFileSync(
    executable,
    `#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const args = process.argv.slice(2);
const statePath = process.env.FAKE_GH_STATE;
const logPath = process.env.FAKE_GH_LOG;
const state = JSON.parse(readFileSync(statePath, "utf8"));
const save = () => writeFileSync(statePath, JSON.stringify(state));
writeFileSync(logPath, JSON.stringify(args) + "\\n", { flag: "a" });
if (args[0] === "auth" && args[1] === "status") {
  if (state.failAuth) {
    process.stderr.write("authentication unavailable\\n");
    process.exit(1);
  }
  process.exit(0);
}
if (args[0] === "repo" && args[1] === "view") {
  process.stdout.write(JSON.stringify(state.repo));
  process.exit(0);
}
if (args[0] === "label" && args[1] === "list") {
  process.stdout.write(JSON.stringify(state.labels));
  process.exit(0);
}
if (args[0] === "label" && args[1] === "create") {
  if (state.advanceDev && !state.advancedDev) {
    const oldHead = execFileSync("git", ["rev-parse", "dev"], { encoding: "utf8" }).trim();
    const tree = execFileSync("git", ["rev-parse", "dev^{tree}"], { encoding: "utf8" }).trim();
    const nextHead = execFileSync("git", ["commit-tree", tree, "-p", oldHead, "-m", "Concurrent dev"], { encoding: "utf8" }).trim();
    execFileSync("git", ["update-ref", "refs/heads/dev", nextHead]);
    state.advancedDev = true;
  }
  const name = args[2];
  const color = args[args.indexOf("--color") + 1];
  const description = args[args.indexOf("--description") + 1];
  const existing = state.labels.find((label) => label.name === name);
  if (existing) Object.assign(existing, { color, description });
  else state.labels.push({ name, color, description });
  save();
  process.exit(0);
}
if (args[0] === "api") {
  const methodIndex = args.findIndex((arg) => arg === "--method" || arg === "-X");
  const method = methodIndex === -1 ? "GET" : args[methodIndex + 1];
  const endpoint = args.find((arg) => arg.startsWith("repos/"));
  if (method === "GET" && endpoint?.endsWith("/issues?state=all&per_page=1")) {
    if (state.failIssues) {
      process.stderr.write("gh: Forbidden (HTTP 403)\\n");
      process.exit(1);
    }
    process.stdout.write("[]");
    process.exit(0);
  }
  const protection = endpoint?.match(/\\/branches\\/(main|dev)\\/protection$/)?.[1];
  if (method === "GET" && protection) {
    if (!state.protections[protection]) {
      process.stderr.write("gh: Branch not protected (HTTP 404)\\n");
      process.exit(1);
    }
    process.stdout.write(JSON.stringify(state.protections[protection]));
    process.exit(0);
  }
  const input = readFileSync(0, "utf8");
  if (method === "PATCH" && endpoint === "repos/brandon-y-lee/helix") {
    const patch = JSON.parse(input);
    state.repo.mergeCommitAllowed = patch.allow_merge_commit;
    state.repo.squashMergeAllowed = patch.allow_squash_merge;
    state.repo.rebaseMergeAllowed = patch.allow_rebase_merge;
    state.repo.deleteBranchOnMerge = patch.delete_branch_on_merge;
    save();
    process.stdout.write(JSON.stringify(state.repo));
    process.exit(0);
  }
  if (method === "PUT" && protection) {
    state.protections[protection] = JSON.parse(input);
    save();
    process.stdout.write(JSON.stringify(state.protections[protection]));
    process.exit(0);
  }
}
process.stderr.write("unexpected fake gh call: " + args.join(" ") + "\\n");
process.exit(2);
`,
  );
  chmodSync(executable, 0o755);
  writeFileSync(logPath, "");
  return executable;
}

function initialiseRemoteRepository(): {
  root: string;
  tempRoot: string;
  remote: string;
  devSha: string;
} {
  const fixture = initialiseRepository();
  const remote = join(fixture.tempRoot, "remote.git");
  expectSuccess(git(fixture.tempRoot, "init", "--bare", remote));
  expectSuccess(git(fixture.root, "remote", "add", "origin", remote));
  expectSuccess(git(fixture.root, "push", "origin", "main"));
  const devSha = git(fixture.root, "rev-parse", "dev").stdout.trim();
  return { ...fixture, remote, devSha };
}

function bootstrap(
  root: string,
  fakeGh: string,
  statePath: string,
  logPath: string,
  ...args: string[]
): CommandResult {
  return run(process.execPath, [bootstrapTool, ...args], root, {
    env: {
      GH_BIN: fakeGh,
      FAKE_GH_STATE: statePath,
      FAKE_GH_LOG: logPath,
    },
  });
}

describe("GitHub workflow bootstrap", () => {
  it("plans exact drift without mutating GitHub or creating remote dev", () => {
    const { root, tempRoot, devSha } = initialiseRemoteRepository();
    try {
      const statePath = join(tempRoot, "github-state.json");
      const logPath = join(tempRoot, "github-calls.log");
      const state: FakeGithubState = {
        repo: {
          nameWithOwner: "brandon-y-lee/helix",
          defaultBranchRef: { name: "main" },
          hasIssuesEnabled: true,
          mergeCommitAllowed: false,
          squashMergeAllowed: false,
          rebaseMergeAllowed: true,
          deleteBranchOnMerge: false,
        },
        labels: [],
        protections: {},
      };
      writeFileSync(statePath, JSON.stringify(state));
      const fakeGh = writeFakeGh(tempRoot, logPath);

      const planned = bootstrap(
        root,
        fakeGh,
        statePath,
        logPath,
        "plan",
        "--repo",
        "brandon-y-lee/helix",
      );
      expectSuccess(planned);
      expect(planned.stdout).toContain(`create remote dev at ${devSha}`);
      expect(planned.stdout).toContain("create label type:spec");
      expect(planned.stdout).toContain("update repository merge settings");
      expect(planned.stdout).toContain("protect dev");
      expect(planned.stdout).toContain("protect main");
      expect(planned.stdout).toContain("No changes applied.");
      expect(git(root, "ls-remote", "--exit-code", "--heads", "origin", "dev").status).not.toBe(0);
      expect(readFileSync(statePath, "utf8")).toBe(JSON.stringify(state));
      expect(readFileSync(logPath, "utf8")).not.toContain('["label","create"');
    } finally {
      cleanupFixture(tempRoot);
    }
  });

  it("fails closed when apply lacks exact repository, dev, and CI confirmations", () => {
    const { root, tempRoot, devSha } = initialiseRemoteRepository();
    try {
      const statePath = join(tempRoot, "github-state.json");
      const logPath = join(tempRoot, "github-calls.log");
      writeFileSync(
        statePath,
        JSON.stringify({
          repo: {
            nameWithOwner: "brandon-y-lee/helix",
            defaultBranchRef: { name: "main" },
            hasIssuesEnabled: true,
            mergeCommitAllowed: true,
            squashMergeAllowed: true,
            rebaseMergeAllowed: false,
            deleteBranchOnMerge: true,
          },
          labels: [],
          protections: {},
        }),
      );
      const fakeGh = writeFakeGh(tempRoot, logPath);
      const applied = bootstrap(
        root,
        fakeGh,
        statePath,
        logPath,
        "apply",
        "--repo",
        "brandon-y-lee/helix",
      );
      expect(applied.status).not.toBe(0);
      expect(applied.stderr).toContain("apply requires --confirm-repo");
      const missingCiAttestation = bootstrap(
        root,
        fakeGh,
        statePath,
        logPath,
        "apply",
        "--repo",
        "brandon-y-lee/helix",
        "--confirm-repo",
        "brandon-y-lee/helix",
        "--confirm-dev-sha",
        devSha,
      );
      expect(missingCiAttestation.status).not.toBe(0);
      expect(missingCiAttestation.stderr).toContain(`apply requires --confirm-ci-sha ${devSha}`);
      expect(git(root, "ls-remote", "--exit-code", "--heads", "origin", "dev").status).not.toBe(0);
    } finally {
      cleanupFixture(tempRoot);
    }
  });

  it("applies solo-maintainer protection and becomes a no-op on the next plan", () => {
    const { root, tempRoot, devSha } = initialiseRemoteRepository();
    try {
      const statePath = join(tempRoot, "github-state.json");
      const logPath = join(tempRoot, "github-calls.log");
      writeFileSync(
        statePath,
        JSON.stringify({
          repo: {
            nameWithOwner: "brandon-y-lee/helix",
            defaultBranchRef: { name: "main" },
            hasIssuesEnabled: true,
            mergeCommitAllowed: false,
            squashMergeAllowed: false,
            rebaseMergeAllowed: true,
            deleteBranchOnMerge: false,
          },
          labels: [],
          protections: {},
        }),
      );
      const fakeGh = writeFakeGh(tempRoot, logPath);

      const applied = bootstrap(
        root,
        fakeGh,
        statePath,
        logPath,
        "apply",
        "--repo",
        "brandon-y-lee/helix",
        "--confirm-repo",
        "brandon-y-lee/helix",
        "--confirm-dev-sha",
        devSha,
        "--confirm-ci-sha",
        devSha,
      );
      expectSuccess(applied);
      expect(applied.stdout).toContain("Applied GitHub workflow configuration.");
      expectSuccess(git(root, "ls-remote", "--exit-code", "--heads", "origin", "dev"));
      const state = JSON.parse(readFileSync(statePath, "utf8"));
      expect(
        state.protections.main.required_pull_request_reviews.required_approving_review_count,
      ).toBe(0);
      expect(readFileSync(logPath, "utf8")).not.toContain("collaborators");

      writeFileSync(logPath, "");
      const plannedAgain = bootstrap(
        root,
        fakeGh,
        statePath,
        logPath,
        "plan",
        "--repo",
        "brandon-y-lee/helix",
      );
      expectSuccess(plannedAgain);
      expect(plannedAgain.stdout).toContain("No changes required.");
      expect(readFileSync(logPath, "utf8")).not.toContain('["label","create"');
      expect(readFileSync(logPath, "utf8")).not.toContain('"PATCH"');
      expect(readFileSync(logPath, "utf8")).not.toContain('"PUT"');

      state.protections.dev.required_pull_request_reviews.require_code_owner_reviews = true;
      writeFileSync(statePath, JSON.stringify(state));
      const approvalDrift = bootstrap(
        root,
        fakeGh,
        statePath,
        logPath,
        "plan",
        "--repo",
        "brandon-y-lee/helix",
      );
      expectSuccess(approvalDrift);
      expect(approvalDrift.stdout).toContain("protect dev");

      state.protections.dev.required_pull_request_reviews.require_code_owner_reviews = false;
      state.protections.dev.required_status_checks.contexts = ["ci", "obsolete-check"];
      writeFileSync(statePath, JSON.stringify(state));
      const statusCheckDrift = bootstrap(
        root,
        fakeGh,
        statePath,
        logPath,
        "plan",
        "--repo",
        "brandon-y-lee/helix",
      );
      expectSuccess(statusCheckDrift);
      expect(statusCheckDrift.stdout).toContain("protect dev");
    } finally {
      cleanupFixture(tempRoot);
    }
  });

  it("pushes only the confirmed dev SHA when local dev moves during apply", () => {
    const { root, tempRoot, devSha } = initialiseRemoteRepository();
    try {
      const statePath = join(tempRoot, "github-state.json");
      const logPath = join(tempRoot, "github-calls.log");
      writeFileSync(
        statePath,
        JSON.stringify({
          repo: {
            nameWithOwner: "brandon-y-lee/helix",
            defaultBranchRef: { name: "main" },
            hasIssuesEnabled: true,
            mergeCommitAllowed: false,
            squashMergeAllowed: false,
            rebaseMergeAllowed: true,
            deleteBranchOnMerge: false,
          },
          labels: [],
          protections: {},
          advanceDev: true,
        }),
      );
      const fakeGh = writeFakeGh(tempRoot, logPath);

      const applied = bootstrap(
        root,
        fakeGh,
        statePath,
        logPath,
        "apply",
        "--repo",
        "brandon-y-lee/helix",
        "--confirm-repo",
        "brandon-y-lee/helix",
        "--confirm-dev-sha",
        devSha,
        "--confirm-ci-sha",
        devSha,
      );
      expectSuccess(applied);
      expect(git(root, "rev-parse", "dev").stdout.trim()).not.toBe(devSha);
      expect(
        git(root, "ls-remote", "--heads", "origin", "refs/heads/dev").stdout.split(/\s+/)[0],
      ).toBe(devSha);
    } finally {
      cleanupFixture(tempRoot);
    }
  });

  it("fails closed on authentication, repository, ancestry, and issue capability uncertainty", () => {
    const scenarios: Array<{
      name: string;
      mutateState?: (state: FakeGithubState) => void;
      mutateRepo?: (root: string) => void;
      expected: RegExp;
    }> = [
      {
        name: "authentication",
        mutateState: (state) => {
          state.failAuth = true;
        },
        expected: /authentication unavailable/,
      },
      {
        name: "repository",
        mutateState: (state) => {
          state.repo.nameWithOwner = "someone/else";
        },
        expected: /not 'brandon-y-lee\/helix'/,
      },
      {
        name: "ancestry",
        mutateRepo: (root) => {
          writeFileSync(join(root, "main-only.txt"), "remote main advanced\n");
          expectSuccess(git(root, "add", "main-only.txt"));
          expectSuccess(git(root, "commit", "-m", "Advance main only"));
          expectSuccess(git(root, "push", "origin", "main"));
        },
        expected: /does not contain remote main/,
      },
      {
        name: "capability",
        mutateState: (state) => {
          state.failIssues = true;
        },
        expected: /issue API capability/,
      },
    ];

    for (const scenario of scenarios) {
      const { root, tempRoot } = initialiseRemoteRepository();
      try {
        const statePath = join(tempRoot, "github-state.json");
        const logPath = join(tempRoot, "github-calls.log");
        const state: FakeGithubState = {
          repo: {
            nameWithOwner: "brandon-y-lee/helix",
            defaultBranchRef: { name: "main" },
            hasIssuesEnabled: true,
            mergeCommitAllowed: true,
            squashMergeAllowed: true,
            rebaseMergeAllowed: false,
            deleteBranchOnMerge: true,
          },
          labels: [],
          protections: {},
        };
        scenario.mutateState?.(state);
        scenario.mutateRepo?.(root);
        writeFileSync(statePath, JSON.stringify(state));
        const fakeGh = writeFakeGh(tempRoot, logPath);
        const planned = bootstrap(
          root,
          fakeGh,
          statePath,
          logPath,
          "plan",
          "--repo",
          "brandon-y-lee/helix",
        );
        expect(planned.status, scenario.name).not.toBe(0);
        expect(planned.stderr).toMatch(scenario.expected);
      } finally {
        cleanupFixture(tempRoot);
      }
    }
  });
});
