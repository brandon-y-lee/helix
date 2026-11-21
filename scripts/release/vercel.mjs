import { setTimeout as delay } from "node:timers/promises";
import { HELIX_VERCEL_PROJECT_ID as projectId } from "../../lib/supabase/project-safety.ts";

const teamId = "team_uriJjJWNwpZnZHnIp5AiXuv0";
export const helixRepositoryId = "1280166759";
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

function verifiedDeployment(value, id, expectedSha, { healthy = true, original = false } = {}) {
  const git = value.gitSource;
  requireState(
    value.id === id &&
      value.projectId === projectId &&
      value.ownerId === teamId &&
      value.target === "production" &&
      (!original || value.source === "git") &&
      git?.type === "github" &&
      git.ref === "main" &&
      typeof git.sha === "string" &&
      sha.test(git.sha) &&
      (expectedSha === undefined || git.sha === expectedSha) &&
      String(git.repoId) === helixRepositoryId &&
      (!healthy || (value.readyState === "READY" && !value.aliasError)) &&
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
  return { id, sha: git.sha, url: `https://${value.url}` };
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

  async function assertHeldProject() {
    const { job } = await scope();
    requireState(!isBusy(job), "Vercel has an alias operation in progress.");
  }

  async function deployment(id, expectedSha, options) {
    requireState(deploymentId.test(id), "Invalid immutable deployment ID.");
    const value = await request(`/v13/deployments/${id}?withGitRepoInfo=true`);
    return verifiedDeployment(value, id, expectedSha, options);
  }

  async function candidateForSha(expectedSha) {
    requireState(sha.test(expectedSha), "Expected an exact Git commit SHA.");
    await assertHeldProject();
    // Count every state and origin, including failed or later redeploys. Choosing
    // the newest READY result could select a different build for the same commit.
    const query = new URLSearchParams({
      projectId,
      target: "production",
      branch: "main",
      sha: expectedSha,
      limit: "100",
    });
    let candidateId;
    let until;
    for (let page = 0; page < 50; page++) {
      if (until !== undefined) query.set("until", String(until));
      const { deployments, pagination } = await request(`/v7/deployments?${query}`);
      requireState(
        Array.isArray(deployments) && pagination?.count === deployments.length,
        "Vercel returned an incomplete deployment inventory.",
      );
      for (const item of deployments) {
        requireState(
          deploymentId.test(item.uid) && item.projectId === projectId && item.target === "production",
          "Vercel deployment selection is inconsistent.",
        );
        requireState(
          !candidateId || candidateId === item.uid,
          "Multiple production builds exist for the selected SHA.",
        );
        candidateId = item.uid;
      }
      const next = pagination?.next;
      if (next === null) {
        requireState(candidateId, "No production build exists for the selected SHA.");
        return deployment(candidateId, expectedSha, { original: true });
      }
      requireState(
        Number.isSafeInteger(next) && next > 0 && (until === undefined || next < until),
        "Invalid Vercel deployment pagination.",
      );
      until = next;
    }
    throw new Error("Incomplete Vercel deployment inventory. Resolve the selection before release.");
  }

  async function candidateById(id) {
    const selected = await deployment(id, undefined, { original: true });
    const candidate = await candidateForSha(selected.sha);
    requireState(candidate.id === id, "Supplied deployment is not the unique Git build for its SHA.");
    return candidate;
  }

  async function ownership() {
    const [{ project, job }, aliases] = await Promise.all([
      scope(),
      Promise.all(domains.map((name) => request(`/v4/aliases/${name}?projectId=${projectId}`))),
    ]);
    const [wwwId, apexId, developmentId] = aliases.map((alias, index) => aliasTarget(alias, domains[index]));
    const owners = [wwwId, apexId, project.targets?.production?.id];
    requireState(
      owners.every((id) => deploymentId.test(id) && id !== developmentId),
      "Production and development ownership is inconsistent.",
    );
    return { job, owners, developmentId };
  }

  async function discoverPrevious(candidate) {
    const [{ job, owners, developmentId }, selected] = await Promise.all([
      ownership(),
      deployment(candidate.id, candidate.sha, { original: true }),
    ]);
    requireState(
      !isBusy(job) &&
        developmentId !== selected.id &&
        selected.sha === candidate.sha &&
        selected.url === candidate.url,
      "Candidate selection or Vercel alias state changed.",
    );
    let priorId = owners[0];
    if (priorId === selected.id || !owners.every((id) => id === priorId)) {
      priorId = job?.fromDeploymentId;
      const release = { previousId: priorId, candidateId: selected.id };
      const unanimous = owners.every((id) => id === selected.id);
      requireState(
        deploymentId.test(priorId) &&
          priorId !== selected.id &&
          priorId !== developmentId &&
          partialPromotion(job, release) &&
          (!unanimous || job.jobStatus === "succeeded") &&
          owners.every((id) => id === selected.id || id === priorId),
        "Cannot establish the prior deployment. Use controller recovery with its recorded pair.",
      );
    }
    const previous = await deployment(priorId, undefined);
    requireState(previous.sha !== selected.sha, "Candidate and previous commit SHA must differ.");
    return previous;
  }

  async function inspectState(release, recovery = false) {
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
    const [{ job, owners, developmentId }, candidate, previous] = await Promise.all([
      ownership(),
      deployment(candidateId, candidateSha, { original: true, healthy: !recovery }),
      deployment(previousId, previousSha),
    ]);
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
    const { job, result } = await inspectState(release, allowRecovery);
    requireState(!isBusy(job), "Vercel has an alias operation in progress.");
    requireState(
      result.serving !== "partial" ||
        (allowRecovery && (partialPromotion(job, release) || failedRollback(job, release))),
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

  function failedRollback(job, release) {
    if (
      job?.type !== "rollback" ||
      job.fromDeploymentId !== release.candidateId ||
      job.toDeploymentId !== release.previousId ||
      !["failed", "skipped"].includes(job.jobStatus)
    )
      return null;
    return { requestedAt: job.requestedAt, candidateId: release.candidateId, previousId: release.previousId };
  }

  async function change(release, type, retry) {
    const recovery = type === "rollback";
    const { job: before, result, productionTarget } = await inspectState(release, recovery);
    if (retry) {
      const observed = failedRollback(before, release);
      requireState(
        recovery &&
          observed &&
          observed.requestedAt === retry.requestedAt &&
          observed.candidateId === retry.candidateId &&
          observed.previousId === retry.previousId,
        "The confirmed terminal rollback changed. Inspect the current provider operation before recovery.",
      );
    }
    const destination = type === "promote" ? "candidate" : "previous";
    const target = result[destination].id;
    requireState(
      !isBusy(before) &&
        (result.serving !== "partial" || (recovery && (partialPromotion(before, release) || retry))),
      "Alias operation pending or partial. Reconcile before another write.",
    );
    if (result.serving === destination) return result;
    // Never re-submit a failed or superseded request for this same pair simply
    // because the public domain still points to its prior deployment.
    const from = productionTarget;
    const matches = (job) => job?.type === type && job.fromDeploymentId === from && job.toDeploymentId === target;
    requireState(
      !matches(before) || retry,
      "This alias change was already requested. Reconcile its outcome before retrying.",
    );
    const path = `/${type === "rollback" ? "v1" : "v10"}/projects/${projectId}/${type}/${target}`;
    try {
      await request(path, "POST");
    } catch {
      /* A lost response may still have moved the domains. Only read from here. */
    }
    for (let attempt = 0; attempt < pollAttempts; attempt++) {
      const { job, result: now } = await inspectState(release, recovery);
      requireState(
        now.developmentId === result.developmentId,
        "Development alias moved during the release; reconcile the observed state.",
      );
      if (matches(job) && (!retry || job.requestedAt !== retry.requestedAt)) {
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
    assertHeldProject,
    readProductionGitBuild: (id, expectedSha) => deployment(id, expectedSha, { original: true }),
    candidateForSha,
    candidateById,
    discoverPrevious,
    inspect: (release) => inspect(release),
    inspectRecovery: (release) => inspect(release, true),
    confirmedFailedPromotion: async (release) => {
      const { job, result } = await inspectState(release, true);
      return (
        result.serving === "previous" &&
        promotionForRelease(job, release) &&
        ["failed", "skipped"].includes(job.jobStatus)
      );
    },
    terminalFailedRollback: async (release) => {
      const { job, result } = await inspectState(release, true);
      return result.serving === "previous" ? null : failedRollback(job, release);
    },
    promote: (release) => change(release, "promote"),
    /** @param {{candidateId:string, candidateSha:string, previousId:string, previousSha:string}} release
     * @param {{requestedAt:number, candidateId:string, previousId:string} | null} [failedAttempt] */
    rollback: (release, failedAttempt) => change(release, "rollback", failedAttempt),
  };
}
