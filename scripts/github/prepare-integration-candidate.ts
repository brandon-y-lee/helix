import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

const execFileAsync = promisify(execFile);
const COMMIT_SHA = /^[0-9a-f]{40}$/;

type FrozenGitInputs = {
  devBase: string;
  candidateHead: string;
};

type PrepareOptions = {
  cwd?: string;
};

async function git(cwd: string, args: string[], env?: Record<string, string>): Promise<string> {
  const result = await execFileAsync("git", args, {
    cwd,
    encoding: "utf8",
    env: env ? { ...process.env, ...env } : process.env,
  });
  return result.stdout.trim();
}

function requireCommitSha(value: string, name: string): void {
  if (!COMMIT_SHA.test(value)) throw new Error(`${name} must be one exact lowercase commit SHA`);
}

export async function prepareIntegrationCandidate(
  inputs: FrozenGitInputs,
  options: PrepareOptions = {},
): Promise<{ candidateSha: string }> {
  requireCommitSha(inputs.devBase, "dev base");
  requireCommitSha(inputs.candidateHead, "candidate head");
  const cwd = options.cwd ?? process.cwd();

  await git(cwd, ["cat-file", "-e", `${inputs.devBase}^{commit}`]);
  await git(cwd, ["cat-file", "-e", `${inputs.candidateHead}^{commit}`]);
  const treeSha = await git(cwd, [
    "merge-tree",
    "--write-tree",
    inputs.devBase,
    inputs.candidateHead,
  ]);
  requireCommitSha(treeSha, "candidate tree");
  const candidateSha = await git(
    cwd,
    [
      "commit-tree",
      treeSha,
      "-p",
      inputs.devBase,
      "-p",
      inputs.candidateHead,
      "-m",
      `Verify candidate ${inputs.candidateHead} on dev ${inputs.devBase}`,
    ],
    {
      GIT_AUTHOR_NAME: "Mei Pelle Integration Verification",
      GIT_AUTHOR_EMAIL: "integration@mei-pelle.invalid",
      GIT_COMMITTER_NAME: "Mei Pelle Integration Verification",
      GIT_COMMITTER_EMAIL: "integration@mei-pelle.invalid",
    },
  );
  requireCommitSha(candidateSha, "prepared candidate");
  await git(cwd, ["checkout", "--detach", candidateSha]);
  return { candidateSha };
}

function parseCli(argv: string[]): FrozenGitInputs {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag?.startsWith("--") || !value) throw new Error("expected --candidate-head and --dev-base");
    values.set(flag, value);
  }
  const candidateHead = values.get("--candidate-head");
  const devBase = values.get("--dev-base");
  if (!candidateHead || !devBase || values.size !== 2) {
    throw new Error("expected exactly --candidate-head and --dev-base");
  }
  return { candidateHead, devBase };
}

async function main(): Promise<void> {
  const result = await prepareIntegrationCandidate(parseCli(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  main().catch((error: unknown) => {
    process.stderr.write(`integration-candidate: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
