#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const API_VERSION = "2026-03-10";
const EXPECTED_REPOSITORY = "brandon-y-lee/helix";
const ghBin = process.env.GH_BIN ?? "gh";
const gitBin = process.env.GIT_BIN ?? "git";

const desiredLabels = [
  ["needs-triage", "D4C5F9", "Maintainer evaluation required"],
  ["needs-info", "FBCA04", "Waiting for more information"],
  ["ready-for-agent", "0E8A16", "Ready for an autonomous agent"],
  ["ready-for-human", "1D76DB", "Human action or implementation required"],
  ["wontfix", "FFFFFF", "Closed without implementation"],
  ["type:spec", "0E8A16", "Approved delivery specification"],
  ["type:ticket", "1D76DB", "Implementable vertical slice"],
  ["workflow:planned", "C5DEF5", "Approved and decomposed into tickets"],
  ["workflow:in-progress", "FBCA04", "Claimed work in progress"],
  ["workflow:review", "D4C5F9", "Implementation awaiting review or CI"],
  ["wayfinder:map", "5319E7", "Wayfinder decision map"],
  ["wayfinder:research", "0052CC", "Wayfinder research ticket"],
  ["wayfinder:prototype", "B60205", "Wayfinder prototype ticket"],
  ["wayfinder:grilling", "D93F0B", "Wayfinder grilling ticket"],
  ["wayfinder:task", "C2E0C6", "Wayfinder prerequisite task"],
].map(([name, color, description]) => ({ name, color, description }));

function fail(message) {
  process.stderr.write(`github-workflow: ${message}\n`);
  process.exit(1);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    input: options.input,
    env: process.env,
  });
  if (result.error) {
    throw new Error(`${command} could not run: ${result.error.message}`);
  }
  if (result.status !== 0 && !options.allowFailure) {
    const detail = (result.stderr || result.stdout || `exit ${result.status}`).trim();
    throw new Error(`${command} ${args.join(" ")} failed: ${detail}`);
  }
  return result;
}

function runGh(args, options = {}) {
  return run(ghBin, args, options);
}

function runGit(args, options = {}) {
  return run(gitBin, args, options);
}

function parseArgs(argv) {
  const [mode, ...rest] = argv;
  if (mode !== "plan" && mode !== "verify" && mode !== "apply") {
    fail("usage: bootstrap-workflow.mjs <plan|verify|apply> --repo <owner/repo> [--candidate-ref <ref>] [--confirm-repo <owner/repo> --confirm-dev-sha <sha> --confirm-ci-sha <sha>]");
  }

  const parsed = { mode, repo: "", candidateRef: "", confirmRepo: "", confirmDevSha: "", confirmCiSha: "" };
  for (let index = 0; index < rest.length; index += 1) {
    const flag = rest[index];
    const value = rest[index + 1];
    if (!value || !flag.startsWith("--")) fail(`missing value for '${flag}'`);
    if (flag === "--repo") parsed.repo = value;
    else if (flag === "--candidate-ref") parsed.candidateRef = value;
    else if (flag === "--confirm-repo") parsed.confirmRepo = value;
    else if (flag === "--confirm-dev-sha") parsed.confirmDevSha = value;
    else if (flag === "--confirm-ci-sha") parsed.confirmCiSha = value;
    else fail(`unknown option '${flag}'`);
    index += 1;
  }

  if (!parsed.repo) fail("--repo is required");
  if (parsed.repo !== EXPECTED_REPOSITORY) {
    fail(`refusing repository '${parsed.repo}'; expected '${EXPECTED_REPOSITORY}'`);
  }
  if (parsed.mode === "apply" && parsed.confirmRepo !== parsed.repo) {
    fail(`apply requires --confirm-repo ${parsed.repo}`);
  }
  if (parsed.mode === "apply" && parsed.candidateRef) {
    fail("apply does not accept --candidate-ref");
  }
  return parsed;
}

function parseJson(result, description) {
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error(`${description} returned invalid JSON`);
  }
}

function readRemoteBranches() {
  const result = runGit([
    "ls-remote",
    "--heads",
    "origin",
    "refs/heads/main",
    "refs/heads/dev",
  ]);
  const branches = new Map();
  for (const line of result.stdout.trim().split("\n")) {
    if (!line) continue;
    const [sha, ref] = line.split(/\s+/);
    branches.set(ref.replace("refs/heads/", ""), sha);
  }
  return branches;
}

function requireLocalCommit(sha, label) {
  const result = runGit(["cat-file", "-e", `${sha}^{commit}`], { allowFailure: true });
  if (result.status !== 0) {
    throw new Error(`${label} commit ${sha} is not present locally; fetch it before planning`);
  }
}

