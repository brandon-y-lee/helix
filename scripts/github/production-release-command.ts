import { execFile } from "node:child_process";
import { appendFile, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";

import {
  prepareProductionPromotion,
  runProductionPromotion,
  runProductionRollback,
  ProductionDeployment,
  ProductionPromotionAdapters,
  ProductionPromotionAudit,
  ProductionRollbackAdapters,
} from "./production-release";
import { createOperationalVerificationIssueAdapter } from "./scheduled-browser-verification";
import {
  readStagedProductionReceipt,
  reconstructStagedProductionReceipt,
  requireProductionSiteUrl,
  verifyStagedProductionAttestation,
} from "./staged-production-verification-command";

type CommandResult = { stderr: string; stdout: string };
export type ProductionReleaseCommandRunner = {
  run(
    command: string,
    args: string[],
    options?: { cwd?: string; env?: NodeJS.ProcessEnv },
  ): Promise<CommandResult>;
};

const execFileAsync = promisify(execFile);
const systemCommands: ProductionReleaseCommandRunner = {
  async run(command, args, options = {}) {
    const result = await execFileAsync(command, args, {
      cwd: options.cwd ?? process.cwd(),
      encoding: "utf8",
      env: options.env ?? process.env,
      maxBuffer: 10 * 1024 * 1024,
    });
    return { stderr: String(result.stderr), stdout: String(result.stdout) };
  },
};

function requiredEnvironment(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key]?.trim();
  if (!value) throw new Error(`Production release requires ${key}.`);
  return value;
}

function deploymentUrl(value: unknown): string {
  if (typeof value !== "string") throw new Error("Vercel omitted the deployment URL.");
  const parsed = new URL(value.startsWith("https://") ? value : `https://${value}`);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    throw new Error("Vercel returned an invalid Production deployment URL.");
  }
  return parsed.origin;
}

function parseProductionDeployment(value: unknown): ProductionDeployment {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Vercel returned malformed Production deployment evidence.");
  }
  const deployment = value as Record<string, unknown>;
  if (typeof deployment.id !== "string" || deployment.target !== "production") {
    throw new Error("Vercel did not return an exact Production deployment identity.");
  }
  return {
    id: deployment.id,
    target: "production",
    url: deploymentUrl(deployment.url),
  };
}

export function createVercelProductionReleaseAdapter(input: {
  cwd: string;
  env: NodeJS.ProcessEnv;
  fetch?: typeof globalThis.fetch;
  run?: ProductionReleaseCommandRunner["run"];
}): ProductionPromotionAdapters["deployment"] & ProductionRollbackAdapters["deployment"] {
  const fetchDeployment = input.fetch ?? globalThis.fetch;
  const run = input.run ?? systemCommands.run;
  const token = requiredEnvironment(input.env, "VERCEL_TOKEN");
  const teamId = requiredEnvironment(input.env, "VERCEL_ORG_ID");
  requireProductionSiteUrl(input.env);
  const productionSite = new URL(requiredEnvironment(input.env, "NEXT_PUBLIC_SITE_URL"));

  const current = async () => {
    const endpoint = new URL(
      `https://api.vercel.com/v13/deployments/${encodeURIComponent(productionSite.hostname)}`,
    );
    endpoint.searchParams.set("teamId", teamId);
    const response = await fetchDeployment(endpoint, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      throw new Error(`Vercel Production deployment inspection failed with status ${response.status}.`);
    }
    return parseProductionDeployment(await response.json());
  };
  const changeCurrent = async (
    operation: "promote" | "rollback",
    deployment: ProductionDeployment,
    policy: { rebuild: false },
  ) => {
    if (policy.rebuild !== false || !deployment.id.trim()) {
      throw new Error("Production release only accepts exact no-rebuild deployment changes.");
    }
    try {
      await run("pnpm", [
        "exec",
        "vercel",
        operation,
        deployment.id,
        "--yes",
        "--no-color",
        "--timeout=5m",
        "--scope",
        teamId,
      ], { cwd: input.cwd, env: input.env });
    } catch {
      // Vercel documents that a CLI timeout does not cancel the provider
      // operation. The exact served deployment below remains authoritative.
    }
    return current();
  };
  return {
    current,
    promote: (deployment, policy) => changeCurrent("promote", deployment, policy),
    restore: (deployment, policy) => changeCurrent("rollback", deployment, policy),
  };
}

