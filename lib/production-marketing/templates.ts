import "server-only";
import type { ProductionMarketingDeliveryContract } from "./delivery-config";
import type { ProductionMarketingIntent } from "./delivery-types";
import { renderMarketingBody } from "./template-content";

export { productionMarketingTemplateHash } from "./template-content";

export function renderProductionMarketingMessage(
  intent: ProductionMarketingIntent,
  contract: ProductionMarketingDeliveryContract,
  tokens: { confirmationToken?: string; preferenceToken: string },
) {
  const origin = "https://www.helixskin.us";
  const preferences = `${origin}/marketing/production/preferences#token=${tokens.preferenceToken}`;
  const action = intent.purpose === "confirmation"
    ? `${origin}/marketing/production/confirm#token=${tokens.confirmationToken}`
    : origin;
  return {
    from: contract.from,
    to: [intent.email],
    reply_to: contract.replyTo,
    ...(intent.direct && intent.purpose === "welcome" ? { topic_id: contract.topicId } : {}),
    ...renderMarketingBody(intent.purpose, action, preferences, contract.postalAddress),
    headers: intent.purpose === "welcome" ? {
      "List-Unsubscribe": `<${origin}/api/marketing/production/unsubscribe?token=${tokens.preferenceToken}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    } : {},
    tags: [
      { name: "environment", value: "production" },
      { name: "helix_message_id", value: intent.id },
      { name: "helix_purpose", value: intent.purpose },
      { name: "helix_contract", value: contract.version },
    ],
  };
}
