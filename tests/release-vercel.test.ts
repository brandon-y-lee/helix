import { describe, expect, it } from "vitest";
import { createVercelRelease } from "../scripts/release/vercel.mjs";

const team = "team_uriJjJWNwpZnZHnIp5AiXuv0",
  project = "prj_N9nyPL9SixJHOROIovS8PDQ9aKny";
const repo = 1280166759;
const www = "www.helixskin.us",
  apex = "helixskin.us",
  dev = "helixskin.vercel.app";
const candidate = "dpl_Candidate",
  previous = "dpl_Previous",
  development = "dpl_Development";
const release = {
  candidateId: candidate,
  candidateSha: "a".repeat(40),
  previousId: previous,
  previousSha: "b".repeat(40),
};
type Job = {
  type: string;
  requestedAt: number;
  fromDeploymentId: string;
  toDeploymentId: string;
  jobStatus: string;
};
type Fault =
  | "team"
  | "repo"
  | "sha"
  | "preview"
  | "provenance"
  | "url"
  | "alias"
  | "extra-domain"
  | "hold"
  | "unknown-hold"
  | "unknown-job"
  | "rolling"
  | "partial"
  | "lost-response"
  | "timeout"
  | "racing-alias";
function fixture(fault?: Fault) {
  let wwwId = previous,
    apexId = previous;
  let job: Job | null = null;
  const writes: string[] = [];
  let projectReads = 0;
  const client = createVercelRelease({
    token: "fixture",
    repositoryId: String(repo),
    sleep: async () => {},
    pollAttempts: 4,
    fetchImpl: async (input: RequestInfo | URL, options?: RequestInit) => {
      const url = new URL(String(input)),
        path = url.pathname;
      expect(url.origin).toBe("https://api.vercel.com");
      expect(url.searchParams.get("teamId")).toBe(team);
      expect(new Headers(options?.headers).get("authorization")).toBe("Bearer fixture");
      expect(options?.redirect).toBe("error");
      if (options?.method === "POST") {
        const type = path.includes("/rollback/") ? "rollback" : "promote";
        const target = type === "rollback" ? previous : candidate;
        expect(path).toBe(`/${type === "rollback" ? "v1" : "v10"}/projects/${project}/${type}/${target}`);
        writes.push(type);
        job = {
          type,
          requestedAt: Date.now(),
          fromDeploymentId: wwwId,
          toDeploymentId: target,
          jobStatus: "pending",
        };
        if (fault === "timeout" || fault === "lost-response") throw new Error("sensitive upstream details");
        return new Response(null, { status: 201 });
      }
      if (path === `/v9/projects/${project}`) {
        expect(url.searchParams.get("rollbackInfo")).toBe("true");
        projectReads++;
        if (writes.length > 0 && job?.jobStatus === "in-progress") {
          wwwId = job.toDeploymentId;
          if (fault !== "partial" || job.type === "rollback") apexId = wwwId;
          job.jobStatus = "succeeded";
        } else if (
          writes.length > 0 &&
          job?.jobStatus === "pending" &&
          (!fault || fault === "lost-response" || job.type === "rollback")
        )
          job.jobStatus = "in-progress";
        if (fault === "partial" && job?.type === "promote") {
          wwwId = candidate;
          job.jobStatus = "failed";
        }
        return Response.json({
          id: project,
          accountId: fault === "team" ? "bad" : team,
          link: { type: "github", org: "brandon-y-lee", repo: "helix", repoId: repo, productionBranch: "main" },
          autoAssignCustomDomains: fault === "unknown-hold" ? undefined : fault === "hold",
          rollingRelease: fault === "rolling" ? { target: "production" } : null,
          lastAliasRequest: fault === "unknown-job" ? undefined : job,
          targets: { production: { id: wwwId } },
        });
      }
      if (path.endsWith("/domains")) {
        const domains = [www, apex, dev, ...(fault === "extra-domain" ? ["unexpected.example"] : [])].map(
          (name) => ({
            name,
            projectId: project,
            verified: true,
            gitBranch: name === dev ? "dev" : null,
            redirect: name === apex ? www : null,
            redirectStatusCode: name === apex ? 308 : null,
          }),
        );
        return Response.json({ domains, pagination: { count: domains.length, next: null, prev: null } });
      }
      if (path.startsWith("/v4/aliases/")) {
        const name = path.split("/").at(-1);
        const id = name === dev ? development : name === www ? wwwId : apexId;
        return Response.json({
          alias: name,
          projectId: project,
          deploymentId: fault === "alias" || (fault === "racing-alias" && projectReads > 1) ? "dpl_Strange" : id,
          deployment: { id },
          redirect: name === apex ? www : null,
          redirectStatusCode: name === apex ? 308 : null,
        });
      }
      if (path.startsWith("/v13/deployments/")) {
        const id = path.split("/").at(-1);
        expect(url.searchParams.get("withGitRepoInfo")).toBe("true");
        const sha = id === candidate ? release.candidateSha : release.previousSha;
        return Response.json({
          id,
          url: fault === "url" ? "bad.example/path" : `helix-${id === previous ? "old" : "new"}.vercel.app`,
          ownerId: team,
          projectId: project,
          readyState: "READY",
          source: "git",
          target: fault === "preview" ? "preview" : "production",
          gitSource:
            fault === "provenance"
              ? null
              : {
                  type: "github",
                  repoId: fault === "repo" ? 999 : repo,
                  ref: "main",
                  sha: fault === "sha" ? "c".repeat(40) : sha,
                },
          meta: { githubCommitSha: sha, githubCommitRef: "main", githubOrg: "brandon-y-lee", githubRepo: "helix" },
        });
      }
      throw new Error("Unexpected fixture request");
    },
  });
  return {
    client,
    writes,
    setJob: (value: Job) => {
      job = value;
    },
  };
}
describe("exact Vercel release", () => {
  it("requires the held Git project before merge and moves only the pinned aliases back and forth", async () => {
    const f = fixture();
    await f.client.assertHeldProject();
    const initial = await f.client.inspect(release);
    expect(initial).toMatchObject({
      previous: { id: previous, sha: release.previousSha },
      candidate: { id: candidate, url: "https://helix-new.vercel.app" },
      serving: "previous",
    });
    expect((await f.client.promote(release)).serving).toBe("candidate");
    expect((await f.client.promote(release)).serving).toBe("candidate");
    expect((await f.client.rollback(release)).serving).toBe("previous");
    expect(f.writes).toEqual(["promote", "rollback"]);
  });
  it.each([
    "team",
    "repo",
    "sha",
    "preview",
    "provenance",
    "url",
    "alias",
    "extra-domain",
    "hold",
    "unknown-hold",
    "unknown-job",
    "rolling",
  ] as const)("rejects %s before mutation", async (fault) => {
    const f = fixture(fault);
    await expect(f.client.promote(release)).rejects.toThrow();
    expect(f.writes).toEqual([]);
  });
  it("rejects a concurrent unrelated provider operation", async () => {
    const f = fixture();
    f.setJob({
      type: "promote",
      requestedAt: 1,
      fromDeploymentId: previous,
      toDeploymentId: "dpl_Strange",
      jobStatus: "in-progress",
    });
    await expect(f.client.promote(release)).rejects.toThrow();
    expect(f.writes).toEqual([]);
  });
  it.each(["partial", "timeout"] as const)(
    "leaves %s outcomes for reconciliation without replaying a write",
    async (fault) => {
      const f = fixture(fault);
      await expect(f.client.promote(release)).rejects.toThrow();
      await expect(f.client.promote(release)).rejects.toThrow();
      expect(f.writes).toEqual(["promote"]);
    },
  );
  it("confirms a successful promotion despite a lost POST response without issuing another request", async () => {
    const f = fixture("lost-response");
    expect((await f.client.promote(release)).serving).toBe("candidate");
    expect(f.writes).toEqual(["promote"]);
  });
  it("confirms only the same terminal unsuccessful promotion when all production targets still serve the prior build", async () => {
    const f = fixture();
    expect(await f.client.confirmedFailedPromotion(release)).toBe(false);
    const matching = {
      type: "promote",
      requestedAt: 1,
      fromDeploymentId: previous,
      toDeploymentId: candidate,
      jobStatus: "failed",
    };
    for (const jobStatus of ["failed", "skipped", "pending", "in-progress", "succeeded"]) {
      f.setJob({ ...matching, jobStatus });
      expect(await f.client.confirmedFailedPromotion(release)).toBe(["failed", "skipped"].includes(jobStatus));
    }
    for (const other of [
      { type: "rollback" },
      { fromDeploymentId: "dpl_Other" },
      { toDeploymentId: "dpl_Other" },
    ]) {
      f.setJob({ ...matching, ...other });
      expect(await f.client.confirmedFailedPromotion(release)).toBe(false);
    }
    expect(f.writes).toEqual([]);
  });
  it("restores both aliases after an explicitly reviewed partial promotion", async () => {
    const f = fixture("partial");
    await expect(f.client.promote(release)).rejects.toThrow();
    await expect(f.client.inspect(release)).rejects.toThrow();
    expect((await f.client.inspectRecovery(release)).serving).toBe("partial");
    expect(await f.client.confirmedFailedPromotion(release)).toBe(false);
    expect((await f.client.rollback(release)).serving).toBe("previous");
    expect(f.writes).toEqual(["promote", "rollback"]);
  });
  it("rechecks changed alias ownership at promotion time", async () => {
    const f = fixture("racing-alias");
    await f.client.inspect(release);
    await expect(f.client.promote(release)).rejects.toThrow();
    expect(f.writes).toEqual([]);
  });
});
