#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const API_VERSION = "2026-03-10";
const EXPECTED_REPOSITORY = "brandon-y-lee/helix";
const SPEC_RULESET_NAME = "Spec Branch Ticket Gate";
const DEV_RULESET_NAME = "dev Integration Gate";
// GitHub's built-in RepositoryRole database ID for repository administrators.
const ADMIN_REPOSITORY_ROLE_ID = 5;
const DESIRED_LABELS = [
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
const RETIRED_RULESETS = [
  "dev pull request integration",
  "spec branch pull request integration",
];
const RETIRED_LABELS = [
  "workflow:integration-active",
  "workflow:integration-queued",
  "workflow:spec-integrated",
  "workflow:urgent",
];
const ghBin = process.env.GH_BIN ?? "gh";
const gitBin = process.env.GIT_BIN ?? "git";

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
  if (result.error) throw new Error(`${command} could not run: ${result.error.message}`);
  if (result.status !== 0 && !options.allowFailure) {
    const detail = (result.stderr || result.stdout || `exit ${result.status}`).trim();
    throw new Error(`${command} ${args.join(" ")} failed: ${detail}`);
  }
  return result;
}

const runGh = (args, options = {}) => run(ghBin, args, options);
const runGit = (args, options = {}) => run(gitBin, args, options);

function parseJson(result, description) {
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error(`${description} returned invalid JSON`);
  }
}

function parseArgs(argv) {
  const [mode, ...rest] = argv;
  if (!["plan", "verify", "apply"].includes(mode)) {
    fail("usage: bootstrap-workflow.mjs <plan|verify|apply> --repo <owner/repo> [--candidate-ref <ref>] [--confirm-repo <owner/repo> --confirm-dev-sha <sha> --confirm-ci-sha <sha> --confirm-phase <activate|cleanup> --confirm-github-actions-app-id <id>]");
  }
  const parsed = {
    mode,
    repo: "",
    candidateRef: "",
    confirmRepo: "",
    confirmDevSha: "",
    confirmCiSha: "",
    confirmPhase: "",
    confirmAppId: "",
  };
  for (let index = 0; index < rest.length; index += 2) {
    const flag = rest[index];
    const value = rest[index + 1];
    if (!flag?.startsWith("--") || !value) fail(`missing value for '${flag ?? "option"}'`);
    if (flag === "--repo") parsed.repo = value;
    else if (flag === "--candidate-ref") parsed.candidateRef = value;
    else if (flag === "--confirm-repo") parsed.confirmRepo = value;
    else if (flag === "--confirm-dev-sha") parsed.confirmDevSha = value;
    else if (flag === "--confirm-ci-sha") parsed.confirmCiSha = value;
    else if (flag === "--confirm-phase") parsed.confirmPhase = value;
    else if (flag === "--confirm-github-actions-app-id") parsed.confirmAppId = value;
    else fail(`unknown option '${flag}'`);
  }
  if (parsed.repo !== EXPECTED_REPOSITORY) {
    fail(`refusing repository '${parsed.repo}'; expected '${EXPECTED_REPOSITORY}'`);
  }
  if (parsed.mode === "apply" && parsed.candidateRef) fail("apply does not accept --candidate-ref");
  return parsed;
}

function remoteBranches() {
  const result = runGit([
    "ls-remote",
    "--heads",
    "origin",
    "refs/heads/main",
    "refs/heads/dev",
  ]);
  return new Map(
    result.stdout
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [sha, ref] = line.split(/\s+/);
        return [ref.replace("refs/heads/", ""), sha];
      }),
  );
}

function readProtection(repo, branch) {
  const result = runGh(
    ["api", `repos/${repo}/branches/${branch}/protection`, "-H", `X-GitHub-Api-Version: ${API_VERSION}`],
    { allowFailure: true },
  );
  if (result.status === 0) return parseJson(result, `${branch} protection`);
  if ((result.stderr ?? "").includes("HTTP 404")) return null;
  throw new Error(`could not inspect ${branch} protection: ${(result.stderr || result.stdout).trim()}`);
}

