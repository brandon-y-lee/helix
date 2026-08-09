import { execFile } from "node:child_process";

import type {
  SpecLifecycleAdapters,
  WorkflowBranch,
  WorkflowIssue,
  WorkflowPullRequest,
} from "./spec-integration-lifecycle";
import { assertDesiredSpecRuleset } from "./spec-ruleset.mjs";

type CommandResult = { stdout: string; stderr: string; status: number };

export interface SpecCommandAdapter {
  run(
    command: string,
    args: string[],
    options?: { allowFailure?: boolean; input?: string },
  ): Promise<CommandResult>;
}

const systemCommands: SpecCommandAdapter = {
  async run(command, args, options = {}) {
    return new Promise((resolve, reject) => {
      const child = execFile(
        command,
        args,
        { cwd: process.cwd(), encoding: "utf8", env: process.env },
        (error, stdout, stderr) => {
          const result = {
            stdout,
            stderr,
            status: typeof error?.code === "number" ? error.code : error ? 1 : 0,
          };
          if (error && !options.allowFailure) {
            reject(new Error(`${command} ${args.join(" ")} failed: ${(stderr || error.message).trim()}`));
          } else {
            resolve(result);
          }
        },
      );
      if (options.input !== undefined) child.stdin?.end(options.input);
    });
  },
};

export async function assertTrustedActionsContext(
  repository: string,
  commands: SpecCommandAdapter = systemCommands,
  environment: Record<string, string | undefined> = process.env,
  requestIdentityToken: (url: string, bearer: string) => Promise<string> = async (url, bearer) => {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${bearer}` } });
    if (!response.ok) throw new Error(`Actions identity endpoint failed with HTTP ${response.status}`);
    const payload = await response.json() as { value?: string };
    if (!payload.value) throw new Error("Actions identity endpoint omitted its token");
    return payload.value;
  },
): Promise<void> {
  const runId = environment.GITHUB_RUN_ID;
  const identityUrlValue = environment.ACTIONS_ID_TOKEN_REQUEST_URL;
  const identityBearer = environment.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (
    environment.GITHUB_ACTIONS !== "true" ||
    environment.GITHUB_REPOSITORY !== repository ||
    !environment.GH_TOKEN ||
    !identityUrlValue ||
    !identityBearer ||
    !/^\d+$/.test(runId ?? "")
  ) {
    throw new Error("spec lifecycle mutations require the trusted GitHub Actions orchestrator");
  }
  const identityUrl = new URL(identityUrlValue);
  if (
    identityUrl.protocol !== "https:" ||
    !identityUrl.hostname.endsWith(".actions.githubusercontent.com")
  ) {
    throw new Error("Actions identity endpoint is not the trusted GitHub issuer");
  }
  const audience = `https://github.com/${repository}/spec-lifecycle`;
  identityUrl.searchParams.set("audience", audience);
  const identityToken = await requestIdentityToken(identityUrl.toString(), identityBearer);
  const encodedClaims = identityToken.split(".")[1];
  if (!encodedClaims) throw new Error("Actions identity endpoint returned an invalid token");
  const claims = parseJson<{
    aud?: string;
    repository?: string;
    event_name?: string;
    ref?: string;
    workflow_ref?: string;
  }>(Buffer.from(encodedClaims, "base64url").toString("utf8"), "Actions identity claims");
  if (
    claims.aud !== audience ||
    claims.repository !== repository ||
    claims.event_name !== "workflow_dispatch" ||
    claims.ref !== "refs/heads/dev" ||
    claims.workflow_ref !== `${repository}/.github/workflows/spec-lifecycle.yml@refs/heads/dev`
  ) {
    throw new Error("Actions identity is not bound to the audited Spec Lifecycle Orchestrator on dev");
  }
  const run = parseJson<{
    name?: string;
    event?: string;
    head_branch?: string;
    repository?: { full_name?: string };
  }>(
    (await commands.run("gh", ["api", `repos/${repository}/actions/runs/${runId}`])).stdout,
    "spec lifecycle workflow run",
  );
  if (
    run.name !== "Spec Lifecycle Orchestrator" ||
    run.event !== "workflow_dispatch" ||
    run.head_branch !== "dev" ||
    run.repository?.full_name !== repository
  ) {
    throw new Error("current Actions run is not the audited Spec Lifecycle Orchestrator on dev");
  }
}

function parseJson<T>(value: string, description: string): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    throw new Error(`${description} returned invalid JSON`);
  }
}

function issueNumberFromBranch(branch: string): number | undefined {
  const match = branch.match(/^codex\/(\d+)-/);
  return match ? Number(match[1]) : undefined;
}

