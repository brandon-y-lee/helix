import { getCurrentUser } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { handleLifecycleActivity } from "@/lib/marketing/activity";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function POST(request: Request) {
  return handleLifecycleActivity(request, {
    env: process.env,
    getUser: getCurrentUser,
    async recordVisit(userId, slug) {
      const { error } = await createSupabaseAdminClient().rpc("record_lifecycle_product_visit", {
        p_user_id: userId, p_product_slug: slug,
      }).abortSignal(AbortSignal.timeout(3000));
      if (error) throw new Error("Activity unavailable.");
    },
  });
}
