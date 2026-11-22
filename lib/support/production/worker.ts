import "server-only";
import {
  assertStoredContract,
  ProductionSupportError,
  UUID,
  type ProductionConfig,
} from "./config";
import {
  assertFrozenRequest,
  type FrozenRequest,
  type SendOutcome,
} from "./provider";
import {
  materializeMedia,
  assertMediaRecipe,
  MediaIntegrityError,
} from "./media";
import { object } from "./request";

export type ClaimedOutbox = { outboxId: string; leaseId: string };
export type WorkerDependencies = {
  contract(config: ProductionConfig): Promise<unknown>;
  claim(config: ProductionConfig, leaseId: string): Promise<unknown>;
  start(config: ProductionConfig, claim: ClaimedOutbox): Promise<unknown>;
  complete(
    config: ProductionConfig,
    claim: ClaimedOutbox,
    outcome: SendOutcome,
  ): Promise<boolean>;
  send(request: FrozenRequest): Promise<SendOutcome>;
  reconcile?(config: ProductionConfig, claim: ClaimedOutbox): Promise<boolean>;
  readClean?(path: string, signal: AbortSignal): Promise<Buffer>;
  now(): number;
  leaseId(): string;
};
/** One awaited job per invocation. No scheduler registration or background work. */
export async function dispatchProductionOutbox(
  config: ProductionConfig,
  dependencies: WorkerDependencies,
) {
  const empty = { claimed: 0, accepted: 0, unconfirmed: 0 };
  if (
    !config.workerEnabled ||
    !config.fullMediaQualified ||
    !config.isolationQualified ||
    !config.operationsQualified
  )
    return empty;
  const contract = await dependencies.contract(config);
  assertStoredContract(contract, config);
  if (
    contract.workerEnabled !== true ||
    contract.fullMediaQualified !== true ||
    contract.isolationQualified !== true ||
    contract.operationsQualified !== true
  )
    return empty;
  const leaseId = dependencies.leaseId();
  if (!UUID.test(leaseId)) throw new ProductionSupportError();
  const claimed = await dependencies.claim(config, leaseId);
  if (claimed === null) return empty;
  if (
    !object(claimed) ||
    typeof claimed.outboxId !== "string" ||
    !UUID.test(claimed.outboxId) ||
    claimed.leaseId !== leaseId
  )
    throw new ProductionSupportError();
  const claim = { outboxId: claimed.outboxId, leaseId };
  let media: Awaited<ReturnType<typeof materializeMedia>> | undefined;
  if (claimed.kind === "media") {
    if (!dependencies.readClean) throw new ProductionSupportError();
    try {
      assertMediaRecipe(claimed.recipe);
      media = await materializeMedia(
        claimed.recipe,
        claim.outboxId,
        config.contractId,
        dependencies.readClean,
        AbortSignal.timeout(25_000),
      );
      if (
        media.requestHash !== claimed.requestHash ||
        media.requestBytes !== claimed.requestBytes
      )
        throw new MediaIntegrityError();
    } catch (error) {
      if (error instanceof MediaIntegrityError && dependencies.reconcile) {
        await dependencies.reconcile(config, claim);
        return { claimed: 1, accepted: 0, unconfirmed: 1 };
      }
      throw error;
    }
  }
  // This RPC records first_attempt_at durably and enforces the horizon and lease
  // before returning the exact previously-frozen provider request.
  const frozen = await dependencies.start(config, claim);
  if (frozen === null) return { ...empty, claimed: 1 };
  if (!object(frozen) || typeof frozen.budgetDay !== "string") throw new ProductionSupportError();
  const budgetDay = Date.parse(frozen.budgetDay);
  let request: FrozenRequest;
  if (media) {
    if (
      frozen.kind !== "media" ||
      frozen.outboxId !== claim.outboxId ||
      frozen.requestHash !== media.requestHash ||
      frozen.requestBytes !== media.requestBytes ||
      JSON.stringify(frozen.recipe) !== JSON.stringify(claimed.recipe) ||
      frozen.idempotencyKey !== `support-media:${claim.outboxId}` ||
      !Number.isSafeInteger(frozen.attemptCount) ||
      Number(frozen.attemptCount) < 1 ||
      typeof frozen.firstAttemptAt !== "string" ||
      !Number.isFinite(Date.parse(frozen.firstAttemptAt))
    )
      throw new ProductionSupportError();
    request = {
      ...media,
      outboxId: claim.outboxId,
      idempotencyKey: frozen.idempotencyKey,
      attemptCount: Number(frozen.attemptCount),
      firstAttemptAt: frozen.firstAttemptAt,
    };
  } else {
    assertFrozenRequest(frozen, config, claim.outboxId);
    request = frozen;
  }
  const now = dependencies.now();
  const elapsed = now - Date.parse(request.firstAttemptAt);
  if (elapsed < 0 || elapsed >= 20 * 3600 * 1000)
    return { claimed: 1, accepted: 0, unconfirmed: 1 };
  const utcDayMs = 24 * 3600 * 1000;
  // A delayed process must reserve another attempt before using the next day's budget.
  if (budgetDay !== Math.floor(now / utcDayMs) * utcDayMs) {
    await dependencies.complete(config, claim, { outcome: "unknown" });
    return { claimed: 1, accepted: 0, unconfirmed: 1 };
  }
  let outcome: SendOutcome;
  try {
    outcome = await dependencies.send(request);
  } catch {
    outcome = { outcome: "unknown" };
  }
  if (outcome.outcome === "accepted" && !UUID.test(outcome.providerEmailId))
    outcome = { outcome: "unknown" };
  const completed = await dependencies.complete(config, claim, outcome);
  return {
    claimed: 1,
    accepted: completed && outcome.outcome === "accepted" ? 1 : 0,
    unconfirmed: !completed || outcome.outcome === "unknown" ? 1 : 0,
  };
}
