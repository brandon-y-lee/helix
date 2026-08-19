import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function qualifyReferralForPaidOrder(orderId: string): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { error } = await admin.rpc("qualify_referral_for_paid_order", {
    p_order_id: orderId,
  });
  if (error) {
    throw new Error("[referrals] Referral Reward qualification failed.");
  }
}
