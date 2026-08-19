import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const contractionSql = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260819183701_contract_legacy_loyalty_implementation.sql",
  ),
  "utf8",
);

const databaseTypes = readFileSync(
  resolve(process.cwd(), "lib/database.types.ts"),
  "utf8",
);

const concurrencyVerifier = readFileSync(
  resolve(process.cwd(), "scripts/db/verify-rewards-contract.ts"),
  "utf8",
);

const rewardsTables = [
  "rewards_accounts",
  "rewards_ledger_entries",
  "rewards_reservations",
] as const;

const rewardsFunctions = [
  "ensure_rewards_account",
  "award_rewards_points",
  "reserve_rewards_points",
  "release_rewards_reservations_for_order",
  "record_rewards_points_adjustment",
] as const;

describe("contracted rewards database implementation", () => {
  it("replaces the temporary views with the existing physical Points records", () => {
    for (const table of rewardsTables) {
      expect(contractionSql).toContain(`drop view public.${table}`);
      expect(contractionSql).toContain(`rename to ${table}`);
      expect(databaseTypes).toContain(`${table}: {`);
    }

    expect(contractionSql).toContain(
      "alter type public.loyalty_ledger_entry_type rename to rewards_ledger_entry_type",
    );
    expect(contractionSql).toContain(
      "alter type public.loyalty_ledger_status rename to rewards_ledger_status",
    );
    expect(contractionSql).toContain(
      "alter type public.loyalty_redemption_status rename to rewards_reservation_status",
    );
    expect(databaseTypes).toContain("rewards_ledger_entry_type:");
    expect(databaseTypes).toContain("rewards_ledger_status:");
    expect(databaseTypes).toContain("rewards_reservation_status:");
  });

  it("renames every active database object at the rewards boundary", () => {
    for (const objectName of [
      "rewards_accounts_points_nonnegative",
      "rewards_accounts_set_updated_at",
      "rewards_accounts_select_own",
      "rewards_ledger_entries_source_key_key",
      "rewards_ledger_user_created_idx",
      "rewards_ledger_order_idx",
      "rewards_ledger_entries_select_own",
      "rewards_reservations_amounts_positive",
      "rewards_reservations_user_created_idx",
      "rewards_reservations_order_idx",
      "rewards_reservations_set_updated_at",
      "rewards_reservations_select_own",
      "on_auth_user_created_rewards",
      "handle_new_user_rewards",
    ]) {
      expect(contractionSql).toContain(objectName);
    }
  });

  it("makes rewards RPCs direct, fixed-search-path, service-only contracts", () => {
    for (const fn of rewardsFunctions) {
      expect(contractionSql).toContain(
        `create or replace function public.${fn}(`,
      );
      expect(contractionSql).toContain(
        `revoke all on function public.${fn}`,
      );
      expect(contractionSql).toContain("from public, anon, authenticated, service_role");
      expect(contractionSql).toContain("to service_role");
    }

    expect(contractionSql.match(/set search_path = ''/g)?.length).toBeGreaterThanOrEqual(
      rewardsFunctions.length,
    );
    expect(contractionSql).toContain("from public.rewards_ledger_entries");
    expect(contractionSql).toContain("from public.rewards_accounts");
    expect(contractionSql).toContain("from public.rewards_reservations");
    expect(contractionSql).toContain("for update");
    expect(contractionSql).toContain("on conflict (source_key) do nothing");
    expect(contractionSql).toContain("Insufficient Available Points Balance");
  });

  it("rewires Checkout and removes every temporary compatibility function", () => {
    for (const fn of [
      "cancel_checkout_order_without_session",
      "expire_checkout_order_from_stripe",
      "fail_checkout_attempt",
      "fail_checkout_order_from_stripe",
      "finalize_paid_checkout_order",
    ]) {
      expect(contractionSql).toContain(
        `create or replace function public.${fn}(`,
      );
    }

    expect(contractionSql).toContain("drop function public.award_loyalty_points");
    expect(contractionSql).toContain("drop function public.ensure_loyalty_account");
    expect(contractionSql).toContain("drop function public.redeem_loyalty_points");
    expect(contractionSql).toContain(
      "drop function public.release_loyalty_redemptions_for_order",
    );
    expect(contractionSql).not.toMatch(/delete\s+from|truncate\s+/i);
    expect(contractionSql).not.toMatch(/drop\s+(?:table|type)\s+/i);
  });

  it("publishes only rewards-named current application types", () => {
    for (const table of rewardsTables) {
      expect(databaseTypes).toContain(`${table}: {`);
    }
    for (const fn of rewardsFunctions) {
      expect(databaseTypes).toContain(`${fn}: {`);
    }

    expect(databaseTypes).not.toMatch(/loyalty/i);
  });

  it("keeps the executable overspend and idempotency probe on rewards interfaces", () => {
    expect(concurrencyVerifier).toContain("Promise.allSettled([");
    expect(concurrencyVerifier.match(/reserve\(sourceKeys\[/g)).toHaveLength(2);
    expect(concurrencyVerifier).toContain("succeeded.length !== 1");
    expect(concurrencyVerifier).toContain("failed.length !== 1");
    expect(concurrencyVerifier).toContain("Insufficient Available Points Balance");
    expect(concurrencyVerifier).toContain('.from("rewards_accounts")');
    expect(concurrencyVerifier).toContain('.from("rewards_ledger_entries")');
    expect(concurrencyVerifier).toContain('.from("rewards_reservations")');
    expect(concurrencyVerifier).not.toMatch(/loyalty/i);
  });
});
