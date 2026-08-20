#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const EXPECTED_REPOSITORY = "brandon-y-lee/helix";
const ghBin = process.env.GH_BIN ?? "gh";
const gitBin = process.env.GIT_BIN ?? "git";

function fail(message) {
  process.stderr.write(`helix-repository: ${message}\n`);
  process.exit(1);
}

function run(command, args, { allowFailure = false } = {}) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
  });
  if (result.error) {
    throw new Error(`${command} could not run: ${result.error.message}`);
  }
  if (result.status !== 0 && !allowFailure) {
    const detail = (result.stderr || result.stdout || `exit ${result.status}`).trim();
    throw new Error(`${command} ${args.join(" ")} failed: ${detail}`);
  }
  return result;
}

function runGit(args, options) {
  return run(gitBin, args, options);
}

function runGh(args, options) {
  return run(ghBin, args, options);
}

function parseArgs(argv) {
  const parsed = { repo: "", candidateRef: "" };
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!value) fail(`missing value for '${flag ?? "option"}'`);
    if (flag === "--repo") parsed.repo = value;
    else if (flag === "--candidate-ref") parsed.candidateRef = value;
    else fail(`unknown option '${flag}'`);
  }
  if (parsed.repo !== EXPECTED_REPOSITORY) {
    fail(`refusing repository '${parsed.repo || "missing"}'; expected '${EXPECTED_REPOSITORY}'`);
  }
  if (!parsed.candidateRef) fail("--candidate-ref is required");
  return parsed;
}

function parseJson(result, description) {
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error(`${description} returned invalid JSON`);
  }
}

function repositoryFromOrigin(origin) {
  const scpMatch = origin.match(/^git@github\.com:(.+?)(?:\.git)?$/);
  if (scpMatch) return scpMatch[1];
  try {
    const url = new URL(origin);
    if (url.hostname !== "github.com") return null;
    return url.pathname.replace(/^\//, "").replace(/\.git$/, "");
  } catch {
    return null;
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
  const result = runGit(["cat-file", "-e", `${sha}^{commit}`], {
    allowFailure: true,
  });
  if (result.status !== 0) {
    throw new Error(`${label} commit ${sha} is not present locally; fetch it before verification`);
  }
}

function requireAncestor(ancestor, descendant, label) {
  const result = runGit(["merge-base", "--is-ancestor", ancestor, descendant], {
    allowFailure: true,
  });
  if (result.status !== 0) throw new Error(label);
}

function verify({ repo, candidateRef }) {
  runGh(["auth", "status"]);
  const repository = parseJson(
    runGh([
      "repo",
      "view",
      repo,
      "--json",
      "nameWithOwner,defaultBranchRef",
    ]),
    "repository inspection",
  );
  if (repository.nameWithOwner !== repo) {
    throw new Error(`authenticated GitHub context resolved '${repository.nameWithOwner}', not '${repo}'`);
  }
  if (repository.defaultBranchRef?.name !== "main") {
    throw new Error(`default branch must remain 'main', found '${repository.defaultBranchRef?.name ?? "unknown"}'`);
  }

  const origin = runGit(["config", "--get", "remote.origin.url"]).stdout.trim();
  if (repositoryFromOrigin(origin) !== repo) {
    throw new Error(`origin must identify '${repo}'`);
  }

  const candidateSha = runGit(["rev-parse", "--verify", `${candidateRef}^{commit}`]).stdout.trim();
  const branches = readRemoteBranches();
  for (const branch of ["main", "dev"]) {
    const sha = branches.get(branch);
    if (!sha) throw new Error(`remote branch '${branch}' does not exist`);
    requireLocalCommit(sha, `remote ${branch}`);
  }

  const remoteMainSha = branches.get("main");
  const remoteDevSha = branches.get("dev");
  requireAncestor(
    remoteDevSha,
    candidateSha,
    `candidate ${candidateSha} does not contain remote dev ${remoteDevSha}`,
  );

  const mainHistory = runGit([
    "rev-list",
    "--parents",
    "--max-count=1",
    remoteMainSha,
  ]).stdout.trim().split(/\s+/);
  if (
    mainHistory.length !== 3 ||
    runGit(["merge-base", "--is-ancestor", mainHistory[2], remoteDevSha], {
      allowFailure: true,
    }).status !== 0
  ) {
    throw new Error(
      "remote main is not a regular two-parent promotion of history contained by dev",
    );
  }

  const candidateCiBlob = runGit(
    ["rev-parse", `${candidateSha}:.github/workflows/ci.yml`],
    { allowFailure: true },
  );
  const currentDevCiBlob = runGit(
    ["rev-parse", `${remoteDevSha}:.github/workflows/ci.yml`],
    { allowFailure: true },
  );
  if (
    candidateCiBlob.status !== 0 ||
    currentDevCiBlob.status !== 0 ||
    candidateCiBlob.stdout.trim() !== currentDevCiBlob.stdout.trim()
  ) {
    throw new Error("candidate CI workflow differs from current dev");
  }
}

const options = parseArgs(process.argv.slice(2));
try {
  verify(options);
  process.stdout.write("Helix repository identity and candidate verified.\n");
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
