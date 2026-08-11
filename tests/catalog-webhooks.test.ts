import { describe, expect, it, vi } from "vitest";
import {
  buildCatalogWebhookApplySql,
  buildCatalogWebhookReport,
  buildDesiredCatalogWebhooks,
  CATALOG_WEBHOOK_EVENTS,
  CATALOG_WEBHOOK_TABLES,
  catalogWebhookTriggerName,
  loadCatalogWebhookConfig,
  runCatalogWebhookProvisioning,
  runCatalogWebhookSmoke,
  SupabaseCatalogWebhookControlPlane,
  type CatalogWebhookConfig,
  type CatalogWebhookControlPlane,
  type CatalogWebhookRemoteState,
  type ObservedCatalogWebhook,
} from "@/scripts/catalog/catalog-webhooks";

const SECRET = "catalog-webhook-secret-that-is-long-enough";
const ENDPOINT =
  "https://preview.mei-pelle.example/api/webhooks/supabase/catalog-search-sync";
const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";

const config: CatalogWebhookConfig = {
  projectRef: "erasogmsqpgiirovubjh",
  targetEnvironment: "preview",
  endpoint: ENDPOINT,
  secret: SECRET,
  accessToken: "test-management-token",
};

function observed(
  tableName: (typeof CATALOG_WEBHOOK_TABLES)[number],
  overrides: Partial<ObservedCatalogWebhook> = {},
): ObservedCatalogWebhook {
  return {
    tableName,
    triggerName: catalogWebhookTriggerName(tableName),
    enabled: true,
    rowLevel: true,
    after: true,
    firesInsert: true,
    firesUpdate: true,
    firesDelete: true,
    firesTruncate: false,
    endpointMatches: true,
    methodMatches: true,
    headersMatch: true,
    paramsMatch: true,
    timeoutMatches: true,
    ...overrides,
  };
}

function state(
  overrides: Partial<CatalogWebhookRemoteState> = {},
): CatalogWebhookRemoteState {
  return {
    pgNetEnabled: true,
    httpRequestAvailable: true,
    missingTables: [],
    hooks: CATALOG_WEBHOOK_TABLES.map((table) => observed(table)),
    ...overrides,
  };
}

