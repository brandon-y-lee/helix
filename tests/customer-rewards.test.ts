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
    const rpc = vi.fn().mockResolvedValue({ error: null });
    dependencies.createSupabaseAdminClient.mockReturnValue({ rpc });

    await expect(submitPrivateFeedbackForCurrentUser({
      feedbackId: "feedback-1",
      rating: 5,
      comments: "Calm after use.",
    })).resolves.toEqual({ ok: true, pointsAwarded: 300 });

    expect(rpc).toHaveBeenLastCalledWith("submit_private_feedback_reward", {
      p_user_id: "account-holder-1",
      p_feedback_id: "feedback-1",
      p_rating: 5,
      p_comments: "Calm after use.",
    });
  });

  it("keeps a failed private feedback transaction retryable", async () => {
    let feedbackAttempts = 0;
    const rpc = vi.fn(async (name: string) => {
      if (name !== "submit_private_feedback_reward") {
        return { data: null, error: null };
      }
      feedbackAttempts += 1;
      return feedbackAttempts === 1
        ? { data: null, error: { message: "provider detail" } }
        : { data: "entry-1", error: null };
    });
    dependencies.createSupabaseAdminClient.mockReturnValue({ rpc });

    const input = { feedbackId: "feedback-1", rating: 5, comments: "Calm." };
    await expect(submitPrivateFeedbackForCurrentUser(input)).rejects.toThrow(
      "helix rewards is temporarily unavailable.",
    );
    await expect(submitPrivateFeedbackForCurrentUser(input)).resolves.toEqual({
      ok: true,
      pointsAwarded: 300,
    });
    expect(
      rpc.mock.calls.filter(([name]) => name === "submit_private_feedback_reward"),
    ).toHaveLength(2);
  });
});
