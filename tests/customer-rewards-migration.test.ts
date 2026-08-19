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

});
