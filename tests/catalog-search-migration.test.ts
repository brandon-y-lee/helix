import { describe, expect, it, vi } from "vitest";
import {
  assessCatalogSearchMigration,
  runCatalogSearchMigration,
  type CatalogSearchControlPlane,
  type CatalogSearchInventory,
} from "@/scripts/catalog/catalog-search-migration";

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
  overrides: Partial<CatalogSearchInventory> = {},
): CatalogSearchInventory {
  return {
    source: {
      name: "mei_pelle_products",
      entries: 1,
      replicas: [],
      primary: null,
      rules: 0,
      synonyms: 0,
      settings: {},
      settingsMatch: true,
      records: canonicalRecords,
    },
    target: null,
    querySuggestions: [],
    recommendDependencies: [],
    apiKeys: { status: "unavailable", configuredPublicKeyVerified: false },
    analytics: {
      implication:
        "Index analytics remain attached to their original index names.",
    },
    ...overrides,
  };
}

describe("Catalog Product Search migration assessment", () => {
  it("plans a canonical target without treating the temporary source as complete", () => {
    const report = assessCatalogSearchMigration(
      "plan",
      inventory(),
      canonicalRecords,
    );

    expect(report.ok).toBe(true);
    expect(report.verified).toBe(false);
    expect(report.actions).toEqual(["prepare-target"]);
    expect(report.reconciliation).toMatchObject({
      canonicalRecords: 1,
      sourceRecords: 1,
      targetRecords: 0,
      targetMatchesCanonical: false,
    });
  });

  it("blocks cutover when replicas or downstream provider features name the source", () => {
    const report = assessCatalogSearchMigration(
      "apply",
      inventory({
        source: {
          ...inventory().source!,
          replicas: ["mei_pelle_products_price_asc"],
        },
        querySuggestions: [
          {
            region: "us",
            indexName: "product_suggestions",
            sourceIndices: ["mei_pelle_products"],
          },
        ],
        recommendDependencies: ["related-products"],
      }),
      canonicalRecords,
    );

    expect(report.ok).toBe(false);
    expect(report.blockers).toEqual([
      "source index has replicas: mei_pelle_products_price_asc",
      "Query Suggestions product_suggestions (us) reads the source index",
      "Recommend model related-products depends on the source index",
    ]);
  });
});

describe("Catalog Product Search migration lifecycle", () => {
  it("prepares, reconciles, and publicly verifies the target without deleting the source", async () => {
    let remote = inventory();
    const controlPlane: CatalogSearchControlPlane = {
      inspect: vi.fn(async () => remote),
      prepareTarget: vi.fn(async (records) => {
        remote = inventory({
          target: {
            name: "helix_products",
            entries: records.length,
            replicas: [],
            primary: null,
            rules: 0,
            synonyms: 0,
            settings: {},
            settingsMatch: true,
            records,
          },
        });
      }),
      verifyPublicRead: vi.fn(async () => {
        remote = {
          ...remote,
          apiKeys: {
            ...remote.apiKeys,
            configuredPublicKeyVerified: true,
          },
        };
      }),
      deleteSource: vi.fn(),
    };

    const report = await runCatalogSearchMigration(
      "apply",
      controlPlane,
      canonicalRecords,
    );

    expect(report.verified).toBe(true);
    expect(controlPlane.prepareTarget).toHaveBeenCalledWith(canonicalRecords);
    expect(controlPlane.verifyPublicRead).toHaveBeenCalledOnce();
    expect(controlPlane.deleteSource).not.toHaveBeenCalled();
  });

  it("keeps the source when provider reconciliation fails", async () => {
    const controlPlane: CatalogSearchControlPlane = {
      inspect: vi.fn(async () => inventory()),
      prepareTarget: vi.fn(async () => {
        throw new Error("Algolia unavailable");
      }),
      verifyPublicRead: vi.fn(),
      deleteSource: vi.fn(),
    };

    await expect(
      runCatalogSearchMigration("apply", controlPlane, canonicalRecords),
    ).rejects.toThrow(/Algolia unavailable/);
    expect(controlPlane.deleteSource).not.toHaveBeenCalled();
  });

  it("finalizes only after the target and switched public reader are verified", async () => {
    let remote = inventory({
      target: {
        name: "helix_products",
        entries: 1,
        replicas: [],
        primary: null,
        rules: 0,
        synonyms: 0,
        settings: {},
        settingsMatch: true,
        records: canonicalRecords,
      },
      apiKeys: { status: "unavailable", configuredPublicKeyVerified: true },
    });
    const controlPlane: CatalogSearchControlPlane = {
      inspect: vi.fn(async () => remote),
      prepareTarget: vi.fn(),
      verifyPublicRead: vi.fn(),
      deleteSource: vi.fn(async () => {
        remote = { ...remote, source: null };
      }),
    };

    const report = await runCatalogSearchMigration(
      "finalize",
      controlPlane,
      canonicalRecords,
      { consumersSwitched: true },
    );

    expect(controlPlane.deleteSource).toHaveBeenCalledOnce();
    expect(report.ok).toBe(true);
    expect(report.verified).toBe(true);
    expect(report.inventory.source).toBeNull();
  });
});
