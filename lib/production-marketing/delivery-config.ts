import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { configuredMarketingSigningKey } from "./callback-config";
import { readProductionMarketingCapabilityKey } from "./capabilities";
import { readProductionMarketingConfiguration } from "./config";
import { productionMarketingTemplateHash } from "./templates";
import type { ProductionMarketingEnvironment } from "./contract";
export const productionMarketingUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export type ProductionMarketingDeliveryContract = { version: "production_welcome_delivery_v1"; from: string; replyTo: string; topicId: string; postalAddress: string; templateHash: string };
export const directMarketingDeliveryContract: Readonly<ProductionMarketingDeliveryContract> = Object.freeze({
  version: "production_welcome_delivery_v1",
  from: "hello@helixskin.us", replyTo: "hello@helixskin.us",
  topicId: "aca091c7-8da7-440e-8761-e6a549c60aa5",
  postalAddress: "Helix Labs LLC, 2747 Haste Street, Berkeley, CA 94704",
  templateHash: productionMarketingTemplateHash,
});
export function directProductionMarketingContract(contract: ProductionMarketingDeliveryContract): boolean {
  return contract.version === directMarketingDeliveryContract.version &&
    contract.from === directMarketingDeliveryContract.from && contract.replyTo === directMarketingDeliveryContract.replyTo &&
    contract.topicId === directMarketingDeliveryContract.topicId && contract.postalAddress === directMarketingDeliveryContract.postalAddress &&
    contract.templateHash === directMarketingDeliveryContract.templateHash;
}
export const productionMarketingContractFingerprint = (text: string) => createHash("sha256").update(text).digest("hex");
const invalid = () => new Error("Production marketing is unavailable.");
export function productionMarketingWorkerToken(env: ProductionMarketingEnvironment): string | undefined {
  const token = env.HELIX_PRODUCTION_MARKETING_WORKER_TOKEN;
  if (!token || token.length < 32 || token.length > 256 ||
    [env.HELIX_PRODUCTION_MARKETING_SERVICE_KEY, env.HELIX_PRODUCTION_MARKETING_PROVIDER_KEY,
      env.HELIX_PRODUCTION_MARKETING_PREFERENCE_KEY, env.CRON_SECRET,
      env.SUPABASE_SERVICE_ROLE_KEY, env.RESEND_API_KEY].includes(token)) return undefined;
  return token;
}
export function productionMarketingScheduleSecret(env: ProductionMarketingEnvironment): string | undefined {
  const secret = env.CRON_SECRET;
  if (!secret || !/^[!-~]{32,256}$/.test(secret)) return undefined;
  const separate = [
    env.HELIX_PRODUCTION_MARKETING_WORKER_TOKEN, env.HELIX_PRODUCTION_MARKETING_PROVIDER_KEY,
    env.SUPABASE_SERVICE_ROLE_KEY, env.HELIX_PRODUCTION_MARKETING_CAPABILITY_KEY,
    env.HELIX_PRODUCTION_MARKETING_ABUSE_KEY, env.HELIX_PRODUCTION_MARKETING_WEBHOOK_SECRET,
    env.HELIX_PRODUCTION_MARKETING_PREFERENCE_KEY, env.RESEND_API_KEY,
  ];
  return separate.includes(secret) ? undefined : secret;
}
export function productionMarketingWorkerAuthorized(request: Request, env: ProductionMarketingEnvironment): boolean {
  const secret = productionMarketingWorkerToken(env);
  const supplied = request.headers.get("authorization");
  if (!secret || !supplied || !supplied.startsWith("Bearer ")) return false;
  const a=Buffer.from(supplied), b=Buffer.from(`Bearer ${secret}`);
  return a.length===b.length && timingSafeEqual(a,b);
}
function configuredDelivery(env: ProductionMarketingEnvironment) {
  const base=readProductionMarketingConfiguration(env);
  const providerKey=env.HELIX_PRODUCTION_MARKETING_PROVIDER_KEY, contractText=env.HELIX_PRODUCTION_MARKETING_DELIVERY_CONTRACT ?? JSON.stringify(directMarketingDeliveryContract);
  if(!providerKey || [base.serviceKey,env.RESEND_API_KEY,env.CRON_SECRET,env.HELIX_PRODUCTION_MARKETING_WORKER_TOKEN,env.HELIX_PRODUCTION_MARKETING_PREFERENCE_KEY].includes(providerKey)
    || !contractText || contractText.length>4096) throw invalid();
  const c: unknown=JSON.parse(contractText);
  if(!c || typeof c!=="object" || Array.isArray(c)) throw invalid();
  const v=c as Record<string,unknown>, keys=["version","from","replyTo","topicId","postalAddress","templateHash"];
  if(Object.keys(v).length!==keys.length || !keys.every(key=>Object.hasOwn(v,key)) || v.version!=="production_welcome_delivery_v1"
    || typeof v.from!=="string" || v.from.trim()!==v.from || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@(?:[a-z0-9-]+\.)*helixskin\.us$/.test(v.from)
    || typeof v.replyTo!=="string" || v.replyTo.trim()!==v.replyTo || !/^[^\s<>@]+@(?:[a-z0-9-]+\.)*helixskin\.us$/.test(v.replyTo)
    || typeof v.topicId!=="string" || v.topicId.length!==36 || !productionMarketingUuid.test(v.topicId)
    || typeof v.postalAddress!=="string" || v.postalAddress.trim()!==v.postalAddress || !v.postalAddress || v.postalAddress.length>500 || /[\r\n\x00]/.test(v.postalAddress)
    || v.templateHash!==productionMarketingTemplateHash) throw invalid();
  return {...base,providerKey,contractText,contractHash:productionMarketingContractFingerprint(contractText),contract:v as ProductionMarketingDeliveryContract};
}

