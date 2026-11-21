import "server-only";
import { verifySupabaseCredential } from "@/lib/supabase/key-binding";
import { deploymentSupabaseTarget, supabaseOriginForTarget } from "@/lib/supabase/project-safety";

type Environment = Record<string, string | undefined>;

/** Both the staged and serving main build use production bindings. Write handlers
 * additionally require the canonical request origin routed by Vercel. */
export async function productionDeploymentAuthorized(env: Environment): Promise<boolean> {
  const origin = supabaseOriginForTarget("production");
  const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const id = env.VERCEL_DEPLOYMENT_ID;
  const sha = env.VERCEL_GIT_COMMIT_SHA;
  try {
    if (deploymentSupabaseTarget(env) !== "production" || env.NEXT_PUBLIC_SUPABASE_URL !== origin
      || !key || !id || !/^dpl_[A-Za-z0-9]{1,96}$/.test(id) || !sha || !/^[0-9a-f]{40}$/.test(sha)) return false;

    verifySupabaseCredential(key, "production", "anon", env);
    return true;
  } catch {
    return false;
  }
}