function parseJson<T>(value: string, description: string): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    throw new Error(`${description} returned invalid JSON.`);
  }
}

function pullRequestNumber(value: string): number {
  const number = Number(value.trim().match(/\/pull\/(\d+)\/?$/)?.[1]);
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw new Error("GitHub did not return the Production pull request number.");
  }
  return number;
}

export function createGitHubProductionRepositoryAdapter(input: {
  commands?: ProductionReleaseCommandRunner;
  repository: string;
}): ProductionPromotionAdapters["repository"] {
  const commands = input.commands ?? systemCommands;
  if (input.repository !== "brandon-y-lee/mei-pelle") {
    throw new Error("Production release is restricted to brandon-y-lee/mei-pelle.");
  }
  const readBranch = async (branch: "dev" | "main") => {
    const result = await commands.run("gh", [
      "api", `repos/${input.repository}/git/ref/heads/${branch}`,
    ]);
    const fact = parseJson<{ object?: { sha?: string } }>(result.stdout, `${branch} ref`);
    const sha = fact.object?.sha;
    if (!sha || !/^[0-9a-f]{40}$/.test(sha)) {
      throw new Error(`GitHub returned an invalid ${branch} commit identity.`);
    }
    return sha;
  };
  const readBranches = async () => {
    const [devSha, mainSha] = await Promise.all([readBranch("dev"), readBranch("main")]);
    return { devSha, mainSha };
  };
  return {
    readBranches,
    async mergeDevToMain(release) {
      if (release.method !== "merge") {
        throw new Error("Production release requires a regular merge.");
      }
      const current = await readBranches();
      if (
        current.devSha !== release.expectedDevSha ||
        current.mainSha !== release.expectedMainSha
      ) {
        throw new Error("dev or main changed after Production authorization.");
      }

      const listed = await commands.run("gh", [
        "pr", "list", "--repo", input.repository,
        "--base", "main", "--head", "dev", "--state", "open",
        "--json", "number,headRefOid,isDraft",
      ]);
      const open = parseJson<Array<{ headRefOid: string; isDraft: boolean; number: number }>>(
        listed.stdout,
        "Production pull requests",
      );
      if (open.length > 1) throw new Error("Multiple dev to main pull requests require reconciliation.");
      let number: number;
      if (open[0]) {
        if (open[0].headRefOid !== release.expectedDevSha || open[0].isDraft) {
          throw new Error("The existing Production pull request does not match authorized dev.");
        }
        number = open[0].number;
      } else {
        const created = await commands.run("gh", [
          "pr", "create", "--repo", input.repository,
          "--base", "main", "--head", "dev",
          "--title", `Promote dev ${release.expectedDevSha.slice(0, 12)} to Production`,
          "--body", "Regular merge for the exact inspected and explicitly authorized Production release candidate.",
        ]);
        number = pullRequestNumber(created.stdout);
      }
      await commands.run("gh", [
        "pr", "checks", String(number), "--repo", input.repository,
        "--required", "--watch", "--fail-fast",
      ]);
      const beforeMerge = await readBranches();
      if (
        beforeMerge.devSha !== release.expectedDevSha ||
        beforeMerge.mainSha !== release.expectedMainSha
      ) {
        throw new Error("dev or main changed while Production checks were running.");
      }
      const merged = await commands.run("gh", [
        "api", "--method", "PUT", `repos/${input.repository}/pulls/${number}/merge`,
        "-f", "merge_method=merge", "-f", `sha=${release.expectedDevSha}`,
      ]);
      const merge = parseJson<{ merged?: boolean; sha?: string }>(merged.stdout, "Production merge");
      if (!merge.merged || !merge.sha || !/^[0-9a-f]{40}$/.test(merge.sha)) {
        throw new Error("GitHub did not complete the authorized regular Production merge.");
      }
      const [devCommit, mergeCommit] = await Promise.all([
        commands.run("gh", ["api", `repos/${input.repository}/git/commits/${release.expectedDevSha}`]),
        commands.run("gh", ["api", `repos/${input.repository}/git/commits/${merge.sha}`]),
      ]);
      const devTree = parseJson<{ tree?: { sha?: string } }>(devCommit.stdout, "dev tree").tree?.sha;
      const mainFact = parseJson<{
        parents?: Array<{ sha?: string }>;
        tree?: { sha?: string };
      }>(mergeCommit.stdout, "main tree");
      if (
        !devTree || mainFact.tree?.sha !== devTree ||
        mainFact.parents?.[0]?.sha !== release.expectedMainSha ||
        mainFact.parents?.[1]?.sha !== release.expectedDevSha
      ) {
        throw new Error("The regular-merged main tree does not match the authorized dev tree.");
      }
      return {
        mainSha: merge.sha,
        mergeSha: merge.sha,
        runtimeFingerprint: release.expectedRuntimeFingerprint,
      };
    },
  };
}