function readRulesets(repo) {
  const summaries = parseJson(
    runGh(["api", `repos/${repo}/rulesets?includes_parents=false`, "-H", `X-GitHub-Api-Version: ${API_VERSION}`]),
    "repository rulesets",
  );
  const rulesets = new Map();
  for (const summary of summaries) {
    const detail = parseJson(
      runGh(["api", `repos/${repo}/rulesets/${summary.id}`, "-H", `X-GitHub-Api-Version: ${API_VERSION}`]),
      `ruleset ${summary.id}`,
    );
    rulesets.set(detail.name, detail);
  }
  return rulesets;
}

function githubActionsAppId(repo, sha) {
  const checks = parseJson(
    runGh(["api", `repos/${repo}/commits/${sha}/check-runs?per_page=100`, "-H", `X-GitHub-Api-Version: ${API_VERSION}`]),
    "GitHub Actions check identity",
  );
  const identityChecks = checks.check_runs?.filter(
    (check) => ["ticket-gate", "integration-gate", "ci"].includes(check.name) &&
      check.app?.slug === "github-actions",
  ) ?? [];
  const appIds = new Set(identityChecks.map((check) => check.app?.id));
  if (
    identityChecks.length === 0 ||
    [...appIds].some((id) => !Number.isInteger(id) || id <= 0) ||
    appIds.size !== 1
  ) {
    throw new Error("GitHub Actions app identity could not be proven from the canonical gate checks");
  }
  return [...appIds][0];
}

function pullRequestsForRun(repo, run) {
  if (!Array.isArray(run.pull_requests)) return [];
  if (run.pull_requests.length > 0) return run.pull_requests;
  const pages = parseJson(
    runGh([
      "api",
      "--paginate",
      "--slurp",
      `repos/${repo}/commits/${run.head_sha}/pulls`,
      "-H",
      `X-GitHub-Api-Version: ${API_VERSION}`,
    ]),
    "workflow run pull-request association",
  );
  if (!Array.isArray(pages) || !pages.every(Array.isArray)) return [];
  const associated = pages.flat();
  const exact = associated.filter((pullRequest) =>
    pullRequest.head?.sha === run.head_sha
  );
  return exact.length === 1 ? exact : [];
}

function replacementGateEvidence(repo, appId) {
  const runs = parseJson(
    runGh(["api", `repos/${repo}/actions/runs?event=pull_request&status=success&per_page=100`, "-H", `X-GitHub-Api-Version: ${API_VERSION}`, "--jq", "{workflow_runs: [.workflow_runs[] | {conclusion, head_sha, pull_requests}]}" ]),
    "successful pull-request workflow runs",
  ).workflow_runs ?? [];
  const evidence = { ticket: false, integration: false };
  for (const run of runs) {
    if (run.conclusion !== "success" || !run.head_sha) continue;
    const base = pullRequestsForRun(repo, run)[0]?.base?.ref;
    const gate = base?.startsWith("codex/spec-") ? "ticket-gate" : (base === "dev" || base === "main" ? "integration-gate" : null);
    if (!gate) continue;
    const checks = parseJson(
      runGh(["api", `repos/${repo}/commits/${run.head_sha}/check-runs?per_page=100`, "-H", `X-GitHub-Api-Version: ${API_VERSION}`, "--jq", "{check_runs: [.check_runs[] | {name, conclusion, app: {id: .app.id, slug: .app.slug}}]}" ]),
      `${gate} evidence`,
    ).check_runs ?? [];
    const passed = checks.some((check) =>
      check.name === gate && check.conclusion === "success" &&
      check.app?.id === appId && check.app?.slug === "github-actions");
    if (gate === "ticket-gate" && passed) evidence.ticket = true;
    if (gate === "integration-gate" && passed) evidence.integration = true;
    if (evidence.ticket && evidence.integration) break;
  }
  return evidence;
}

