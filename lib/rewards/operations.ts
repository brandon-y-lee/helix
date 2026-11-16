import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export class PointsReservationUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PointsReservationUnavailableError";
  }
}

export async function getAvailablePointsBalance(userId: string | null): Promise<number> {
  if (!userId) return 0;

  const admin = createSupabaseAdminClient();
  const { error: ensureError } = await admin.rpc("ensure_rewards_account", {
    p_user_id: userId,
  });
  if (ensureError) {
    throw new Error(`[rewards] Failed to ensure account: ${ensureError.message}`);
  }

  const { data, error } = await admin
    .from("rewards_accounts")
    .select("points_balance")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    throw new Error(`[rewards] Failed to load Available Points Balance: ${error.message}`);
  }

  return Number((data as { points_balance?: number } | null)?.points_balance ?? 0);
}

export async function reservePointsForOrder(input: {
  amountCents: number;
  description: string;
  orderId: string;
  points: number;
  userId: string;
}): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { data: reservations, error: existingError } = await admin
    .from("rewards_reservations")
    .select("id,status")
    .eq("order_id", input.orderId);
  if (existingError) {
    throw new Error(`[rewards] Failed to load Points Reservation: ${existingError.message}`);
  }
  if ((reservations ?? []).some((reservation) => reservation.status === "applied")) {
    return;
  }

  const { error } = await admin.rpc("reserve_rewards_points", {
    p_user_id: input.userId,
    p_points: input.points,
    p_amount_cents: input.amountCents,
    p_source_key: `reward-reserve:${input.orderId}:${(reservations?.length ?? 0) + 1}`,
    p_description: input.description,
    p_order_id: input.orderId,
  });
  if (error) {
    if (
      error.code === "P0001" &&
      error.message.includes("Insufficient Available Points Balance")
    ) {
      throw new PointsReservationUnavailableError(error.message);
    }
    throw new Error(`[rewards] Failed to record Points Reservation: ${error.message}`);
  }
}

export async function awardPaidOrderPoints(input: {
  eligibleNetMerchandiseCents: number;
  orderId: string;
  orderNumber: string;
  points: number;
  userId: string;
}): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { error } = await admin.rpc("award_rewards_points", {
    p_user_id: input.userId,
    p_points: input.points,
    p_entry_type: "purchase_earn",
    p_source_key: `purchase:${input.orderId}`,
    p_description: `Sandbox Order ${input.orderNumber} Points Award.`,
    p_order_id: input.orderId,
    p_metadata: {
      eligible_net_merchandise_cents: input.eligibleNetMerchandiseCents,
    },
  });
  if (error) {
    throw new Error(`[rewards] Failed to record Points Award: ${error.message}`);
  }
}

async function recordPointsAdjustment(input: {
  description: string;
  entryType: "purchase_refund" | "redemption_reversal";
  orderId: string;
  points: number;
  sourceKey: string;
  userId: string;
}): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { error } = await admin.rpc("record_rewards_points_adjustment", {
    p_user_id: input.userId,
    p_points: input.points,
    p_entry_type: input.entryType,
    p_source_key: input.sourceKey,
    p_description: input.description,
    p_order_id: input.orderId,
    p_metadata: {},
  });
  if (error) {
    throw new Error(`[rewards] Failed to record Points Reversal: ${error.message}`);
  }
}

export async function reversePaidOrderPoints(input: {
  orderId: string;
  orderNumber: string;
  pointsEarned: number;
  pointsRedeemed: number;
  userId: string;
}): Promise<void> {
  if (input.pointsEarned > 0) {
    await recordPointsAdjustment({
      userId: input.userId,
      orderId: input.orderId,
      points: -input.pointsEarned,
      entryType: "purchase_refund",
      sourceKey: `purchase-refund:${input.orderId}`,
      description: `Sandbox Order ${input.orderNumber} Points Award reversed after Refund.`,
    });
  }

  if (input.pointsRedeemed > 0) {
    await recordPointsAdjustment({
      userId: input.userId,
      orderId: input.orderId,
      points: input.pointsRedeemed,
      entryType: "redemption_reversal",
      sourceKey: `reward-refund-restore:${input.orderId}`,
      description: `Sandbox Order ${input.orderNumber} Points Redemption reversed after Refund.`,
    });
  }
}
