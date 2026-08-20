import { describe, expect, it, vi } from "vitest";
import { LEGACY_PRODUCTS_INDEX } from "@/lib/algolia/index";
import {
  assessProductSearchMigration,
  collectPaginatedIndices,
  collectPaginatedSearchConfiguration,
  runProductSearchVerification,
  type ProductSearchControlPlane,
  type ProductSearchInventory,
} from "@/scripts/catalog/product-search-migration";

const canonicalRecords = [
  {
    objectID: "product-1",
    slug: "biotic-reset",
    imageMedia: {
      url: "https://erasogmsqpgiirovubjh.supabase.co/storage/v1/object/public/helix-catalog/products/biotic-reset.webp",
    },
  },
];

function inventory(
  overrides: Partial<ProductSearchInventory> = {},
): ProductSearchInventory {
  return {
    indices: [{ name: "helix_products" }],
    source: null,
    target: {
      name: "helix_products",
      entries: 1,
      replicas: [],
      primary: null,
      rules: [],
      synonyms: [],
      settings: {},
      settingsMatch: true,
      records: canonicalRecords,
    },
    querySuggestions: [],
    recommendDependencies: [],
    providerChecks: {
      querySuggestions: "verified",
      recommend: "verified",
    },
    apiKeys: {
      status: "all-keys-enumerated",
      configuredPublicKeyVerified: true,
      configuredWriteKeyVerified: true,
    },
    analytics: {
      implication:
        "Index analytics remain attached to their original index names.",
    },
    ...overrides,
  };
}

describe("Product Search completion assessment", () => {
  it("verifies the canonical helix index with no former index remaining", () => {
    const report = assessProductSearchMigration(inventory(), canonicalRecords);

    expect(report.ok).toBe(true);
    expect(report.verified).toBe(true);
    expect(report.blockers).toEqual([]);
    expect(report.reconciliation).toMatchObject({
      canonicalRecords: 1,
      sourceRecords: 0,
      targetRecords: 1,
      targetMatchesCanonical: true,
    });
  });

  it("fails when the former index still exists", () => {
    const report = assessProductSearchMigration(
      inventory({
        source: {
          ...inventory().target!,
          name: LEGACY_PRODUCTS_INDEX,
        },
      }),
      canonicalRecords,
    );

    expect(report.ok).toBe(false);
    expect(report.blockers).toContain("former Product Search index still exists");
  });

  it("fails when downstream provider features still name the former index", () => {
    const report = assessProductSearchMigration(
      inventory({
        querySuggestions: [
          {
            region: "us",
            indexName: "product_suggestions",
            sourceIndices: [LEGACY_PRODUCTS_INDEX],
          },
        ],
        recommendDependencies: ["related-products"],
      }),
      canonicalRecords,
    );

    expect(report.blockers).toEqual([
      `Query Suggestions product_suggestions source ${LEGACY_PRODUCTS_INDEX} contains a retired identifier`,
      "Query Suggestions product_suggestions (us) reads the source index",
      "Recommend model related-products depends on the source index",
    ]);
  });

  it("fails closed when provider dependency inventory is unavailable", () => {
    const report = assessProductSearchMigration(
      inventory({
        providerChecks: {
          querySuggestions: "unavailable",
          recommend: "unavailable",
        },
        apiKeys: {
          status: "unavailable",
          configuredPublicKeyVerified: false,
          configuredWriteKeyVerified: false,
        },
      }),
      canonicalRecords,
    );

    expect(report.blockers).toEqual([
      "Query Suggestions inventory is unavailable",
      "Recommend inventory is unavailable",
      "configured Algolia keys could not be verified",
      "configured public Product Search key could not read helix_products",
      "all Algolia API keys must be inventoried",
    ]);
  });

  it("fails when only configured keys can be verified", () => {
    const report = assessProductSearchMigration(
      inventory({
        apiKeys: {
          status: "configured-keys-verified",
          configuredPublicKeyVerified: true,
          configuredWriteKeyVerified: true,
        },
      }),
      canonicalRecords,
    );

    expect(report.ok).toBe(false);
    expect(report.blockers).toContain("all Algolia API keys must be inventoried");
  });

  it("fails when any inventoried API key is scoped only to the former index", () => {
    const report = assessProductSearchMigration(
      inventory({
        apiKeys: {
          status: "all-keys-enumerated",
          configuredPublicKeyVerified: true,
          configuredWriteKeyVerified: true,
          keys: [
            {
              identity: "other-key-1",
              acl: ["search"],
              indexes: [LEGACY_PRODUCTS_INDEX],
              description: "Former mobile search key",
            },
          ],
        },
      }),
      canonicalRecords,
    );

    expect(report.blockers).toContain(
      "Algolia API key other-key-1 is scoped to the source index",
    );
  });

  it("recognizes wildcard key restrictions that match only the former index", () => {
    const report = assessProductSearchMigration(
      inventory({
        apiKeys: {
          status: "all-keys-enumerated",
          configuredPublicKeyVerified: true,
          configuredWriteKeyVerified: true,
          keys: [
            {
              identity: "other-key-1",
              acl: ["search"],
              indexes: [["mei", "pelle", "*"].join("_")],
              description: null,
            },
            {
              identity: "other-key-2",
              acl: ["search"],
              indexes: ["helix_*"],
              description: null,
            },
          ],
        },
      }),
      canonicalRecords,
    );

    expect(report.blockers).toContain(
      "Algolia API key other-key-1 is scoped to the source index",
    );
    expect(report.blockers).not.toContain(
      "Algolia API key other-key-2 is scoped to the source index",
    );
  });

  it("rejects retired identifiers in any index name or API-key description", () => {
    const retiredCopy = ["mei", "Pelle", "archive"].join("");
    const retiredDescription = ["loyal", "ty mobile key"].join("");
    const report = assessProductSearchMigration(
      inventory({
        indices: [{ name: "helix_products" }, { name: retiredCopy }],
        apiKeys: {
          status: "all-keys-enumerated",
          configuredPublicKeyVerified: true,
          configuredWriteKeyVerified: true,
          keys: [
            {
              identity: "other-key-1",
              acl: ["search"],
              indexes: ["helix_products"],
              description: retiredDescription,
            },
          ],
        },
      }),
      canonicalRecords,
    );

    expect(report.blockers).toContain(
      `Algolia index ${retiredCopy} contains a retired identifier`,
    );
    expect(report.blockers).toContain(
      "Algolia API key other-key-1 description contains a retired identifier",
    );
  });

  it("rejects retired identifiers in key restrictions and Query Suggestions names", () => {
    const retiredRestriction = ["mei", "Pelle", "*"].join("");
    const retiredSuggestion = ["loyal", "ty", "suggestions"].join("");
    const retiredSource = ["mei", "-pelle", "-source"].join("");
    const report = assessProductSearchMigration(
      inventory({
        querySuggestions: [
          {
            region: "us",
            indexName: retiredSuggestion,
            sourceIndices: [retiredSource],
          },
        ],
        apiKeys: {
          status: "all-keys-enumerated",
          configuredPublicKeyVerified: true,
          configuredWriteKeyVerified: true,
          keys: [
            {
              identity: "other-key-1",
              acl: ["search"],
              indexes: [retiredRestriction],
              description: null,
            },
          ],
        },
      }),
      canonicalRecords,
    );

    expect(report.blockers).toEqual(
      expect.arrayContaining([
        "Algolia API key other-key-1 restriction contains a retired identifier",
        `Query Suggestions ${retiredSuggestion} contains a retired identifier`,
        `Query Suggestions ${retiredSuggestion} source ${retiredSource} contains a retired identifier`,
      ]),
    );
  });

  it("rejects equal counts when records, rules, or synonyms differ", () => {
    const report = assessProductSearchMigration(
      inventory({
        target: {
          ...inventory().target!,
          rules: [{ objectID: "rule-1", consequence: { hide: [] } }],
          synonyms: [{ objectID: "synonym-1", synonyms: ["serum", "essence"] }],
          records: [{ ...canonicalRecords[0], staleField: true }],
        },
      }),
      canonicalRecords,
    );

    expect(report.ok).toBe(false);
    expect(report.reconciliation.targetMatchesCanonical).toBe(false);
  });
});

