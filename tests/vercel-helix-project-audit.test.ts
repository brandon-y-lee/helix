import { describe, expect, it, vi } from "vitest";
import {
  loadVercelHelixAuditConfig,
  runVercelHelixAudit,
} from "@/scripts/vercel/helix-project-audit";

const config = {
  token: "secret-token",
  projectId: "prj_helix",
  teamId: "team_helix",
  expectedProjectName: "helix",
  expectedRepository: "brandon-y-lee/helix",
  expectedDomain: "helixskin.vercel.app",
  expectedBranch: "dev",
} as const;

function response(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("Vercel Helix project audit", () => {
  it("requires explicit credentials and project authority", () => {
    expect(() => loadVercelHelixAuditConfig({} as NodeJS.ProcessEnv)).toThrow(
      "VERCEL_ACCESS_TOKEN or VERCEL_TOKEN, VERCEL_PROJECT_ID",
    );
  });

  it("verifies the project, repository, branch domain, and active environment names", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(
        response({
          id: "prj_helix",
          name: "helix",
          link: { org: "brandon-y-lee", repo: "helix" },
        }),
      )
      .mockResolvedValueOnce(
        response({
          domains: [
            {
              name: "helixskin.vercel.app",
              gitBranch: "dev",
              verified: true,
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        response({
          envs: [
            { key: "NEXT_PUBLIC_SITE_URL", value: "encrypted" },
            { key: "STRIPE_WEBHOOK_SECRET", value: "encrypted" },
          ],
        }),
      );

    const report = await runVercelHelixAudit(config, fetchImpl);

    expect(report).toEqual({
      ok: true,
      project: {
        id: "prj_helix",
        name: "helix",
        repository: "brandon-y-lee/helix",
      },
      domain: {
        name: "helixskin.vercel.app",
        gitBranch: "dev",
        verified: true,
      },
      environmentKeys: ["NEXT_PUBLIC_SITE_URL", "STRIPE_WEBHOOK_SECRET"],
      findings: [],
    });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    for (const [, init] of fetchImpl.mock.calls) {
      expect(init).toEqual({
        headers: { authorization: "Bearer secret-token" },
      });
    }
  });

  it("fails closed on identity drift without exposing environment values", async () => {
    const formerProject = ["mei", "pelle"].join("-");
    const formerEnvironmentKey = ["MEI", "PELLE", "SITE_URL"].join("_");
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(
        response({
          id: "wrong",
          name: formerProject,
          link: { org: "other", repo: "repository" },
        }),
      )
      .mockResolvedValueOnce(
        response({
          domains: [
            {
              name: "helixskin.vercel.app",
              gitBranch: "main",
              verified: false,
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        response({ envs: [{ key: formerEnvironmentKey, value: "do-not-report" }] }),
      );

    const report = await runVercelHelixAudit(config, fetchImpl);

    expect(report.ok).toBe(false);
    expect(report.findings).toEqual([
      "project-id-mismatch",
      "project-name-mismatch",
      "repository-link-mismatch",
      "canonical-domain-branch-mismatch",
      "canonical-domain-unverified",
      "retired-identity-in-active-metadata",
    ]);
    expect(JSON.stringify(report)).not.toContain("do-not-report");
  });
});
