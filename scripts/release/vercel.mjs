import { setTimeout as delay } from "node:timers/promises";
import { HELIX_VERCEL_PROJECT_ID as projectId } from "../../lib/supabase/project-safety.ts";

const teamId = "team_uriJjJWNwpZnZHnIp5AiXuv0";
const helixRepositoryId = "1280166759";
const canonical = "www.helixskin.us";
const apex = "helixskin.us";
const development = "helixskin.vercel.app";
const domains = [canonical, apex, development];
const deploymentId = /^dpl_[A-Za-z0-9]{1,100}$/;
const sha = /^[a-f0-9]{40}$/;

function requireState(condition, message) {
  if (!condition) throw new Error(message);
}

function checkScope(project, inventory, repositoryId) {
  const link = project.link;
  requireState(
    project.id === projectId &&
      project.accountId === teamId &&
      link?.type === "github" &&
      link.org === "brandon-y-lee" &&
      link.repo === "helix" &&
      String(link.repoId) === repositoryId &&
      link.productionBranch === "main",
    "Vercel project, repository or production branch mismatch.",
  );
  requireState(
    project.autoAssignCustomDomains === false && project.rollingRelease == null && project.paused !== true,
    "Production domain assignment must be held on an active project with rolling releases disabled.",
  );
  const entries = inventory.domains;
  requireState(
    Array.isArray(entries) && inventory.pagination?.next === null && entries.length === domains.length,
    "Unreviewed or incomplete project-domain inventory.",
  );
  for (const name of domains) {
    const entry = entries.find((domain) => domain.name === name);
    requireState(
      entry?.projectId === projectId &&
        entry.verified === true &&
        entry.customEnvironmentId == null &&
        (entry.gitBranch ?? null) === (name === development ? "dev" : null) &&
        (entry.redirect ?? null) === (name === apex ? canonical : null) &&
        (entry.redirectStatusCode ?? null) === (name === apex ? 308 : null),
      "Project-domain or development branch binding mismatch.",
    );
  }
}

function readJob(project) {
  const job = project.lastAliasRequest;
  if (job === null) return null;
  requireState(
    job &&
      ["pending", "in-progress", "succeeded", "failed", "skipped"].includes(job.jobStatus) &&
      ["promote", "rollback"].includes(job.type) &&
      Number.isSafeInteger(job.requestedAt) &&
      deploymentId.test(job.toDeploymentId) &&
      (job.fromDeploymentId === null || deploymentId.test(job.fromDeploymentId)),
    "Unknown Vercel alias operation status.",
  );
  return job;
}

function isBusy(job) {
  return job?.jobStatus === "pending" || job?.jobStatus === "in-progress";
}

function aliasTarget(alias, expectedName) {
  requireState(
    alias.alias === expectedName &&
      alias.projectId === projectId &&
      deploymentId.test(alias.deploymentId) &&
      (!alias.deployment || alias.deployment.id === alias.deploymentId) &&
      !alias.deletedAt &&
      (alias.redirect ?? null) === (expectedName === apex ? canonical : null) &&
      (alias.redirectStatusCode ?? null) === (expectedName === apex ? 308 : null),
    "Vercel alias ownership or redirect mismatch.",
  );
  return alias.deploymentId;
}

function verifiedDeployment(value, id, expectedSha, repositoryId) {
  const git = value.gitSource;
  requireState(
    value.id === id &&
      value.projectId === projectId &&
      value.ownerId === teamId &&
      value.target === "production" &&
      value.readyState === "READY" &&
      git?.type === "github" &&
      git.ref === "main" &&
      git.sha === expectedSha &&
      String(git.repoId) === repositoryId &&
      !value.aliasError &&
      !value.deletedAt,
    "Deployment identity, Git provenance, production target or readiness mismatch.",
  );
  // The deployment URL is read from the authenticated deployment resource. Never
  // send a protection credential to an alias or a URL supplied by a release input.
  requireState(
    typeof value.url === "string" &&
      /^[a-z0-9][a-z0-9-]{0,61}[a-z0-9]\.vercel\.app$/.test(value.url) &&
      value.url !== development,
    "Unexpected immutable deployment hostname.",
  );
  return { id, sha: expectedSha, url: `https://${value.url}` };
}

