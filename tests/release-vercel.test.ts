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
type Discovery = {
  pages?: string[][];
  repeatCursor?: boolean;
  source?: string;
  candidateAliasError?: boolean;
  previousAliasError?: boolean;
};
function fixture(fault?: Fault, discovery: Discovery = {}) {
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
      if (path === "/v7/deployments") {
        expect(options?.method).toBe("GET");
        expect(url.searchParams.get("projectId")).toBe(project);
        expect(url.searchParams.get("target")).toBe("production");
        expect(url.searchParams.get("branch")).toBe("main");
        expect(url.searchParams.get("sha")).toBe(release.candidateSha);
        expect(url.searchParams.has("state")).toBe(false);
        const pages = discovery.pages ?? [[candidate]];
        const until = url.searchParams.get("until");
        const page = until === null ? 0 : 1001 - Number(until);
        const deployments = (pages[page] ?? []).map((uid) => ({
          uid,
          projectId: project,
          target: "production",
          readyState: uid === "dpl_Redeploy" ? "ERROR" : "READY",
          source: uid === "dpl_Redeploy" ? "redeploy" : "git",
        }));
        return Response.json({
          deployments,
          pagination: {
            count: deployments.length,
            next: discovery.repeatCursor ? 1000 : page + 1 < pages.length ? 1000 - page : null,
          },
        });
      }
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
          source: discovery.source ?? "git",
          aliasError: (id === candidate ? discovery.candidateAliasError : discovery.previousAliasError)
            ? { message: "failed" }
            : undefined,
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
    setAliases: (wwwOwner: string, apexOwner: string) => {
      wwwId = wwwOwner;
      apexId = apexOwner;
    },
    setJob: (value: Job) => {
      job = value;
    },
  };
}
describe("exact Vercel release", () => {
  const selected = { id: candidate, sha: release.candidateSha, url: "https://helix-new.vercel.app" };
  const prior = { id: previous, sha: release.previousSha, url: "https://helix-old.vercel.app" };
  const promoteJob = {
    type: "promote",
    requestedAt: 100,
    fromDeploymentId: previous,
    toDeploymentId: candidate,
    jobStatus: "succeeded",
  };
  const rollbackJob = {
    type: "rollback",
    requestedAt: 200,
    fromDeploymentId: candidate,
    toDeploymentId: previous,
    jobStatus: "failed",
  };
  it("resolves SHA or ID to the unique original Git build across complete provider pages", async () => {
    const f = fixture(undefined, { pages: [[], [candidate]] });
    expect(await f.client.candidateForSha(release.candidateSha)).toEqual(selected);
    expect(await f.client.candidateById(candidate)).toEqual(selected);
    expect(await f.client.discoverPrevious(selected)).toEqual(prior);
    expect(f.writes).toEqual([]);
  });
  it("rejects missing, ambiguous, non-Git, unverified, and incompletely paginated selections", async () => {
    for (const f of [
      fixture(undefined, { pages: [[]] }),
      fixture(undefined, { pages: [[candidate], ["dpl_Redeploy"]] }),
      fixture(undefined, { pages: [[candidate]], repeatCursor: true }),
      fixture(undefined, { source: "redeploy" }),
      fixture("provenance"),
      fixture("preview"),
      fixture("hold"),
    ]) {
      await expect(f.client.candidateForSha(release.candidateSha)).rejects.toThrow();
      await expect(f.client.candidateById(candidate)).rejects.toThrow();
      expect(f.writes).toEqual([]);
    }
    await expect(fixture("sha").client.candidateForSha(release.candidateSha)).rejects.toThrow();
    await expect(fixture(undefined, { pages: [["dpl_Other"]] }).client.candidateById(candidate)).rejects.toThrow();
  });
  it("discovers the original prior after exact completed or partial promotion only with matching provider history", async () => {
    const f = fixture();
    for (const apexOwner of [previous, candidate]) {
      f.setAliases(candidate, apexOwner);
      f.setJob(promoteJob);
      expect(await f.client.discoverPrevious(selected)).toEqual(prior);
      for (const other of [{ toDeploymentId: "dpl_Other" }, { type: "rollback" }, { jobStatus: "pending" }]) {
        f.setJob({ ...promoteJob, ...other });
        await expect(f.client.discoverPrevious(selected)).rejects.toThrow();
      }
    }
    f.setAliases("dpl_Third", candidate);
    f.setJob(promoteJob);
    await expect(f.client.discoverPrevious(selected)).rejects.toThrow();
    expect(f.writes).toEqual([]);
  });
  it("rearms only the observed terminal rollback of a precise pair, including partial rollback", async () => {
    for (const jobStatus of ["failed", "skipped"]) {
      const f = fixture(undefined, { candidateAliasError: true });
      f.setAliases(candidate, jobStatus === "failed" ? candidate : previous);
      f.setJob({ ...rollbackJob, jobStatus });
      const failure = await f.client.terminalFailedRollback(release);
      expect(failure).toEqual({ requestedAt: 200, candidateId: candidate, previousId: previous });
      await f.client.inspectRecovery(release);
      await expect(f.client.inspect(release)).rejects.toThrow();
      await expect(f.client.rollback(release)).rejects.toThrow();
      f.setJob({ ...rollbackJob, jobStatus, requestedAt: 201 });
      await expect(f.client.rollback(release, failure)).rejects.toThrow();
      expect(f.writes).toEqual([]);
      f.setJob({ ...rollbackJob, jobStatus });
      expect((await f.client.rollback(release, failure)).serving).toBe("previous");
      expect(f.writes).toEqual(["rollback"]);
    }
  });
  it("holds recovery for unknown, busy or unrelated operations and an unhealthy rollback target", async () => {
    const f = fixture();
    f.setAliases(candidate, candidate);
    for (const other of [
      { type: "promote" },
      { fromDeploymentId: "dpl_Other" },
      { jobStatus: "pending" },
      { jobStatus: "succeeded" },
    ]) {
      f.setJob({ ...rollbackJob, ...other });
      expect(await f.client.terminalFailedRollback(release)).toBeNull();
    }
    const unhealthy = fixture(undefined, { previousAliasError: true });
    unhealthy.setAliases(candidate, candidate);
    await expect(unhealthy.client.rollback(release)).rejects.toThrow();
    expect(unhealthy.writes).toEqual([]);
  });
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
