import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("customer helix rewards migration", () => {
  it("keeps active customer journeys on rewards language and interfaces", () => {
    const customerRuntime = [
      "app/account/page.tsx",
      "app/api/rewards/summary/route.ts",
      "app/api/rewards/private-feedback/route.ts",
      "app/rewards/page.tsx",
      "components/account/PrivateFeedbackForm.tsx",
      "components/cart/CheckoutPanel.tsx",
      "content/footer.ts",
      "content/legal/privacy.ts",
      "content/legal/terms.ts",
      "content/support/faq.ts",
      "lib/rewards/rules.ts",
      "lib/rewards/server.ts",
    ].map(source).join("\n");

    expect(customerRuntime).not.toMatch(/loyalty|MEI PELLE REWARDS/i);
    expect(customerRuntime).toContain("helix rewards");
    expect(customerRuntime).toContain('rpc("ensure_rewards_account"');
    expect(customerRuntime).toContain('rpc("award_rewards_points"');
    expect(customerRuntime).toContain('.from("rewards_accounts")');
    expect(customerRuntime).toContain('.from("rewards_ledger_entries")');
  });

  it("retains the established retry, failure, concurrency, and out-of-order gates", () => {
    const databaseContract = source("supabase/tests/rewards_contract.integration.sql");
    const concurrencyProbe = source("scripts/db/verify-rewards-contract.ts");
    const checkoutStateTests = source("tests/checkout-stripe-state.test.ts");
    const checkoutOperations = source("lib/orders/server.ts");

    expect(databaseContract).toContain("rewards account setup is retry-safe");
    expect(databaseContract).toContain("a retried Points Release is idempotent");
    expect(databaseContract).toContain("the Points Release appends one immutable ledger entry");
    expect(databaseContract).toContain("browser sessions cannot reserve Points");
    expect(concurrencyProbe).toContain("Promise.allSettled([");
    expect(concurrencyProbe).toContain("Expected one successful and one rejected reservation");
    expect(checkoutStateTests).toContain("does not regress terminal orders to payment failed");
    expect(checkoutOperations).toContain('if (order.status === "paid")');
    expect(checkoutOperations).toContain('return { action: "duplicate", type: event.type }');
  });
});
