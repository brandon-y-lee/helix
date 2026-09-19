import assert from "node:assert/strict";

// The narrow checkpoint omits the rewards subsystem. Load the actual predecessor
// table and function definitions, retaining its rename, constraints and policies.
export function loadCheckoutPaymentTestEffects(sql, source) {
  const initial = source("supabase/migrations/202606250001_checkout_rewards_private_feedback.sql");
  for (const name of ["loyalty_ledger_entry_type", "loyalty_ledger_status", "loyalty_redemption_status"]) {
    const definition = initial.match(new RegExp(`create type public\\.${name} as enum \\([\\s\\S]*?\\);`));
    assert.ok(definition, `Missing real enum ${name}`);
    sql(definition[0].replaceAll("loyalty_ledger", "rewards_ledger")
      .replaceAll("loyalty_redemption", "rewards_reservation"));
  }
  for (const name of ["loyalty_ledger_entries", "loyalty_redemptions"]) {
    const definition = initial.match(new RegExp(`create table if not exists public\\.${name} \\([\\s\\S]*?\\n\\);`));
    assert.ok(definition, `Missing real table ${name}`);
    sql(definition[0].replaceAll("loyalty_ledger", "rewards_ledger")
      .replaceAll("loyalty_redemptions", "rewards_reservations")
      .replaceAll("loyalty_redemption", "rewards_reservation"));
  }
  for (const [path, names] of [
    ["supabase/migrations/20260819183701_contract_legacy_loyalty_implementation.sql",
      ["ensure_rewards_account", "award_rewards_points", "finalize_paid_checkout_order"]],
    ["supabase/migrations/20260801110000_checkout_generation_and_attempt_ownership.sql",
      ["clear_paid_order_cart"]],
  ]) {
    const text = source(path);
    for (const name of names) {
      const start = text.indexOf(`create or replace function public.${name}(`);
      const end = text.indexOf("\n$$;", start) + 4;
      assert.ok(start >= 0 && end > start, `Missing real function ${name}`);
      sql(text.slice(start, end));
    }
  }
  sql(`ALTER TABLE public.rewards_ledger_entries ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.rewards_reservations ENABLE ROW LEVEL SECURITY;
    GRANT SELECT, INSERT, UPDATE ON public.rewards_ledger_entries, public.rewards_reservations TO service_role;`);
}

