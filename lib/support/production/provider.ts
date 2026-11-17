import "server-only";
import { createHash } from "node:crypto";
import { HASH, ProductionSupportError, SUPPORT_FROM, SUPPORT_TO, UUID, type ProductionConfig } from "./config";
import { boundedText, email, object, strictKeys } from "./request";

export type FrozenRequest = { outboxId: string; requestText: string; requestHash: string; idempotencyKey: string; attemptCount: number; firstAttemptAt: string };
export type SendOutcome = { outcome: "accepted"; providerEmailId: string } | { outcome: "unknown" | "rejected" };
/** Validate without reserializing. The database owns these immutable bytes and key. */
export function assertFrozenRequest(value: unknown, config: ProductionConfig, outboxId: string): asserts value is FrozenRequest {
  if (!object(value) || value.outboxId !== outboxId || typeof value.requestText !== "string"
    || Buffer.byteLength(value.requestText) > 48 * 1024 || typeof value.requestHash !== "string" || !HASH.test(value.requestHash)
    || createHash("sha256").update(value.requestText).digest("hex") !== value.requestHash
    || typeof value.idempotencyKey !== "string" || !/^[A-Za-z0-9:_-]{1,256}$/.test(value.idempotencyKey)
    || !Number.isSafeInteger(value.attemptCount) || Number(value.attemptCount) < 1
    || typeof value.firstAttemptAt !== "string" || !Number.isFinite(Date.parse(value.firstAttemptAt))) throw new ProductionSupportError();
  let payload: unknown;
  try { payload = JSON.parse(value.requestText); } catch { throw new ProductionSupportError(); }
  if (!object(payload)) throw new ProductionSupportError();
  strictKeys(payload, ["from", "to", "reply_to", "subject", "text", "tags"]);
  if (payload.from !== SUPPORT_FROM || !Array.isArray(payload.to) || payload.to.length !== 1 || payload.to[0] !== SUPPORT_TO
    || payload.subject !== `Helix Website inquiry ${outboxId}` || typeof payload.text !== "string" || payload.text.length > 14_000
    || !Array.isArray(payload.tags) || payload.tags.length !== 3) throw new ProductionSupportError();
  email(payload.reply_to);
  const tags: Record<string, string> = {};
  for (const tag of payload.tags) {
    if (!object(tag) || Object.keys(tag).length !== 2 || typeof tag.name !== "string" || typeof tag.value !== "string"
      || !["helix_support_contract", "helix_support_outbox", "helix_support_delivery"].includes(tag.name)
      || Object.hasOwn(tags, tag.name)) throw new ProductionSupportError();
    tags[tag.name] = tag.value;
  }
  if (tags.helix_support_contract !== config.contractId || tags.helix_support_outbox !== outboxId || !HASH.test(tags.helix_support_delivery ?? "")) throw new ProductionSupportError();
}
/** Sending-only REST API. No receiving/read capability or shared provider client. */
export async function sendFrozenRequest(request: FrozenRequest, sendingKey: string, network: typeof fetch = fetch): Promise<SendOutcome> {
  if (!/^re_[A-Za-z0-9_-]{20,256}$/.test(sendingKey)) throw new ProductionSupportError();
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error("deadline")); }, 10_000); });
  try {
    const result = await Promise.race([network("https://api.resend.com/emails", {
      method: "POST", redirect: "error", signal: controller.signal,
      headers: { authorization: `Bearer ${sendingKey}`, "content-type": "application/json", "idempotency-key": request.idempotencyKey },
      body: request.requestText,
    }), deadline]);
    if (!result.ok) {
      // Explicit validation/auth rejection is definite. A timeout, conflict, quota,
      // server error, or any other unrecognized status is conservatively unknown.
      void result.body?.cancel().catch(() => undefined);
      return { outcome: [400, 401, 403, 422].includes(result.status) ? "rejected" : "unknown" };
    }
    const raw = await Promise.race([boundedText(result, 4096, 5_000), deadline]);
    const accepted: unknown = JSON.parse(raw);
    return object(accepted) && typeof accepted.id === "string" && UUID.test(accepted.id)
      ? { outcome: "accepted", providerEmailId: accepted.id } : { outcome: "unknown" };
  } catch { return { outcome: "unknown" }; }
  finally { if (timer) clearTimeout(timer); }
}
