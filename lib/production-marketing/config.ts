import "server-only";
import { readProductionMarketingCapabilityKey } from "./capabilities";
import type { ProductionMarketingEnvironment } from "./contract";

// The parent is production. This does not relax the existing dev/sandbox guard.
const SITE_ORIGIN = "https://www.helixskin.us";
const PROJECT_URL = "https://erasogmsqpgiirovubjh.supabase.co";
export function readProductionMarketingConfiguration(env: ProductionMarketingEnvironment) {
  const origin = new URL(env.HELIX_PRODUCTION_MARKETING_SITE_ORIGIN ?? "");
  const serviceKey = env.HELIX_PRODUCTION_MARKETING_SERVICE_KEY;
  if (origin.origin !== SITE_ORIGIN || origin.origin !== env.HELIX_PRODUCTION_MARKETING_SITE_ORIGIN || origin.protocol !== "https:"
    || origin.username || origin.password || env.VERCEL !== "1" || env.VERCEL_ENV !== "production"
    || !env.VERCEL_PROJECT_ID || env.VERCEL_PROJECT_ID !== env.HELIX_PRODUCTION_MARKETING_VERCEL_PROJECT_ID
    || !env.VERCEL_DEPLOYMENT_ID || env.VERCEL_DEPLOYMENT_ID !== env.HELIX_PRODUCTION_MARKETING_DEPLOYMENT_ID
    // Vercel reports the shortest attached production domain, which may be apex.
    // This hosting alias assertion is separate from the exact canonical request origin.
    || (env.VERCEL_PROJECT_PRODUCTION_URL !== "helixskin.us" && env.VERCEL_PROJECT_PRODUCTION_URL !== "www.helixskin.us")
    || env.HELIX_PRODUCTION_MARKETING_SUPABASE_URL !== PROJECT_URL || !serviceKey
    || serviceKey === env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Production marketing is unavailable.");
  return { siteOrigin: origin.origin, supabaseUrl: PROJECT_URL, serviceKey };
}
export function productionMarketingEnrollmentEnabled(env: ProductionMarketingEnvironment): boolean {
  if (env.HELIX_PRODUCTION_MARKETING_ENABLED !== "true") return false;
  try {
    readProductionMarketingConfiguration(env);
    readProductionMarketingCapabilityKey(env);
    if (!env.HELIX_PRODUCTION_MARKETING_ABUSE_KEY || env.HELIX_PRODUCTION_MARKETING_ABUSE_KEY.length < 32) return false;
    return true;
  } catch { return false; }
}
