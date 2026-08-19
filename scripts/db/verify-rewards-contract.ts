import { randomUUID } from "node:crypto";
import { createOpsClient } from "./supabase-ops";
import { runCleanupAttempts } from "./rewards-contract-cleanup";

function safeErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = error.message;
    return typeof message === "string" ? message : JSON.stringify(message);
  }
  return String(error);
}

function requireNoError(error: unknown, action: string): void {
  if (error) throw new Error(`${action} failed: ${safeErrorMessage(error)}`);
}

async function run(): Promise<void> {
  const supabase = createOpsClient();
  const runId = randomUUID();
  const email = `rewards-contract-${runId}@example.test`;
  const refereeEmail = `rewards-referee-${runId}@example.test`;
  const password = `${randomUUID()}-Aa1!`;
  const orderId = randomUUID();
  const sourceKeys = [
    `ticket-184-concurrency-a:${runId}`,
    `ticket-184-concurrency-b:${runId}`,
  ] as const;

  const { data: created, error: createError } =
    await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
  requireNoError(createError, "synthetic Account Holder creation");
  if (!created.user) throw new Error("Synthetic Account Holder was not returned.");

  const userId = created.user.id;
  let refereeUserId: string | null = null;
  try {
    const { data: referee, error: refereeError } =
      await supabase.auth.admin.createUser({
        email: refereeEmail,
        password,
        email_confirm: true,
      });
    requireNoError(refereeError, "synthetic referred Account Holder creation");
    if (!referee.user) {
      throw new Error("Synthetic referred Account Holder was not returned.");
    }
    refereeUserId = referee.user.id;

    const { error: awardError } = await supabase.rpc("award_rewards_points", {
      p_user_id: userId,
      p_points: 400,
      p_entry_type: "manual_adjustment",
      p_source_key: `ticket-184-concurrency-seed:${runId}`,
      p_description: "Ticket 184 concurrency seed.",
      p_order_id: null,
      p_metadata: {},
    });
    requireNoError(awardError, "Points seed");

    const reserve = async (sourceKey: string): Promise<void> => {
      const { error } = await supabase.rpc("reserve_rewards_points", {
        p_user_id: userId,
        p_points: 400,
        p_amount_cents: 1_000,
        p_source_key: sourceKey,
        p_description: "Ticket 184 concurrent Points Reservation.",
        p_order_id: null,
      });
      requireNoError(error, "Points Reservation");
    };

    const attempts = await Promise.allSettled([
      reserve(sourceKeys[0]),
      reserve(sourceKeys[1]),
    ]);
    const succeeded = attempts.filter(({ status }) => status === "fulfilled");
    const failed = attempts.filter(({ status }) => status === "rejected");
    if (succeeded.length !== 1 || failed.length !== 1) {
      throw new Error(
        `Expected one successful and one rejected reservation; got ${succeeded.length} and ${failed.length}.`,
      );
    }
    const rejection = failed[0];
    if (
      rejection.status !== "rejected" ||
      !(rejection.reason instanceof Error) ||
      !rejection.reason.message.includes("Insufficient Available Points Balance")
    ) {
      throw new Error("The competing reservation did not fail for insufficient balance.");
    }

    const { data: account, error: accountError } = await supabase
      .from("rewards_accounts")
      .select("points_balance")
      .eq("user_id", userId)
      .single();
    requireNoError(accountError, "Available Points Balance read");

    const { data: reservations, error: reservationsError } = await supabase
      .from("rewards_reservations")
      .select("id")
      .eq("user_id", userId)
      .in("source_key", [...sourceKeys]);
    requireNoError(reservationsError, "Points Reservation read");

    if (account?.points_balance !== 0 || reservations?.length !== 1) {
      throw new Error(
        `Concurrent reservation invariant failed: balance=${account?.points_balance}, reservations=${reservations?.length}.`,
      );
    }

    const { data: referralCode, error: referralCodeError } = await supabase
      .from("referral_codes")
      .select("id")
      .eq("user_id", userId)
      .single();
    requireNoError(referralCodeError, "Referral Code read");
    if (!referralCode) throw new Error("Synthetic Referral Code was not returned.");

    const { error: orderError } = await supabase.from("orders").insert({
      id: orderId,
      order_number: `VERIFY-${runId.slice(0, 12).toUpperCase()}`,
      user_id: refereeUserId,
      status: "payment_failed",
      merchandise_subtotal_cents: 5_000,
      total_cents: 5_000,
      idempotency_key: `ticket-185-referral-order:${runId}`,
    });
    requireNoError(orderError, "synthetic unpaid Order creation");

    const attributionSourceKey = `ticket-185-referral-attribution:${runId}`;
    const { data: attribution, error: attributionError } = await supabase
      .from("referral_attributions")
      .insert({
        referral_code_id: referralCode.id,
        referrer_user_id: userId,
        referee_user_id: refereeUserId,
        order_id: orderId,
        status: "pending",
        source_key: attributionSourceKey,
      })
      .select("id")
      .single();
    requireNoError(attributionError, "Referral Attribution creation");
    if (!attribution) throw new Error("Synthetic Referral Attribution was not returned.");

    const { data: unpaidReward, error: unpaidRewardError } = await supabase.rpc(
      "qualify_referral_for_paid_order",
      { p_order_id: orderId },
    );
    requireNoError(unpaidRewardError, "unpaid Referral Reward qualification");
    if (unpaidReward !== null) {
      throw new Error("An unpaid Order issued a Referral Reward.");
    }

    const { error: paidError } = await supabase
      .from("orders")
      .update({ status: "paid", paid_at: new Date().toISOString() })
      .eq("id", orderId);
    requireNoError(paidError, "verified Paid Order transition");

    const concurrentReferralQualifications = await Promise.all([
      supabase.rpc("qualify_referral_for_paid_order", { p_order_id: orderId }),
      supabase.rpc("qualify_referral_for_paid_order", { p_order_id: orderId }),
    ]);
    for (const result of concurrentReferralQualifications) {
      requireNoError(result.error, "Concurrent Referral Reward qualification");
    }
    const [firstQualification, secondQualification] =
      concurrentReferralQualifications.map(({ data }) => data);
    if (!firstQualification || firstQualification !== secondQualification) {
      throw new Error("Concurrent Referral Reward qualification was not idempotent.");
    }

    const { data: referralRewards, error: referralRewardsError } = await supabase
      .from("referral_rewards")
      .select("id")
      .eq("referral_attribution_id", attribution.id);
    requireNoError(referralRewardsError, "Referral Reward read");
    if (referralRewards?.length !== 1) {
      throw new Error(
        `Concurrent Referral Reward qualification created ${referralRewards?.length ?? 0} Rewards.`,
      );
    }

    console.log(
      JSON.stringify({
        ok: true,
        successfulReservations: succeeded.length,
        rejectedReservations: failed.length,
        availablePointsBalance: account.points_balance,
        concurrentReferralQualifications: concurrentReferralQualifications.length,
        referralRewards: referralRewards.length,
      }),
    );
  } finally {
    const cleanupRefereeUserId = refereeUserId;
    await runCleanupAttempts([
      {
        label: "synthetic Order",
        run: async () => {
          const { error } = await supabase.from("orders").delete().eq("id", orderId);
          requireNoError(error, "synthetic Order cleanup");
        },
      },
      ...(cleanupRefereeUserId
        ? [{
            label: "synthetic referred Account Holder",
            run: async () => {
              const { error } = await supabase.auth.admin.deleteUser(
                cleanupRefereeUserId,
              );
              requireNoError(error, "synthetic referred Account Holder cleanup");
            },
          }]
        : []),
      {
        label: "synthetic Account Holder",
        run: async () => {
          const { error } = await supabase.auth.admin.deleteUser(userId);
          requireNoError(error, "synthetic Account Holder cleanup");
        },
      },
    ]);
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
