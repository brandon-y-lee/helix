import "server-only";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  MEI_PELLE_REWARDS_NAME,
  PRIVATE_FEEDBACK_POINTS,
  WELCOME_REWARD_POINTS,
  affordableRewardTiers,
  calculatePurchasePoints,
} from "@/lib/rewards/rules";

export type RewardsSummary = {
  authenticated: boolean;
  emailConfirmed: boolean;
  programName: typeof MEI_PELLE_REWARDS_NAME;
  pointsBalance: number;
  lifetimePoints: number;
  estimatedPurchasePoints: number;
  affordableTiers: ReturnType<typeof affordableRewardTiers>;
  referralCode: string | null;
  recentLedger: Array<{
    id: string;
    entry_type: string;
    points: number;
    description: string;
    created_at: string;
  }>;
  feedbackRequests: Array<{
    id: string;
    order_id: string;
    order_number: string;
    points: number;
  }>;
};

async function ensureCurrentUserRewards(): Promise<{
  userId: string | null;
  emailConfirmed: boolean;
}> {
  const user = await getCurrentUser();
  if (!user) return { userId: null, emailConfirmed: false };

  const admin = createSupabaseAdminClient();
  await admin.rpc("ensure_loyalty_account", { p_user_id: user.id });
  if (user.email_confirmed_at) {
    await admin.rpc("award_loyalty_points", {
      p_user_id: user.id,
      p_points: WELCOME_REWARD_POINTS,
      p_entry_type: "welcome",
      p_source_key: `welcome:${user.id}`,
      p_description: "Welcome to MEI PELLE REWARDS.",
      p_order_id: null,
      p_metadata: { email_confirmed: true },
    });
  }

  return { userId: user.id, emailConfirmed: Boolean(user.email_confirmed_at) };
}

export async function getRewardsSummaryForCurrentUser(
  merchandiseSubtotalCents = 0,
): Promise<RewardsSummary> {
  const { userId, emailConfirmed } = await ensureCurrentUserRewards();
  if (!userId) {
    return {
      authenticated: false,
      emailConfirmed: false,
      programName: MEI_PELLE_REWARDS_NAME,
      pointsBalance: 0,
      lifetimePoints: 0,
      estimatedPurchasePoints: 0,
      affordableTiers: [],
      referralCode: null,
      recentLedger: [],
      feedbackRequests: [],
    };
  }

  const admin = createSupabaseAdminClient();
  const [accountResult, referralResult, ledgerResult, feedbackResult] = await Promise.all([
    admin
      .from("loyalty_accounts")
      .select("points_balance, lifetime_points")
      .eq("user_id", userId)
      .single(),
    admin
      .from("referral_codes")
      .select("code")
      .eq("user_id", userId)
      .maybeSingle(),
    admin
      .from("loyalty_ledger_entries")
      .select("id, entry_type, points, description, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(8),
    admin
      .from("private_feedback")
      .select("id, order_id, orders!inner ( order_number )")
      .eq("user_id", userId)
      .eq("status", "available")
      .limit(6),
  ]);

  if (accountResult.error) {
    throw new Error(`[rewards] Failed to load loyalty account: ${accountResult.error.message}`);
  }
  const account = accountResult.data as { points_balance?: number; lifetime_points?: number };
  const balance = Number(account.points_balance ?? 0);
  const subtotal = Math.max(0, Math.trunc(merchandiseSubtotalCents));

  return {
    authenticated: true,
    emailConfirmed,
    programName: MEI_PELLE_REWARDS_NAME,
    pointsBalance: balance,
    lifetimePoints: Number(account.lifetime_points ?? 0),
    estimatedPurchasePoints: calculatePurchasePoints(subtotal),
    affordableTiers: affordableRewardTiers(balance, subtotal),
    referralCode: (referralResult.data as { code?: string } | null)?.code ?? null,
    recentLedger: ((ledgerResult.data ?? []) as RewardsSummary["recentLedger"]),
    feedbackRequests: ((feedbackResult.data ?? []) as Array<{
      id: string;
      order_id: string;
      orders?: { order_number?: string } | { order_number?: string }[];
    }>).map((row) => {
      const order = Array.isArray(row.orders) ? row.orders[0] : row.orders;
      return {
        id: row.id,
        order_id: row.order_id,
        order_number: order?.order_number ?? "Sandbox order",
        points: PRIVATE_FEEDBACK_POINTS,
      };
    }),
  };
}

export async function submitPrivateFeedbackForCurrentUser(input: {
  feedbackId: string;
  rating: number;
  comments: string;
}): Promise<{ ok: true; pointsAwarded: number }> {
  const { userId, emailConfirmed } = await ensureCurrentUserRewards();
  if (!userId || !emailConfirmed) {
    throw new Error("Sign in with a confirmed account to submit private feedback.");
  }
  const rating = Math.trunc(input.rating);
  if (rating < 1 || rating > 5) throw new Error("Choose a feedback rating from 1 to 5.");
  const comments = input.comments.trim().slice(0, 2000);

  const admin = createSupabaseAdminClient();
  const { data: feedback, error } = await admin
    .from("private_feedback")
    .select("id, order_id, status")
    .eq("id", input.feedbackId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`[rewards] Failed to load feedback request: ${error.message}`);
  const row = feedback as { id: string; order_id: string; status: string } | null;
  if (!row || row.status !== "available") {
    throw new Error("This private feedback request is no longer available.");
  }

  const now = new Date().toISOString();
  const { error: updateError } = await admin
    .from("private_feedback")
    .update({
      status: "rewarded",
      rating,
      comments: comments || null,
      points_awarded: PRIVATE_FEEDBACK_POINTS,
      submitted_at: now,
    })
    .eq("id", row.id)
    .eq("status", "available");
  if (updateError) throw new Error(`[rewards] Failed to save private feedback: ${updateError.message}`);

  const { error: awardError } = await admin.rpc("award_loyalty_points", {
    p_user_id: userId,
    p_points: PRIVATE_FEEDBACK_POINTS,
    p_entry_type: "private_feedback",
    p_source_key: `private-feedback:${row.order_id}`,
    p_description: "Private post-purchase feedback reward.",
    p_order_id: row.order_id,
    p_metadata: { sentiment_neutral_reward: true },
  });
  if (awardError) throw new Error(`[rewards] Failed to award feedback points: ${awardError.message}`);

  revalidatePath("/account");
  revalidatePath("/rewards");
  return { ok: true, pointsAwarded: PRIVATE_FEEDBACK_POINTS };
}