function isAncestor(ancestor, descendant) {
  return runGit(["merge-base", "--is-ancestor", ancestor, descendant], {
    allowFailure: true,
  }).status === 0;
}

function readProtection(repo, branch) {
  const result = runGh(
    [
      "api",
      `repos/${repo}/branches/${branch}/protection`,
      "-H",
      `X-GitHub-Api-Version: ${API_VERSION}`,
    ],
    { allowFailure: true },
  );
  if (result.status === 0) return parseJson(result, `${branch} protection`);
  if ((result.stderr ?? "").includes("HTTP 404")) return null;
  throw new Error(`could not inspect ${branch} protection: ${(result.stderr || result.stdout).trim()}`);
}

function desiredProtection() {
  return {
    required_status_checks: { strict: true, contexts: ["ci"] },
    enforce_admins: true,
    required_pull_request_reviews: {
      dismiss_stale_reviews: true,
      require_code_owner_reviews: false,
      required_approving_review_count: 0,
      require_last_push_approval: false,
    },
    restrictions: null,
    required_linear_history: false,
    allow_force_pushes: false,
    allow_deletions: false,
    required_conversation_resolution: true,
  };
}

function enabled(value) {
  if (typeof value === "boolean") return value;
  return value?.enabled;
}

function protectionMatches(observed, desired) {
  if (!observed) return false;
  const contexts = observed.required_status_checks?.contexts ?? [];
  return (
    observed.required_status_checks?.strict === desired.required_status_checks.strict &&
    contexts.length === desired.required_status_checks.contexts.length &&
    desired.required_status_checks.contexts.every((context) => contexts.includes(context)) &&
    enabled(observed.enforce_admins) === desired.enforce_admins &&
    observed.required_pull_request_reviews?.dismiss_stale_reviews ===
      desired.required_pull_request_reviews.dismiss_stale_reviews &&
    observed.required_pull_request_reviews?.require_code_owner_reviews ===
      desired.required_pull_request_reviews.require_code_owner_reviews &&
    observed.required_pull_request_reviews?.required_approving_review_count ===
      desired.required_pull_request_reviews.required_approving_review_count &&
    observed.required_pull_request_reviews?.require_last_push_approval ===
      desired.required_pull_request_reviews.require_last_push_approval &&
    enabled(observed.required_linear_history) === desired.required_linear_history &&
    enabled(observed.allow_force_pushes) === desired.allow_force_pushes &&
    enabled(observed.allow_deletions) === desired.allow_deletions &&
    enabled(observed.required_conversation_resolution) ===
      desired.required_conversation_resolution
  );
}

function protectionSatisfiesCandidateVerification(observed) {
  if (!observed) return false;
  const contexts = observed.required_status_checks?.contexts ?? [];
  return (
    contexts.includes("ci") &&
    observed.required_pull_request_reviews?.required_approving_review_count === 0 &&
    enabled(observed.allow_force_pushes) === false &&
    enabled(observed.allow_deletions) === false &&
    enabled(observed.required_conversation_resolution) === true
  );
}

