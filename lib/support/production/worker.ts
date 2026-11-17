import "server-only";
import { assertStoredContract, ProductionSupportError, UUID, type ProductionConfig } from "./config";
import { assertFrozenRequest, type FrozenRequest, type SendOutcome } from "./provider";
import { object } from "./request";

export type ClaimedOutbox = { outboxId: string; leaseId: string };
export type WorkerDependencies = {
  contract(config: ProductionConfig): Promise<unknown>;
  claim(config: ProductionConfig, leaseId: string): Promise<unknown>;
  start(config: ProductionConfig, claim: ClaimedOutbox): Promise<unknown>;
  complete(config: ProductionConfig, claim: ClaimedOutbox, outcome: SendOutcome): Promise<boolean>;
  send(request: FrozenRequest): Promise<SendOutcome>;
  now(): number; leaseId(): string;
};
/** One awaited job per invocation. No scheduler registration or background work. */
export async function dispatchProductionOutbox(config: ProductionConfig, dependencies: WorkerDependencies) {
  const empty = { claimed: 0, accepted: 0, unconfirmed: 0 };
  if (!config.workerEnabled || !config.fullMediaQualified || !config.isolationQualified || !config.operationsQualified) return empty;
  const contract = await dependencies.contract(config);
  assertStoredContract(contract, config);
  if (contract.workerEnabled !== true || contract.fullMediaQualified !== true || contract.isolationQualified !== true || contract.operationsQualified !== true) return empty;
  const leaseId = dependencies.leaseId();
  if (!UUID.test(leaseId)) throw new ProductionSupportError();
  const claimed = await dependencies.claim(config, leaseId);
  if (claimed === null) return empty;
  if (!object(claimed) || typeof claimed.outboxId !== "string" || !UUID.test(claimed.outboxId) || claimed.leaseId !== leaseId) throw new ProductionSupportError();
  const claim = { outboxId: claimed.outboxId, leaseId };
  // This RPC records first_attempt_at durably and enforces the horizon and lease
  // before returning the exact previously-frozen provider request.
  const frozen = await dependencies.start(config, claim);
  if (frozen === null) return { ...empty, claimed: 1 };
  assertFrozenRequest(frozen, config, claim.outboxId);
  const elapsed = dependencies.now() - Date.parse(frozen.firstAttemptAt);
  if (elapsed < 0 || elapsed >= 20 * 3600 * 1000) return { claimed: 1, accepted: 0, unconfirmed: 1 };
  let outcome: SendOutcome;
  try { outcome = await dependencies.send(frozen); } catch { outcome = { outcome: "unknown" }; }
  if (outcome.outcome === "accepted" && !UUID.test(outcome.providerEmailId)) outcome = { outcome: "unknown" };
  const completed = await dependencies.complete(config, claim, outcome);
  return { claimed: 1, accepted: completed && outcome.outcome === "accepted" ? 1 : 0,
    unconfirmed: !completed || outcome.outcome === "unknown" ? 1 : 0 };
}