export const PRODUCTION_REQUIRED_CHECKS = [
  "ci",
  "verification-system-browser-gate",
  "verification-lifecycle-gate",
] as const;

export function createProductionReleaseEvidenceAdapter(input: {
  attestationId: string;
  attestationMetadataPath: string;
  bundlePath: string;
  commands?: ProductionReleaseCommandRunner;
  cwd: string;
  env: NodeJS.ProcessEnv;
  inspectedUrl: string;
  receiptPath: string;
}) : ProductionPromotionAdapters["evidence"] {
  const commands = input.commands ?? systemCommands;
  return {
    async load(identity) {
      if (identity.attestationId !== input.attestationId) return undefined;
      const attestation = parseJson<{ id?: string; url?: string }>(
        await readFile(input.attestationMetadataPath, "utf8"),
        "Production attestation identity",
      );
      const repository = requiredEnvironment(input.env, "GITHUB_REPOSITORY");
      const expectedAttestationUrl =
        `${requiredEnvironment(input.env, "GITHUB_SERVER_URL")}/${repository}/attestations/${input.attestationId}`;
      if (
        attestation.id !== input.attestationId ||
        attestation.url !== expectedAttestationUrl
      ) return undefined;
      const receipt = await readStagedProductionReceipt(input.receiptPath);
      if (receipt.deployment.id !== identity.deploymentId) return undefined;
      const runnerTemp = requiredEnvironment(input.env, "RUNNER_TEMP");
      const subjectPath = resolve(runnerTemp, "production-release-subject.json");
      const reconstructed = await reconstructStagedProductionReceipt({
        cwd: input.cwd,
        env: input.env,
        receiptPath: input.receiptPath,
        subjectPath,
        workflowRun: receipt.workflowRun,
      });
      await verifyStagedProductionAttestation({
        attestationId: input.attestationId,
        bundlePath: input.bundlePath,
        cwd: input.cwd,
        env: input.env,
        receiptPath: input.receiptPath,
        subjectPath,
      });
      const pullsResult = await commands.run("gh", [
        "api",
        `repos/${repository}/commits/${receipt.source.candidateSha}/pulls`,
      ]);
      const sourcePullRequests = parseJson<Array<{
        base?: { ref?: string };
        head?: { sha?: string };
        merge_commit_sha?: string;
        merged_at?: string | null;
      }>>(pullsResult.stdout, "Production source pull requests");
      const sourcePullRequest = sourcePullRequests.find((pullRequest) => (
        pullRequest.base?.ref === "dev" &&
        pullRequest.merge_commit_sha === receipt.source.candidateSha &&
        Boolean(pullRequest.merged_at) &&
        /^[0-9a-f]{40}$/.test(pullRequest.head?.sha ?? "")
      ));
      const checksSha = sourcePullRequest?.head?.sha ?? receipt.source.candidateSha;
      const checksResult = await commands.run("gh", [
        "api", `repos/${repository}/commits/${checksSha}/check-runs?per_page=100`,
      ]);
      const checks = parseJson<{
        check_runs?: Array<{ conclusion?: string | null; name?: string }>;
      }>(checksResult.stdout, "Production required checks").check_runs ?? [];
      const requiredChecks = PRODUCTION_REQUIRED_CHECKS.map((name) => {
        const check = checks.find((candidate) => candidate.name === name);
        const conclusion = check?.conclusion;
        return {
          conclusion: conclusion === "success"
            ? "success" as const
            : conclusion === "failure"
              ? "failure" as const
              : conclusion === "cancelled"
                ? "cancelled" as const
                : "pending" as const,
          name,
        };
      });
      return {
        attestation: {
          id: input.attestationId,
          url: attestation.url,
        },
        current: reconstructed.current,
        inspected: input.inspectedUrl === receipt.deployment.url,
        receipt,
        requiredChecks,
        signedPredicate: structuredClone(receipt),
      };
    },
  };
}

