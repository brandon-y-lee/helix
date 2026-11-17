import "server-only";
import { readBoundedBody } from "@/lib/email/provider";
import { readProductionMarketingConfiguration } from "./config";
import type { ProductionMarketingEnvironment } from "./contract";
import type { ProductionMarketingRequestStorage } from "./requests";

// Dedicated bounded RPC-only transport. Never constructs the sandbox admin client,
// accepts a caller-selected URL, logs failures, or retries an ambiguous write.
export function createProductionMarketingStorage(env: ProductionMarketingEnvironment): ProductionMarketingRequestStorage {
  async function rpc(name: string, args: Record<string, unknown>): Promise<boolean> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const config = readProductionMarketingConfiguration(env);
      const deadline = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error()); }, 3_000);
      });
      return await Promise.race([(async () => {
        const result = await fetch(`${config.supabaseUrl}/rest/v1/rpc/${name}`, {
          method: "POST", headers: { "Content-Type": "application/json", apikey: config.serviceKey, Authorization: `Bearer ${config.serviceKey}` },
          body: JSON.stringify(args), signal: controller.signal, cache: "no-store", redirect: "error",
        });
        if (!result.ok) { await result.body?.cancel(); throw new Error(); }
        const value: unknown = JSON.parse(await readBoundedBody(result, 128));
        if (typeof value !== "boolean") throw new Error();
        return value;
      })(), deadline]);
    } catch { throw new Error("Production marketing is unavailable."); }
    finally { clearTimeout(timer); controller.abort(); }
  }
  return {
    request: input => rpc("request_production_marketing_subscription", { p_email: input.email,
      p_confirmation_hash: input.confirmationHash, p_preference_hash: input.preferenceHash, p_requester_hash: input.requesterHash,
      p_explicit_consent: input.explicitConsent, p_wording_version: input.wordingVersion, p_delivery_payload: input.deliveryPayload }),
    confirm: hash => rpc("confirm_production_marketing_subscription", { p_token_hash: hash }),
    withdraw: hash => rpc("withdraw_production_marketing_subscription", { p_token_hash: hash }),
  };
}
