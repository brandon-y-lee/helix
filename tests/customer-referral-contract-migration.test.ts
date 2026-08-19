import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260819165730_qualify_referral_rewards_atomically.sql",
  ),
  "utf8",
);
const integration = readFileSync(
  resolve(process.cwd(), "supabase/tests/customer_rewards_referrals.integration.sql"),
  "utf8",
);
const verifier = readFileSync(
  resolve(process.cwd(), "scripts/db/verify-rewards-contract.ts"),
  "utf8",
);

describe("customer Referral Reward database contract", () => {
  it("qualifies paid Referral Rewards atomically and idempotently", () => {
    expect(migration).toContain(
      "create function public.qualify_referral_for_paid_order(p_order_id uuid)",
    );
    expect(migration).toContain("for update");
    expect(migration).toContain("on conflict (source_key)");
    expect(migration).toContain("set search_path = ''");
    expect(migration).toMatch(
      /grant execute on function public\.qualify_referral_for_paid_order\(uuid\)\s+to service_role/,
    );
  });

  it("ships executable retry and browser-authority coverage", () => {
    expect(integration).toContain("an unpaid Order cannot issue a Referral Reward");
    expect(integration).toContain("a later verified Paid Order can issue the Referral Reward");
    expect(integration).toContain("a retried Referral Reward qualification returns the same Reward");
    expect(integration).toContain("a retry creates exactly one Referral Reward");
    expect(integration).toContain("browser sessions cannot qualify Referral Rewards");
    expect(verifier).toContain("concurrentReferralQualifications");
    expect(verifier).toContain("Concurrent Referral Reward qualification");
  });
});
