import "server-only";

export type ProductionEnvironment = Record<string, string | undefined>;
export const PRODUCTION_ORIGIN = "https://www.helixskin.us";
export const SUPPORT_FROM = "Helix Website <contact@helixskin.us>";
export const SUPPORT_TO = "support@helixskin.us";
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const HASH = /^[a-f0-9]{64}$/;
export type ProductionConfig = ReturnType<typeof productionConfig>;
export class ProductionSupportError extends Error {
  constructor(readonly status = 503, readonly code = "support_unavailable") { super(code); }
}
export function productionConfig(env: ProductionEnvironment) {
  const projectRef = env.HELIX_PRODUCTION_SUPPORT_PROJECT_REF;
  const contractId = env.HELIX_PRODUCTION_SUPPORT_CONTRACT_ID;
  const projectUrl = env.HELIX_PRODUCTION_SUPPORT_PROJECT_URL;
  const serviceKey = env.HELIX_PRODUCTION_SUPPORT_SERVICE_ROLE_KEY;
  const abuseSecret = env.HELIX_PRODUCTION_SUPPORT_ABUSE_SECRET;
  if (env.VERCEL !== "1" || env.VERCEL_ENV !== "production"
    || (env.VERCEL_TARGET_ENV !== undefined && env.VERCEL_TARGET_ENV !== "production")
    || env.HELIX_PRODUCTION_SUPPORT_ORIGIN !== PRODUCTION_ORIGIN
    || !projectRef || !/^[a-z0-9]{20}$/.test(projectRef) || projectUrl !== `https://${projectRef}.supabase.co`
    || !contractId || !UUID.test(contractId)
    || !serviceKey || !/^[A-Za-z0-9_.-]{32,4096}$/.test(serviceKey)
    || !abuseSecret || !/^[A-Za-z0-9_-]{32,256}$/.test(abuseSecret)) throw new ProductionSupportError();
  return { projectRef, contractId, projectUrl, serviceKey, abuseSecret,
    admissionEnabled: env.HELIX_PRODUCTION_SUPPORT_ADMISSION_ENABLED === "true",
    workerEnabled: env.HELIX_PRODUCTION_SUPPORT_WORKER_ENABLED === "true",
    fullMediaQualified: env.HELIX_PRODUCTION_SUPPORT_FULL_MEDIA_QUALIFIED === "true",
    isolationQualified: env.HELIX_PRODUCTION_SUPPORT_ISOLATION_QUALIFIED === "true",
    operationsQualified: env.HELIX_PRODUCTION_SUPPORT_OPERATIONS_QUALIFIED === "true" };
}
export function assertCanonicalRequest(request: Request): void {
  if (new URL(request.url).origin !== PRODUCTION_ORIGIN) throw new ProductionSupportError(403, "same_origin_required");
}
export function admissionConfigured(config: ProductionConfig): boolean {
  return config.admissionEnabled && config.fullMediaQualified && config.isolationQualified && config.operationsQualified;
}
export type StoredContract = { projectRef: string; contractId: string; admissionEnabled: boolean; workerEnabled: boolean;
  fullMediaQualified: boolean; isolationQualified: boolean; operationsQualified: boolean };
export function assertStoredContract(value: unknown, config: ProductionConfig): asserts value is StoredContract {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || (value as StoredContract).projectRef !== config.projectRef || (value as StoredContract).contractId !== config.contractId
    || ["admissionEnabled", "workerEnabled", "fullMediaQualified", "isolationQualified", "operationsQualified"]
      .some((key) => typeof (value as Record<string, unknown>)[key] !== "boolean")) {
    throw new ProductionSupportError();
  }
}
