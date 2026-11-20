import { readReleasePacket } from "./packet.mjs";
import { pathToFileURL } from "node:url";
import { createReleaseSource } from "./github.mjs";
import { createVercelRelease } from "./vercel.mjs";

export async function run(command, env = process.env) {
  const source = createReleaseSource(env.GH_TOKEN);
  const controller = createVercelRelease({ token: env.HELIX_RELEASE_VERCEL_TOKEN, repositoryId: env.GITHUB_REPOSITORY_ID });
  const sha = env.RELEASE_CANDIDATE_SHA;
  if (command === "premerge") {
    await source.verifyPr(env.RELEASE_PR, "premerge", sha, env.GITHUB_REPOSITORY_ID);
    await controller.assertHeldProject();
    return;
  }
  if (!["preflight", "verify", "promote", "rollback", "cancel"].includes(command)) throw new Error("Unknown operation.");
  const release = { candidateId: env.RELEASE_CANDIDATE_ID, candidateSha: sha,
    previousId: env.RELEASE_PREVIOUS_ID, previousSha: env.RELEASE_PREVIOUS_SHA };
  // Exceptions in adapters, including URL/DB/network errors, must never print credential-bearing input.
  const { validateObservations, verifyReleaseObservations } = await import("./observations.mjs");
  const readExpectations = () => validateObservations(readReleasePacket(
    env.HELIX_RELEASE_EXPECTATIONS, env.RELEASE_EXPECTATIONS_SHA256, release,
  ));
  const expectations = readExpectations();
  const check = (phase, origin, deployment) => verifyReleaseObservations({
    phase, origin, deploymentId: deployment.id, sha: deployment.sha, expectations,
    statusToken: env.HELIX_RELEASE_STATUS_TOKEN, bypassToken: env.HELIX_RELEASE_BYPASS_TOKEN,
  });
  const recovery = command === "rollback" || command === "cancel";
  await source.verifyPr(env.RELEASE_PR, recovery ? "recorded" : "merged", sha, env.GITHUB_REPOSITORY_ID);
  if (!recovery) {
    if (sha !== env.GITHUB_SHA) throw new Error("Migrations and promotion require the selected main commit.");
    await source.assertMainHead(sha);
  }
  if (command === "preflight") {
    const result = await controller.inspect(release);
    if (result.serving !== "previous" && env.RELEASE_OPERATION !== "promote") {
      throw new Error("The previously serving deployment is no longer current.");
    }
    // This precedes all forward database writes. The existing build is checked
    // again after expansion, and T3 independently validates the real ledger.
    await check("previous", result.serving === "previous" ? "https://www.helixskin.us" : result.previous.url, result.previous);
    return;
  }
  const { executeRelease } = await import("./workflow.mjs");
  const { withReleaseWriter } = await import("./writer.mjs");
  await withReleaseWriter(env, write => executeRelease(command, { controller, release, check,
    appliedSha: env.RELEASE_APPLIED_SHA, currentHead: () => { readExpectations(); return source.assertMainHead(sha); },
    transition: state => write(state, release),
  }));
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
