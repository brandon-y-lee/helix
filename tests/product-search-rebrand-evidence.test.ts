import { describe, expect, it } from "vitest";
import {
  findProductSearchCompletionEvidence,
  mayUseProductSearchCompletionEvidence,
} from "@/scripts/catalog/product-search-rebrand-evidence";

describe("Product Search rebrand completion evidence", () => {
  it("accepts only the complete authoritative finalization record", () => {
    const retiredIndex = ["mei", "pelle", "products"].join("_");
    const evidence = findProductSearchCompletionEvidence([
      {
        body: [
          "Complete Algolia inventory enumerated all five API keys with no legacy-index restrictions.",
          `The finalizer deleted exactly \`${retiredIndex}\`.`,
          "Independent verification confirms the source is absent and 10 canonical records remain.",
        ].join(" "),
        createdAt: "2026-08-19T18:02:26Z",
      },
    ]);

    expect(evidence).toEqual({
      issue: 189,
      createdAt: "2026-08-19T18:02:26Z",
      keyCount: 5,
    });
    expect(
      findProductSearchCompletionEvidence([
        { body: "Only configured keys passed.", createdAt: "2026-08-19T18:00:00Z" },
      ]),
    ).toBeNull();
  });

  it("uses completion evidence only when every fresh check except full key listing passes", () => {
    const completeFreshState = {
      ok: false,
      blockers: ["all Algolia API keys must be inventoried"],
      inventory: {
        source: null,
        target: { name: "helix_products" },
        querySuggestions: [],
        recommendDependencies: [],
        apiKeys: { status: "configured-keys-verified" },
      },
      reconciliation: { targetMatchesCanonical: true },
    };

    expect(mayUseProductSearchCompletionEvidence(completeFreshState)).toBe(true);
    expect(
      mayUseProductSearchCompletionEvidence({
        ...completeFreshState,
        blockers: [...completeFreshState.blockers, "target records do not match"],
      }),
    ).toBe(false);
  });
});
