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

const databaseTypes = readFileSync(
  resolve(process.cwd(), "lib/database.types.ts"),
  "utf8",
);

const concurrencySql = readFileSync(
  resolve(
    process.cwd(),
    "supabase/tests/rewards_contract_concurrency.session.sql",
  ),
  "utf8",
);

const rewardsViews = [
  "rewards_accounts",
  "rewards_ledger_entries",
  "rewards_redemptions",
] as const;

const rewardsFunctions = [
  "ensure_rewards_account",
  "award_rewards_points",
  "redeem_rewards_points",
  "release_rewards_redemptions_for_order",
] as const;

describe("temporary rewards database contract", () => {
  it("adds explicit security-invoker views over the existing Points records", () => {
    for (const view of rewardsViews) {
      expect(migrationSql).toContain(
        `create view public.${view}\nwith (security_invoker = true)`,
      );
      expect(migrationSql).toContain(
        `revoke all privileges on table public.${view} from public, anon, authenticated, service_role`,
      );
      expect(migrationSql).toContain(
        `grant select on table public.${view} to authenticated`,
      );
      expect(migrationSql).toContain(
        `grant select, insert, update on table public.${view} to service_role`,
      );
    }

    expect(migrationSql).toContain("from public.loyalty_accounts");
    expect(migrationSql).toContain("from public.loyalty_ledger_entries");
    expect(migrationSql).toContain("from public.loyalty_redemptions");
    expect(migrationSql).not.toMatch(/create\s+table\s+public\.rewards_/i);
  });

  it("keeps rewards mutations service-only behind fixed-search-path wrappers", () => {
    for (const fn of rewardsFunctions) {
      expect(migrationSql).toContain(
        `create function public.${fn}(`,
      );
      expect(migrationSql).toContain(
        `revoke all on function public.${fn}`,
      );
      expect(migrationSql).toContain("from public, anon, authenticated, service_role");
      expect(migrationSql).toContain(`to service_role`);
    }

    expect(migrationSql.match(/security invoker/g)).toHaveLength(4);
    expect(migrationSql.match(/set search_path = ''/g)).toHaveLength(4);
    expect(migrationSql).toContain("public.ensure_loyalty_account(");
    expect(migrationSql).toContain("public.award_loyalty_points(");
    expect(migrationSql).toContain("public.redeem_loyalty_points(");
    expect(migrationSql).toContain(
      "public.release_loyalty_redemptions_for_order(",
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
  });

  it("marks the compatibility boundary as temporary and rebrand-scoped", () => {
    expect(migrationSql).toContain("Temporary helix rewards expansion boundary");
    expect(migrationSql).toContain("Tickets #185 and #186");
    expect(migrationSql).toContain("Ticket #187");
  });

  it("ships a two-session overspend probe through the rewards interface", () => {
    expect(concurrencySql.match(/public\.redeem_rewards_points\(/g)).toHaveLength(2);
    expect(concurrencySql).toContain("ticket-184-concurrency-a");
    expect(concurrencySql).toContain("ticket-184-concurrency-b");
    expect(concurrencySql).toContain("exactly_one_reservation");
    expect(concurrencySql).toContain(
      "delete from auth.users where id = '18400000-0000-4000-8000-000000000003'",
    );
  });
});
