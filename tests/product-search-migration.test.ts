import { describe, expect, it, vi } from "vitest";
import {
  assessProductSearchMigration,
  runProductSearchMigration,
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
    source: {
      name: "mei_pelle_products",
      entries: 1,
      replicas: [],
      primary: null,
      rules: [],
      synonyms: [],
      settings: {},
      settingsMatch: true,
      records: canonicalRecords,
    },
    target: null,
    querySuggestions: [],
    recommendDependencies: [],
    providerChecks: {
      querySuggestions: "verified",
      recommend: "verified",
    },
    apiKeys: {
      status: "configured-keys-verified",
      configuredPublicKeyVerified: false,
      configuredWriteKeyVerified: true,
    },
    analytics: {
      implication:
        "Index analytics remain attached to their original index names.",
    },
    ...overrides,
  };
}

describe("Product Search migration assessment", () => {
  it("plans a canonical target without treating the temporary source as complete", () => {
    const report = assessProductSearchMigration(
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
    const report = assessProductSearchMigration(
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

  it("fails closed when provider dependency inventory is unavailable", () => {
    const report = assessProductSearchMigration(
      "apply",
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

    expect(report.ok).toBe(false);
    expect(report.blockers).toEqual([
      "Query Suggestions inventory is unavailable",
      "Recommend inventory is unavailable",
      "configured Algolia keys could not be verified",
    ]);
  });

  it("rejects equal counts when records, rules, or synonyms differ", () => {
    const report = assessProductSearchMigration(
      "verify",
      inventory({
        source: {
          ...inventory().source!,
          rules: [{ objectID: "rule-1", consequence: { promote: [] } }],
          synonyms: [{ objectID: "synonym-1", synonyms: ["serum", "ampoule"] }],
        },
        target: {
          name: "helix_products",
          entries: 1,
          replicas: [],
          primary: null,
          rules: [{ objectID: "rule-1", consequence: { hide: [] } }],
          synonyms: [{ objectID: "synonym-1", synonyms: ["serum", "essence"] }],
          settings: {},
          settingsMatch: true,
          records: [{ ...canonicalRecords[0], staleLegacyField: true }],
        },
        apiKeys: {
          status: "configured-keys-verified",
          configuredPublicKeyVerified: true,
          configuredWriteKeyVerified: true,
        },
      }),
      canonicalRecords,
    );

    expect(report.ok).toBe(false);
    expect(report.reconciliation.targetMatchesCanonical).toBe(false);
  });
});

describe("Product Search migration lifecycle", () => {
  it("prepares, reconciles, and publicly verifies the target without deleting the source", async () => {
    let remote = inventory();
    const controlPlane: ProductSearchControlPlane = {
      inspect: vi.fn(async () => remote),
      prepareTarget: vi.fn(async (records) => {
        remote = inventory({
          target: {
            name: "helix_products",
            entries: records.length,
            replicas: [],
            primary: null,
            rules: [],
            synonyms: [],
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

    const report = await runProductSearchMigration(
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
    const controlPlane: ProductSearchControlPlane = {
      inspect: vi.fn(async () => inventory()),
      prepareTarget: vi.fn(async () => {
        throw new Error("Algolia unavailable");
      }),
      verifyPublicRead: vi.fn(),
      deleteSource: vi.fn(),
    };

    await expect(
      runProductSearchMigration("apply", controlPlane, canonicalRecords),
    ).rejects.toThrow(/Algolia unavailable/);
    expect(controlPlane.deleteSource).not.toHaveBeenCalled();
  });

  it("recovers from a transient provider failure with bounded retries", async () => {
    let remote = inventory();
    const prepareTarget = vi
      .fn()
      .mockRejectedValueOnce(new Error("Algolia temporarily unavailable"))
      .mockImplementationOnce(async (records: typeof canonicalRecords) => {
        remote = inventory({
          target: {
            name: "helix_products",
            entries: records.length,
            replicas: [],
            primary: null,
            rules: [],
            synonyms: [],
            settings: {},
            settingsMatch: true,
            records,
          },
        });
      });
    const controlPlane: ProductSearchControlPlane = {
      inspect: vi.fn(async () => remote),
      prepareTarget,
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

    await expect(
      runProductSearchMigration("apply", controlPlane, canonicalRecords),
    ).resolves.toMatchObject({ ok: true, verified: true });
    expect(prepareTarget).toHaveBeenCalledTimes(2);
  });

  it("finalizes only after the target and switched public reader are verified", async () => {
    let remote = inventory({
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
      apiKeys: {
        status: "configured-keys-verified",
        configuredPublicKeyVerified: true,
        configuredWriteKeyVerified: true,
      },
    });
    const controlPlane: ProductSearchControlPlane = {
      inspect: vi.fn(async () => remote),
      prepareTarget: vi.fn(),
      verifyPublicRead: vi.fn(),
      deleteSource: vi.fn(async () => {
        remote = { ...remote, source: null };
      }),
    };

    const report = await runProductSearchMigration(
      "finalize",
      controlPlane,
      canonicalRecords,
      {
        consumerVerification: {
          publicReadIndex: "helix_products",
          serverWriteIndex: "helix_products",
          webhookDeliveryVerified: true,
        },
      },
    );

    expect(controlPlane.deleteSource).toHaveBeenCalledOnce();
    expect(report.ok).toBe(true);
    expect(report.verified).toBe(true);
    expect(report.inventory.source).toBeNull();
  });

  it("refuses finalization without deployed reader, writer, and webhook evidence", async () => {
    const remote = inventory({
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
      apiKeys: {
        status: "configured-keys-verified",
        configuredPublicKeyVerified: true,
        configuredWriteKeyVerified: true,
      },
    });
    const controlPlane: ProductSearchControlPlane = {
      inspect: vi.fn(async () => remote),
      prepareTarget: vi.fn(),
      verifyPublicRead: vi.fn(),
      deleteSource: vi.fn(),
    };

    await expect(
      runProductSearchMigration(
        "finalize",
        controlPlane,
        canonicalRecords,
      ),
    ).rejects.toThrow(/deployed consumer verification/);
    expect(controlPlane.deleteSource).not.toHaveBeenCalled();
  });
});