export function createUrgentReconciliationAdapter(input: {
  commands?: ProductionReleaseCommandRunner;
  repository: string;
}): ProductionRollbackAdapters["reconciliation"] {
  const commands = input.commands ?? systemCommands;
  return {
    async createUrgent(reconciliation) {
      const body = [
        "## Production rollback reconciliation",
        "",
        reconciliation.reason,
        "",
        `Served deployment restored first: \`${reconciliation.servedDeployment.id}\` (${reconciliation.servedDeployment.url})`,
        `Authorized release dev: \`${reconciliation.devSha}\``,
        `Regular-merged main: \`${reconciliation.mainSha}\``,
        "",
        "Reconcile the served deployment, main, and dev with additive history. Do not rebuild, amend, reset, or force-push during rollback.",
      ].join("\n");
      const result = await commands.run("gh", [
        "issue", "create", "--repo", input.repository,
        "--title", "Urgent: reconcile Production after exact deployment rollback",
        "--body", body,
        "--label", "type:ticket",
        "--label", "workflow:urgent",
        "--label", "ready-for-agent",
      ]);
      const url = result.stdout.trim();
      const number = Number(url.match(/\/issues\/(\d+)\/?$/)?.[1]);
      if (!Number.isSafeInteger(number) || number <= 0) {
        throw new Error("GitHub did not return the urgent reconciliation issue.");
      }
      return { number, url };
    },
  };
}

function assertTrustedProductionContext(env: NodeJS.ProcessEnv): void {
  const operator = env.PRODUCTION_OPERATOR?.trim() || "brandon-y-lee";
  if (
    env.CI !== "true" ||
    env.GITHUB_ACTIONS !== "true" ||
    env.GITHUB_EVENT_NAME !== "workflow_dispatch" ||
    env.GITHUB_REPOSITORY !== "brandon-y-lee/mei-pelle" ||
    env.GITHUB_ACTOR !== operator
  ) {
    throw new Error("Production release requires an explicit trusted Operator workflow dispatch.");
  }
}

function namedArguments(argv: string[], required: readonly string[]): Record<string, string> {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || !value || value.startsWith("--") || values.has(key)) {
      throw new Error("Production release requires unique named value arguments.");
    }
    values.set(key, value);
  }
  if (values.size !== required.length || required.some((key) => !values.get(key))) {
    throw new Error("Production release arguments are incomplete or unknown.");
  }
  return Object.fromEntries(values);
}

function releaseAdapters(input: {
  attestationId: string;
  attestationMetadataPath: string;
  bundlePath: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
  inspectedUrl: string;
  receiptPath: string;
}): ProductionPromotionAdapters {
  const repository = requiredEnvironment(input.env, "GITHUB_REPOSITORY");
  const commands = systemCommands;
  const issueAdapter = createOperationalVerificationIssueAdapter({
    commands: {
      async run(args) {
        const result = await commands.run("gh", args);
        return { stdout: result.stdout };
      },
    },
    repository,
    runUrl: `${requiredEnvironment(input.env, "GITHUB_SERVER_URL")}/${repository}/actions/runs/${requiredEnvironment(input.env, "GITHUB_RUN_ID")}`,
  });
  return {
    clock: { now: () => new Date().toISOString() },
    deployment: createVercelProductionReleaseAdapter({
      cwd: input.cwd,
      env: input.env,
    }),
    evidence: createProductionReleaseEvidenceAdapter({
      ...input,
      commands,
    }),
    repository: createGitHubProductionRepositoryAdapter({ commands, repository }),
    scheduled: { findActive: () => issueAdapter.findActive() },
  };
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value)}\n`, { encoding: "utf8", mode: 0o600 });
}

async function writeSummary(env: NodeJS.ProcessEnv, heading: string, value: unknown) {
  const summary = requiredEnvironment(env, "GITHUB_STEP_SUMMARY");
  await appendFile(summary, `## ${heading}\n\n\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\`\n`, "utf8");
}