function desiredSpecRuleset(appId) {
  return {
    name: SPEC_RULESET_NAME,
    target: "branch",
    enforcement: "active",
    bypass_actors: [{
      actor_id: ADMIN_REPOSITORY_ROLE_ID,
      actor_type: "RepositoryRole",
      bypass_mode: "always",
    }],
    conditions: { ref_name: { include: ["refs/heads/codex/spec-*"], exclude: [] } },
    rules: [
      { type: "non_fast_forward" },
      {
        type: "pull_request",
        parameters: {
          allowed_merge_methods: ["squash"],
          dismiss_stale_reviews_on_push: true,
          require_code_owner_review: false,
          require_last_push_approval: false,
          required_approving_review_count: 0,
          required_review_thread_resolution: true,
        },
      },
      {
        type: "required_status_checks",
        parameters: {
          required_status_checks: [{ context: "ticket-gate", integration_id: appId }],
          strict_required_status_checks_policy: false,
          do_not_enforce_on_create: true,
        },
      },
    ],
  };
}

function desiredDevRuleset(appId) {
  return {
    name: DEV_RULESET_NAME,
    target: "branch",
    enforcement: "active",
    bypass_actors: [],
    conditions: { ref_name: { include: ["refs/heads/dev"], exclude: [] } },
    rules: [
      { type: "deletion" },
      { type: "non_fast_forward" },
      {
        type: "pull_request",
        parameters: {
          allowed_merge_methods: ["merge", "squash"],
          dismiss_stale_reviews_on_push: true,
          require_code_owner_review: false,
          require_last_push_approval: false,
          required_approving_review_count: 0,
          required_review_thread_resolution: true,
        },
      },
      {
        type: "required_status_checks",
        parameters: {
          required_status_checks: [{ context: "integration-gate", integration_id: appId }],
          strict_required_status_checks_policy: true,
          do_not_enforce_on_create: false,
        },
      },
    ],
  };
}

function containsDesired(value, desired) {
  if (Array.isArray(desired)) {
    return Array.isArray(value) && value.length === desired.length &&
      desired.every((entry, index) => containsDesired(value[index], entry));
  }
  if (desired && typeof desired === "object") {
    return value && typeof value === "object" &&
      Object.entries(desired).every(([key, entry]) => containsDesired(value[key], entry));
  }
  return value === desired;
}

function rulesetAction(repo, observed, desired, description) {
  return {
    description,
    apply: () => runGh(
      [
        "api",
        "--method",
        observed ? "PUT" : "POST",
        observed ? `repos/${repo}/rulesets/${observed.id}` : `repos/${repo}/rulesets`,
        "-H",
        `X-GitHub-Api-Version: ${API_VERSION}`,
        "--input",
        "-",
      ],
      { input: JSON.stringify(desired) },
    ),
  };
}

