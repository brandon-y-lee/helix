import { beforeEach, describe, expect, it, vi } from "vitest";

const dependencies = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
  getCurrentUser: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: dependencies.getCurrentUser,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: dependencies.createSupabaseAdminClient,
}));
vi.mock("next/cache", () => ({
  revalidatePath: dependencies.revalidatePath,
}));

import {
  getRewardsSummaryForCurrentUser,
  submitPrivateFeedbackForCurrentUser,
} from "@/lib/rewards/server";
import { HELIX_REWARDS_NAME } from "@/lib/rewards/rules";

type QueryResult = { data: unknown; error: { message: string } | null };

function query(result: QueryResult) {
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    single: vi.fn(() => Promise.resolve(result)),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
    limit: vi.fn(() => Promise.resolve(result)),
  };
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  builder.order.mockReturnValue(builder);
  return builder;
}

describe("customer rewards service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dependencies.getCurrentUser.mockResolvedValue({
      id: "account-holder-1",
      email_confirmed_at: "2026-08-19T12:00:00.000Z",
    });
  });

  it("loads an Account Holder summary through rewards-named interfaces", async () => {
    const results = {
      rewards_accounts: query({
        data: { points_balance: 425, lifetime_points: 725 },
        error: null,
      }),
      referral_codes: query({ data: { code: "HELIX25" }, error: null }),
      rewards_ledger_entries: query({
        data: [
          {
            id: "entry-1",
            entry_type: "welcome",
            points: 100,
            description: "Welcome to helix rewards.",
            created_at: "2026-08-19T12:00:00.000Z",
          },
        ],
        error: null,
      }),
      private_feedback: query({ data: [], error: null }),
    };
    const rpc = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn((table: keyof typeof results) => results[table]);
    dependencies.createSupabaseAdminClient.mockReturnValue({ from, rpc });

    const summary = await getRewardsSummaryForCurrentUser(5_000);

    expect(summary).toMatchObject({
      authenticated: true,
      emailConfirmed: true,
      programName: "helix rewards",
      pointsBalance: 425,
      lifetimePoints: 725,
      estimatedPurchasePoints: 100,
      referralCode: "HELIX25",
    });
    expect(summary.programName).toBe(HELIX_REWARDS_NAME);
    expect(rpc).toHaveBeenNthCalledWith(1, "ensure_rewards_account", {
      p_user_id: "account-holder-1",
    });
    expect(rpc).toHaveBeenNthCalledWith(
      2,
      "award_rewards_points",
      expect.objectContaining({
        p_user_id: "account-holder-1",
        p_source_key: "welcome:account-holder-1",
        p_description: "Welcome to helix rewards.",
      }),
    );
    expect(from.mock.calls.map(([table]) => table)).toEqual([
      "rewards_accounts",
      "referral_codes",
      "rewards_ledger_entries",
      "private_feedback",
    ]);
  });

  it("fails closed when rewards account initialization fails", async () => {
    const rpc = vi.fn().mockResolvedValue({
      error: { message: "rewards contract unavailable" },
    });
    const from = vi.fn();
    dependencies.createSupabaseAdminClient.mockReturnValue({ from, rpc });

    await expect(getRewardsSummaryForCurrentUser()).rejects.toThrow(
      "helix rewards is temporarily unavailable.",
    );
    expect(from).not.toHaveBeenCalled();
  });

  it("rejects a partial summary when a private rewards read fails", async () => {
    const results = {
      rewards_accounts: query({
        data: { points_balance: 425, lifetime_points: 725 },
        error: null,
      }),
      referral_codes: query({ data: { code: "HELIX25" }, error: null }),
      rewards_ledger_entries: query({
        data: null,
        error: { message: "ledger unavailable" },
      }),
      private_feedback: query({ data: [], error: null }),
    };
    const rpc = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn((table: keyof typeof results) => results[table]);
    dependencies.createSupabaseAdminClient.mockReturnValue({ from, rpc });

    await expect(getRewardsSummaryForCurrentUser()).rejects.toThrow(
      "helix rewards is temporarily unavailable.",
    );
  });

  it("derives feedback identity and Points Awards from trusted server state", async () => {
    const feedbackLookup = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: "feedback-1", order_id: "order-1", status: "available" },
        error: null,
      }),
    };
    feedbackLookup.select.mockReturnValue(feedbackLookup);
    feedbackLookup.eq.mockReturnValue(feedbackLookup);

    const updateResult = { data: null, error: null };
    const feedbackUpdate = {
      update: vi.fn(),
      eq: vi.fn(),
      then: <TResult1 = typeof updateResult, TResult2 = never>(
        onFulfilled?: ((value: typeof updateResult) => TResult1 | PromiseLike<TResult1>) | null,
        onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
      ) => Promise.resolve(updateResult).then(onFulfilled, onRejected),
    };
    feedbackUpdate.update.mockReturnValue(feedbackUpdate);
    feedbackUpdate.eq.mockReturnValue(feedbackUpdate);

    const rpc = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn()
      .mockReturnValueOnce(feedbackLookup)
      .mockReturnValueOnce(feedbackUpdate);
    dependencies.createSupabaseAdminClient.mockReturnValue({ from, rpc });

    await expect(submitPrivateFeedbackForCurrentUser({
      feedbackId: "feedback-1",
      rating: 5,
      comments: "Calm after use.",
    })).resolves.toEqual({ ok: true, pointsAwarded: 300 });

    expect(feedbackLookup.eq).toHaveBeenCalledWith("user_id", "account-holder-1");
    expect(rpc).toHaveBeenLastCalledWith("award_rewards_points", {
      p_user_id: "account-holder-1",
      p_points: 300,
      p_entry_type: "private_feedback",
      p_source_key: "private-feedback:order-1",
      p_description: "Private post-purchase feedback reward.",
      p_order_id: "order-1",
      p_metadata: { sentiment_neutral_reward: true },
    });
  });
});
