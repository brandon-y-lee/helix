import { createHash } from "node:crypto";
import { appendFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { createReleaseSource } from "./github.mjs";
import { createVercelRelease } from "./vercel.mjs";

const digest = raw => createHash("sha256").update(raw).digest("hex");
const isRecovery = operation => operation === "rollback" || operation === "cancel";
const canonical = "https://www.helixskin.us";

function inspectionOnly(profile, operation) {
  if (profile.mode !== "inspection-only") return false;
  if (operation !== "verify" && operation !== "cancel") {
    throw new Error("Release expectations: inspection allows only verification or cancellation.");
  }
  return true;
}

export function releaseSelector(value) {
  const pr = /^(?:#|https:\/\/github\.com\/brandon-y-lee\/helix\/pull\/)?([1-9][0-9]{0,9})$/.exec(value);
  if (pr) return { pr: Number(pr[1]) };
  if (/^dpl_[A-Za-z0-9]{1,96}$/.test(value)) return { id: value };
  throw new Error("Choose a release PR or immutable deployment ID.");
}

export async function discover({ source, controller, repoId, selector, workflowSha }) {
  const candidate = selector.pr
    ? await controller.candidateForSha(await source.mergedSha(selector.pr))
    : await controller.candidateById(selector.id);
  const pr = selector.pr ?? await source.releasePrForCommit(candidate.sha, repoId);
  if (candidate.sha !== workflowSha) throw new Error("The selected release does not match this main run.");
  await source.verifyPr(pr, "merged", candidate.sha, repoId);
  await source.assertMainHead(candidate.sha);
  const previous = await controller.discoverPrevious(candidate);
  return { pr, release: { candidateId: candidate.id, candidateSha: candidate.sha, previousId: previous.id, previousSha: previous.sha } };
}

async function writeContext(ctx, env) {
  const encoded = Buffer.from(JSON.stringify(ctx)).toString("base64url");
  if (!env.GITHUB_OUTPUT || encoded.length > 120000) throw new Error("Invalid release job output.");
  // The profile validator admits only bounded nonsecret expectations and hashes.
  await appendFile(env.GITHUB_OUTPUT, `context=${encoded}\ncontext_sha256=${digest(encoded)}\n`);
}

function readContext(env) {
  const value = env.RELEASE_CONTEXT;
  if (typeof value !== "string" || value.length > 120000 || !/^[A-Za-z0-9_-]+$/.test(value) ||
      digest(value) !== env.RELEASE_CONTEXT_SHA256) throw new Error("Release verification context is missing or changed.");
  const ctx = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  if (ctx.operation !== env.RELEASE_OPERATION || ctx.selector !== env.RELEASE_SELECTOR || ctx.workflowSha !== env.GITHUB_SHA) {
    throw new Error("Release verification context belongs to a different operation.");
  }
  return ctx;
}

export async function run(command, env = process.env) {
  const source = createReleaseSource(env.GH_TOKEN);
  const repoId = env.GITHUB_REPOSITORY_ID;
  const controller = createVercelRelease({ token: env.HELIX_RELEASE_VERCEL_TOKEN, repositoryId: repoId });
  if (command === "premerge") {
    await source.verifyPr(env.RELEASE_PR, "premerge", env.RELEASE_CANDIDATE_SHA, repoId);
    await controller.assertHeldProject();
    return;
  }
  const operation = env.RELEASE_OPERATION;
  if (!["verify","promote","rollback","cancel"].includes(operation) || !["resolve","admit","execute"].includes(command)) {
    throw new Error("Unknown release operation.");
  }
  const selector = releaseSelector(env.RELEASE_SELECTOR);
  const { readReleaseProfile, buildReleasePacket, verifyReleasePacket, observationsFor } = await import("./packet.mjs");
  const { verifyReleaseObservations } = await import("./observations.mjs");
  const probe = (phase, origin, deployment, profile, release) => verifyReleaseObservations({
    phase, origin, deploymentId: deployment.id, sha: deployment.sha, ...observationsFor(profile, release, phase),
    statusToken: env.HELIX_RELEASE_STATUS_TOKEN, bypassToken: env.HELIX_RELEASE_BYPASS_TOKEN, env,
  });
  if (command === "resolve") {
    const rawProfile = env.HELIX_RELEASE_PROFILE;
    inspectionOnly(readReleaseProfile(rawProfile), operation);
    const common = { operation, selector: env.RELEASE_SELECTOR, workflowSha: env.GITHUB_SHA };
    await controller.assertHeldProject();
    if (isRecovery(operation)) {
      // Use the protected registry to select the *original* pair on recovery,
      // even if a later main build exists or the outgoing artifact is unhealthy.
      const lookup = selector.pr ? { sha: await source.mergedSha(selector.pr) } : { id: selector.id };
      await writeContext({ ...common, lookup, rawProfile }, env);
      return;
    }
    const { pr, release } = await discover({ source, controller, repoId, selector, workflowSha: env.GITHUB_SHA });
    const packet = buildReleasePacket(rawProfile, release);
    const profile = verifyReleasePacket(packet.raw, packet.digest, release);
    const state = await controller.inspect(release);
    if (state.serving !== "previous" && operation !== "promote") throw new Error("The candidate already serves production.");
    await probe("previous", state.serving === "previous" ? canonical : state.previous.url, state.previous, profile, release);
    await writeContext({ ...common, pr, release, packet }, env);
    console.log(`Release PR ${pr}: staged ${release.candidateId} at ${release.candidateSha}; prior ${release.previousId} at ${release.previousSha}.`);
    return;
  }

  const ctx = readContext(env);
  const { withReleaseWriter } = await import("./writer.mjs");
  await withReleaseWriter(env, async ({ admit, change, recorded }) => {
    const recovery = isRecovery(operation);
    const release = recovery ? await recorded(ctx.lookup) : ctx.release;
    const pr = recovery ? selector.pr ?? await source.releasePrForCommit(release.candidateSha, repoId) : ctx.pr;
    const packet = recovery ? buildReleasePacket(ctx.rawProfile, release) : ctx.packet;
    const profile = () => verifyReleasePacket(packet.raw, packet.digest, release);
    // A recovery selector is looked up afresh in the registry in both jobs.
    // Bind the admitted pair and profile too, so the latest row cannot silently change.
    const receipt = digest(JSON.stringify([env.RELEASE_CONTEXT_SHA256, packet.digest]));
    if (command === "execute" && receipt !== env.RELEASE_ADMISSION_SHA256) {
      throw new Error("Release admission belongs to a different operation or deployment pair.");
    }
    await source.verifyPr(pr, recovery ? "recorded" : "merged", release.candidateSha, repoId);
    const currentHead = async () => {
      profile();
      await source.assertMainHead(release.candidateSha);
      if ((await controller.candidateForSha(release.candidateSha)).id !== release.candidateId) {
        throw new Error("The staged deployment changed.");
      }
    };
    if (command === "admit") {
      if (!env.GITHUB_OUTPUT) throw new Error("Missing protected admission output.");
      if (recovery) {
        const { serving } = await controller.inspectRecovery(release);
        if (operation === "cancel" && serving !== "previous") throw new Error("Cancellation requires the prior deployment to serve.");
      } else {
        await currentHead();
        const { serving } = await controller.inspect(release);
        if (operation === "verify" && serving !== "previous") throw new Error("The candidate already serves production.");
      }
    }
    const limited = inspectionOnly(profile(), operation);
    if (await admit(operation, release, limited) !== true) {
      throw new Error("Release transition unavailable for this profile and recorded deployment pair.");
    }
    if (command === "admit") {
      await appendFile(env.GITHUB_OUTPUT, `admission_sha256=${receipt}\n`);
      return;
    }
    const { executeRelease } = await import("./workflow.mjs");
    await executeRelease(operation, { controller, release, appliedSha: env.RELEASE_APPLIED_SHA, currentHead,
      check: (phase, origin, deployment) => probe(phase, origin, deployment, profile(), release),
      transition: (action, failureAt) => change(action, release, failureAt),
    });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run(process.argv[2]).then(() => console.log("Release check completed.")).catch(err => {
    // Provider error bodies, request objects and connection diagnostics stay out of CI.
    const publicReasons = ["Release observation failed:", "Unexpected ", "The release PR", "CI run is not bound",
      "The selected release", "The merged tree", "Vercel alias", "Production alias", "Release transition unavailable",
      "Release expectations", "GitHub release source", "The exact release PR", "Rollback has not", "Promotion has not"];
    const message = String(err?.message ?? "");
    console.error(publicReasons.some(prefix => message.startsWith(prefix)) && message.length < 240 && !/[\r\n]/.test(message)
      ? message : "Release verification stopped. Check the approved identities, credentials and operation state privately.");
    process.exitCode = 1;
  });
}
