import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { calculateReferralDiscount } from "@/lib/rewards/rules";

export class ReferralServiceUnavailableError extends Error {
  constructor() {
    super("Referral Offer validation is temporarily unavailable.");
    this.name = "ReferralServiceUnavailableError";
  }
}

export type ReferralOffer = {
  code: string;
  referrerUserId: string;
  discountCents: number;
};

export async function resolveReferralOfferForCheckout(input: {
  code: string;
  userId: string;
  merchandiseSubtotalCents: number;
}): Promise<ReferralOffer | null> {
  const admin = createSupabaseAdminClient();
  const { data: referral, error } = await admin
    .from("referral_codes")
    .select("code, user_id, active")
    .eq("code", input.code)
    .eq("active", true)
    .maybeSingle();
  if (error) throw new ReferralServiceUnavailableError();
  if (!referral) return null;

  const referralRow = referral as { user_id: string; code: string };
  if (referralRow.user_id === input.userId) return null;

  const { data: priorOrders, error: ordersError } = await admin
    .from("orders")
    .select("id")
    .eq("user_id", input.userId)
    .eq("status", "paid")
    .limit(1);
  if (ordersError) throw new ReferralServiceUnavailableError();
  if ((priorOrders?.length ?? 0) > 0) return null;

  return {
    code: referralRow.code,
    referrerUserId: referralRow.user_id,
    discountCents: calculateReferralDiscount(input.merchandiseSubtotalCents),
  };
}

export async function qualifyReferralForPaidOrder(orderId: string): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { error } = await admin.rpc("qualify_referral_for_paid_order", {
    p_order_id: orderId,
  });
  if (error) {
    throw new Error("[referrals] Referral Reward qualification failed.");
  }
}
