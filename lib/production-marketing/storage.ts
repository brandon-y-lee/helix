import "server-only";
import { createHmac } from "node:crypto";
import { marketingSigningKey } from "./callback-config";
import { nativeCallbackIdentity } from "./native-restrictions";
import { productionDeploymentAuthorized } from "@/lib/release/deployment-authorization";
import { readBoundedBody } from "@/lib/email/provider";
import { productionMarketingEnrollmentEnabled, readProductionMarketingConfiguration } from "./config";
import { confirmationWorkerQualification } from "./delivery-config";
import type { ProductionMarketingEnvironment } from "./contract";
import type { ProductionMarketingRequestStorage } from "./requests";

/** A changed callback destination, signer or native contract pauses new admission until verified again. */
export function productionSignupQualification(env: ProductionMarketingEnvironment) {
  const worker = confirmationWorkerQualification(env);
  const identity = nativeCallbackIdentity(env);
  const signer = marketingSigningKey(env, true);
  if (!identity) throw new Error("Production marketing is unavailable.");
  const binding = createHmac("sha256", Buffer.from(worker.p_worker_binding_hash, "hex")).update(JSON.stringify([
    "helix:production-marketing:signup:v2", identity.digest, identity.sender, identity.template, signer,
  ])).digest("hex");
  return { p_contract_hash: worker.p_contract_hash, p_worker_binding_hash: binding };
}

// Dedicated bounded RPC-only transport. Never constructs the sandbox admin client,
// accepts a caller-selected URL, logs failures, or retries an ambiguous write.
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
  async function qualifiedWorker() {
    if (!await productionMarketingEnrollmentEnabled(env)) {
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
