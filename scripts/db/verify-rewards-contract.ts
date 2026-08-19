import { randomUUID } from "node:crypto";
import { createOpsClient } from "./supabase-ops";

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
  const password = `${randomUUID()}-Aa1!`;
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
  try {
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

    console.log(
      JSON.stringify({
        ok: true,
        successfulReservations: succeeded.length,
        rejectedReservations: failed.length,
        availablePointsBalance: account.points_balance,
      }),
    );
  } finally {
    const { error } = await supabase.auth.admin.deleteUser(userId);
    requireNoError(error, "synthetic Account Holder cleanup");
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
