import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { LEGACY_REWARDS_PATTERN } from "@/tests/helpers/former-identifiers";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("operational rewards migration", () => {
  it("keeps Checkout and Stripe operations on rewards-named interfaces", () => {
    const orderOperations = source("lib/orders/server.ts");
    const rewardsOperations = source("lib/rewards/operations.ts");

    expect(`${orderOperations}\n${rewardsOperations}`).not.toMatch(
      LEGACY_REWARDS_PATTERN,
    );
    expect(rewardsOperations).toContain('rpc("reserve_rewards_points"');
    expect(rewardsOperations).toContain('rpc("record_rewards_points_adjustment"');
    expect(orderOperations).not.toContain(
      'if (!order || order.status === "refunded") return;',
    );
  });

  it("describes transactional Checkout release through the rewards contract", () => {
    const checkoutContract = source("supabase/tests/cart_server_integrity.integration.sql");

    expect(checkoutContract).toContain("release_rewards_reservations_for_order");
    expect(checkoutContract).not.toContain(
      ["release", "loyal", "ty", "redemptions", "for", "order"].join("_"),
    );
  });

  it("keeps the active Stripe sandbox tool on helix rewards language", () => {
    const stripeCommand = source("scripts/stripe-sync-sandbox.ts");
    const stripeContract = source("scripts/stripe/sandbox-rewards.ts");

    expect(`${stripeCommand}\n${stripeContract}`).not.toMatch(/mei[ _-]?pelle/i);
    expect(stripeContract).toContain("helix rewards — $5 off");
    expect(stripeContract).toContain("helix referral offer — 15% off");
  });
});