export function createVercelRelease({
  token,
  repositoryId,
  fetchImpl = fetch,
  sleep = (ms) => delay(ms),
  pollAttempts = 20,
}) {
  requireState(
    typeof token === "string" && token.length > 0 && String(repositoryId) === helixRepositoryId,
    "Missing release credential or unexpected GitHub repository identity.",
  );
  const projectPath = `/v9/projects/${projectId}`;
  async function request(path, method = "GET") {
    const url = new URL(path, "https://api.vercel.com");
    url.searchParams.set("teamId", teamId);
    let response;
    try {
      response = await fetchImpl(url, {
        method,
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        ...(method === "POST" ? { body: "{}" } : {}),
      });
    } catch {
      throw new Error("Vercel request outcome unavailable.");
    }
    requireState(response.ok, `Vercel release API returned HTTP ${response.status}.`);
    if (method === "POST") return;
    try {
      return await response.json();
    } catch {
      throw new Error("Vercel returned unreadable release metadata.");
    }
  }

  async function scope() {
    const [project, inventory] = await Promise.all([
      request(`${projectPath}?rollbackInfo=true`),
      request(`${projectPath}/domains?limit=100`),
    ]);
    checkScope(project, inventory, helixRepositoryId);
    const job = readJob(project);
    return { project, job };
  }

  async function inspectState(release) {
    const { candidateId, candidateSha, previousId, previousSha } = release;
    requireState(
      deploymentId.test(candidateId) &&
        deploymentId.test(previousId) &&
        candidateId !== previousId &&
        sha.test(candidateSha) &&
        sha.test(previousSha) &&
        candidateSha !== previousSha,
      "Expected two distinct immutable release identities.",
    );
    const [{ project, job }, candidateData, previousData, aliases] = await Promise.all([
      scope(),
      request(`/v13/deployments/${candidateId}?withGitRepoInfo=true`),
      request(`/v13/deployments/${previousId}?withGitRepoInfo=true`),
      Promise.all(domains.map((name) => request(`/v4/aliases/${name}?projectId=${projectId}`))),
    ]);
    const candidate = verifiedDeployment(candidateData, candidateId, candidateSha, helixRepositoryId);
    const previous = verifiedDeployment(previousData, previousId, previousSha, helixRepositoryId);
    const [wwwId, apexId, developmentId] = aliases.map((alias, index) => aliasTarget(alias, domains[index]));
    const owners = [wwwId, apexId, project.targets?.production?.id];
    requireState(
      owners.every((id) => id === candidateId || id === previousId) &&
        developmentId !== candidateId &&
        developmentId !== previousId,
      "Release ownership changed outside the authorized pair.",
    );
    const serving = owners.every((id) => id === candidateId)
      ? "candidate"
      : owners.every((id) => id === previousId)
        ? "previous"
        : "partial";
    return { job, productionTarget: owners[2], result: { candidate, previous, developmentId, serving } };
  }

  async function inspect(release, allowRecovery = false) {
    const { job, result } = await inspectState(release);
    requireState(!isBusy(job), "Vercel has an alias operation in progress.");
    requireState(
      result.serving !== "partial" || (allowRecovery && partialPromotion(job, release)),
      "Production alias ownership is partial. Reconcile before another write.",
    );
    return result;
  }

  function promotionForRelease(job, release) {
    return (
      job?.type === "promote" &&
      job.fromDeploymentId === release.previousId &&
      job.toDeploymentId === release.candidateId
    );
  }

  function partialPromotion(job, release) {
    return promotionForRelease(job, release) && ["failed", "succeeded"].includes(job.jobStatus);
  }

  async function change(release, type) {
    const { job: before, result, productionTarget } = await inspectState(release);
    const destination = type === "promote" ? "candidate" : "previous";
    const target = result[destination].id;
    requireState(
      !isBusy(before) &&
        (result.serving !== "partial" || (type === "rollback" && partialPromotion(before, release))),
      "Alias operation pending or partial. Reconcile before another write.",
    );
    if (result.serving === destination) return result;
    // Never re-submit a failed or superseded request for this same pair simply
    // because the public domain still points to its prior deployment.
    const from = productionTarget;
    const matches = (job) => job?.type === type && job.fromDeploymentId === from && job.toDeploymentId === target;
    requireState(
      !matches(before),
      "This alias change was already requested. Reconcile its outcome before retrying.",
    );
    const path = `/${type === "rollback" ? "v1" : "v10"}/projects/${projectId}/${type}/${target}`;
    try {
      await request(path, "POST");
    } catch {
      /* A lost response may still have moved the domains. Only read from here. */
    }
    for (let attempt = 0; attempt < pollAttempts; attempt++) {
      const { job, result: now } = await inspectState(release);
      requireState(
        now.developmentId === result.developmentId,
        "Development alias moved during the release; reconcile the observed state.",
      );
      if (matches(job)) {
        requireState(
          job.jobStatus !== "failed" && job.jobStatus !== "skipped",
          "Vercel alias operation failed or skipped. Reconcile the public domains.",
        );
        if (job.jobStatus === "succeeded" && now.serving === destination) return now;
      } else if (
        job &&
        (job.requestedAt !== before?.requestedAt ||
          job.toDeploymentId !== before?.toDeploymentId ||
          job.type !== before?.type)
      ) {
        throw new Error("Competing Vercel alias operation was observed. Reconcile the public domains.");
      }
      if (attempt + 1 < pollAttempts) await sleep(1500);
    }
    throw new Error(
      "Vercel alias outcome remains uncertain. Inspect provider operation and public aliases before recovery.",
    );
  }

  return {
    assertHeldProject: async () => {
      const { job } = await scope();
      requireState(!isBusy(job), "Vercel has an alias operation in progress.");
    },
    inspect: (release) => inspect(release),
    inspectRecovery: (release) => inspect(release, true),
    confirmedFailedPromotion: async (release) => {
      const { job, result } = await inspectState(release);
      return (
        result.serving === "previous" &&
        promotionForRelease(job, release) &&
        ["failed", "skipped"].includes(job.jobStatus)
      );
    },
    promote: (release) => change(release, "promote"),
    rollback: (release) => change(release, "rollback"),
  };
}
