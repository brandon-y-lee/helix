// Pure orchestration. Every transition is issued by the protected writer,
// including the durable one-shot reservation immediately before a provider POST.
const canonical = "https://www.helixskin.us";
export async function executeRelease(action, {
  controller, release, appliedSha, currentHead, transition, check,
}) {
  if (!["verify", "promote", "rollback", "cancel"].includes(action)) throw new Error("Invalid release action.");
  const recovery = action === "rollback" || action === "cancel";
  const snapshot = recovery ? await controller.inspectRecovery(release) : await controller.inspect(release);
  const { candidate, previous, serving } = snapshot;
  const mustTransition = async (state, ...evidence) => {
    if (await transition(state, ...evidence) !== true) {
      throw new Error("Release transition unavailable or previously attempted. Reconcile the exact provider operation.");
    }
  };
  if (action === "cancel") {
    if (serving !== "previous") throw new Error("Previous deployment must own all production domains before cancellation.");
    await mustTransition("cancel");
    return;
  }
  if (action === "rollback") {
    if (serving !== "previous") {
      await check("previous", previous.url, previous);
      // A reserved request can only be attempted again after Vercel identifies
      // that exact rollback as terminally failed. Reserve its timestamp once.
      const failure = await controller.terminalFailedRollback(release);
      if (failure) await mustTransition("retry_rollback", failure.requestedAt);
      else await mustTransition("start_rollback");
      await controller.rollback(release, failure);
    }
    const result = await controller.inspectRecovery(release);
    if (result.serving !== "previous") throw new Error("Rollback has not restored the previous deployment.");
    // Release a failed promotion only with conclusive provider evidence that
    // all domains stayed on the previous build. An unknown request stays held.
    if (serving === "previous" && await controller.confirmedFailedPromotion(release)) {
      await mustTransition("failed_promotion");
    } else {
      await mustTransition("rolled_back");
    }
    await check("previous", canonical, previous);
    return;
  }
  if (appliedSha !== candidate.sha) throw new Error("The database verification belongs to a different release.");
  await currentHead();
  if (serving === "previous") {
    await check("previous", canonical, previous);
    await mustTransition("prepare");
    await check("staged", candidate.url, candidate);
    if (action === "verify") return;
    await currentHead();
    await mustTransition("start_promote");
    await controller.promote(release);
  } else if (action === "verify") {
    throw new Error("The candidate is already serving.");
  }
  const result = await controller.inspect(release);
  if (result.serving !== "candidate") throw new Error("Promotion has not completed.");
  await mustTransition("promoted");
  await check("canonical", canonical, candidate);
}
