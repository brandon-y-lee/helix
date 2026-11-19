import "server-only";
import { handleProductionSent } from "@/lib/support/production/sent";
import { productionRpc } from "@/lib/support/production/storage";
import { receiveProductionMarketingEvent } from "@/lib/production-marketing/events";
import { createProductionMarketingEventStorage } from "@/lib/production-marketing/event-storage";
import { receiveProductionEmail, type GatewayDependencies, type GatewayEnvironment } from "./gateway";
/** Existing handlers re-verify the same raw body; their own independent guards stay active. */
export function productionEmailDelegates(env: GatewayEnvironment): Pick<GatewayDependencies, "support" | "welcome"> {
  return {
    support: (request, secret) => handleProductionSent(request, {
      env: { ...env, HELIX_PRODUCTION_SUPPORT_SENT_WEBHOOK_SECRET: secret },
      contract: (config) => productionRpc(config, "read_support_prod_contract"),
      record: async (input, config) => {
        const result = await productionRpc(config, "record_support_prod_sent", input);
        // The existing standalone route acknowledges unmatched/conflict; the shared
        // ingress must retain uncertain ownership for reconciliation instead.
        if (result !== "matched" && result !== "duplicate") throw new Error("Unconfirmed support ownership");
        return result;
      },
    }),
    welcome: (request, secret) => {
      const dedicated = { ...env, HELIX_PRODUCTION_MARKETING_WEBHOOK_SECRET: secret };
      const storage = createProductionMarketingEventStorage(dedicated);
      return receiveProductionMarketingEvent(request, { env: dedicated, record: async (event) => {
        const result = await storage.record(event);
        return result === "recorded" ? "recorded" : "paused";
      } });
    },
  };
}
export function deployedProductionEmail(request: Request): Promise<Response> {
  // Intentionally no legacy snapshot, DB adapter or provider client. This dark
  // source stage cannot replace the active webhook or admit support traffic.
  const env = { ...process.env };
  return receiveProductionEmail(request, { env, ...productionEmailDelegates(env) });
}
