import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationSql = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260819035644_expand_rewards_contract.sql",
  ),
  "utf8",
);

const hardeningSql = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260819041100_harden_rewards_contract.sql",
  ),
  "utf8",
);

const finalizationSql = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260819042432_finalize_rewards_contract.sql",
  ),
  "utf8",
);

const provisionalRemovalSql = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260819042708_remove_provisional_rewards_contract.sql",
  ),
  "utf8",
);

const adjustmentFixSql = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260819051228_fix_rewards_adjustment_coalesce.sql",
  ),
  "utf8",
);

const canonicalErrorsSql = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260819051920_canonicalize_rewards_balance_errors.sql",
  ),
  "utf8",
);

const effectiveMigrationSql = `${migrationSql}\n${hardeningSql}\n${finalizationSql}\n${provisionalRemovalSql}\n${adjustmentFixSql}\n${canonicalErrorsSql}`;

const databaseTypes = readFileSync(
  resolve(process.cwd(), "lib/database.types.ts"),
  "utf8",
);

const concurrencyVerifier = readFileSync(
  resolve(process.cwd(), "scripts/db/verify-rewards-contract.ts"),
  "utf8",
);

const rewardsViews = [
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

describe("temporary rewards database contract", () => {
  it("adds explicit security-invoker views over the existing Points records", () => {
    for (const view of rewardsViews) {
      expect(effectiveMigrationSql).toContain(
        `create view public.${view}\nwith (security_invoker = true)`,
      );
      expect(hardeningSql).toContain(
        `revoke all privileges on table public.${view} from public, anon, authenticated, service_role`,
      );
      expect(hardeningSql).toContain(
        `grant select on table public.${view} to authenticated`,
      );
      expect(hardeningSql).toContain(
        `grant select on table public.${view} to service_role`,
      );
    }

    expect(migrationSql).toContain("from public.loyalty_accounts");
    expect(migrationSql).toContain("from public.loyalty_ledger_entries");
    expect(hardeningSql).toContain("from public.loyalty_redemptions");
    expect(effectiveMigrationSql).not.toMatch(
      /create\s+table\s+public\.rewards_/i,
    );
    expect(hardeningSql).not.toMatch(
      /grant\s+(?:insert|update|delete|all)\b[\s\S]*?on\s+table\s+public\.rewards_/i,
    );
  });

  it("keeps rewards mutations service-only behind fixed-search-path wrappers", () => {
    for (const fn of rewardsFunctions) {
      expect(effectiveMigrationSql).toContain(
        `create function public.${fn}(`,
      );
      expect(effectiveMigrationSql).toContain(
        `revoke all on function public.${fn}`,
      );
      expect(effectiveMigrationSql).toContain(
        "from public, anon, authenticated, service_role",
      );
      expect(effectiveMigrationSql).toContain(`to service_role`);
    }

    expect(hardeningSql.match(/security invoker/g)).toHaveLength(2);
    expect(hardeningSql.match(/set search_path = ''/g)).toHaveLength(2);
    expect(hardeningSql).toContain("public.redeem_loyalty_points(");
    expect(hardeningSql).toContain(
      "public.release_loyalty_redemptions_for_order(",
    );
    expect(hardeningSql).toContain(
      "revoke all on function public.redeem_rewards_points",
    );
    expect(hardeningSql).toContain(
      "revoke all on function public.release_rewards_redemptions_for_order",
    );
    expect(finalizationSql).toContain("for update");
    expect(finalizationSql).toContain("on conflict (source_key) do nothing");
    expect(finalizationSql.match(/security invoker/g)).toHaveLength(1);
    expect(finalizationSql.match(/set search_path = ''/g)).toHaveLength(1);
    expect(adjustmentFixSql).toContain(
      "create or replace function public.record_rewards_points_adjustment(",
    );
    expect(adjustmentFixSql.match(/security invoker/g)).toHaveLength(1);
    expect(adjustmentFixSql.match(/set search_path = ''/g)).toHaveLength(1);
    expect(adjustmentFixSql).not.toContain("pg_catalog.coalesce");
    expect(
      canonicalErrorsSql.match(/Insufficient Available Points Balance/g),
    ).toHaveLength(2);
    expect(canonicalErrorsSql).not.toContain("Insufficient rewards balance");
    expect(provisionalRemovalSql).toContain(
      "drop function public.redeem_rewards_points",
    );
    expect(provisionalRemovalSql).toContain(
      "drop function public.release_rewards_redemptions_for_order",
    );
    expect(provisionalRemovalSql).toContain(
      "drop view public.rewards_redemptions",
    );
  });

  it("publishes rewards-named application types without removing compatibility", () => {
    for (const view of rewardsViews) {
      expect(databaseTypes).toContain(`${view}: {`);
    }
    for (const fn of rewardsFunctions) {
      expect(databaseTypes).toContain(`${fn}: {`);
    }

    expect(databaseTypes).toContain("loyalty_accounts: {");
    expect(databaseTypes).toContain("award_loyalty_points: {");
    expect(databaseTypes).not.toContain("rewards_redemptions: {");
    expect(databaseTypes).not.toContain("redeem_rewards_points: {");
    expect(databaseTypes).not.toContain(
      "release_rewards_redemptions_for_order: {",
    );
  });

  it("marks the compatibility boundary as temporary and rebrand-scoped", () => {
    expect(migrationSql).toContain("Temporary helix rewards expansion boundary");
    expect(migrationSql).toContain("Tickets #185 and #186");
    expect(migrationSql).toContain("Ticket #187");
  });

  it("ships an executable concurrent overspend probe through the rewards interface", () => {
    expect(concurrencyVerifier).toContain("Promise.allSettled([");
    expect(concurrencyVerifier.match(/reserve\(sourceKeys\[/g)).toHaveLength(2);
    expect(concurrencyVerifier).toContain('succeeded.length !== 1');
    expect(concurrencyVerifier).toContain('failed.length !== 1');
    expect(concurrencyVerifier).toContain(
      "Insufficient Available Points Balance",
    );
    expect(concurrencyVerifier).toContain('.from("rewards_accounts")');
    expect(concurrencyVerifier).toContain('.from("rewards_reservations")');
    expect(concurrencyVerifier).toContain("supabase.auth.admin.deleteUser(userId)");
  });
});
