import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { createVercelStagedDeploymentAdapter } from "@/scripts/github/staged-production-verification-command";

describe("staged Production verification command", () => {
  it("exposes one manual read-only verification job and a separate Production receipt signer", async () => {
    const [workflow, config, packageJson] = await Promise.all([
      readFile(resolve(process.cwd(), ".github/workflows/staged-production-verification.yml"), "utf8"),
      readFile(resolve(process.cwd(), "vercel.json"), "utf8"),
      readFile(resolve(process.cwd(), "package.json"), "utf8"),
    ]);

    expect(JSON.parse(config)).toEqual({
      $schema: "https://openapi.vercel.sh/vercel.json",
      git: { deploymentEnabled: false },
    });
    expect(JSON.parse(packageJson).scripts["verification:staged-production"]).toBe(
      "tsx scripts/github/staged-production-verification-command.ts",
    );
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("source_sha:");
    expect(workflow).toContain("permissions:\n  contents: read");
    expect(workflow).toContain("verification:staged-production --");
    expect(workflow).toContain("--candidate-sha \"$SOURCE_SHA\"");
    expect(workflow).toContain("uses: actions/attest@v4");
    expect(workflow).toContain(
      "predicate-type: https://mei-pelle.com/attestations/staged-production-verification/v1",
    );
    expect(workflow).toContain("retention-days: 30");
    expect(workflow).toContain("retention-days: 90");
    expect(workflow).not.toContain("vercel promote");
  });

  it("uses Vercel's domainless Production contract and records the immutable deployment identity", async () => {
    const commands: Array<{ args: string[]; command: string }> = [];
    const requests: string[] = [];
    const adapter = createVercelStagedDeploymentAdapter({
      cwd: "/tmp/mei-pelle-candidate",
      env: {
        NODE_ENV: "production",
        VERCEL_ORG_ID: "team_mei_pelle",
        VERCEL_PROJECT_ID: "prj_mei_pelle",
        VERCEL_TOKEN: "secret-not-for-output",
      },
      fetch: async (url) => {
        requests.push(String(url));
        return new Response(JSON.stringify({
          alias: [],
          id: "dpl_staged_57",
          readyState: "READY",
          target: "production",
          url: "mei-pelle-staged-57.vercel.app",
        }), { status: 200 });
      },
      run: async (command, args) => {
        commands.push({ args, command });
        return { stderr: "", stdout: "https://mei-pelle-staged-57.vercel.app\n" };
      },
    });

    const created = await adapter.create({
      candidateSha: "c".repeat(40),
      skipDomain: true,
      target: "production",
    });
    const inspected = await adapter.inspect(created.id);

    expect(commands).toEqual([{
      args: [
        "exec",
        "vercel",
        "deploy",
        "--prod",
        "--skip-domain",
        "--yes",
        "--no-color",
        "--meta",
        `githubCommitSha=${"c".repeat(40)}`,
      ],
      command: "pnpm",
    }]);
    expect(commands[0].args).not.toContain("promote");
    expect(JSON.stringify(commands)).not.toContain("secret-not-for-output");
    expect(requests).toEqual([
      "https://api.vercel.com/v13/deployments/mei-pelle-staged-57.vercel.app?teamId=team_mei_pelle",
      "https://api.vercel.com/v13/deployments/dpl_staged_57?teamId=team_mei_pelle",
    ]);
    expect(created).toEqual({
      id: "dpl_staged_57",
      target: "production",
      url: "https://mei-pelle-staged-57.vercel.app",
    });
    expect(inspected).toEqual({
      ...created,
      productionDomains: [],
      ready: true,
    });
  });
});
