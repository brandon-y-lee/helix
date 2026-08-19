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
] as const;

describe("temporary rewards database contract", () => {
  it("adds explicit security-invoker views over the existing Points records", () => {
    for (const view of rewardsViews) {
      expect(`${migrationSql}\n${hardeningSql}`).toContain(
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
    expect(`${migrationSql}\n${hardeningSql}`).not.toMatch(
      /create\s+table\s+public\.rewards_/i,
    );
    expect(hardeningSql).not.toMatch(
      /grant\s+(?:insert|update|delete|all)\b[\s\S]*?on\s+table\s+public\.rewards_/i,
    );
  });

  it("keeps rewards mutations service-only behind fixed-search-path wrappers", () => {
    for (const fn of rewardsFunctions) {
      expect(`${migrationSql}\n${hardeningSql}`).toContain(
        `create function public.${fn}(`,
      );
      expect(`${migrationSql}\n${hardeningSql}`).toContain(
        `revoke all on function public.${fn}`,
      );
      expect(`${migrationSql}\n${hardeningSql}`).toContain(
        "from public, anon, authenticated, service_role",
      );
      expect(`${migrationSql}\n${hardeningSql}`).toContain(`to service_role`);
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

  it("ships an executable concurrent overspend probe through the rewards interface", () => {
    expect(concurrencyVerifier).toContain("Promise.allSettled([");
    expect(concurrencyVerifier.match(/reserve\(sourceKeys\[/g)).toHaveLength(2);
    expect(concurrencyVerifier).toContain('succeeded.length !== 1');
    expect(concurrencyVerifier).toContain('failed.length !== 1');
    expect(concurrencyVerifier).toContain('.from("rewards_accounts")');
    expect(concurrencyVerifier).toContain('.from("rewards_reservations")');
    expect(concurrencyVerifier).toContain("supabase.auth.admin.deleteUser(userId)");
  });
});
