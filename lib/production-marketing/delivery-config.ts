import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { readProductionMarketingCapabilityKey } from "./capabilities";
import { readProductionMarketingConfiguration } from "./config";
import { productionMarketingTemplateHash } from "./templates";
import type { ProductionMarketingEnvironment } from "./contract";
export const productionMarketingUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export type ProductionMarketingDeliveryContract = { version: "production_welcome_delivery_v1"; from: string; replyTo: string; topicId: string; postalAddress: string; templateHash: string };
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
export function productionMarketingWorkerAuthorized(request: Request, env: ProductionMarketingEnvironment): boolean {
  const secret = productionMarketingWorkerToken(env);
  const supplied = request.headers.get("authorization");
  if (!secret || !supplied || !supplied.startsWith("Bearer ")) return false;
  const a=Buffer.from(supplied), b=Buffer.from(`Bearer ${secret}`);
  return a.length===b.length && timingSafeEqual(a,b);
}
export function readProductionMarketingDeliveryConfiguration(env: ProductionMarketingEnvironment) {
  const base=readProductionMarketingConfiguration(env);
  if(env.HELIX_PRODUCTION_MARKETING_DISPATCH_ENABLED!=="true") throw invalid();
  const providerKey=env.HELIX_PRODUCTION_MARKETING_PROVIDER_KEY, contractText=env.HELIX_PRODUCTION_MARKETING_DELIVERY_CONTRACT;
  if(!providerKey || [base.serviceKey,env.RESEND_API_KEY,env.HELIX_PRODUCTION_MARKETING_WORKER_TOKEN,env.HELIX_PRODUCTION_MARKETING_PREFERENCE_KEY].includes(providerKey)
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

/** The operator qualifies this configuration after verifying the scheduled confirmation worker.
 * Ordinary deployments with identical credentials and content keep the same qualification. */
export function confirmationWorkerQualification(env: ProductionMarketingEnvironment) {
  const workerToken = productionMarketingWorkerToken(env);
  if (!workerToken) throw invalid();
  const config = readProductionMarketingDeliveryConfiguration(env);
  const capability = readProductionMarketingCapabilityKey(env);
  const workerBindingHash = createHmac("sha256", workerToken).update(JSON.stringify([
    "helix:production-marketing:confirmation-worker:v1",
    config.contractHash, env.VERCEL_PROJECT_ID, config.siteOrigin, config.supabaseUrl,
    config.providerKey, config.serviceKey, capability.keyId, capability.key.toString("hex"),
  ])).digest("hex");
  return { p_contract_hash: config.contractHash, p_worker_binding_hash: workerBindingHash };
}
