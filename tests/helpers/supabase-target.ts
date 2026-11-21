// Locally fabricated payloads exercise target/role selection without
// contacting a provider or using a valid signature.
import { SUPABASE_PROJECT_REFS, type SupabaseKeyRole, type SupabaseTarget } from "@/lib/supabase/project-safety";

export function syntheticSupabaseKey(target: SupabaseTarget, role: SupabaseKeyRole): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ role, ref: SUPABASE_PROJECT_REFS[target] })}.synthetic`;
}

export const syntheticMainContext = {
  VERCEL: "1", VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main",
  VERCEL_PROJECT_ID: "prj_N9nyPL9SixJHOROIovS8PDQ9aKny",
};
