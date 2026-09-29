import "server-only";
import { randomUUID } from "node:crypto";
import { renderOrderConfirmation } from "@/lib/email/order-confirmation";
import { renderOrderTracking } from "@/lib/email/order-tracking";
import { renderSupportEmail } from "@/lib/support/email";
import { renderProductNotification } from "@/lib/waitlist/templates";
import { isMarketingPurpose, parseMarketingReceipt, type MarketingPurpose } from "@/lib/marketing/contract";
import { renderMarketingMessage } from "@/lib/marketing/templates";
import { MarketingProviderError, resendMarketingContacts } from "@/lib/marketing/provider";
import { verifyMarketingPreferences } from "@/lib/marketing/service";
import { marketingServiceStorage } from "@/lib/marketing/storage";
import { emailRecipientAllowed, EmailConfigurationError, readEmailConfig, readEmailSender, type EmailEnvironment } from "@/lib/email/config";
import type { EmailAttemptOutcome, EmailDeliveryStorage, EmailIntent, EmailRequest } from "@/lib/email/types";

export type EmailDeliveryDependencies = {
  storage: EmailDeliveryStorage;
  send(payload: EmailRequest, idempotencyKey: string, apiKey: string): Promise<EmailAttemptOutcome>;
  env: EmailEnvironment;
};

type MarketingIntent = Extract<EmailIntent, { purpose: MarketingPurpose }>;
function marketingIntent(intent: EmailIntent): intent is MarketingIntent { return isMarketingPurpose(intent.purpose); }
async function renderEmailContent(intent: Exclude<EmailIntent, MarketingIntent>, config: ReturnType<typeof readEmailConfig>) {
  switch (intent.purpose) {
    case "order_confirmation": return renderOrderConfirmation(intent.receipt, config);
    case "order_tracking": return renderOrderTracking(intent.receipt, config);
    case "support_acknowledgement": case "support_reply": return renderSupportEmail(intent.purpose, intent.receipt);
    case "product_availability": case "product_waitlist_recovery": return renderProductNotification(intent.purpose, intent.receipt, config);
  }
}

export async function dispatchEmailIntents({ storage, send, env }: EmailDeliveryDependencies) {
  const result = { claimed: 0, accepted: 0, deferred: 0, blocked: 0 };
  if (env.HELIX_EMAIL_DISPATCH_ENABLED !== "true") return result;
  const config = readEmailConfig(env);
  // One complete attempt fits the hosted deadline, including native preference
  // reads. Do not lease a batch that cannot be processed before that deadline.
  const intents = await storage.claim(randomUUID(), 1);
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
    let eligibility: "eligible" | "blocked" | "deferred" = "eligible";
    try {
      if (intent.requestPayload) payload = intent.requestPayload;
      else {
        const content = marketingIntent(intent)
          ? await renderMarketingMessage(intent.purpose, intent.receipt, config.apiKey)
          : { from: readEmailSender(intent.purpose, env), reply_to: config.replyTo,
            ...await renderEmailContent(intent, config) };
        payload = { ...content, to: [intent.recipient],
          tags: [{ name: "helix_environment", value: "sandbox" }, { name: "helix_message_id", value: intent.id }] };
      }
      if (intent.purpose === "welcome_initial" || intent.purpose === "welcome_education") {
        const receipt = parseMarketingReceipt(intent.receipt);
        eligibility = await verifyMarketingPreferences({ subscriberId: receipt.subscriberId, generation: receipt.generation,
          revision: receipt.revision, topicId: receipt.templateContract.topicId },
        { storage: marketingServiceStorage, provider: resendMarketingContacts, env });
      }
    } catch (error) {
      const unavailable = error instanceof MarketingProviderError && error.code === "provider_unavailable";
      await storage.finish(intent.id, intent.leaseToken, { kind: unavailable ? "retry" : "blocked",
        code: unavailable ? "marketing_template_unavailable" : error instanceof EmailConfigurationError ? error.code
          : error instanceof MarketingProviderError ? "invalid_marketing_template" : "invalid_receipt" });
      if (unavailable) result.deferred++; else result.blocked++;
      continue;
    }
    if (eligibility !== "eligible") {
      await storage.finish(intent.id, intent.leaseToken, { kind: eligibility === "blocked" ? "blocked" : "retry",
        code: eligibility === "blocked" ? "marketing_not_eligible" : "marketing_preferences_unavailable" });
      result[eligibility]++;
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
