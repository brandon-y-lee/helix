import "server-only";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  HELIX_REWARDS_NAME,
  PRIVATE_FEEDBACK_POINTS,
  WELCOME_REWARD_POINTS,
  affordableRewardTiers,
  calculatePurchasePoints,
  type PointsLedgerEntryType,
} from "@/lib/rewards/rules";
import {
  RewardsRequestError,
  RewardsServiceUnavailableError,
} from "@/lib/rewards/errors";

export type RewardsSummary = {
  authenticated: boolean;
  emailConfirmed: boolean;
  programName: typeof HELIX_REWARDS_NAME;
  pointsBalance: number;
  lifetimePoints: number;
  estimatedPurchasePoints: number;
  affordableTiers: ReturnType<typeof affordableRewardTiers>;
  referralCode: string | null;
  recentLedger: Array<{
    id: string;
    entry_type: PointsLedgerEntryType;
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
  const { error: ensureError } = await admin.rpc("ensure_rewards_account", {
    p_user_id: user.id,
  });
  if (ensureError) {
    throw new RewardsServiceUnavailableError();
  }
  if (user.email_confirmed_at) {
    const { error: welcomeError } = await admin.rpc("award_rewards_points", {
      p_user_id: user.id,
      p_points: WELCOME_REWARD_POINTS,
      p_entry_type: "welcome",
      p_source_key: `welcome:${user.id}`,
      p_description: "Welcome to helix rewards.",
      p_order_id: null,
      p_metadata: { email_confirmed: true },
    });
    if (welcomeError) {
      throw new RewardsServiceUnavailableError();
    }
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
      programName: HELIX_REWARDS_NAME,
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
      .from("rewards_accounts")
      .select("points_balance, lifetime_points")
      .eq("user_id", userId)
      .single(),
    admin
      .from("referral_codes")
      .select("code")
      .eq("user_id", userId)
      .maybeSingle(),
    admin
      .from("rewards_ledger_entries")
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
    throw new RewardsServiceUnavailableError();
  }
  if (referralResult.error) {
    throw new RewardsServiceUnavailableError();
  }
  if (ledgerResult.error) {
    throw new RewardsServiceUnavailableError();
  }
  if (feedbackResult.error) {
    throw new RewardsServiceUnavailableError();
  }
  const account = accountResult.data as { points_balance?: number; lifetime_points?: number };
  const balance = Number(account.points_balance ?? 0);
  const subtotal = Math.max(0, Math.trunc(merchandiseSubtotalCents));

  return {
    authenticated: true,
    emailConfirmed,
    programName: HELIX_REWARDS_NAME,
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
    throw new RewardsRequestError(
      "Sign in with a confirmed account to submit private feedback.",
    );
  }
  const rating = Math.trunc(input.rating);
  if (rating < 1 || rating > 5) {
    throw new RewardsRequestError("Choose a feedback rating from 1 to 5.");
  }
  const comments = input.comments.trim().slice(0, 2000);

  const admin = createSupabaseAdminClient();
  const { error } = await admin.rpc("submit_private_feedback_reward", {
    p_user_id: userId,
    p_feedback_id: input.feedbackId,
    p_rating: rating,
    p_comments: comments,
  });
  if (error?.code === "P0001" && error.message === "feedback request unavailable") {
    throw new RewardsRequestError(
      "This private feedback request is no longer available.",
    );
  }
  if (error) throw new RewardsServiceUnavailableError();

  revalidatePath("/account");
  revalidatePath("/rewards");
  return { ok: true, pointsAwarded: PRIVATE_FEEDBACK_POINTS };
}