function parsePromotionAudit(value: unknown): ProductionPromotionAudit {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Production promotion audit is malformed.");
  }
  const audit = value as ProductionPromotionAudit;
  if (
    audit.mergeMethod !== "merge" || audit.rebuild !== false ||
    !/^[0-9a-f]{40}$/.test(audit.devSha) || !/^[0-9a-f]{40}$/.test(audit.mainSha) ||
    !audit.previousDeployment?.id || !audit.promotedDeployment?.id ||
    !audit.previousDeployment.url || !audit.promotedDeployment.url
  ) {
    throw new Error("Production promotion audit does not identify an exact no-rebuild release.");
  }
  return audit;
}

export async function runProductionReleaseCommand(input: {
  argv: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
}) {
  assertTrustedProductionContext(input.env);
  const operation = input.argv[0];
  if (operation === "rollback") {
    const args = namedArguments(input.argv.slice(1), ["--audit-path", "--reason"]);
    const audit = parsePromotionAudit(parseJson(
      await readFile(args["--audit-path"]!, "utf8"),
      "Production promotion audit",
    ));
    const deployment = createVercelProductionReleaseAdapter({ cwd: input.cwd, env: input.env });
    const result = await runProductionRollback({
      audit,
      reason: args["--reason"]!,
    }, {
      deployment,
      reconciliation: createUrgentReconciliationAdapter({
        repository: requiredEnvironment(input.env, "GITHUB_REPOSITORY"),
      }),
    });
    if (result.outcome !== "rolled-back") {
      throw new Error(`Production rollback failed closed: ${result.reason}.`);
    }
    await writeSummary(input.env, "Production rollback completed", result);
    return result;
  }
  if (operation !== "plan" && operation !== "promote") {
    throw new Error("Production release operation must be plan, promote, or rollback.");
  }
  const args = namedArguments(input.argv.slice(1), [
    "--attestation-id", "--attestation-metadata-path", "--bundle-path", "--deployment-id",
    "--inspection-url", "--output-path", "--receipt-path",
  ]);
  const adapters = releaseAdapters({
    attestationId: args["--attestation-id"]!,
    attestationMetadataPath: args["--attestation-metadata-path"]!,
    bundlePath: args["--bundle-path"]!,
    cwd: input.cwd,
    env: input.env,
    inspectedUrl: args["--inspection-url"]!,
    receiptPath: args["--receipt-path"]!,
  });
  if (operation === "plan") {
    const plan = await prepareProductionPromotion({
      attestationId: args["--attestation-id"]!,
      deploymentId: args["--deployment-id"]!,
    }, adapters);
    await writeJson(args["--output-path"]!, plan);
    await writeSummary(input.env, "Immutable Production release plan", plan);
    if (plan.outcome !== "authorization-required") {
      throw new Error(`Production release plan is blocked: ${plan.reason}.`);
    }
    return plan;
  }
  const result = await runProductionPromotion({
    attestationId: args["--attestation-id"]!,
    authorization: input.env.PRODUCTION_AUTHORIZATION,
    deploymentId: args["--deployment-id"]!,
  }, adapters);
  if (result.outcome !== "promoted") {
    const reason = "reason" in result ? result.reason : result.outcome;
    throw new Error(`Production promotion failed closed: ${reason}.`);
  }
  await writeJson(args["--output-path"]!, result.audit);
  await writeSummary(input.env, "Production promotion completed", result.audit);
  return result;
}

if (process.argv[1]?.endsWith("production-release-command.ts")) {
  runProductionReleaseCommand({
    argv: process.argv.slice(2),
    cwd: process.cwd(),
    env: process.env,
  }).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Production release failed.");
    process.exitCode = 1;
  });
}
