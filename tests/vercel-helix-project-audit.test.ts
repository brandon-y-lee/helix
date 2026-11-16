import { describe, expect, it, vi } from "vitest";
import {
  loadVercelHelixAuditConfig,
  runVercelHelixAudit,
} from "@/scripts/vercel/helix-project-audit";

const config = {
  token: "secret-token",
  teamId: "team_helix",
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
      "VERCEL_ACCESS_TOKEN or VERCEL_TOKEN",
    );
  });

  it("verifies the project, repository, branch domain, and active environment names", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(
        response({
          id: "prj_N9nyPL9SixJHOROIovS8PDQ9aKny",
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
        id: "prj_N9nyPL9SixJHOROIovS8PDQ9aKny",
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
        response({
          envs: [
            { key: formerEnvironmentKey, value: "do-not-report" },
            { key: "HELIX_VERIFICATION_ADAPTER", value: "do-not-report" },
          ],
        }),
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
      "verification-adapter-in-remote-environment",
    ]);
    expect(JSON.stringify(report)).not.toContain("do-not-report");
  });

  it("loads every domain and environment page before deciding", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/domains")) {
        return url.searchParams.has("until")
          ? response({
              domains: [
                {
                  name: "helixskin.vercel.app",
                  gitBranch: "dev",
                  verified: true,
                },
              ],
              pagination: { next: null },
            })
          : response({ domains: [], pagination: { next: 1234 } });
      }
      if (url.pathname.endsWith("/env")) {
        return url.searchParams.has("until")
          ? response({
              envs: [{ key: "HELIX_VERIFICATION_BASE_URL", value: "hidden" }],
              pagination: { next: null },
            })
          : response({
              envs: [{ key: "NEXT_PUBLIC_SITE_URL", value: "hidden" }],
              pagination: { next: "next-page" },
            });
      }
      return response({
        id: "prj_N9nyPL9SixJHOROIovS8PDQ9aKny",
        name: "helix",
        link: { org: "brandon-y-lee", repo: "helix" },
      });
    });

    const report = await runVercelHelixAudit(config, fetchImpl);

    expect(report.environmentKeys).toEqual([
      "HELIX_VERIFICATION_BASE_URL",
      "NEXT_PUBLIC_SITE_URL",
    ]);
    expect(report.findings).toContain("verification-adapter-in-remote-environment");
    expect(fetchImpl).toHaveBeenCalledTimes(5);
    expect(
      fetchImpl.mock.calls.filter(([input]) =>
        new URL(String(input)).searchParams.has("until"),
      ),
    ).toHaveLength(2);
  });
});