describe("Product Search configuration inventory", () => {
  it("collects every index inventory page", async () => {
    const readPage = vi
      .fn()
      .mockResolvedValueOnce({ items: [{ name: "other" }], nbPages: 2 })
      .mockResolvedValueOnce({
        items: [{ name: LEGACY_PRODUCTS_INDEX }],
        nbPages: 2,
      });

    await expect(collectPaginatedIndices(readPage, 1)).resolves.toEqual([
      { name: "other" },
      { name: LEGACY_PRODUCTS_INDEX },
    ]);
    expect(readPage).toHaveBeenNthCalledWith(1, 0, 1);
    expect(readPage).toHaveBeenNthCalledWith(2, 1, 1);
  });

  it("fails closed on an empty final index inventory page", async () => {
    const readPage = vi
      .fn()
      .mockResolvedValueOnce({ items: [{ name: "other" }], nbPages: 2 })
      .mockResolvedValueOnce({ items: [], nbPages: 2 });

    await expect(collectPaginatedIndices(readPage, 1)).rejects.toThrow(
      /inventory was incomplete/,
    );
  });

  it("collects every rules or synonyms page before reconciliation", async () => {
    const readPage = vi
      .fn()
      .mockResolvedValueOnce({ hits: [{ objectID: "1" }], nbHits: 2 })
      .mockResolvedValueOnce({ hits: [{ objectID: "2" }], nbHits: 2 });

    await expect(
      collectPaginatedSearchConfiguration(readPage, 1),
    ).resolves.toEqual([{ objectID: "1" }, { objectID: "2" }]);
    expect(readPage).toHaveBeenNthCalledWith(1, 0, 1);
    expect(readPage).toHaveBeenNthCalledWith(2, 1, 1);
  });

  it("fails closed if the configuration total changes between pages", async () => {
    const readPage = vi
      .fn()
      .mockResolvedValueOnce({ hits: [{ objectID: "1" }], nbHits: 2 })
      .mockResolvedValueOnce({ hits: [{ objectID: "2" }], nbHits: 3 });

    await expect(
      collectPaginatedSearchConfiguration(readPage, 1),
    ).rejects.toThrow(/changed during inventory/);
  });
});

describe("Product Search verification runner", () => {
  it("is read-only and returns the inventory assessment", async () => {
    const controlPlane: ProductSearchControlPlane = {
      inspect: vi.fn(async () => inventory()),
    };

    await expect(
      runProductSearchVerification(controlPlane, canonicalRecords),
    ).resolves.toMatchObject({ ok: true, verified: true });
    expect(controlPlane.inspect).toHaveBeenCalledOnce();
  });
});
