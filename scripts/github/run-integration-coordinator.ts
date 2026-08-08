import { execFile } from "node:child_process";
import { pathToFileURL } from "node:url";

import {
  runIntegrationLine,
  type GitAdapter,
  IntegrationCandidate,
  type MergeAdapter,
  type RepositoryAdapter,
  RiskArea,
  type VerificationAdapter,
  WorkClass,
} from "./verification-orchestrator";

type PullRequestFact = {
  number: number;
  baseRefName: string;
  headRefOid: string;
  isDraft: boolean;
  mergeable: string;
  createdAt: string;
  body: string;
  labels: Array<{ name: string }>;
  files: Array<{ path: string }>;
  statusCheckRollup: Array<{
    name?: string;
    context?: string;
    status?: string;
    conclusion?: string;
    state?: string;
  }>;
};

type CommandResult = {
  stdout: string;
  stderr: string;
  status: number;
};

type CommandOptions = {
  allowFailure?: boolean;
  signal?: AbortSignal;
};

export interface CommandAdapter {
  run(command: string, args: string[], options?: CommandOptions): Promise<CommandResult>;
}

const commandAdapter: CommandAdapter = {
  async run(command, args, options = {}) {
    return new Promise((resolve, reject) => {
      execFile(
        command,
        args,
        {
          cwd: process.cwd(),
          encoding: "utf8",
          env: process.env,
          signal: options.signal,
        },
        (error, stdout, stderr) => {
          const status = typeof error?.code === "number" ? error.code : error ? 1 : 0;
          const result = { stdout, stderr, status };
          if (error && !options.allowFailure) {
            reject(new Error(`${command} ${args.join(" ")} failed: ${(stderr || error.message).trim()}`));
            return;
          }
          resolve(result);
        },
      );
    });
  },
};

const verificationSystemPaths = [
  ".nvmrc",
  ".github/workflows/",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "playwright.config.ts",
  "scripts/affected-browser-verification",
  "scripts/browser-verification-plan",
  "scripts/github/",
  "scripts/production-verification",
  "scripts/verify-affected",
  "scripts/verify-production",
  "tests/affected-browser-verification",
  "tests/integration-",
  "tests/verification-orchestrator",
  "tests/production-verification",
];

function declaredWorkClass(body: string): WorkClass {
  const path = body.match(/^- Path:\s*(.+?)\s*$/m)?.[1]?.toLowerCase();
  if (path === "urgent ticket") return "urgent";
  if (path === "planning") return "planning";
  if (path === "documentation") return "documentation";
  if (path === "trivial") return "trivial";
  if (path === "completed spec") return "completed-spec";
  if (path === "normal ticket" || path === "standalone ticket") return "standalone";
  return "verification-system";
}

function declaredFastPathProof(body: string): string[] | undefined {
  const declaration = body.match(/^- Fast-path proof:\s*(.+?)\s*$/m)?.[1]?.trim();
  if (!declaration || /^n\/?a$/i.test(declaration)) return undefined;
  const paths = declaration
    .split(",")
    .map((path) => path.trim().replace(/^`|`$/g, ""))
    .filter(Boolean)
    .sort();
  return paths.length > 0 ? paths : undefined;
}

function isVerificationSystemPath(path: string): boolean {
  return verificationSystemPaths.some((prefix) => path.startsWith(prefix));
}

function inferRiskAreas(paths: string[]): RiskArea[] {
  const risks: RiskArea[] = [];
  const joined = paths.join("\n").toLowerCase();
  if (/(auth|security|middleware|rls)/.test(joined)) risks.push("security");
  if (/(checkout|payment|stripe|cart|order)/.test(joined)) risks.push("payment");
  if (/(supabase|database|migration|schema)/.test(joined)) risks.push("data");
  if (/(\.github|vercel|algolia|supabase|stripe)/.test(joined)) risks.push("provider");
  if (
    paths.some(
      (path) =>
        path.startsWith(".github/workflows/") ||
        path.startsWith("scripts/github/") ||
        ["package.json", "pnpm-lock.yaml", "tsconfig.json", "next.config.ts"].includes(path),
    )
  ) {
    risks.push("cross-cutting");
  }
  return risks;
}

