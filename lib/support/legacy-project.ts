import "server-only";
import { deploymentSupabaseTarget, supabaseOriginForTarget } from "@/lib/supabase/project-safety";

// Existing private objects and leases belong to the retained parent. A new
// dev deployment cannot acquire that authority by presenting its hostname.
export function isLegacySupportProject(env: Record<string, string | undefined>): boolean {
  try {
    return deploymentSupabaseTarget(env) === "production" &&
      env.NEXT_PUBLIC_SUPABASE_URL === supabaseOriginForTarget("production");
  } catch {
    return false;
  }
}
