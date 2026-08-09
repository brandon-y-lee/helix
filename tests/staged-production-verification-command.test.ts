import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import {
  createVercelStagedDeploymentAdapter,
  requireProductionSiteUrl,
  verifyStagedProductionAttestation,
} from "@/scripts/github/staged-production-verification-command";
import { STAGED_PRODUCTION_RECEIPT_PREDICATE_TYPE } from "@/scripts/github/staged-production-verification";

describe("staged Production verification command", () => {
  it.each([
    "http://mei-pelle.vercel.app",
    "https://localhost",
    "https://foo.localhost",
    "https://127.0.0.2",
    "https://0.0.0.0",
    "https://[::1]",
    "https://[fe90::1]",
    "https://[::ffff:127.0.0.1]",
    "https://internal.local",
  ])("rejects non-Production public site origin %s", (siteUrl) => {
    expect(() => requireProductionSiteUrl({
      NEXT_PUBLIC_SITE_URL: siteUrl,
      NODE_ENV: "test",
    })).toThrow("exact HTTPS Production site URL");
  });

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
    expect(workflow).toContain("reconstruct-receipt");
    expect(workflow).toContain("verify-attestation");
    expect(workflow.match(/NEXT_PUBLIC_SITE_URL: \$\{\{ vars\.NEXT_PUBLIC_SITE_URL \}\}/g)).toHaveLength(2);
    expect(workflow).toContain("if: ${{ failure() || cancelled() }}");
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
        NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
        NEXT_PUBLIC_SITE_URL: "https://mei-pelle.vercel.app",
        VERCEL_ORG_ID: "team_mei_pelle",
        VERCEL_PROJECT_ID: "prj_mei_pelle",
        VERCEL_TOKEN: "secret-not-for-output",
      },
      fetch: async (url) => {
        requests.push(String(url));
        return new Response(JSON.stringify({
          alias: [],
          id: "dpl_staged_57",
          meta: { githubCommitSha: "c".repeat(40) },
          readyState: "READY",
          target: "production",
          url: "mei-pelle-staged-57.vercel.app",
        }), { status: 200 });
      },
      readSourceIdentity: async (buildId) => ({
        artifact: {
          buildId,
          configurationFingerprint: `sha256:${"2".repeat(64)}`,
          runtimeFingerprint: `sha256:${"1".repeat(64)}`,
        },
        browsers: { chromium: "Chromium 1", webkit: "WebKit 1" },
        candidateSha: "c".repeat(40),
        planFingerprint: `sha256:${"3".repeat(64)}`,
        tools: { framework: "15", node: "v24", packageManager: "pnpm@9", playwright: "1" },
      }),
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

    expect(commands).toHaveLength(1);
    expect(commands[0]?.command).toBe("pnpm");
    expect(commands[0]?.args).toEqual(expect.arrayContaining([
      "exec", "vercel", "deploy", "--prod", "--skip-domain", "--yes", "--no-color",
      "--build-env", "NEXT_PUBLIC_SUPABASE_URL",
      "--env", "NEXT_PUBLIC_SUPABASE_URL",
      "--meta", `githubCommitSha=${"c".repeat(40)}`,
    ]));
    expect(commands[0]?.args.join(" ")).toContain("MEI_PELLE_VERIFICATION_BUILD_ID=");
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

  it("cryptographically verifies the exact prepared predicate and rejects tampering", async () => {
    const directory = await mkdtemp(resolve(tmpdir(), "mei-pelle-staged-attestation-"));
    const receipt = {
      artifact: {
        buildId: "build-57",
        configurationFingerprint: `sha256:${"2".repeat(64)}`,
        runtimeFingerprint: `sha256:${"1".repeat(64)}`,
      },
      browsers: { chromium: "Chromium 1", webkit: "WebKit 1" },
      catalog: { after: `sha256:${"3".repeat(64)}`, before: `sha256:${"3".repeat(64)}` },
      completedAt: "2026-08-08T22:30:00.000Z",
      deployment: {
        id: "dpl_staged_57", productionDomainAssignment: "none" as const,
        target: "production" as const, url: "https://mei-pelle-staged-57.vercel.app",
      },
      planFingerprint: `sha256:${"4".repeat(64)}`,
      predicateType: STAGED_PRODUCTION_RECEIPT_PREDICATE_TYPE,
      result: "passed" as const,
      source: { candidateSha: "c".repeat(40) },
      tools: { framework: "15", node: "v24", packageManager: "pnpm@9", playwright: "1" },
      workflowRun: "57-1",
    };
    const receiptPath = resolve(directory, "receipt.json");
    const subjectPath = resolve(directory, "subject.json");
    await Promise.all([
      writeFile(receiptPath, JSON.stringify(receipt)),
      writeFile(subjectPath, "subject"),
    ]);
    try {
      const result = await verifyStagedProductionAttestation({
        attestationId: "attestation-57", bundlePath: resolve(directory, "bundle.json"),
        cwd: directory, env: {
          GITHUB_REPOSITORY: "brandon-y-lee/mei-pelle", NODE_ENV: "test",
        },
        receiptPath, subjectPath,
        run: async (_command, args) => {
          expect(args).toEqual(expect.arrayContaining([
            "--predicate-type", STAGED_PRODUCTION_RECEIPT_PREDICATE_TYPE,
            "--signer-workflow",
            "brandon-y-lee/mei-pelle/.github/workflows/staged-production-verification.yml",
          ]));
          return { stderr: "", stdout: JSON.stringify([{
            verificationResult: { statement: { predicate: receipt } },
          }]) };
        },
      });
      expect(result).toEqual({ attestationId: "attestation-57", outcome: "verified" });

      await expect(verifyStagedProductionAttestation({
        attestationId: "attestation-57", bundlePath: resolve(directory, "bundle.json"),
        cwd: directory, env: {
          GITHUB_REPOSITORY: "brandon-y-lee/mei-pelle", NODE_ENV: "test",
        },
        receiptPath, subjectPath,
        run: async () => ({ stderr: "", stdout: JSON.stringify([{
          verificationResult: { statement: { predicate: {
            ...receipt, artifact: { ...receipt.artifact, buildId: "tampered" },
          } } },
        }]) }),
      })).rejects.toThrow("substituted or tampered");
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });
});
