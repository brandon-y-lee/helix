import "server-only";
import { Resend } from "resend";
import { supportRfcMessageId } from "@/lib/support/threading";
import { assertCanonicalRequest, assertStoredContract, HASH, productionConfig, ProductionSupportError, SUPPORT_FROM, SUPPORT_TO, UUID,
  type ProductionConfig, type ProductionEnvironment } from "./config";
import { boundedText, failure, object, response } from "./request";

export type SentMetadata = { projectRef: string; contractId: string; outboxId: string; deliveryToken: string; providerEmailId: string;
  messageId: string; from: string; to: string; eventId: string };
export type SentDependencies = { env: ProductionEnvironment; contract(config: ProductionConfig): Promise<unknown>;
  record(input: SentMetadata, config: ProductionConfig): Promise<unknown> };
export async function handleProductionSent(request: Request, dependencies: SentDependencies): Promise<Response> {
  try {
    if (request.method !== "POST") throw new ProductionSupportError(405, "method_not_allowed");
    const config = productionConfig(dependencies.env);
    assertCanonicalRequest(request);
    const secret = dependencies.env.HELIX_PRODUCTION_SUPPORT_SENT_WEBHOOK_SECRET;
    if (!secret || !/^whsec_[A-Za-z0-9+/=]{20,256}$/.test(secret)) throw new ProductionSupportError();
    const raw = await boundedText(request, 32 * 1024);
    const eventId = request.headers.get("svix-id") ?? "";
    const timestamp = request.headers.get("svix-timestamp") ?? "";
    const signature = request.headers.get("svix-signature") ?? "";
    if (!/^[A-Za-z0-9_-]{1,200}$/.test(eventId) || !/^\d{1,12}$/.test(timestamp) || signature.length > 1024) throw new ProductionSupportError(400, "invalid_event");
    let event: unknown;
    try {
      // Local verification only: no API call and no sending/read key required.
      event = new Resend("re_local_signature_verification_only").webhooks.verify({ payload: raw, webhookSecret: secret,
        headers: { id: eventId, timestamp, signature } });
    } catch { throw new ProductionSupportError(400, "invalid_event"); }
    if (!object(event) || event.type !== "email.sent" || !object(event.data) || typeof event.created_at !== "string"
      || !Number.isFinite(Date.parse(event.created_at))) throw new ProductionSupportError(400, "invalid_event");
    const data = event.data;
    if (!object(data.tags) || typeof data.tags.helix_support_outbox !== "string" || !UUID.test(data.tags.helix_support_outbox)
      || data.tags.helix_support_contract !== config.contractId || typeof data.tags.helix_support_delivery !== "string" || !HASH.test(data.tags.helix_support_delivery)
      || data.from !== SUPPORT_FROM || !Array.isArray(data.to) || data.to.length !== 1 || data.to[0] !== SUPPORT_TO
      || (data.cc !== undefined && (!Array.isArray(data.cc) || data.cc.length !== 0))
      || (data.bcc !== undefined && (!Array.isArray(data.bcc) || data.bcc.length !== 0))
      || data.subject !== `Helix Website inquiry ${data.tags.helix_support_outbox}`
      || typeof data.email_id !== "string" || !UUID.test(data.email_id) || !supportRfcMessageId(data.message_id)) throw new ProductionSupportError(400, "invalid_event");
    // Admission and sending pause do not prevent reconciliation of already-owned attempts.
    const contract = await dependencies.contract(config);
    assertStoredContract(contract, config);
    const status = await dependencies.record({ projectRef: config.projectRef, contractId: config.contractId,
      outboxId: data.tags.helix_support_outbox, deliveryToken: data.tags.helix_support_delivery, providerEmailId: data.email_id,
      messageId: data.message_id, from: SUPPORT_FROM, to: SUPPORT_TO, eventId }, config);
    if (!["matched", "duplicate", "conflict", "unmatched"].includes(String(status))) throw new ProductionSupportError();
    return response({ ok: true });
  } catch (error) { return failure(error); }
}
