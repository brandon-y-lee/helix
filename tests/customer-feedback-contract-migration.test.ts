import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260819173704_submit_private_feedback_reward_atomically.sql",
  ),
  "utf8",
);
const integration = readFileSync(
  resolve(process.cwd(), "supabase/tests/customer_rewards_referrals.integration.sql"),
  "utf8",
);

describe("private feedback Points Award database contract", () => {
  it("owns feedback completion and its Points Award in one server-only transaction", () => {
    expect(migration).toContain(
      "create function public.submit_private_feedback_reward(",
    );
    expect(migration).toContain("for update");
    expect(migration).toContain("public.award_rewards_points(");
    expect(migration).toContain("set search_path = ''");
    expect(migration).toMatch(
      /grant execute on function public\.submit_private_feedback_reward\([\s\S]+?to service_role/,
    );
  });

  it("proves rollback after an award failure and idempotent recovery", () => {
    expect(integration).toContain("a failed Points Award rolls back feedback completion");
    expect(integration).toContain("feedback can be retried after the rolled-back failure");
    expect(integration).toContain("a feedback retry returns the same Points Ledger entry");
  });
});