function checkPassed(
  checks: PullRequestFact["statusCheckRollup"],
  requiredName: string,
): boolean {
  return checks.some((check) => {
    const name = check.name ?? check.context;
    const result = check.conclusion ?? check.state;
    return name === requiredName && check.status !== "IN_PROGRESS" && result === "SUCCESS";
  });
}

function requiredPreflightPassed(
  checks: PullRequestFact["statusCheckRollup"],
  workClass: WorkClass,
): boolean {
  return (
    checkPassed(checks, "ci") &&
    (workClass !== "verification-system" ||
      checkPassed(checks, "verification-lifecycle-windows"))
  );
}

export function toIntegrationCandidate(fact: PullRequestFact): IntegrationCandidate {
  const changedFiles = fact.files.map((file) => file.path);
  const workClass = changedFiles.some(isVerificationSystemPath)
    ? "verification-system"
    : declaredWorkClass(fact.body);
  return {
    number: fact.number,
    target: "dev",
    headSha: fact.headRefOid,
    readyAt: fact.createdAt,
    workClass,
    changedFiles,
    fastPathProof: declaredFastPathProof(fact.body),
    riskAreas: inferRiskAreas(changedFiles),
    labels: fact.labels.map((label) => label.name),
    ready:
      fact.baseRefName === "dev" &&
      !fact.isDraft &&
      fact.mergeable !== "CONFLICTING" &&
      !fact.labels.some((label) => label.name === "workflow:review") &&
      requiredPreflightPassed(fact.statusCheckRollup, workClass),
  };
}

function parseJson<T>(value: string, description: string): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    throw new Error(`${description} returned invalid JSON`);
  }
}

function requireSha(value: string, description: string): string {
  if (!/^[0-9a-f]{40}$/.test(value)) throw new Error(`${description} was not an exact commit SHA`);
  return value;
}

async function readReadyTimes(
  commands: CommandAdapter,
  repository: string,
  signal?: AbortSignal,
): Promise<Map<number, string>> {
  const [owner, name] = repository.split("/");
  if (!owner || !name) throw new Error("repository must be owner/name");
  const query = `
    query($owner: String!, $name: String!) {
      repository(owner: $owner, name: $name) {
        pullRequests(first: 100, states: OPEN, baseRefName: "dev") {
          nodes {
            number
            createdAt
            timelineItems(
              last: 100
              itemTypes: [READY_FOR_REVIEW_EVENT, REOPENED_EVENT, UNLABELED_EVENT]
            ) {
              nodes {
                __typename
                ... on ReadyForReviewEvent { createdAt }
                ... on ReopenedEvent { createdAt }
                ... on UnlabeledEvent { createdAt label { name } }
              }
            }
          }
        }
      }
    }
  `;
  const result = await commands.run(
    "gh",
    ["api", "graphql", "-f", `query=${query}`, "-F", `owner=${owner}`, "-F", `name=${name}`],
    { signal },
  );
  const response = parseJson<{
    data?: {
      repository?: {
        pullRequests?: {
          nodes?: Array<{
            number: number;
            createdAt: string;
            timelineItems?: {
              nodes?: Array<{
                __typename?: string;
                createdAt?: string;
                label?: { name?: string };
              }>;
            };
          }>;
        };
      };
    };
  }>(result.stdout, "pull request readiness timeline");
  const readyTimes = new Map<number, string>();
  for (const pull of response.data?.repository?.pullRequests?.nodes ?? []) {
    const events = (pull.timelineItems?.nodes ?? [])
      .filter(
        (event) =>
          event.createdAt &&
          (event.__typename !== "UnlabeledEvent" || event.label?.name === "workflow:review"),
      )
      .sort((left, right) => left.createdAt!.localeCompare(right.createdAt!));
    readyTimes.set(pull.number, events.at(-1)?.createdAt ?? pull.createdAt);
  }
  return readyTimes;
}