function collectPlan(repo, candidateRef = "") {
  runGh(["auth", "status"]);
  const repository = parseJson(
    runGh(["repo", "view", repo, "--json", "nameWithOwner,defaultBranchRef,hasIssuesEnabled,mergeCommitAllowed,squashMergeAllowed,rebaseMergeAllowed,deleteBranchOnMerge"]),
    "repository inspection",
  );
  if (repository.nameWithOwner !== repo) throw new Error(`authenticated repository '${repository.nameWithOwner}' is not '${repo}'`);
  if (repository.defaultBranchRef?.name !== "main") throw new Error("default branch must remain main");
  if (!repository.hasIssuesEnabled) throw new Error("GitHub Issues must remain enabled");
  const issueCapability = runGh(
    ["api", `repos/${repo}/issues?state=all&per_page=1`, "-H", `X-GitHub-Api-Version: ${API_VERSION}`],
    { allowFailure: true },
  );
  if (issueCapability.status !== 0) {
    throw new Error(`issue API capability could not be verified: ${(issueCapability.stderr || issueCapability.stdout).trim()}`);
  }

  const branches = remoteBranches();
  const remoteDevSha = branches.get("dev");
  const remoteMainSha = branches.get("main");
  if (!remoteDevSha || !remoteMainSha) throw new Error("remote main and dev must both exist before workflow planning");
  const auditedDevSha = runGit(["rev-parse", candidateRef || "dev"]).stdout.trim();
  if (runGit(["merge-base", "--is-ancestor", remoteDevSha, auditedDevSha], { allowFailure: true }).status !== 0) {
    throw new Error(`audited dev ${auditedDevSha} does not contain remote dev ${remoteDevSha}`);
  }
  if (runGit(["merge-base", remoteMainSha, auditedDevSha], { allowFailure: true }).status !== 0) {
    throw new Error(`audited dev ${auditedDevSha} does not share history with deferred remote main ${remoteMainSha}`);
  }

  const appId = githubActionsAppId(repo, remoteDevSha);
  const gateEvidence = replacementGateEvidence(repo, appId);
  const rulesets = readRulesets(repo);
  const labels = parseJson(
    runGh(["label", "list", "--repo", repo, "--limit", "200", "--json", "name,color,description"]),
    "label inventory",
  );
  const labelsByName = new Map(labels.map((label) => [label.name, label]));
  const labelNames = new Set(labelsByName.keys());
  const classicDev = readProtection(repo, "dev");
  const classicMain = readProtection(repo, "main");
  if (!classicMain) throw new Error("main compatibility protection is unavailable; production policy is not safe to plan");

  const desiredSpec = desiredSpecRuleset(appId);
  const desiredDev = desiredDevRuleset(appId);
  const observedSpec = rulesets.get(SPEC_RULESET_NAME);
  const observedDev = rulesets.get(DEV_RULESET_NAME);
  const specMatches = containsDesired(observedSpec, desiredSpec);
  const devMatches = containsDesired(observedDev, desiredDev);
  const activation = [];
  const repositorySettingsMatch =
    repository.mergeCommitAllowed === true &&
    repository.squashMergeAllowed === true &&
    repository.rebaseMergeAllowed === false &&
    repository.deleteBranchOnMerge === true;
  if (!repositorySettingsMatch) {
    activation.push({
      description: "enable merge and squash, disable rebase, and delete merged heads",
      apply: () => runGh(
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
      ),
    });
  }
  for (const desiredLabel of DESIRED_LABELS) {
    const observed = labelsByName.get(desiredLabel.name);
    if (
      !observed ||
      observed.color.toLowerCase() !== desiredLabel.color.toLowerCase() ||
      (observed.description ?? "") !== desiredLabel.description
    ) {
      activation.push({
        description: `${observed ? "update" : "create"} canonical label ${desiredLabel.name}`,
        apply: () => runGh([
          "label",
          "create",
          desiredLabel.name,
          "--repo",
          repo,
          "--color",
          desiredLabel.color,
          "--description",
          desiredLabel.description,
          "--force",
        ]),
      });
    }
  }
  if (!specMatches) {
    activation.push(rulesetAction(repo, observedSpec, desiredSpec, "create/update active Spec Branch ruleset with loose ticket-gate, creation/deletion lifecycle, and repository-administrator bypass"));
  }
  if (!devMatches) {
    activation.push(rulesetAction(repo, observedDev, desiredDev, "create/update active dev ruleset with strict integration-gate with no bypass"));
  }
  if (!classicDev && (!specMatches || !devMatches)) {
    throw new Error("classic dev protection is absent before replacement rulesets are exact; stop and restore protection before activation");
  }

  const cleanup = [];
  if (classicDev) {
    cleanup.push({
      description: "remove classic dev protection requiring compatibility ci",
      apply: () => runGh(["api", "--method", "DELETE", `repos/${repo}/branches/dev/protection`, "-H", `X-GitHub-Api-Version: ${API_VERSION}`]),
    });
  }
  for (const name of RETIRED_RULESETS) {
    const ruleset = rulesets.get(name);
    if (ruleset) cleanup.push({
      description: `delete retired ruleset ${name}`,
      apply: () => runGh(["api", "--method", "DELETE", `repos/${repo}/rulesets/${ruleset.id}`, "-H", `X-GitHub-Api-Version: ${API_VERSION}`]),
    });
  }
  for (const name of RETIRED_LABELS) {
    if (labelNames.has(name)) cleanup.push({
      description: `delete retired label ${name}`,
      apply: () => runGh(["label", "delete", name, "--repo", repo, "--yes"]),
    });
  }

  return {
    activation,
    cleanup,
    activationReady: specMatches && devMatches,
    gateEvidence,
    auditedDevSha,
    remoteDevSha,
    appId,
  };
}

