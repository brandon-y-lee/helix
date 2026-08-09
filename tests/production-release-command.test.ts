import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  createGitHubProductionRepositoryAdapter,
  createVercelProductionReleaseAdapter,
} from "@/scripts/github/production-release-command";

const runtimeFingerprint = `sha256:${"1".repeat(64)}` as const;

describe("Production release command adapters", () => {
  it("promotes and restores exact Vercel deployments without a build command", async () => {
    const commands: Array<{ args: string[]; command: string }> = [];
    const requests: string[] = [];
    let current = {
      id: "dpl_previous",
      target: "production",
      url: "mei-pelle-previous.vercel.app",
    };
    const adapter = createVercelProductionReleaseAdapter({
      cwd: "/tmp/trusted-release",
      env: {
        NEXT_PUBLIC_SITE_URL: "https://mei-pelle.vercel.app",
        NODE_ENV: "test",
        VERCEL_ORG_ID: "team_mei_pelle",
        VERCEL_TOKEN: "secret-not-for-output",
      },
      fetch: async (url) => {
        requests.push(String(url));
        return new Response(JSON.stringify(current), { status: 200 });
      },
      run: async (command, args) => {
        commands.push({ args, command });
        if (args.includes("promote")) {
          current = {
            id: "dpl_staged_58",
            target: "production",
            url: "mei-pelle-staged-58.vercel.app",
          };
        } else if (args.includes("rollback")) {
          current = {
            id: "dpl_previous",
            target: "production",
            url: "mei-pelle-previous.vercel.app",
          };
        }
        return { stderr: "", stdout: "completed" };
      },
    });

    await expect(adapter.current()).resolves.toMatchObject({ id: "dpl_previous" });
    await expect(adapter.promote({
      id: "dpl_staged_58",
      target: "production",
      url: "https://mei-pelle-staged-58.vercel.app",
    }, { rebuild: false })).resolves.toMatchObject({ id: "dpl_staged_58" });
    await expect(adapter.restore({
      id: "dpl_previous",
      target: "production",
      url: "https://mei-pelle-previous.vercel.app",
    }, { rebuild: false })).resolves.toMatchObject({ id: "dpl_previous" });

    expect(commands.map(({ args }) => args.slice(1, 4))).toEqual([
      ["vercel", "promote", "dpl_staged_58"],
      ["vercel", "rollback", "dpl_previous"],
    ]);
    expect(commands.every(({ args }) => args.includes("--yes") && args.includes("--timeout=5m"))).toBe(true);
    expect(JSON.stringify(commands)).not.toContain("deploy");
    expect(JSON.stringify(commands)).not.toContain("secret-not-for-output");
    expect(requests).toEqual(Array(3).fill(
      "https://api.vercel.com/v13/deployments/mei-pelle.vercel.app?teamId=team_mei_pelle",
    ));
  });

  it("reconciles Vercel's non-cancelling command timeout against the served deployment", async () => {
    let current = {
      id: "dpl_previous",
      target: "production",
      url: "mei-pelle-previous.vercel.app",
    };
    const adapter = createVercelProductionReleaseAdapter({
      cwd: "/tmp/trusted-release",
      env: {
        NEXT_PUBLIC_SITE_URL: "https://mei-pelle.vercel.app",
        NODE_ENV: "test",
        VERCEL_ORG_ID: "team_mei_pelle",
        VERCEL_TOKEN: "secret-not-for-output",
      },
      fetch: async () => new Response(JSON.stringify(current), { status: 200 }),
      run: async () => {
        current = {
          id: "dpl_staged_58",
          target: "production",
          url: "mei-pelle-staged-58.vercel.app",
        };
        throw new Error("promotion command timed out while provider operation continued");
      },
    });

    await expect(adapter.promote({
      id: "dpl_staged_58",
      target: "production",
      url: "https://mei-pelle-staged-58.vercel.app",
    }, { rebuild: false })).resolves.toMatchObject({ id: "dpl_staged_58" });
  });

  it("uses an exact-head regular pull-request merge and verifies the merge tree", async () => {
    const devSha = "d".repeat(40);
    const mainSha = "a".repeat(40);
    const mergeSha = "e".repeat(40);
    const calls: string[][] = [];
    const adapter = createGitHubProductionRepositoryAdapter({
      commands: {
        async run(command, args) {
          expect(command).toBe("gh");
          calls.push(args);
          const joined = args.join(" ");
          if (joined.includes("git/ref/heads/dev")) return { stderr: "", stdout: JSON.stringify({ object: { sha: devSha } }) };
          if (joined.includes("git/ref/heads/main")) return { stderr: "", stdout: JSON.stringify({ object: { sha: mainSha } }) };
          if (joined.startsWith("pr list")) return { stderr: "", stdout: "[]" };
          if (joined.startsWith("pr create")) return { stderr: "", stdout: "https://github.com/brandon-y-lee/mei-pelle/pull/158\n" };
          if (joined.startsWith("pr checks")) return { stderr: "", stdout: "" };
          if (joined.includes("pulls/158/merge")) return { stderr: "", stdout: JSON.stringify({ merged: true, sha: mergeSha }) };
          if (joined.includes(`git/commits/${devSha}`)) return { stderr: "", stdout: JSON.stringify({ tree: { sha: "tree-release" } }) };
          if (joined.includes(`git/commits/${mergeSha}`)) return { stderr: "", stdout: JSON.stringify({
            parents: [{ sha: mainSha }, { sha: devSha }],
            tree: { sha: "tree-release" },
          }) };
          throw new Error(`Unexpected command: ${joined}`);
        },
      },
      repository: "brandon-y-lee/mei-pelle",
    });

    await expect(adapter.mergeDevToMain({
      expectedDevSha: devSha,
      expectedMainSha: mainSha,
      expectedRuntimeFingerprint: runtimeFingerprint,
      method: "merge",
    })).resolves.toEqual({ mainSha: mergeSha, mergeSha, runtimeFingerprint });

    expect(calls).toContainEqual(expect.arrayContaining([
      "--method", "PUT", "repos/brandon-y-lee/mei-pelle/pulls/158/merge",
      "-f", "merge_method=merge", "-f", `sha=${devSha}`,
    ]));
    expect(calls).toContainEqual(expect.arrayContaining(["pr", "checks", "158", "--required", "--watch"]));
  });

  it("defines separate read-only planning, authorized promotion, and rollback jobs", async () => {
    const [promotion, rollback, packageJson] = await Promise.all([
      readFile(resolve(process.cwd(), ".github/workflows/production-promotion.yml"), "utf8"),
      readFile(resolve(process.cwd(), ".github/workflows/production-rollback.yml"), "utf8"),
      readFile(resolve(process.cwd(), "package.json"), "utf8"),
    ]);
    const scripts = JSON.parse(packageJson).scripts as Record<string, string>;

    expect(scripts["production:release"]).toBe("tsx scripts/github/production-release-command.ts");
    expect(promotion).toContain("workflow_dispatch:");
    expect(promotion).toContain("operation:");
    expect(promotion).toContain("authorization:");
    expect(promotion).toContain("production:release -- plan");
    expect(promotion).toContain("production:release -- promote");
    expect(promotion).toContain("contents: write");
    expect(promotion).toContain("pull-requests: write");
    expect(promotion).not.toContain("vercel deploy");
    expect(rollback).toContain("production:release -- rollback");
    expect(rollback).toContain("issues: write");
    expect(rollback).not.toContain("git reset");
    expect(rollback).not.toContain("force-push");
  });
});