describe("catalog webhook desired state", () => {
  it("contains the seven canonical tables with deterministic event coverage", () => {
    const first = buildDesiredCatalogWebhooks(ENDPOINT, SECRET);
    const second = buildDesiredCatalogWebhooks(ENDPOINT, SECRET);

    expect(first).toEqual(second);
    expect(first.map((webhook) => webhook.table)).toEqual([
      "products",
      "product_variants",
      "product_media",
      "product_pdp_content",
      "product_slug_routes",
      "product_families",
      "product_family_memberships",
    ]);
    expect(first).toHaveLength(7);
    expect(first.every((webhook) => webhook.events === CATALOG_WEBHOOK_EVENTS)).toBe(
      true,
    );
    expect(first.map((webhook) => webhook.name)).toEqual([
      "mei_pelle_catalog_search_sync_products",
      "mei_pelle_catalog_search_sync_product_variants",
      "mei_pelle_catalog_search_sync_product_media",
      "mei_pelle_catalog_search_sync_product_pdp_content",
      "mei_pelle_catalog_search_sync_product_slug_routes",
      "mei_pelle_catalog_search_sync_product_families",
      "mei_pelle_catalog_search_sync_product_family_memberships",
    ]);
  });

  it("fails closed for unknown or production projects and missing configuration", () => {
    const base: NodeJS.ProcessEnv = {
      NODE_ENV: "test",
      SUPABASE_PROJECT_REF: "erasogmsqpgiirovubjh",
      CATALOG_WEBHOOK_TARGET_ENVIRONMENT: "preview",
      SUPABASE_CATALOG_WEBHOOK_URL: ENDPOINT,
      SUPABASE_CATALOG_WEBHOOK_SECRET: SECRET,
      SUPABASE_ACCESS_TOKEN: "test-management-token",
    };

    expect(() =>
      loadCatalogWebhookConfig({
        ...base,
        SUPABASE_PROJECT_REF: "unknown-project",
      }),
    ).toThrow(/Refusing Supabase project/);
    expect(() =>
      loadCatalogWebhookConfig({
        ...base,
        CATALOG_WEBHOOK_TARGET_ENVIRONMENT: "production",
      }),
    ).toThrow(/Refusing production/);
    expect(() =>
      loadCatalogWebhookConfig({
        ...base,
        SUPABASE_CATALOG_WEBHOOK_URL: "",
      }),
    ).toThrow(/SUPABASE_CATALOG_WEBHOOK_URL/);
    expect(() =>
      loadCatalogWebhookConfig({
        ...base,
        SUPABASE_CATALOG_WEBHOOK_SECRET: "",
      }),
    ).toThrow(/SUPABASE_CATALOG_WEBHOOK_SECRET/);
  });

  it("detects missing, mismatched, and duplicate webhook definitions", () => {
    const missing = buildCatalogWebhookReport(
      "verify",
      config,
      state({ hooks: [] }),
    );
    expect(missing.ok).toBe(false);
    expect(missing.actions.every((action) => action.action === "create")).toBe(
      true,
    );

    const mismatched = buildCatalogWebhookReport(
      "verify",
      config,
      state({
        hooks: CATALOG_WEBHOOK_TABLES.map((table) =>
          observed(table, table === "product_media" ? { headersMatch: false } : {}),
        ),
      }),
    );
    expect(mismatched.ok).toBe(false);
    expect(mismatched.actions).toContainEqual({
      action: "update",
      table: "product_media",
      name: "mei_pelle_catalog_search_sync_product_media",
    });

    const duplicate = buildCatalogWebhookReport(
      "plan",
      config,
      state({
        hooks: [
          ...CATALOG_WEBHOOK_TABLES.map((table) => observed(table)),
          observed("products", { triggerName: "unmanaged_products_webhook" }),
        ],
      }),
    );
    expect(duplicate.ok).toBe(false);
    expect(duplicate.duplicates).toEqual([
      {
        table: "products",
        triggerNames: [
          "mei_pelle_catalog_search_sync_products",
          "unmanaged_products_webhook",
        ],
      },
    ]);
  });

  it("keeps secrets out of deterministic plan and verification reports", () => {
    const report = buildCatalogWebhookReport("plan", config, state({ hooks: [] }));
    const output = JSON.stringify(report);

    expect(output).not.toContain(SECRET);
    expect(output).toContain("x-webhook-secret");
    expect(report).toEqual(buildCatalogWebhookReport("plan", config, state({ hooks: [] })));
  });
});

