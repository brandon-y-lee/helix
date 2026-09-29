import "server-only";
import { randomUUID } from "node:crypto";
import { renderOrderConfirmation } from "@/lib/email/order-confirmation";
import { renderOrderTracking } from "@/lib/email/order-tracking";
import { renderSupportEmail } from "@/lib/support/email";
import { emailRecipientAllowed, EmailConfigurationError, readEmailConfig, readEmailSender, type EmailEnvironment } from "@/lib/email/config";
import type { EmailAttemptOutcome, EmailDeliveryStorage, EmailIntent, EmailRequest } from "@/lib/email/types";

export type EmailDeliveryDependencies = {
  storage: EmailDeliveryStorage;
  send(payload: EmailRequest, idempotencyKey: string, apiKey: string): Promise<EmailAttemptOutcome>;
  env: EmailEnvironment;
};

async function renderEmailContent(intent: EmailIntent, config: ReturnType<typeof readEmailConfig>) {
  switch (intent.purpose) {
    case "order_confirmation": return renderOrderConfirmation(intent.receipt, config);
    case "order_tracking": return renderOrderTracking(intent.receipt, config);
    case "support_acknowledgement": case "support_reply": return renderSupportEmail(intent.purpose, intent.receipt);
  }
}

export async function dispatchEmailIntents({ storage, send, env }: EmailDeliveryDependencies) {
  const result = { claimed: 0, accepted: 0, deferred: 0, blocked: 0 };
  if (env.HELIX_EMAIL_DISPATCH_ENABLED !== "true") return result;
  const config = readEmailConfig(env);
  const intents = await storage.claim(randomUUID(), 5);
  result.claimed = intents.length;
  for (const intent of intents) {
    if (intent.firstAttemptAt && Date.now() - Date.parse(intent.firstAttemptAt) >= 23 * 60 * 60 * 1000) {
      await storage.finish(intent.id, intent.leaseToken, { kind: "uncertain", code: "reconciliation_required" });
      result.deferred++;
      continue;
    }
    if (!emailRecipientAllowed(intent.recipient, env)) {
      await storage.finish(intent.id, intent.leaseToken, { kind: "blocked", code: "recipient_not_allowed" });
      result.blocked++;
      continue;
    }
    let payload: EmailRequest;
    try {
      payload = intent.requestPayload ?? {
        from: readEmailSender(intent.purpose, env), to: [intent.recipient], reply_to: config.replyTo,
        ...await renderEmailContent(intent, config),
        tags: [{ name: "helix_environment", value: "sandbox" }, { name: "helix_message_id", value: intent.id }],
      };
    } catch (error) {
      await storage.finish(intent.id, intent.leaseToken, { kind: "blocked", code: error instanceof EmailConfigurationError ? error.code : "invalid_receipt" });
      result.blocked++;
      continue;
    }
    const prepared = await storage.prepare(intent.id, intent.leaseToken, payload);
    if (!prepared?.requestPayload) { result.deferred++; continue; }
    if (!prepared.firstAttemptAt || !Number.isFinite(Date.parse(prepared.firstAttemptAt))
      || Date.now() - Date.parse(prepared.firstAttemptAt) >= 23 * 60 * 60 * 1000) {
      await storage.finish(intent.id, intent.leaseToken, { kind: "uncertain", code: "reconciliation_required" });
      result.deferred++;
      continue;
    }
    let outcome: EmailAttemptOutcome;
    try { outcome = await send(prepared.requestPayload, prepared.idempotencyKey, config.apiKey); }
    catch { outcome = { kind: "uncertain", code: "provider_connection_uncertain" }; }
    const saved = await storage.finish(intent.id, intent.leaseToken, outcome);
    if (saved && outcome.kind === "accepted") result.accepted++;
    else result.deferred++;
  }
  return result;
}

export { EmailConfigurationError };
