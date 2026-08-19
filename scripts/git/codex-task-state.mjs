#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";

function fail(message) {
  process.stderr.write(`codex-task: ${message}\n`);
  process.exit(1);
}

function run(command, args, cwd, allowFailure = false) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", env: process.env });
  if (result.error) {
    fail(result.error.message);
  }
  if (!allowFailure && result.status !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim();
    fail(detail || `${command} ${args.join(" ")} failed`);
  }
  return result;
}

function git(cwd, ...args) {
  return run("git", args, cwd).stdout.trim();
}

function canonicalPath(path) {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

function repositoryContext(cwd = process.cwd()) {
  const invocationRoot = canonicalPath(git(cwd, "rev-parse", "--show-toplevel"));
  const commonDir = canonicalPath(
    git(cwd, "rev-parse", "--path-format=absolute", "--git-common-dir"),
  );
  return { invocationRoot, primaryCheckout: canonicalPath(dirname(commonDir)) };
}

function loadGithubInventory(cwd) {
  const ghBin = process.env.GH_BIN || "gh";
  const queries = [
    ["pr", "list", "--state", "all", "--limit", "1000", "--json",
      "number,state,baseRefName,mergedAt,headRefName,headRefOid,mergeCommit"],
    ["issue", "list", "--state", "open", "--limit", "1000", "--json", "number"],
  ];

  const [prs, issues] = queries.map((args) => {
    const result = run(ghBin, args, cwd, true);
    if (result.status !== 0) {
      const detail = result.stderr.trim() || result.stdout.trim();
      fail(`could not inventory GitHub state${detail ? `: ${detail}` : ""}`);
    }
    try {
      const value = JSON.parse(result.stdout);
      if (!Array.isArray(value)) throw new Error("expected a JSON array");
      return value;
    } catch (error) {
      fail(`could not parse GitHub inventory: ${error.message}`);
    }
  });
  return {
    prs,
    openIssues: new Set(issues.map((issue) => issue.number)),
  };
}

function listRefs(cwd, prefix) {
  const output = git(cwd, "for-each-ref", "--format=%(refname)%09%(objectname)", prefix);
  if (!output) return [];
  return output.split("\n").map((line) => {
    const [ref, head] = line.split("\t");
    return { ref, head };
  });
}

function refHead(cwd, ref) {
  const result = run("git", ["rev-parse", "--verify", ref], cwd, true);
  if (result.status === 0) return result.stdout.trim();
  return null;
}

function ticketNumber(branch) {
  const match = branch.match(/^codex\/(\d+)-/);
  return match ? Number(match[1]) : null;
}

function openPrFor(inventory, branch, head) {
  return inventory.prs.find(
    (pr) =>
      pr.state === "OPEN" &&
      ((branch && pr.headRefName === branch) || (head && pr.headRefOid === head)),
  );
}

function mergedPrFor(inventory, branch, head, requireExactHead = true) {
  return inventory.prs.find(
    (pr) =>
      pr.state === "MERGED" &&
      pr.baseRefName === "dev" &&
      pr.mergedAt &&
      (!branch || pr.headRefName === branch) &&
      (!requireExactHead || pr.headRefOid === head),
  );
}

function classifyTaskBranch(inventory, branch, head) {
  if (branch === "main" || branch === "dev") {
    return { status: "PROTECTED", evidence: "permanent branch" };
  }
  if (!branch.startsWith("codex/")) {
    return { status: "UNPROVEN", evidence: "explicit SHA-pinned retirement required" };
  }
  const issue = ticketNumber(branch);
  if (issue && inventory.openIssues.has(issue)) {
    return { status: "ACTIVE", evidence: `open issue #${issue}` };
  }
  const openPr = openPrFor(inventory, branch, head);
  if (openPr) return { status: "ACTIVE", evidence: `open PR #${openPr.number}` };
  const mergedPr = mergedPrFor(inventory, branch, head);
  if (mergedPr) {
    return { status: "REMOVE", evidence: `exact head merged by PR #${mergedPr.number} into dev` };
  }
  return { status: "UNPROVEN", evidence: "no exact merged PR evidence" };
}

function parseWorktrees(cwd) {
  const output = git(cwd, "worktree", "list", "--porcelain");
  if (!output) return [];
  return output.split("\n\n").map((block) => {
    const worktree = {};
    for (const line of block.split("\n")) {
      if (line.startsWith("worktree ")) worktree.path = line.slice(9);
      else if (line.startsWith("HEAD ")) worktree.head = line.slice(5);
      else if (line.startsWith("branch refs/heads/")) worktree.branch = line.slice(18);
      else if (line === "detached") worktree.detached = true;
      else if (line.startsWith("locked")) worktree.locked = true;
      else if (line.startsWith("prunable")) worktree.prunable = true;
    }
    return worktree;
  });
}

function worktreeInventory(cwd) {
  return parseWorktrees(cwd).map((worktree) => ({
    ...worktree,
    path: canonicalPath(worktree.path),
  }));
}

function isClean(path) {
  const args = ["-C", path, "status", "--porcelain", "--untracked-files=normal"];
  const result = run("git", args, path, true);
  return result.status === 0 && result.stdout.length === 0;
}

function isAncestor(cwd, ancestor, descendant) {
  const result = run("git", ["merge-base", "--is-ancestor", ancestor, descendant], cwd, true);
  if (result.status === 0) return true;
  if (result.status === 1) return false;
  fail(result.stderr.trim() || "could not verify Git ancestry");
}

function classifyWorktree(cwd, inventory, worktree) {
  if (worktree.locked || worktree.prunable) {
    return { status: "BLOCKED", evidence: "locked or prunable" };
  }
  if (!isClean(worktree.path)) {
    return { status: "DIRTY", evidence: "preserve local changes" };
  }
  if (worktree.branch) {
    return classifyTaskBranch(inventory, worktree.branch, worktree.head);
  }
  const openPr = openPrFor(inventory, null, worktree.head);
  if (openPr) return { status: "ACTIVE", evidence: `open PR #${openPr.number}` };
  if (isAncestor(cwd, worktree.head, "dev")) {
    return { status: "REMOVE", evidence: "clean detached HEAD is integrated into dev" };
  }
  const mergedPr = mergedPrFor(inventory, null, worktree.head);
  if (mergedPr && mergedPr.headRefName?.startsWith("codex/")) {
    const issue = ticketNumber(mergedPr.headRefName);
    if (issue && inventory.openIssues.has(issue)) {
      return { status: "ACTIVE", evidence: `open issue #${issue}` };
    }
    return {
      status: "REMOVE",
      evidence: `detached HEAD merged by PR #${mergedPr.number} into dev`,
    };
  }
  return { status: "UNPROVEN", evidence: "explicit evidence required" };
}

function emitPlan(status, kind, head, name, evidence) {
  process.stdout.write(`${status} ${kind} ${head} ${name} — ${evidence}\n`);
}

function remoteHead(cwd, branch) {
  const args = ["ls-remote", "--heads", "origin", `refs/heads/${branch}`];
  const result = run("git", args, cwd, true);
  if (result.status !== 0) {
    fail(result.stderr.trim() || `could not read origin/${branch}`);
  }
  return result.stdout.trim().split(/\s+/)[0] || null;
}

function removeRemoteBranch(cwd, branch, expectedHead) {
  const actualHead = remoteHead(cwd, branch);
  if (actualHead && actualHead !== expectedHead) {
    fail(`origin/${branch} changed after planning; expected ${expectedHead}, found ${actualHead}`);
  }
  if (actualHead) {
    const lease = `--force-with-lease=refs/heads/${branch}:${expectedHead}`;
    run("git", ["push", lease, "origin", `:refs/heads/${branch}`], cwd);
  }
  const trackingRef = `refs/remotes/origin/${branch}`;
  const trackingHead = refHead(cwd, trackingRef);
  if (trackingHead && trackingHead !== expectedHead) {
    fail(`${trackingRef} changed after planning; expected ${expectedHead}, found ${trackingHead}`);
  }
  if (trackingHead) run("git", ["update-ref", "-d", trackingRef, expectedHead], cwd);
  return Boolean(actualHead);
}

function reportRemoteMutation(verb, removed, head, branch) {
  const status = removed ? verb : "ABSENT";
  process.stdout.write(
    `${status} remote-branch ${head} origin/${branch}${removed ? "" : " — no-op"}\n`,
  );
}

function reconcile(args) {
  const apply = args.includes("--apply");
  const remote = args.includes("--remote");
  if (
    args.some((arg) => arg !== "--apply" && arg !== "--remote") ||
    new Set(args).size !== args.length ||
    (remote && !apply)
  ) {
    fail("usage: codex-task.sh reconcile [--apply [--remote]]");
  }

  const { invocationRoot, primaryCheckout } = repositoryContext();
  const inventory = loadGithubInventory(invocationRoot);
  const actions = {
    worktrees: [],
    branches: [],
    reviewRefs: [],
    remoteBranches: [],
  };
  const worktrees = worktreeInventory(invocationRoot);
  const worktreeResults = new Map();

  for (const worktree of worktrees) {
    const path = worktree.path;
    if (path === invocationRoot || path === primaryCheckout) {
      const result = {
        status: "PROTECTED",
        evidence: "invoking or primary worktree",
      };
      emitPlan(result.status, "worktree", worktree.head, path, result.evidence);
      if (worktree.branch) {
        worktreeResults.set(worktree.branch, result);
      }
      continue;
    }
    const result = classifyWorktree(invocationRoot, inventory, worktree);
    if (worktree.branch) worktreeResults.set(worktree.branch, result);
    emitPlan(result.status, "worktree", worktree.head, path, result.evidence);
    if (result.status === "REMOVE") actions.worktrees.push(worktree);
  }

  const localRefs = listRefs(invocationRoot, "refs/heads/");
  const remoteRefs = listRefs(invocationRoot, "refs/remotes/origin/").filter(
    ({ ref }) => ref !== "refs/remotes/origin/HEAD",
  );
  const branchResults = new Map();

  for (const item of localRefs) {
    const branch = item.ref.slice("refs/heads/".length);
    const worktreeResult = worktreeResults.get(branch);
    const result =
      worktreeResult && worktreeResult.status !== "REMOVE"
        ? worktreeResult
        : classifyTaskBranch(inventory, branch, item.head);
    branchResults.set(branch, result);
    emitPlan(result.status, "branch", item.head, branch, result.evidence);
    if (result.status === "REMOVE") actions.branches.push({ ...item, branch });
  }

  for (const item of listRefs(invocationRoot, "refs/codex/review-base/")) {
    const slug = item.ref.slice("refs/codex/review-base/".length);
    const branch = `codex/${slug}`;
    const currentRef =
      localRefs.find(({ ref }) => ref === `refs/heads/${branch}`) ||
      remoteRefs.find(({ ref }) => ref === `refs/remotes/origin/${branch}`);
    let result;
    if (branchResults.has(branch)) {
      result = branchResults.get(branch);
    } else if (currentRef) {
      result = classifyTaskBranch(inventory, branch, currentRef.head);
    } else {
      const issue = ticketNumber(branch);
      const openPr = openPrFor(inventory, branch, null);
      const mergedPr = mergedPrFor(inventory, branch, null, false);
      if (issue && inventory.openIssues.has(issue)) {
        result = { status: "ACTIVE", evidence: `open issue #${issue}` };
      } else if (openPr) {
        result = { status: "ACTIVE", evidence: `open PR #${openPr.number}` };
      } else if (mergedPr) {
        result = { status: "REMOVE", evidence: `task merged by PR #${mergedPr.number} into dev` };
      } else {
        result = { status: "UNPROVEN", evidence: "no merged task evidence" };
      }
    }
    emitPlan(result.status, "review-ref", item.head, item.ref, result.evidence);
    if (result.status === "REMOVE") actions.reviewRefs.push(item);
  }

  for (const item of remoteRefs) {
    const branch = item.ref.slice("refs/remotes/origin/".length);
    const localResult = branchResults.get(branch);
    const result =
      localResult && localResult.status !== "REMOVE"
        ? localResult
        : classifyTaskBranch(inventory, branch, item.head);
    emitPlan(result.status, "remote-branch", item.head, `origin/${branch}`, result.evidence);
    if (result.status === "REMOVE") actions.remoteBranches.push({ ...item, branch });
  }

  if (!apply) {
    process.stdout.write(
      "Dry run only; re-run with reconcile --apply for local cleanup or add --remote for remote branches.\n",
    );
    return;
  }

  for (const worktree of actions.worktrees) {
    const current = parseWorktrees(invocationRoot).find(
      (candidate) => canonicalPath(candidate.path) === worktree.path,
    );
    if (!current || current.head !== worktree.head) {
      fail(`worktree changed after planning: ${worktree.path}`);
    }
    current.path = canonicalPath(current.path);
    if (classifyWorktree(invocationRoot, inventory, current).status !== "REMOVE") {
      fail(`worktree is no longer safe to remove: ${worktree.path}`);
    }
  }

  const removablePaths = new Set(actions.worktrees.map(({ path }) => path));
  const currentWorktrees = parseWorktrees(invocationRoot);
  for (const item of actions.branches) {
    if (refHead(invocationRoot, item.ref) !== item.head) {
      fail(`branch changed after planning: ${item.branch}`);
    }
    const retainedWorktree = currentWorktrees.find(
      (worktree) =>
          worktree.branch === item.branch && !removablePaths.has(canonicalPath(worktree.path)),
    );
    if (retainedWorktree) fail(`branch is checked out in retained worktree: ${item.branch}`);
  }
  for (const item of actions.reviewRefs) {
    if (refHead(invocationRoot, item.ref) !== item.head) {
      fail(`review ref changed after planning: ${item.ref}`);
    }
  }
  if (remote) {
    for (const item of actions.remoteBranches) {
      const actualHead = remoteHead(invocationRoot, item.branch);
      if (actualHead && actualHead !== item.head) {
        fail(
          `origin/${item.branch} changed after planning; expected ${item.head}, found ${actualHead}`,
        );
      }
    }
  }

  for (const worktree of actions.worktrees) {
    run("git", ["worktree", "remove", worktree.path], primaryCheckout);
    process.stdout.write(`REMOVED worktree ${worktree.head} ${worktree.path}\n`);
  }
  for (const item of actions.branches) {
    run("git", ["update-ref", "-d", item.ref, item.head], primaryCheckout);
    process.stdout.write(`REMOVED branch ${item.head} ${item.branch}\n`);
  }
  for (const item of actions.reviewRefs) {
    run("git", ["update-ref", "-d", item.ref, item.head], primaryCheckout);
    process.stdout.write(`REMOVED review-ref ${item.head} ${item.ref}\n`);
  }
  for (const item of actions.remoteBranches) {
    if (remote) {
      const removed = removeRemoteBranch(primaryCheckout, item.branch, item.head);
      reportRemoteMutation("REMOVED", removed, item.head, item.branch);
    } else {
      process.stdout.write(
        `SKIPPED remote-branch ${item.head} origin/${item.branch} — add --remote to delete\n`,
      );
    }
  }
}

function parseRetireArgs(args) {
  if (!args[0] || args[0].startsWith("--")) {
    fail("usage: codex-task.sh retire <branch-or-worktree> --expect-head <sha> [--remote]");
  }
  const target = args[0];
  let expectedHead = null;
  let remote = false;
  for (let index = 1; index < args.length; index += 1) {
    if (args[index] === "--expect-head" && !expectedHead && args[index + 1]) {
      expectedHead = args[index + 1];
      index += 1;
    } else if (args[index] === "--remote" && !remote) {
      remote = true;
    } else {
      fail("usage: codex-task.sh retire <branch-or-worktree> --expect-head <sha> [--remote]");
    }
  }
  if (!expectedHead || !/^[0-9a-f]{40}$/.test(expectedHead)) {
    fail("--expect-head must be one full lowercase commit SHA");
  }
  return { target, expectedHead, remote };
}

function retire(args) {
  const { target, expectedHead, remote } = parseRetireArgs(args);
  const { invocationRoot, primaryCheckout } = repositoryContext();
  const inventory = loadGithubInventory(invocationRoot);
  const worktrees = worktreeInventory(invocationRoot).map((worktree) => ({
    ...worktree,
    displayPath: worktree.path,
  }));
  const requestedPath = canonicalPath(resolve(invocationRoot, target));
  let worktree = worktrees.find(({ path }) => path === requestedPath) || null;
  if (worktree) worktree.displayPath = target;
  let branch = worktree?.branch || null;

  if (!worktree) {
    const validBranch = run("git", ["check-ref-format", "--branch", target], invocationRoot, true);
    if (validBranch.status !== 0) fail(`'${target}' is neither a linked worktree nor a valid branch`);
    branch = target;
    worktree = worktrees.find((candidate) => candidate.branch === branch) || null;
  }

  if (branch === "main" || branch === "dev") fail(`refusing to retire permanent branch '${branch}'`);
  if (worktree && (worktree.path === invocationRoot || worktree.path === primaryCheckout)) {
    fail(`refusing to retire the invoking or primary worktree: ${worktree.path}`);
  }
  if (worktree?.locked || worktree?.prunable) {
    fail(`worktree is locked or prunable: ${worktree.path}`);
  }
  if (worktree && !isClean(worktree.path)) fail(`worktree has local changes: ${worktree.path}`);

  const localRef = branch ? `refs/heads/${branch}` : null;
  const trackingRef = branch ? `refs/remotes/origin/${branch}` : null;
  const localHead = localRef ? refHead(invocationRoot, localRef) : null;
  const trackingHead = trackingRef ? refHead(invocationRoot, trackingRef) : null;
  const observedHeads = [worktree?.head, localHead, trackingHead].filter(Boolean);
  if (observedHeads.length === 0 && !remote) fail(`no local state found for '${target}'`);
  for (const actualHead of observedHeads) {
    if (actualHead !== expectedHead) {
      fail(`expected ${expectedHead}, found ${actualHead}; nothing was retired`);
    }
  }

  const issue = branch ? ticketNumber(branch) : null;
  if (issue && inventory.openIssues.has(issue)) fail(`branch belongs to open issue #${issue}`);
  const openPr = openPrFor(inventory, branch, expectedHead);
  if (openPr) fail(`state belongs to open PR #${openPr.number}`);
  if (remote && !branch) fail("--remote requires an attached branch name");

  if (remote) {
    const actualRemoteHead = remoteHead(invocationRoot, branch);
    if (actualRemoteHead && actualRemoteHead !== expectedHead) {
      fail(
        `origin/${branch} is ${actualRemoteHead}, not expected ${expectedHead}; nothing was retired`,
      );
    }
  }

  if (worktree) {
    run("git", ["worktree", "remove", worktree.path], primaryCheckout);
    process.stdout.write(`RETIRED worktree ${expectedHead} ${worktree.displayPath}\n`);
  }
  if (localHead) {
    if (refHead(primaryCheckout, localRef) !== expectedHead) {
      fail(`branch changed before retirement: ${branch}`);
    }
    run("git", ["update-ref", "-d", localRef, expectedHead], primaryCheckout);
    process.stdout.write(`RETIRED branch ${expectedHead} ${branch}\n`);
  }
  if (branch?.startsWith("codex/")) {
    const reviewRef = `refs/codex/review-base/${branch.slice("codex/".length)}`;
    const reviewHead = refHead(primaryCheckout, reviewRef);
    if (reviewHead) {
      run("git", ["update-ref", "-d", reviewRef, reviewHead], primaryCheckout);
      process.stdout.write(`RETIRED review-ref ${reviewHead} ${reviewRef}\n`);
    }
  }
  if (remote) {
    const removed = removeRemoteBranch(primaryCheckout, branch, expectedHead);
    reportRemoteMutation("RETIRED", removed, expectedHead, branch);
  } else if (trackingHead) {
    process.stdout.write(
      `PRESERVED remote-branch ${trackingHead} origin/${branch} — add --remote to retire\n`,
    );
  }
}

const [command, ...args] = process.argv.slice(2);
if (command === "reconcile") reconcile(args);
else if (command === "retire") retire(args);
else fail("expected reconcile or retire");
