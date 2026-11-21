import "server-only";
import type { ProductionMarketingEnvironment } from "./contract";

export function marketingSigningKey(env: ProductionMarketingEnvironment, standalone: boolean) {
  const value = env.HELIX_PRODUCTION_MARKETING_WEBHOOK_SECRET;
  if (env.HELIX_PRODUCTION_MARKETING_EVENTS_ENABLED !== "true" || !value?.startsWith("whsec_") ||
      value === env.RESEND_WEBHOOK_SECRET || value.length > 256) throw new Error("Marketing callbacks unavailable.");
  if (standalone && [env.HELIX_PRODUCTION_EMAIL_GATEWAY_WEBHOOK_SECRET, env.HELIX_PRODUCTION_SUPPORT_SENT_WEBHOOK_SECRET].includes(value))
    throw new Error("Marketing callbacks unavailable.");
  const encoded = value.slice(6);
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.length < 16 || bytes.length > 64 || bytes.toString("base64") !== encoded) throw new Error("Marketing callbacks unavailable.");
  return value;
}