describe("catalog webhook apply", () => {
  it("is idempotent when all four managed hooks already match", async () => {
    const matchingRow = {
      pgNetEnabled: true,
      httpRequestAvailable: true,
      missingTables: [],
      hooks: CATALOG_WEBHOOK_TABLES.map((table) => observed(table)),
    };
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) =>
      new Response(JSON.stringify([matchingRow]), {
        status: 201,
        headers: { "content-type": "application/json" },
      }),
    );
    const controlPlane = new SupabaseCatalogWebhookControlPlane(fetchMock);

    const report = await runCatalogWebhookProvisioning(
      "apply",
      config,
      controlPlane,
    );

    expect(report.ok).toBe(true);
    expect(report.verified).toBe(true);
    expect(report.actions.every((action) => action.action === "unchanged")).toBe(
      true,
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      fetchMock.mock.calls.every(([url]) =>
        String(url).endsWith("/database/query/read-only"),
      ),
    ).toBe(true);
  });

  it("enables the provider feature, applies one transaction, and verifies", async () => {
    let remoteState = state({
      pgNetEnabled: false,
      httpRequestAvailable: false,
      hooks: [],
    });
    let enableCalls = 0;
    let applyCalls = 0;
    const fake: CatalogWebhookControlPlane = {
      inspect: vi.fn(async () => remoteState),
      enableDatabaseWebhooks: vi.fn(async () => {
        enableCalls += 1;
        remoteState = state({ hooks: [] });
      }),
      applyChanges: vi.fn(async (_config, desired, actions) => {
        applyCalls += 1;
        const sql = buildCatalogWebhookApplySql(desired, actions);
        expect(sql.startsWith("begin;")).toBe(true);
        expect(sql.endsWith("commit;")).toBe(true);
        remoteState = state();
      }),
    };

    const report = await runCatalogWebhookProvisioning("apply", config, fake);

    expect(report.ok).toBe(true);
    expect(report.verified).toBe(true);
    expect(enableCalls).toBe(1);
    expect(applyCalls).toBe(1);
  });

  it("updates only mismatched managed hooks", () => {
    const desired = buildDesiredCatalogWebhooks(ENDPOINT, SECRET);
    const actions = buildCatalogWebhookReport(
      "plan",
      config,
      state({
        hooks: CATALOG_WEBHOOK_TABLES.map((table) =>
          observed(table, table === "product_media" ? { timeoutMatches: false } : {}),
        ),
      }),
    ).actions;
    const sql = buildCatalogWebhookApplySql(desired, actions);

    expect(sql).toContain(
      'drop trigger if exists "mei_pelle_catalog_search_sync_product_media"',
    );
    expect(sql).toContain(
      'create trigger "mei_pelle_catalog_search_sync_product_media"',
    );
    expect(sql).not.toContain(
      'create trigger "mei_pelle_catalog_search_sync_products"',
    );
  });

  it("fails when final verification detects partial state", async () => {
    let remoteState = state({ hooks: [] });
    const fake: CatalogWebhookControlPlane = {
      inspect: vi.fn(async () => remoteState),
      enableDatabaseWebhooks: vi.fn(),
      applyChanges: vi.fn(async () => {
        remoteState = state({
          hooks: CATALOG_WEBHOOK_TABLES.map((table) =>
            observed(table, table === "products" ? { headersMatch: false } : {}),
          ),
        });
      }),
    };

    await expect(
      runCatalogWebhookProvisioning("apply", config, fake),
    ).rejects.toThrow(/Partial failure.*final verification detected drift/);
  });

  it("does not surface provider response bodies that may echo a secret", async () => {
    const fetchMock = vi.fn(async () => new Response(SECRET, { status: 500 }));
    const controlPlane = new SupabaseCatalogWebhookControlPlane(fetchMock);

    await expect(controlPlane.inspect(config)).rejects.toThrow(
      "Supabase Management API request failed (500)",
    );
    await expect(controlPlane.inspect(config)).rejects.not.toThrow(SECRET);
  });
});

describe("catalog webhook smoke verification", () => {
  const smokeConfig = {
    projectRef: config.projectRef,
    targetEnvironment: config.targetEnvironment,
    endpoint: config.endpoint,
    secret: config.secret,
    productId: PRODUCT_ID,
  } as const;

  it("verifies auth, child identity, Algolia, cache, and duplicate delivery", async () => {
    const successfulBody = {
      ok: true,
      action: "upsert",
      table: "product_variants",
      objectID: PRODUCT_ID,
      cache: {
        tags: ["catalog-product-offer:treat-03-pdrn-5-ampoule"],
        paths: ["/products/treat-03-pdrn-5-ampoule"],
      },
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('{"error":"unauthorized"}', { status: 401 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(successfulBody), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(successfulBody), { status: 200 }),
      );

    const report = await runCatalogWebhookSmoke(smokeConfig, fetchMock);

    expect(report).toMatchObject({
      ok: true,
      authenticationVerified: true,
      childProductResolutionVerified: true,
      algoliaAttemptVerified: true,
      cacheInvalidationAttemptVerified: true,
      duplicateDeliveryVerified: true,
    });
    expect(JSON.stringify(report)).not.toContain(SECRET);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("reports Algolia and partial-success failures distinctly", async () => {
    const algoliaFailure = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 401 }))
      .mockResolvedValueOnce(
        new Response('{"error":"sync failed"}', { status: 502 }),
      );
    await expect(
      runCatalogWebhookSmoke(smokeConfig, algoliaFailure),
    ).rejects.toThrow(/Algolia failure/);

    const successfulBody = {
      ok: true,
      action: "upsert",
      table: "product_variants",
      objectID: PRODUCT_ID,
      cache: { tags: ["tag"], paths: ["/products/example"] },
    };
    const partialFailure = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 401 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(successfulBody), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response("{}", { status: 502 }));
    await expect(
      runCatalogWebhookSmoke(smokeConfig, partialFailure),
    ).rejects.toThrow(/Partial success/);
  });
});
