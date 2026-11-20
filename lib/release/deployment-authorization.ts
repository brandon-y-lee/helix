import "server-only";
import { readBoundedBody } from "@/lib/email/provider";
import { verifySupabaseCredential } from "@/lib/supabase/key-binding";
import { deploymentSupabaseTarget, supabaseOriginForTarget } from "@/lib/supabase/project-safety";

type Environment = Record<string, string | undefined>;

/** The app can only ask the release controller's registry about its own build.
 * A fresh check lets the controller withdraw a build without rebuilding it. */
export async function productionDeploymentAuthorized(env: Environment): Promise<boolean> {
  const origin = supabaseOriginForTarget("production");
  const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const id = env.VERCEL_DEPLOYMENT_ID;
  const sha = env.VERCEL_GIT_COMMIT_SHA;
  try {
    if (deploymentSupabaseTarget(env) !== "production" || env.NEXT_PUBLIC_SUPABASE_URL !== origin
      || !key || !id || !/^dpl_[A-Za-z0-9]{1,96}$/.test(id) || !sha || !/^[0-9a-f]{40}$/.test(sha)) return false;

    verifySupabaseCredential(key, "production", "anon", env);
    const headers: Record<string, string> = { apikey: key, "Content-Type": "application/json" };
    // Supabase publishable keys authenticate via apikey. Only JWTs are bearer tokens.
    if (!key.startsWith("sb_publishable_")) headers.Authorization = `Bearer ${key}`;
    const result = await fetch(`${origin}/rest/v1/rpc/read_helix_release_authorization`, {
      method: "POST", headers, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(3000),
      body: JSON.stringify({ p_project_id: env.VERCEL_PROJECT_ID, p_deployment_id: id, p_git_sha: sha }),
    });
    if (!result.ok) { await result.body?.cancel(); return false; }
    return JSON.parse(await readBoundedBody(result, 16)) === true;
  } catch {
    return false;
  }
}