function printPlan(repo, plan) {
  process.stdout.write(`GitHub workflow plan for ${repo}\n`);
  process.stdout.write(`Audited dev: ${plan.auditedDevSha}\n`);
  process.stdout.write(`GitHub Actions app: ${plan.appId}\n`);
  process.stdout.write("Activation phase (classic ci remains required)\n");
  if (plan.activation.length === 0) process.stdout.write("- no activation changes required\n");
  else for (const action of plan.activation) process.stdout.write(`- ${action.description}\n`);
  process.stdout.write("Cleanup phase (only after replacement gates are verified)\n");
  process.stdout.write(`- ticket-gate evidence: ${plan.gateEvidence.ticket ? "verified" : "missing"}\n`);
  process.stdout.write(`- integration-gate evidence: ${plan.gateEvidence.integration ? "verified" : "missing"}\n`);
  if (plan.cleanup.length === 0) process.stdout.write("- no cleanup changes required\n");
  else for (const action of plan.cleanup) process.stdout.write(`- ${action.description}\n`);
  process.stdout.write("Rollback before cleanup: delete the new rulesets while classic ci still protects dev.\n");
  process.stdout.write("Rollback after cleanup: restore classic integration-gate protection before disabling replacement rules.\n");
  process.stdout.write("The main transition is deferred; classic main protection remains unchanged.\n");
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  let plan;
  try {
    plan = collectPlan(options.repo, options.candidateRef);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
  printPlan(options.repo, plan);
  if (options.mode === "plan") {
    process.stdout.write("No changes applied.\n");
    return;
  }
  if (options.mode === "verify") {
    const driftCount = plan.activation.length + plan.cleanup.length;
    if (driftCount > 0) fail(`verification found ${driftCount} required change(s)`);
    process.stdout.write("GitHub workflow configuration verified.\n");
    return;
  }
  if (options.confirmRepo !== options.repo) fail(`apply requires --confirm-repo ${options.repo}`);
  if (options.confirmDevSha !== plan.remoteDevSha) fail(`apply requires --confirm-dev-sha ${plan.remoteDevSha}`);
  if (options.confirmCiSha !== plan.remoteDevSha) fail(`apply requires --confirm-ci-sha ${plan.remoteDevSha}`);
  if (options.confirmAppId !== String(plan.appId)) fail(`apply requires --confirm-github-actions-app-id ${plan.appId}`);
  if (!["activate", "cleanup"].includes(options.confirmPhase)) {
    fail("apply requires --confirm-phase activate or --confirm-phase cleanup");
  }
  if (options.confirmPhase === "cleanup" && !plan.activationReady) {
    fail("cleanup requires both replacement rulesets to be active and exact; run and verify activation first");
  }
  if (
    options.confirmPhase === "cleanup" &&
    (!plan.gateEvidence.ticket || !plan.gateEvidence.integration)
  ) {
    fail("cleanup requires successful real ticket-gate and integration-gate evidence from pull requests");
  }
  const actions = options.confirmPhase === "activate" ? plan.activation : plan.cleanup;
  try {
    for (const action of actions) action.apply();
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
  process.stdout.write(`Applied ${options.confirmPhase} phase. Refetch and verify live state before continuing.\n`);
}

main();