export function createRepositoryAdapter(
  repository: string,
  commands: CommandAdapter = commandAdapter,
): RepositoryAdapter {
  let claimTail = Promise.resolve();

  async function read(signal?: AbortSignal) {
    const [dev, pulls, readyTimes] = await Promise.all([
      commands.run(
        "gh",
        ["api", `repos/${repository}/git/ref/heads/dev`, "--jq", ".object.sha"],
        { signal },
      ),
      commands.run("gh", [
        "pr",
        "list",
        "--repo",
        repository,
        "--base",
        "dev",
        "--state",
        "open",
        "--limit",
        "100",
        "--json",
        "number,baseRefName,headRefOid,isDraft,mergeable,createdAt,body,labels,files,statusCheckRollup",
      ], { signal }),
      readReadyTimes(commands, repository, signal),
    ]);
    const facts = parseJson<PullRequestFact[]>(pulls.stdout, "dev pull requests");
    const candidates = await Promise.all(
      facts.map(async (fact) => {
        const candidate = toIntegrationCandidate(fact);
        candidate.readyAt = readyTimes.get(candidate.number) ?? candidate.readyAt;
        return candidate;
      }),
    );
    return { devSha: requireSha(dev.stdout.trim(), "dev"), candidates };
  }

  async function editLabels(number: number, add: string[], remove: string[]): Promise<void> {
    const args = ["issue", "edit", String(number), "--repo", repository];
    for (const label of add) args.push("--add-label", label);
    for (const label of remove) args.push("--remove-label", label);
    await commands.run("gh", args);
  }

  return {
    read,
    async queue(candidate) {
      const current = await read();
      const match = current.candidates.find((entry) => entry.number === candidate.number);
      if (!match?.ready || match.headSha !== candidate.headSha) return false;
      await editLabels(candidate.number, ["workflow:integration-queued"], []);
      return true;
    },
    async claim(candidate) {
      const previousClaim = claimTail;
      let finishClaim!: () => void;
      claimTail = new Promise<void>((resolve) => {
        finishClaim = resolve;
      });
      await previousClaim;
      try {
        const current = await read();
        const match = current.candidates.find((entry) => entry.number === candidate.number);
        if (
          current.devSha !== candidate.baseSha ||
          current.candidates.some((entry) => entry.labels.includes("workflow:integration-active")) ||
          !match?.ready ||
          match.headSha !== candidate.headSha ||
          !match.labels.includes("workflow:integration-queued")
        ) {
          return false;
        }
        await editLabels(
          candidate.number,
          ["workflow:integration-active"],
          ["workflow:integration-queued", "workflow:review"],
        );
        const claimed = await read();
        const active = claimed.candidates.filter((entry) =>
          entry.labels.includes("workflow:integration-active"),
        );
        const owner = active[0];
        const valid = (
          claimed.devSha === candidate.baseSha &&
          active.length === 1 &&
          owner?.number === candidate.number &&
          owner.headSha === candidate.headSha
        );
        if (!valid) {
          await editLabels(
            candidate.number,
            ["workflow:review"],
            ["workflow:integration-active", "workflow:integration-queued"],
          );
        }
        return valid;
      } finally {
        finishClaim();
      }
    },
    async release(candidate, outcome) {
      await editLabels(
        candidate.number,
        outcome === "review" ? ["workflow:review"] : [],
        ["workflow:integration-active", "workflow:integration-queued"],
      );
    },
  };
}

export async function requestIntegrationHandoff(
  repository: string,
  commands: CommandAdapter = commandAdapter,
): Promise<void> {
  await commands.run("gh", [
    "workflow",
    "run",
    "dev-integration.yml",
    "--repo",
    repository,
    "--ref",
    "dev",
  ]);
}

export function createGitAdapter(
  repository: string,
  commands: CommandAdapter = commandAdapter,
): GitAdapter {
  return {
    async prepare(candidate) {
      const result = await commands.run("gh", [
        "api",
        `repos/${repository}/pulls/${candidate.number}`,
        "--jq",
        ".merge_commit_sha",
      ], { signal: candidate.signal });
      return { candidateSha: requireSha(result.stdout.trim(), "GitHub merge candidate") };
    },
  };
}

function abortableDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const abort = () => {
      clearTimeout(timeout);
      reject(signal.reason);
    };
    const timeout = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, milliseconds);
    signal.addEventListener("abort", abort, { once: true });
  });
}

export function createVerificationAdapter(
  repository: string,
  nonce: string,
  commands: CommandAdapter = commandAdapter,
): VerificationAdapter {
  return {
    async verify(input) {
      const title = `Integration verification #${input.number} ${nonce}`;
      await commands.run("gh", [
        "workflow",
        "run",
        "dev-integration-verification.yml",
        "--repo",
        repository,
        "--ref",
        "dev",
        "-f",
        `pr_number=${input.number}`,
        "-f",
        `candidate_head=${input.headSha}`,
        "-f",
        `dev_base=${input.baseSha}`,
        "-f",
        `gate=${input.gate}`,
        "-f",
        `nonce=${nonce}`,
      ]);

      let runId: number | undefined;
      for (let attempt = 0; attempt < 30 && !runId; attempt += 1) {
        const result = await commands.run("gh", [
          "run",
          "list",
          "--repo",
          repository,
          "--workflow",
          "dev-integration-verification.yml",
          "--event",
          "workflow_dispatch",
          "--limit",
          "30",
          "--json",
          "databaseId,displayTitle",
        ]);
        const runs = parseJson<Array<{ databaseId: number; displayTitle: string }>>(
          result.stdout,
          "integration verification runs",
        );
        runId = runs.find((run) => run.displayTitle === title)?.databaseId;
        if (!runId) await abortableDelay(1_000, input.signal);
      }
      if (!runId) throw new Error("dispatched integration verification run was not observable");

      const watched = await commands.run(
        "gh",
        ["run", "watch", String(runId), "--repo", repository, "--exit-status", "--interval", "10"],
        { allowFailure: true, signal: input.signal },
      );
      if (input.signal.aborted) {
        await commands.run(
          "gh",
          ["run", "cancel", String(runId), "--repo", repository],
          { allowFailure: true },
        );
      }
      return { outcome: watched.status === 0 ? "passed" : "failed" };
    },
  };
}

export function createMergeAdapter(
  repository: string,
  commands: CommandAdapter = commandAdapter,
): MergeAdapter {
  return {
    async merge(candidate) {
      const result = await commands.run("gh", [
        "api",
        "--method",
        "PUT",
        `repos/${repository}/pulls/${candidate.number}/merge`,
        "-f",
        `merge_method=${candidate.mergeMethod}`,
        "-f",
        `sha=${candidate.headSha}`,
      ], { signal: candidate.signal });
      const merged = parseJson<{ merged?: boolean; sha?: string; message?: string }>(
        result.stdout,
        `pull request #${candidate.number} merge`,
      );
      if (!merged.merged || !merged.sha) {
        throw new Error(`GitHub refused pull request #${candidate.number}: ${merged.message ?? "unknown"}`);
      }
      return { mergeSha: requireSha(merged.sha, "merged dev") };
    },
  };
}

async function main(): Promise<void> {
  const repository = process.env.INTEGRATION_REPOSITORY;
  const nonce = process.env.INTEGRATION_RUN_NONCE;
  if (repository !== "brandon-y-lee/mei-pelle" || !nonce) {
    throw new Error("the exact repository and coordinator run nonce are required");
  }
  const cancellation = new AbortController();
  process.once("SIGINT", () => cancellation.abort("SIGINT"));
  process.once("SIGTERM", () => cancellation.abort("SIGTERM"));
  const report = await runIntegrationLine(
    {
      repository: createRepositoryAdapter(repository),
      git: createGitAdapter(repository),
      verification: createVerificationAdapter(repository, nonce),
      merge: createMergeAdapter(repository),
    },
    { signal: cancellation.signal },
  );
  if (report.outcome === "handoff") {
    await requestIntegrationHandoff(repository);
  }
  process.stdout.write(`${JSON.stringify(report)}\n`);
  if (report.outcome === "exhausted") process.exitCode = 1;
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  main().catch((error: unknown) => {
    process.stderr.write(`dev-integration: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
