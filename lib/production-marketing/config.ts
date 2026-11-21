import "server-only";
import { productionDeploymentAuthorized } from "@/lib/release/deployment-authorization";
import { verifySupabaseCredential } from "@/lib/supabase/key-binding";
import { deploymentSupabaseTarget, supabaseOriginForTarget } from "@/lib/supabase/project-safety";
import { readProductionMarketingCapabilityKey } from "./capabilities";
import type { ProductionMarketingEnvironment } from "./contract";

// The parent is production. This does not relax the existing dev/sandbox guard.
const SITE_ORIGIN = "https://www.helixskin.us";
const PROJECT_URL = supabaseOriginForTarget("production");
export function readProductionMarketingConfiguration(env: ProductionMarketingEnvironment) {
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    if (deploymentSupabaseTarget(env) !== "production" || env.NEXT_PUBLIC_SUPABASE_URL !== PROJECT_URL ||
        (env.HELIX_PRODUCTION_MARKETING_SITE_ORIGIN !== undefined && env.HELIX_PRODUCTION_MARKETING_SITE_ORIGIN !== SITE_ORIGIN) ||
        (env.HELIX_PRODUCTION_MARKETING_VERCEL_PROJECT_ID !== undefined && env.HELIX_PRODUCTION_MARKETING_VERCEL_PROJECT_ID !== env.VERCEL_PROJECT_ID) ||
        (env.HELIX_PRODUCTION_MARKETING_SUPABASE_URL !== undefined && env.HELIX_PRODUCTION_MARKETING_SUPABASE_URL !== PROJECT_URL) ||
        !serviceKey || !env.VERCEL_DEPLOYMENT_ID || !/^dpl_[A-Za-z0-9]{1,96}$/.test(env.VERCEL_DEPLOYMENT_ID) ||
        !["helixskin.us", "www.helixskin.us"].includes(env.VERCEL_PROJECT_PRODUCTION_URL ?? "")) {
      throw new Error();
    }
    verifySupabaseCredential(serviceKey, "production", "service_role", env);
    return { siteOrigin: SITE_ORIGIN, supabaseUrl: PROJECT_URL, serviceKey };
  } catch {
    throw new Error("Production marketing is unavailable.");
  }
}
/** Supabase's Data API accepts opaque secret keys in apikey. Only a JWT
 * belongs in the Authorization bearer header. Callers verify the key first. */
export function productionMarketingRpcHeaders(serviceKey: string): Record<string, string> {
  const headers: Record<string, string> = { apikey: serviceKey, "Content-Type": "application/json" };
  if (!serviceKey.startsWith("sb_secret_")) headers.Authorization = `Bearer ${serviceKey}`;
  return headers;
}

export async function productionMarketingEnrollmentEnabled(env: ProductionMarketingEnvironment): Promise<boolean> {
  if (env.HELIX_PRODUCTION_MARKETING_ENABLED !== "true") return false;
  try {
    readProductionMarketingConfiguration(env);
    readProductionMarketingCapabilityKey(env);
    if (!env.HELIX_PRODUCTION_MARKETING_ABUSE_KEY || env.HELIX_PRODUCTION_MARKETING_ABUSE_KEY.length < 32) return false;
    return await productionDeploymentAuthorized(env);
  } catch { return false; }
}