export function readProductionMarketingDeliveryConfiguration(env: ProductionMarketingEnvironment) {
  if (env.HELIX_PRODUCTION_MARKETING_DISPATCH_ENABLED !== "true") throw invalid();
  return configuredDelivery(env);
}

/** The operator qualifies this configuration after verifying the scheduled confirmation worker.
 * Ordinary deployments with identical credentials and content keep the same qualification. */
function workerQualification(env: ProductionMarketingEnvironment, config: ReturnType<typeof configuredDelivery>) {
  const workerToken = productionMarketingWorkerToken(env);
  if (!workerToken) throw invalid();
  const capability = readProductionMarketingCapabilityKey(env);
  const workerBindingHash = createHmac("sha256", workerToken).update(JSON.stringify([
    "helix:production-marketing:confirmation-worker:v1",
    config.contractHash, env.VERCEL_PROJECT_ID, config.siteOrigin, config.supabaseUrl,
    config.providerKey, config.serviceKey, capability.keyId, capability.key.toString("hex"),
  ])).digest("hex");
  return { p_contract_hash: config.contractHash, p_worker_binding_hash: workerBindingHash };
}

/** Retained workers qualify the exact original contract, including its JSON bytes. */
export function confirmationWorkerQualification(env: ProductionMarketingEnvironment) {
  return workerQualification(env, configuredDelivery(env));
}

/** Read-only runtime qualification. Operational admission is enforced independently. */
export function productionSignupQualification(env: ProductionMarketingEnvironment) {
  const config = configuredDelivery(env);
  if (!productionMarketingScheduleSecret(env) || !directProductionMarketingContract(config.contract) || !/^re_[A-Za-z0-9_-]{12,250}$/.test(config.providerKey)) throw invalid();
  const signer = configuredMarketingSigningKey(env, true);
  const worker = workerQualification(env, config);
  const binding = createHmac("sha256", Buffer.from(worker.p_worker_binding_hash, "hex")).update(JSON.stringify([
    "helix:production-marketing:direct-signup:v1", signer,
  ])).digest("hex");
  return { p_contract_hash: worker.p_contract_hash, p_worker_binding_hash: binding };
}
