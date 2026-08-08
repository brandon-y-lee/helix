#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { parse as parseYaml } from "yaml";

const API_VERSION = "2026-03-10";
const EXPECTED_REPOSITORY = "brandon-y-lee/mei-pelle";
const INTEGRATION_RULESET_NAME = "dev Integration Line authority";
const INTEGRATION_CUTOVER_CONFIRMATION = "dev-integration-authority";
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
  ["workflow:integration-queued", "C5DEF5", "Ready dev pull request awaiting the Integration Slot"],
  ["workflow:integration-active", "B60205", "Current frozen dev Integration Slot owner"],
  ["workflow:urgent", "D93F0B", "Human-approved active production or security urgency"],
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
  if (mode !== "plan" && mode !== "apply") {
    fail("usage: bootstrap-workflow.mjs <plan|apply> --repo <owner/repo> [--confirm-repo <owner/repo> --confirm-dev-sha <sha> --confirm-ci-sha <sha> --confirm-integration-cutover dev-integration-authority --confirm-integration-app-id <id>]");
  }

  const parsed = {
    mode,
    repo: "",
    confirmRepo: "",
    confirmDevSha: "",
    confirmCiSha: "",
    confirmIntegrationCutover: "",
    confirmIntegrationAppId: "",
  };
  for (let index = 0; index < rest.length; index += 1) {
    const flag = rest[index];
    const value = rest[index + 1];
    if (!value || !flag.startsWith("--")) fail(`missing value for '${flag}'`);
    if (flag === "--repo") parsed.repo = value;
    else if (flag === "--confirm-repo") parsed.confirmRepo = value;
    else if (flag === "--confirm-dev-sha") parsed.confirmDevSha = value;
    else if (flag === "--confirm-ci-sha") parsed.confirmCiSha = value;
    else if (flag === "--confirm-integration-cutover") parsed.confirmIntegrationCutover = value;
    else if (flag === "--confirm-integration-app-id") parsed.confirmIntegrationAppId = value;
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

function requireDefaultBranchCoordinator(sha) {
  const paths = [
    ".github/workflows/dev-integration.yml",
    ".github/workflows/dev-integration-verification.yml",
  ];
  if (
    paths.some(
      (path) =>
        runGit(["cat-file", "-e", `${sha}:${path}`], { allowFailure: true }).status !== 0,
    )
  ) {
    throw new Error("coordinator workflows must exist on remote main before cutover planning");
  }
}

function requireAuditedWorkflowAuthority(sha) {
  const coordinator = ".github/workflows/dev-integration.yml";
  const attestationSigner = ".github/workflows/dev-integration-verification.yml";
  const workflows = runGit([
    "ls-tree",
    "-r",
    "--name-only",
    sha,
    "--",
    ".github/workflows",
  ]).stdout.trim().split("\n").filter((path) => /\.ya?ml$/.test(path));
  if (!workflows.includes(coordinator)) {
    throw new Error(`coordinator workflow is absent from audited dev ${sha}`);
  }
  for (const path of workflows) {
    const contents = runGit(["show", `${sha}:${path}`]).stdout;
    let workflow;
    try {
      workflow = parseYaml(contents);
    } catch (error) {
      throw new Error(
        `workflow '${path}' is not valid YAML at ${sha}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (!workflow || typeof workflow !== "object" || Array.isArray(workflow)) {
      throw new Error(`workflow '${path}' must be a YAML object at ${sha}`);
    }
    const jobs = workflow.jobs;
    if (!jobs || typeof jobs !== "object" || Array.isArray(jobs)) {
      throw new Error(`workflow '${path}' must declare jobs at ${sha}`);
    }
    if (path === coordinator) {
      const required = ["actions", "contents", "issues", "pull-requests"];
      const permissions = workflow.permissions;
      if (!permissions || typeof permissions !== "object" || Array.isArray(permissions)) {
        throw new Error(`coordinator workflow must declare an explicit permission map at ${sha}`);
      }
      if (
        Object.keys(permissions).length !== required.length ||
        required.some((permission) => permissions[permission] !== "write")
      ) {
        throw new Error(
          `coordinator workflow must grant only ${required.join(", ")}: write at ${sha}`,
        );
      }
      for (const [jobName, job] of Object.entries(jobs)) {
        if (job && typeof job === "object" && !Array.isArray(job) && "permissions" in job) {
          throw new Error(
            `coordinator workflow job '${jobName}' must inherit the audited workflow permissions at ${sha}`,
          );
        }
      }
      continue;
    }
    const permissions = workflow.permissions;
    if (path === attestationSigner) {
      const requiredSigner = {
        "artifact-metadata": "write",
        attestations: "write",
        contents: "read",
        "id-token": "write",
      };
      if (
        !permissions ||
        typeof permissions !== "object" ||
        Array.isArray(permissions) ||
        Object.keys(permissions).length !== 1 ||
        permissions.contents !== "read"
      ) {
        throw new Error(
          `attestation signer workflow must default to contents: read at ${sha}`,
        );
      }
      for (const [jobName, job] of Object.entries(jobs)) {
        if (!job || typeof job !== "object" || Array.isArray(job)) continue;
        if (jobName === "attest-stable-result") {
          const jobPermissions = job.permissions;
          if (
            !jobPermissions ||
            typeof jobPermissions !== "object" ||
            Array.isArray(jobPermissions) ||
            Object.keys(jobPermissions).length !== Object.keys(requiredSigner).length ||
            Object.entries(requiredSigner).some(
              ([permission, access]) => jobPermissions[permission] !== access,
            )
          ) {
            throw new Error(
              `attestation signer job must grant only artifact-metadata, attestations, id-token: write and contents: read at ${sha}`,
            );
          }
        } else if ("permissions" in job) {
          throw new Error(
            `unprivileged attestation workflow job '${jobName}' must inherit contents: read at ${sha}`,
          );
        }
      }
      continue;
    }
    if (
      !permissions ||
      typeof permissions !== "object" ||
      Array.isArray(permissions) ||
      Object.keys(permissions).length !== 1 ||
      permissions.contents !== "read"
    ) {
      throw new Error(
        `non-coordinator workflow '${path}' must grant only contents: read at ${sha}`,
      );
    }
    for (const [jobName, job] of Object.entries(jobs)) {
      if (!job || typeof job !== "object" || Array.isArray(job) || !("permissions" in job)) {
        continue;
      }
      const jobPermissions = job.permissions;
      if (jobPermissions === "write-all") {
        throw new Error(
          `non-coordinator workflow '${path}' job '${jobName}' requests write-all at ${sha}`,
        );
      }
      if (
        typeof jobPermissions !== "object" ||
        Array.isArray(jobPermissions) ||
        jobPermissions === null
      ) {
        throw new Error(
          `non-coordinator workflow '${path}' job '${jobName}' has an unrecognized permission declaration at ${sha}`,
        );
      }
      for (const [permission, access] of Object.entries(jobPermissions)) {
        if (access === "write") {
          throw new Error(
            `non-coordinator workflow '${path}' job '${jobName}' requests ${permission}: write at ${sha}`,
          );
        }
        if (access !== "read" && access !== "none") {
          throw new Error(
            `non-coordinator workflow '${path}' job '${jobName}' has invalid ${permission} permission at ${sha}`,
          );
        }
      }
    }
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

function desiredProtection(branch) {
  return {
    required_status_checks: { strict: branch === "main", contexts: ["ci"] },
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

function readCoordinatorAppId(repo, sha) {
  const result = parseJson(
    runGh([
      "api",
      `repos/${repo}/commits/${sha}/check-runs?per_page=100`,
      "-H",
      `X-GitHub-Api-Version: ${API_VERSION}`,
    ]),
    "GitHub Actions app inspection",
  );
  const app = result.check_runs?.find(
    (check) => check.name === "ci" && check.app?.slug === "github-actions",
  )?.app;
  if (!Number.isInteger(app?.id) || app.id <= 0) {
    throw new Error("the GitHub Actions app identity could not be proven from the ci check");
  }
  return app.id;
}

function desiredIntegrationRuleset(appId) {
  return {
    name: INTEGRATION_RULESET_NAME,
    target: "branch",
    enforcement: "active",
    bypass_actors: [
      { actor_id: appId, actor_type: "Integration", bypass_mode: "pull_request" },
    ],
    conditions: { ref_name: { include: ["refs/heads/dev"], exclude: [] } },
    rules: [
      { type: "update", parameters: { update_allows_fetch_and_merge: false } },
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
          required_status_checks: [
            { context: "ci", integration_id: appId },
            { context: "dev-integration", integration_id: appId },
          ],
          strict_required_status_checks_policy: false,
          do_not_enforce_on_create: false,
        },
      },
    ],
  };
}

function containsDesired(value, desired) {
  if (Array.isArray(desired)) {
    return (
      Array.isArray(value) &&
      value.length === desired.length &&
      desired.every((entry, index) => containsDesired(value[index], entry))
    );
  }
  if (desired && typeof desired === "object") {
    return (
      value &&
      typeof value === "object" &&
      Object.entries(desired).every(([key, entry]) => containsDesired(value[key], entry))
    );
  }
  return value === desired;
}

function readIntegrationRuleset(repo) {
  const rulesets = parseJson(
    runGh([
      "api",
      `repos/${repo}/rulesets?includes_parents=false`,
      "-H",
      `X-GitHub-Api-Version: ${API_VERSION}`,
    ]),
    "repository ruleset inspection",
  );
  const summary = rulesets.find((ruleset) => ruleset.name === INTEGRATION_RULESET_NAME);
  if (!summary) return null;
  return parseJson(
    runGh([
      "api",
      `repos/${repo}/rulesets/${summary.id}`,
      "-H",
      `X-GitHub-Api-Version: ${API_VERSION}`,
    ]),
    "dev Integration Line ruleset inspection",
  );
}

function readWorkflowPermissions(repo) {
  return parseJson(
    runGh([
      "api",
      `repos/${repo}/actions/permissions/workflow`,
      "-H",
      `X-GitHub-Api-Version: ${API_VERSION}`,
    ]),
    "default Actions workflow permissions",
  );
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

function collectPlan(repo) {
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

  const localDevSha = runGit(["rev-parse", "dev"]).stdout.trim();
  requireAuditedWorkflowAuthority(localDevSha);
  const remoteBranches = readRemoteBranches();
  const remoteMainSha = remoteBranches.get("main");
  if (!remoteMainSha) throw new Error("remote branch 'main' does not exist");
  requireLocalCommit(remoteMainSha, "remote main");
  requireDefaultBranchCoordinator(remoteMainSha);
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

  const coordinatorAppId = readCoordinatorAppId(repo, remoteDevSha ?? remoteMainSha);

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

  const workflowPermissions = readWorkflowPermissions(repo);
  if (
    workflowPermissions.default_workflow_permissions !== "read" ||
    workflowPermissions.can_approve_pull_request_reviews !== false
  ) {
    actions.push({
      description: "set default Actions workflow permissions to read-only",
      apply: () => {
        runGh(
          [
            "api",
            "--method",
            "PUT",
            `repos/${repo}/actions/permissions/workflow`,
            "-H",
            `X-GitHub-Api-Version: ${API_VERSION}`,
            "--input",
            "-",
          ],
          {
            input: JSON.stringify({
              default_workflow_permissions: "read",
              can_approve_pull_request_reviews: false,
            }),
          },
        );
      },
    });
  }

  if (remoteDevSha !== localDevSha) {
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
    const desired = desiredProtection(branch);
    const observed = readProtection(repo, branch);
    if (!protectionMatches(observed, desired)) {
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

  const desiredRuleset = desiredIntegrationRuleset(coordinatorAppId);
  const observedRuleset = readIntegrationRuleset(repo);
  if (!containsDesired(observedRuleset, desiredRuleset)) {
    actions.push({
      description: `${observedRuleset ? "update" : "create"} dev Integration Line authority ruleset for GitHub App ${coordinatorAppId}`,
      apply: () => {
        runGh(
          [
            "api",
            "--method",
            observedRuleset ? "PUT" : "POST",
            observedRuleset
              ? `repos/${repo}/rulesets/${observedRuleset.id}`
              : `repos/${repo}/rulesets`,
            "-H",
            `X-GitHub-Api-Version: ${API_VERSION}`,
            "--input",
            "-",
          ],
          { input: JSON.stringify(desiredRuleset) },
        );
      },
    });
  }

  return { actions, localDevSha, coordinatorAppId };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  let plan;
  try {
    plan = collectPlan(options.repo);
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

  if (options.confirmDevSha !== plan.localDevSha) {
    fail(`apply requires --confirm-dev-sha ${plan.localDevSha}`);
  }
  if (options.confirmCiSha !== plan.localDevSha) {
    fail(`apply requires --confirm-ci-sha ${plan.localDevSha}`);
  }
  if (options.confirmIntegrationCutover !== INTEGRATION_CUTOVER_CONFIRMATION) {
    fail(`apply requires --confirm-integration-cutover ${INTEGRATION_CUTOVER_CONFIRMATION}`);
  }
  if (options.confirmIntegrationAppId !== String(plan.coordinatorAppId)) {
    fail(`apply requires --confirm-integration-app-id ${plan.coordinatorAppId}`);
  }

  try {
    for (const action of plan.actions) action.apply();
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
  process.stdout.write("Applied GitHub workflow configuration.\n");
}

main();
