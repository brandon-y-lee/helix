import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { describe, expect, it } from "vitest";

const projectRoot = process.cwd();
const taskHelper = resolve(projectRoot, "scripts/git/codex-task.sh");
const bootstrapTool = resolve(projectRoot, "scripts/github/bootstrap-workflow.mjs");

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
  const tempRoot = mkdtempSync(join(tmpdir(), "mei-pelle-workflow-test-"));
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

      const fakeGh = join(tempRoot, "fake-gh");
      writeFileSync(
        fakeGh,
        "#!/bin/sh\nprintf '%s\\tdev\\t2026-08-05T12:00:00Z\\t%s\\n' \"${FAKE_PR_STATE:-OPEN}\" \"${FAKE_PR_HEAD:-missing}\"\n",
      );
      chmodSync(fakeGh, 0o755);

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
});

type FakeGithubState = {
  repo: Record<string, unknown>;
  labels: Array<{ name: string; color: string; description: string }>;
  protections: Record<string, unknown>;
  collaborators?: Array<{ login: string; permissions: { push: boolean } }>;
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
  if (method === "GET" && endpoint?.endsWith("/collaborators?affiliation=direct")) {
    process.stdout.write(JSON.stringify(state.collaborators ?? [
      { login: "owner", permissions: { push: true } },
      { login: "reviewer", permissions: { push: true } }
    ]));
    process.exit(0);
  }
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
  if (method === "PATCH" && endpoint === "repos/brandon-y-lee/mei-pelle") {
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
          nameWithOwner: "brandon-y-lee/mei-pelle",
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
        "brandon-y-lee/mei-pelle",
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
            nameWithOwner: "brandon-y-lee/mei-pelle",
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
        "brandon-y-lee/mei-pelle",
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
        "brandon-y-lee/mei-pelle",
        "--confirm-repo",
        "brandon-y-lee/mei-pelle",
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
            nameWithOwner: "brandon-y-lee/mei-pelle",
            defaultBranchRef: { name: "main" },
            hasIssuesEnabled: true,
            mergeCommitAllowed: false,
            squashMergeAllowed: false,
            rebaseMergeAllowed: true,
            deleteBranchOnMerge: false,
          },
          labels: [],
          protections: {},
          collaborators: [{ login: "owner", permissions: { push: true } }],
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
        "brandon-y-lee/mei-pelle",
        "--confirm-repo",
        "brandon-y-lee/mei-pelle",
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
        "brandon-y-lee/mei-pelle",
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
        "brandon-y-lee/mei-pelle",
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
        "brandon-y-lee/mei-pelle",
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
            nameWithOwner: "brandon-y-lee/mei-pelle",
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
        "brandon-y-lee/mei-pelle",
        "--confirm-repo",
        "brandon-y-lee/mei-pelle",
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
        expected: /not 'brandon-y-lee\/mei-pelle'/,
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
            nameWithOwner: "brandon-y-lee/mei-pelle",
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
          "brandon-y-lee/mei-pelle",
        );
        expect(planned.status, scenario.name).not.toBe(0);
        expect(planned.stderr).toMatch(scenario.expected);
      } finally {
        cleanupFixture(tempRoot);
      }
    }
  });
});