function collectPlan(repo, candidateRef = "") {
  runGh(["auth", "status"]);
  const repository = parseJson(
    runGh([
      "repo",
      "view",
      repo,
      "--json",
      "nameWithOwner,defaultBranchRef,hasIssuesEnabled,mergeCommitAllowed,squashMergeAllowed,rebaseMergeAllowed,deleteBranchOnMerge",
    ]),
    "repository inspection",
  );
  if (repository.nameWithOwner !== repo) {
    throw new Error(`authenticated GitHub context resolved '${repository.nameWithOwner}', not '${repo}'`);
  }
  if (repository.defaultBranchRef?.name !== "main") {
    throw new Error(`default branch must remain 'main', found '${repository.defaultBranchRef?.name ?? "unknown"}'`);
  }
  if (!repository.hasIssuesEnabled) throw new Error("GitHub Issues must be enabled");

  const issueCapability = runGh(
    [
      "api",
      `repos/${repo}/issues?state=all&per_page=1`,
      "-H",
      `X-GitHub-Api-Version: ${API_VERSION}`,
    ],
    { allowFailure: true },
  );
  if (issueCapability.status !== 0) {
    throw new Error(
      `issue API capability could not be verified: ${(issueCapability.stderr || issueCapability.stdout).trim()}`,
    );
  }

  const localDevSha = runGit(["rev-parse", candidateRef || "dev"]).stdout.trim();
  const remoteBranches = readRemoteBranches();
  const remoteMainSha = remoteBranches.get("main");
  if (!remoteMainSha) throw new Error("remote branch 'main' does not exist");
  requireLocalCommit(remoteMainSha, "remote main");
  if (!isAncestor(remoteMainSha, localDevSha)) {
    throw new Error(`local dev ${localDevSha} does not contain remote main ${remoteMainSha}`);
  }

  const remoteDevSha = remoteBranches.get("dev");
  if (remoteDevSha) {
    requireLocalCommit(remoteDevSha, "remote dev");
    if (remoteDevSha !== localDevSha && !isAncestor(remoteDevSha, localDevSha)) {
      throw new Error(`remote dev ${remoteDevSha} is not an ancestor of local dev ${localDevSha}`);
    }
  }

  const labels = parseJson(
    runGh(["label", "list", "--repo", repo, "--limit", "200", "--json", "name,color,description"]),
    "label inspection",
  );
  const labelsByName = new Map(labels.map((label) => [label.name, label]));
  const actions = [];
  for (const label of desiredLabels) {
    const observed = labelsByName.get(label.name);
    if (
      !observed ||
      observed.color.toLowerCase() !== label.color.toLowerCase() ||
      (observed.description ?? "") !== label.description
    ) {
      actions.push({
        description: `${observed ? "update" : "create"} label ${label.name}`,
        apply: () => {
          runGh([
            "label",
            "create",
            label.name,
            "--repo",
            repo,
            "--color",
            label.color,
            "--description",
            label.description,
            "--force",
          ]);
        },
      });
    }
  }

  const repositorySettingsMatch =
    repository.mergeCommitAllowed === true &&
    repository.squashMergeAllowed === true &&
    repository.rebaseMergeAllowed === false &&
    repository.deleteBranchOnMerge === true;
  if (!repositorySettingsMatch) {
    actions.push({
      description: "update repository merge settings",
      apply: () => {
        runGh(
          [
            "api",
            "--method",
            "PATCH",
            `repos/${repo}`,
            "-H",
            `X-GitHub-Api-Version: ${API_VERSION}`,
            "--input",
            "-",
          ],
          {
            input: JSON.stringify({
              allow_merge_commit: true,
              allow_squash_merge: true,
              allow_rebase_merge: false,
              delete_branch_on_merge: true,
            }),
          },
        );
      },
    });
  }

  if (!candidateRef && remoteDevSha !== localDevSha) {
    actions.push({
      description: `${remoteDevSha ? "update" : "create"} remote dev at ${localDevSha}`,
      apply: () => {
        const currentRemoteBranches = readRemoteBranches();
        const currentRemoteMainSha = currentRemoteBranches.get("main");
        const currentRemoteDevSha = currentRemoteBranches.get("dev");
        if (currentRemoteMainSha !== remoteMainSha || currentRemoteDevSha !== remoteDevSha) {
          throw new Error("remote main or dev changed after planning; rerun plan and apply");
        }
        if (!isAncestor(currentRemoteMainSha, localDevSha)) {
          throw new Error(
            `confirmed dev ${localDevSha} no longer contains remote main ${currentRemoteMainSha}`,
          );
        }
        runGit(["push", "origin", `${localDevSha}:refs/heads/dev`]);
      },
    });
  }

  for (const branch of ["dev", "main"]) {
    const desired = desiredProtection();
    const observed = readProtection(repo, branch);
    const protectionVerified = candidateRef
      ? protectionSatisfiesCandidateVerification(observed)
      : protectionMatches(observed, desired);
    if (!protectionVerified) {
      actions.push({
        description: `protect ${branch}`,
        apply: () => {
          runGh(
            [
              "api",
              "--method",
              "PUT",
              `repos/${repo}/branches/${branch}/protection`,
              "-H",
              `X-GitHub-Api-Version: ${API_VERSION}`,
              "--input",
              "-",
            ],
            { input: JSON.stringify(desired) },
          );
        },
      });
    }
  }

  return { actions, localDevSha };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  let plan;
  try {
    plan = collectPlan(options.repo, options.candidateRef);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }

  process.stdout.write(`GitHub workflow plan for ${options.repo}\n`);
  if (plan.actions.length === 0) process.stdout.write("No changes required.\n");
  else for (const action of plan.actions) process.stdout.write(`- ${action.description}\n`);

  if (options.mode === "plan") {
    process.stdout.write("No changes applied.\n");
    return;
  }
  if (options.mode === "verify") {
    if (plan.actions.length > 0) {
      fail(`verification found ${plan.actions.length} required change(s)`);
    }
    process.stdout.write("GitHub workflow configuration verified.\n");
    return;
  }

  if (options.confirmDevSha !== plan.localDevSha) {
    fail(`apply requires --confirm-dev-sha ${plan.localDevSha}`);
  }
  if (options.confirmCiSha !== plan.localDevSha) {
    fail(`apply requires --confirm-ci-sha ${plan.localDevSha}`);
  }

  try {
    for (const action of plan.actions) action.apply();
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
  process.stdout.write("Applied GitHub workflow configuration.\n");
}

main();
