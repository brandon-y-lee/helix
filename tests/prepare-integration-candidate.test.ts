import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

import { prepareIntegrationCandidate } from "@/scripts/github/prepare-integration-candidate";

const fixtures: string[] = [];

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function fixture(): { root: string; baseSha: string; headSha: string } {
  const root = mkdtempSync(join(tmpdir(), "mei-pelle-integration-candidate-"));
  fixtures.push(root);
  git(root, "init", "-b", "dev");
  git(root, "config", "user.name", "Integration Test");
  git(root, "config", "user.email", "integration@example.test");
  writeFileSync(join(root, "base.txt"), "base\n");
  git(root, "add", "base.txt");
  git(root, "commit", "-m", "Base");
  const baseSha = git(root, "rev-parse", "HEAD");
  git(root, "switch", "-c", "candidate");
  writeFileSync(join(root, "candidate.txt"), "candidate\n");
  git(root, "add", "candidate.txt");
  git(root, "commit", "-m", "Candidate");
  const headSha = git(root, "rev-parse", "HEAD");
  git(root, "switch", "dev");
  return { root, baseSha, headSha };
}

afterEach(() => {
  while (fixtures.length) rmSync(fixtures.pop()!, { recursive: true, force: true });
});

describe("prepareIntegrationCandidate", () => {
  it("checks out one synthetic merge with the exact frozen head and dev parents", async () => {
    const { root, baseSha, headSha } = fixture();

    const result = await prepareIntegrationCandidate(
      { devBase: baseSha, candidateHead: headSha },
      { cwd: root },
    );

    expect(git(root, "rev-parse", "HEAD")).toBe(result.candidateSha);
    expect(git(root, "show", "-s", "--format=%P", "HEAD").split(" ")).toEqual([
      baseSha,
      headSha,
    ]);
    expect(git(root, "show", "HEAD:base.txt")).toBe("base");
    expect(git(root, "show", "HEAD:candidate.txt")).toBe("candidate");
  });

  it("materializes the candidate in a separate worktree without replacing the trusted runner", async () => {
    const { root, baseSha, headSha } = fixture();
    const trustedSha = git(root, "rev-parse", "HEAD");
    const candidatePath = join(root, "candidate-worktree");

    const result = await prepareIntegrationCandidate(
      { devBase: baseSha, candidateHead: headSha },
      { cwd: root, outputPath: candidatePath },
    );

    expect(git(root, "rev-parse", "HEAD")).toBe(trustedSha);
    expect(git(candidatePath, "rev-parse", "HEAD")).toBe(result.candidateSha);
    expect(git(candidatePath, "show", "HEAD:candidate.txt")).toBe("candidate");
  });
});
