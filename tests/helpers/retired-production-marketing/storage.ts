import "server-only";
import { productionDeploymentAuthorized } from "@/lib/release/deployment-authorization";
import { readBoundedBody } from "@/lib/email/provider";
import { productionMarketingEnrollmentEnabled, productionMarketingRpcHeaders, readProductionMarketingConfiguration } from "@/lib/production-marketing/config";
import { productionSignupQualification } from "@/lib/production-marketing/delivery-config";
import type { ProductionMarketingEnvironment } from "@/lib/production-marketing/contract";
import type { ProductionMarketingRequestStorage } from "./requests";

export { productionSignupQualification };

// Only these fixed RPCs receive the verified parent credential. Unknown writes are never replayed.
export function createProductionMarketingStorage(env: ProductionMarketingEnvironment): ProductionMarketingRequestStorage & { enrollmentReady(): Promise<boolean> } {
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
          method: "POST", headers: productionMarketingRpcHeaders(config.serviceKey),
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
  async function qualifiedWorker() {
    if (env.HELIX_PRODUCTION_MARKETING_DISPATCH_ENABLED !== "true" ||
        env.HELIX_PRODUCTION_MARKETING_EVENTS_ENABLED !== "true" || !await productionMarketingEnrollmentEnabled(env)) {
      throw new Error("Production marketing is unavailable.");
    }
    return productionSignupQualification(env);
  }

  async function enrollmentReady(): Promise<boolean> {
    try {
      return await rpc("production_marketing_enrollment_ready", await qualifiedWorker());
    } catch {
      return false;
    }
  }

  return {
    enrollmentReady,
    async request(input) {
      return rpc("request_qualified_production_marketing_subscription", {
        ...await qualifiedWorker(),
        p_email: input.email,
        p_confirmation_hash: input.confirmationHash,
        p_preference_hash: input.preferenceHash,
        p_requester_hash: input.requesterHash,
        p_explicit_consent: input.explicitConsent,
        p_wording_version: input.wordingVersion,
        p_delivery_payload: input.deliveryPayload,
      });
    },
    confirm: hash => rpc("confirm_production_marketing_subscription", { p_token_hash: hash }),
    withdraw: hash => rpc("withdraw_production_marketing_subscription", { p_token_hash: hash }),
  };
}

export async function productionMarketingSignupStatus(request: Request, env: ProductionMarketingEnvironment) {
  const origin = new URL(request.url).origin;
  const canonical = origin === "https://www.helixskin.us";
  const deploymentHost = env.VERCEL_URL;
  const heldHost = deploymentHost && /^[a-z0-9-]+\.vercel\.app$/.test(deploymentHost)
    && origin === `https://${deploymentHost}`;
  const production = Boolean(canonical || heldHost) && await productionDeploymentAuthorized(env);
  const enabled = canonical && production && await createProductionMarketingStorage(env).enrollmentReady();
  return { production, enabled };
}
