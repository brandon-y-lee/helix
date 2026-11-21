import { createHash } from "node:crypto";
import { HELIX_VERCEL_PROJECT_ID, supabaseOriginForTarget } from "@/lib/supabase/project-safety";

const anon = "sb_publishable_synthetic_marketing_test";
const service = "sb_secret_synthetic_marketing_test";
const fingerprint = (key: string) => createHash("sha256").update(key).digest("hex");

export const productionMarketingTestTarget = {
  VERCEL: "1",
  VERCEL_ENV: "production",
  VERCEL_PROJECT_ID: HELIX_VERCEL_PROJECT_ID,
  VERCEL_DEPLOYMENT_ID: "dpl_SyntheticEmailBuild",
  VERCEL_GIT_COMMIT_REF: "main",
  VERCEL_GIT_COMMIT_SHA: "1".repeat(40),
  VERCEL_PROJECT_PRODUCTION_URL: "www.helixskin.us",
  NEXT_PUBLIC_SUPABASE_URL: supabaseOriginForTarget("production"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: anon,
  SUPABASE_SERVICE_ROLE_KEY: service,
  HELIX_PRODUCTION_SUPABASE_ANON_KEY_SHA256: fingerprint(anon),
  HELIX_PRODUCTION_SUPABASE_SERVICE_ROLE_KEY_SHA256: fingerprint(service),
  HELIX_PRODUCTION_MARKETING_VERCEL_PROJECT_ID: HELIX_VERCEL_PROJECT_ID,
  HELIX_PRODUCTION_MARKETING_SITE_ORIGIN: "https://www.helixskin.us",
  HELIX_PRODUCTION_MARKETING_SUPABASE_URL: supabaseOriginForTarget("production"),
};
