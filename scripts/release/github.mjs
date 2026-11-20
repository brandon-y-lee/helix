const repo = "brandon-y-lee/helix";
const shaPattern = /^[a-f0-9]{40}$/;

export function createReleaseSource(token, fetchImpl = fetch) {
  if (!token) throw new Error("Missing GitHub read credential.");
  async function read(path) {
    const response = await fetchImpl(`https://api.github.com/repos/${repo}/${path}`, {
      headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json" },
      redirect: "error", signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error("GitHub release source verification unavailable.");
    return response.json();
  }
  async function assertMainHead(sha) {
    if (!shaPattern.test(sha) || (await read("git/ref/heads/main")).object?.sha !== sha) {
      throw new Error("The selected release is no longer main.");
    }
  }
  async function verifyPr(number, mode, sha, repoId) {
    if (!/^[1-9][0-9]{0,9}$/.test(String(number)) || !shaPattern.test(sha) || !/^[1-9]\d*$/.test(String(repoId))) {
      throw new Error("Invalid release source.");
    }
    const pr = await read(`pulls/${number}`);
    if (pr.number !== Number(number) || pr.draft !== false ||
        [pr.head?.repo, pr.base?.repo].some(r => r?.full_name !== repo || String(r?.id) !== String(repoId)) ||
        pr.head.ref !== "dev" || pr.base.ref !== "main" || !shaPattern.test(pr.head.sha)) {
      throw new Error("Expected an internal dev to main release pull request.");
    }
    if (mode === "premerge") {
      if (pr.state !== "open" || pr.merged || pr.head.sha !== sha ||
          (await read("git/ref/heads/dev")).object?.sha !== sha) throw new Error("Release PR head changed.");
      return;
    }
    if (!pr.merged || !pr.merged_at || pr.merge_commit_sha !== sha) throw new Error("Release is not the merged PR commit.");
    const [merged, reviewed] = await Promise.all([read(`git/commits/${sha}`), read(`git/commits/${pr.head.sha}`)]);
    if (!shaPattern.test(merged.tree?.sha) || reviewed.tree?.sha !== merged.tree.sha) {
      throw new Error("The merged tree differs from the reviewed dev tree.");
    }
    // Recovery can outlive a GitHub Actions job's retention. The controller
    // database admits recovery only for its already verified exact pair.
    if (mode === "recorded") return;
    // Use the named workflow's authenticated run and individual jobs. A green
    // status from an unrelated workflow or a skipped gate cannot admit a release.
    const runs = await read(`actions/workflows/ci.yml/runs?event=pull_request&head_sha=${pr.head.sha}&per_page=100`);
    const run = runs.workflow_runs?.find(r =>
      r.event === "pull_request" && r.head_sha === pr.head.sha &&
      String(r.head_repository?.id) === String(repoId) && r.path === ".github/workflows/ci.yml" &&
      r.head_branch === "dev");
    if (!Number.isSafeInteger(run?.id) || run.conclusion !== "success") throw new Error("The release PR lacks passing CI.");
    const jobs = await read(`actions/runs/${run.id}/jobs?filter=latest&per_page=100`);
    const jobProof = jobs.jobs?.find(job => job.name === "ci")?.steps?.some(step =>
      step.name === `Report Main Compatibility Gate for Release PR ${number} source ${pr.head.sha}` && step.conclusion === "success");
    if (!jobProof && !run.pull_requests?.some(p => p.number === Number(number))) {
      throw new Error("CI run is not bound to the selected release PR.");
    }
    if (!["ci", "integration-gate"].every(name => jobs.jobs?.some(job => job.name === name && job.conclusion === "success"))) {
      throw new Error("The exact release PR gates did not pass.");
    }
  }
  async function mergedSha(number) {
    if (!/^[1-9][0-9]{0,9}$/.test(String(number))) throw new Error("Invalid release PR.");
    const pr = await read(`pulls/${number}`);
    if (!pr.merged || !shaPattern.test(pr.merge_commit_sha)) throw new Error("The release PR must already be merged.");
    return pr.merge_commit_sha;
  }
  async function releasePrForCommit(sha, repoId) {
    if (!shaPattern.test(sha)) throw new Error("Invalid release commit.");
    const prs = await read(`commits/${sha}/pulls?per_page=100`);
    if (!Array.isArray(prs) || prs.length >= 100) throw new Error("Incomplete release PR inventory.");
    const matches = prs.filter(p => p.merged_at && p.merge_commit_sha === sha &&
      p.base?.ref === "main" && p.head?.ref === "dev" &&
      [p.base.repo, p.head.repo].every(r => r?.full_name === repo && String(r?.id) === String(repoId)));
    if (matches.length !== 1 || !Number.isSafeInteger(matches[0].number)) throw new Error("Expected exactly one merged release PR.");
    return matches[0].number;
  }
  return { assertMainHead, verifyPr, mergedSha, releasePrForCommit };
}