function issueParent(body: string): number | undefined {
  const match = body.match(/^## Parent\s*\n+\s*#(\d+)\s*$/m);
  return match ? Number(match[1]) : undefined;
}

function ticketNumber(body: string): number | undefined {
  const match = body.match(/(?:^- Refs:\s*|^Refs\s+)#(\d+)\s*$/m);
  return match ? Number(match[1]) : undefined;
}

function reviewPassed(body: string): boolean {
  return (
    /^- Standards:\s*(?:pass|0 findings)\b/im.test(body) &&
    /^- Spec:\s*(?:pass|0 findings)\b/im.test(body)
  );
}


export function createSpecLifecycleAdapters(
  repository: string,
  commands: SpecCommandAdapter = systemCommands,
): SpecLifecycleAdapters {
  if (repository !== "brandon-y-lee/mei-pelle") {
    throw new Error("spec lifecycle requires repository brandon-y-lee/mei-pelle");
  }

  async function readIssue(number: number): Promise<WorkflowIssue> {
    const [result, blockersResult] = await Promise.all([
      commands.run("gh", [
        "issue",
        "view",
        String(number),
        "--repo",
        repository,
        "--json",
        "number,state,labels,assignees,body",
      ]),
      commands.run("gh", [
        "api",
        `repos/${repository}/issues/${number}/dependencies/blocked_by`,
        "--paginate",
        "-H",
        "X-GitHub-Api-Version: 2026-03-10",
      ]),
    ]);
    const fact = parseJson<{
      number: number;
      state: string;
      labels: Array<{ name: string }>;
      assignees: Array<{ login: string }>;
      body: string;
    }>(result.stdout, `issue #${number}`);
    const blockers = parseJson<Array<{ number: number }>>(blockersResult.stdout, `issue #${number} blockers`);
    return {
      number: fact.number,
      state: fact.state.toLowerCase() === "open" ? "open" : "closed",
      labels: fact.labels.map((label) => label.name),
      assignees: fact.assignees.map((assignee) => assignee.login),
      parentNumber: issueParent(fact.body),
      blockedBy: blockers.map((blocker) => blocker.number),
    };
  }

  async function readPullRequest(number: number): Promise<WorkflowPullRequest> {
    const result = await commands.run("gh", [
      "pr",
      "view",
      String(number),
      "--repo",
      repository,
      "--json",
      "number,state,headRefName,baseRefName,headRefOid,isDraft,mergeable,statusCheckRollup,body,mergeCommit,mergedAt",
    ]);
    const fact = parseJson<{
      number: number;
      state: string;
      headRefName: string;
      baseRefName: string;
      headRefOid: string;
      isDraft: boolean;
      mergeable: string;
      statusCheckRollup: Array<{
        name?: string;
        context?: string;
        conclusion?: string;
        state?: string;
        status?: string;
      }>;
      body: string;
      mergeCommit?: { oid?: string };
      mergedAt?: string;
    }>(result.stdout, `pull request #${number}`);
    const checks: WorkflowPullRequest["checks"] = {};
    for (const check of fact.statusCheckRollup) {
      const name = check.name ?? check.context;
      if (!name) continue;
      const value = check.conclusion ?? check.state;
      checks[name] = value === "SUCCESS" ? "passed" : value === "FAILURE" ? "failed" : "pending";
    }
    let mergeMethod: WorkflowPullRequest["mergeMethod"];
    if (fact.mergedAt && fact.mergeCommit?.oid) {
      const commit = parseJson<{ parents?: unknown[] }>(
        (await commands.run("gh", ["api", `repos/${repository}/git/commits/${fact.mergeCommit.oid}`])).stdout,
        `merge commit for pull request #${number}`,
      );
      mergeMethod = (commit.parents?.length ?? 0) > 1 ? "merge" : "squash";
    }
    return {
      number: fact.number,
      state: fact.mergedAt ? "merged" : fact.state.toLowerCase() === "open" ? "open" : "closed",
      headBranch: fact.headRefName,
      baseBranch: fact.baseRefName,
      headSha: fact.headRefOid,
      draft: fact.isDraft,
      checks,
      body: fact.body,
      ticketNumber: ticketNumber(fact.body),
      reviewPassed: reviewPassed(fact.body),
      mergeable: fact.mergeable !== "CONFLICTING" && fact.mergeable !== "UNKNOWN",
      mergeMethod,
      mergeSha: fact.mergeCommit?.oid,
    };
  }

  async function readTicketStart(issueNumber: number, branch: string) {
    const comments = await commands.run("gh", [
      "issue",
      "view",
      String(issueNumber),
      "--repo",
      repository,
      "--comments",
      "--json",
      "comments",
    ]);
    const values = parseJson<{ comments: Array<{ body: string }> }>(comments.stdout, `issue #${issueNumber} comments`);
    for (const comment of [...values.comments].reverse()) {
      const match = comment.body.match(/<!-- mei-pelle-ticket-branch:v1 (\{.*\}) -->/);
      if (!match) continue;
      const metadata = parseJson<{ branch: string; baseBranch: string; baseSha?: string }>(match[1], "ticket branch metadata");
      if (metadata.branch === branch && metadata.baseSha) {
        return { baseBranch: metadata.baseBranch, baseSha: metadata.baseSha };
      }
    }
    return null;
  }

  return {
    github: {
      async protectSpecBranch(input) {
        const summaries = parseJson<Array<{ id: number; name: string }>>(
          (await commands.run("gh", ["api", `repos/${repository}/rulesets?includes_parents=false`])).stdout,
          "repository rulesets",
        );
        const summary = summaries.find((entry) => entry.name === "spec branch pull request integration");
        if (!summary) throw new Error("protected spec branch ruleset is not active");
        const ruleset = parseJson<Record<string, unknown>>(
          (await commands.run("gh", ["api", `repos/${repository}/rulesets/${summary.id}`])).stdout,
          "protected spec branch ruleset",
        );
        assertDesiredSpecRuleset(ruleset);
        if (!input.branch.startsWith("codex/spec-")) throw new Error("invalid protected spec branch");
      },
    },
    git: {
      async readBranch(name) {
        const result = await commands.run(
          "gh",
          ["api", `repos/${repository}/git/ref/heads/${encodeURIComponent(name)}`],
          { allowFailure: true },
        );
        if (result.status !== 0) {
          if (/HTTP 404|Not Found/i.test(result.stderr)) return null;
          throw new Error(`branch ${name} could not be observed: ${result.stderr.trim() || "gh api failed"}`);
        }
        const ref = parseJson<{ object: { sha: string } }>(result.stdout, `branch ${name}`);
        let parent: string | null = null;
        let baseSha: string | undefined;
        const number = issueNumberFromBranch(name);
        if (number) {
          const start = await readTicketStart(number, name);
          parent = start?.baseBranch ?? null;
          baseSha = start?.baseSha;
        }
        return { name, sha: ref.object.sha, parent, baseSha } satisfies WorkflowBranch;
      },
      async createBranch(input) {
        await commands.run("gh", [
          "api",
          "--method",
          "POST",
          `repos/${repository}/git/refs`,
          "-f",
          `ref=refs/heads/${input.name}`,
          "-f",
          `sha=${input.fromSha}`,
        ]);
      },
      async deleteBranch(name) {
        await commands.run("gh", [
          "api",
          "--method",
          "DELETE",
          `repos/${repository}/git/refs/heads/${encodeURIComponent(name)}`,
        ]);
      },
      readTicketStart,
      async verifyFlatTicketBranch(input) {
        const remoteTicket = `refs/remotes/origin/${input.branch}`;
        const remoteBase = `refs/remotes/origin/${input.baseBranch}`;
        await commands.run("git", [
          "fetch",
          "origin",
          `refs/pull/${input.pullRequestNumber}/head:${remoteTicket}`,
          `refs/heads/${input.baseBranch}:${remoteBase}`,
        ]);
        const observedHead = (await commands.run("git", ["rev-parse", remoteTicket])).stdout.trim();
        const observedBase = (await commands.run("git", ["rev-parse", remoteBase])).stdout.trim();
        if (observedHead !== input.headSha) return false;
        for (const pair of [[input.baseSha, input.headSha], [input.baseSha, observedBase]] as const) {
          const ancestry = await commands.run("git", ["merge-base", "--is-ancestor", pair[0], pair[1]], { allowFailure: true });
          if (ancestry.status !== 0) return false;
        }
        const commits = (await commands.run("git", ["rev-list", "--parents", `${input.baseSha}..${input.headSha}`])).stdout;
        for (const line of commits.trim().split("\n").filter(Boolean)) {
          const [, , ...additionalParents] = line.split(/\s+/);
          for (const parent of additionalParents) {
            const belongsToBase = await commands.run(
              "git",
              ["merge-base", "--is-ancestor", parent, observedBase],
              { allowFailure: true },
            );
            if (belongsToBase.status !== 0) return false;
          }
        }
        return true;
      },
      async updateSpecFromDev(input) {
        const remoteSpec = `refs/remotes/origin/${input.branch}`;
        const remoteDev = "refs/remotes/origin/dev";
        await commands.run("git", [
          "fetch",
          "origin",
          `refs/heads/${input.branch}:${remoteSpec}`,
          `refs/heads/dev:${remoteDev}`,
        ]);
        const fetchedSpec = (await commands.run("git", ["rev-parse", remoteSpec])).stdout.trim();
        const fetchedDev = (await commands.run("git", ["rev-parse", remoteDev])).stdout.trim();
        if (fetchedSpec !== input.expectedSpecSha || fetchedDev !== input.devSha) {
          throw new Error("spec or dev advanced during the controlled update; retry with fresh facts");
        }
        const tree = (await commands.run("git", ["merge-tree", "--write-tree", input.expectedSpecSha, input.devSha])).stdout.trim();
        const commit = (
          await commands.run("git", [
            "commit-tree",
            tree,
            "-p",
            input.expectedSpecSha,
            "-p",
            input.devSha,
            "-m",
            `Update spec branch for ${input.reason}`,
          ])
        ).stdout.trim();
        await commands.run("git", ["push", "origin", `${commit}:refs/heads/${input.branch}`]);
        return { sha: commit };
      },
    },
    issues: {
      read: readIssue,
      async listChildren(specNumber) {
        const result = await commands.run("gh", [
          "api",
          `repos/${repository}/issues/${specNumber}/sub_issues`,
          "--paginate",
          "-H",
          "X-GitHub-Api-Version: 2026-03-10",
        ]);
        const children = parseJson<Array<{ number: number }>>(result.stdout, `spec #${specNumber} children`);
        return Promise.all(children.map((child) => readIssue(child.number)));
      },
      async update(number, update) {
        await commands.run(
          "gh",
          ["api", "--method", "PATCH", `repos/${repository}/issues/${number}`, "--input", "-"],
          { input: JSON.stringify(update) },
        );
      },
      async comment(number, body) {
        const marker = body.match(/<!-- (mei-pelle-[a-z-]+:v1 \{.*\}) -->/)?.[0];
        if (marker) {
          const existing = await commands.run("gh", [
            "issue",
            "view",
            String(number),
            "--repo",
            repository,
            "--comments",
            "--json",
            "comments",
          ]);
          const comments = parseJson<{ comments: Array<{ body: string }> }>(existing.stdout, `issue #${number} comments`);
          if (comments.comments.some((comment) => comment.body.includes(marker))) return;
        }
        await commands.run("gh", ["issue", "comment", String(number), "--repo", repository, "--body", body]);
      },
    },
    pullRequests: {
      async find(headBranch, baseBranch) {
        const result = await commands.run("gh", [
          "pr",
          "list",
          "--repo",
          repository,
          "--state",
          "open",
          "--head",
          headBranch,
          "--base",
          baseBranch,
          "--json",
          "number",
        ]);
        const matches = parseJson<Array<{ number: number }>>(result.stdout, "pull request lookup");
        return matches[0] ? readPullRequest(matches[0].number) : null;
      },
      read: readPullRequest,
      async create(input) {
        const args = [
          "pr",
          "create",
          "--repo",
          repository,
          "--head",
          input.headBranch,
          "--base",
          input.baseBranch,
          "--title",
          input.title,
          "--body-file",
          "-",
        ];
        if (input.draft) args.push("--draft");
        const result = await commands.run("gh", args, { input: input.body });
        const number = Number(result.stdout.trim().match(/\/(\d+)\/?$/)?.[1]);
        if (!Number.isInteger(number)) throw new Error("created pull request number was not observable");
        return readPullRequest(number);
      },
      async update(number, update) {
        if (update.body !== undefined) {
          await commands.run(
            "gh",
            ["pr", "edit", String(number), "--repo", repository, "--body-file", "-"],
            { input: update.body },
          );
        }
        if (update.draft !== undefined) {
          await commands.run("gh", [
            "pr",
            "ready",
            String(number),
            "--repo",
            repository,
            ...(update.draft ? ["--undo"] : []),
          ]);
        }
        if (update.state === "closed") {
          await commands.run("gh", ["pr", "close", String(number), "--repo", repository]);
        }
      },
      async merge(number, input) {
        const result = await commands.run("gh", [
          "api",
          "--method",
          "PUT",
          `repos/${repository}/pulls/${number}/merge`,
          "-f",
          `merge_method=${input.method}`,
          "-f",
          `sha=${input.expectedHeadSha}`,
        ]);
        const merged = parseJson<{ merged: boolean; sha?: string; message?: string }>(result.stdout, `pull request #${number} merge`);
        if (!merged.merged || !merged.sha) throw new Error(merged.message ?? `pull request #${number} did not merge`);
        return { mergeSha: merged.sha };
      },
    },
    verification: {
      async readCombinedFailure(input) {
        const pullRequest = await readPullRequest(input.pullRequestNumber);
        const match = pullRequest.body.match(/<!-- mei-pelle-combined-failure:v1\s*(\{.*\})\s*-->/);
        if (!match) throw new Error("combined failure evidence is missing from the final pull request");
        const evidence = parseJson<{ reason?: string; responsibleChildNumber?: number }>(match[1], "combined failure evidence");
        if (!evidence.reason) throw new Error("combined failure evidence requires a reason");
        return { reason: evidence.reason, responsibleChildNumber: evidence.responsibleChildNumber };
      },
    },
  };
}
