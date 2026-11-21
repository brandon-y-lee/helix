// @vitest-environment node
import { createHash } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { liteClient } from "algoliasearch/lite";
import { GET } from "@/app/api/internal/release-status/route";
import { POST as reindex } from "@/app/api/admin/search-reindex/route";
import { upsertSearchRecord } from "@/lib/algolia/server";
import { supabaseOriginForTarget, SUPABASE_PROJECT_REFS } from "@/lib/supabase/project-safety";
import { syntheticMainContext, syntheticSupabaseKey } from "./helpers/supabase-target";

const { searchForHits, saveObjects } = vi.hoisted(() => ({ searchForHits: vi.fn(), saveObjects: vi.fn() }));
vi.mock("algoliasearch/lite", () => ({ liteClient: vi.fn(() => ({ searchForHits })) }));
vi.mock("algoliasearch", () => ({ algoliasearch: vi.fn(() => ({ saveObjects })) }));
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const origin = supabaseOriginForTarget("production");
const token = "r".repeat(40);
const publicKey = "synthetic-public-reader";
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const status = () => GET(new Request("https://www.helixskin.us/api/internal/release-status?product=super-serum",
  { headers: { Authorization: "Bearer " + token } }));
const requestReindex = (signer: string) => reindex(new Request("https://www.helixskin.us/api/admin/search-reindex", {
  method: "POST", headers: { "x-webhook-secret": signer },
}));
beforeEach(() => {
  for (const [name, value] of Object.entries({
    ...syntheticMainContext,
    VERCEL_DEPLOYMENT_ID: "dpl_search", VERCEL_GIT_COMMIT_SHA: "a".repeat(40),
    NEXT_PUBLIC_HELIX_SUPABASE_TARGET: "production", NEXT_PUBLIC_SITE_URL: "https://www.helixskin.us",
    NEXT_PUBLIC_SUPABASE_URL: origin, NEXT_PUBLIC_SUPABASE_ANON_KEY: syntheticSupabaseKey("production", "anon"),
    SUPABASE_SERVICE_ROLE_KEY: syntheticSupabaseKey("production", "service_role"),
    HELIX_RELEASE_STATUS_TOKEN: token,
    NEXT_PUBLIC_ALGOLIA_APP_ID: "test-app", ALGOLIA_APP_ID: "test-app", HELIX_PRODUCTION_ALGOLIA_APP_ID: "test-app",
    NEXT_PUBLIC_ALGOLIA_INDEX_NAME: "helix_products", ALGOLIA_INDEX_NAME: "helix_products",
    NEXT_PUBLIC_ALGOLIA_SEARCH_API_KEY: publicKey, HELIX_PRODUCTION_ALGOLIA_SEARCH_KEY_SHA256: digest(publicKey),
    ALGOLIA_WRITE_API_KEY: "retained-legacy-writer", ALGOLIA_ADMIN_API_KEY: "retained-operator-key",
    SUPABASE_CATALOG_WEBHOOK_SECRET: "retained-legacy-signer",
    HELIX_PRODUCTION_ALGOLIA_WRITE_API_KEY: undefined, HELIX_PRODUCTION_CATALOG_WEBHOOK_SECRET: undefined,
  })) vi.stubEnv(name, value);
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url === origin + "/rest/v1/rpc/read_helix_release_authorization") return Response.json(true);
    if (url === origin + "/rest/v1/rpc/read_helix_release_observations") {
      return Response.json({ environment: "production", projectRef: SUPABASE_PROJECT_REFS.production, catalogSchema: true });
    }
    throw new Error("Unexpected provider request");
  }));
  searchForHits.mockResolvedValue({ results: [{ hits: [{ slug: "super-serum" }], nbHits: 1 }] });
});

it("reports successful storefront reads and only the effective production writer and signer", async () => {
  const readOnly = await status();
  expect(readOnly.status).toBe(200);
  expect(await readOnly.json()).toMatchObject({
    features: { searchRead: true, searchWrite: false },
    searchCredentials: { writeKeySha256: null, webhookSecretSha256: null },
  });
  expect(liteClient).toHaveBeenCalledWith("test-app", publicKey);
  expect(searchForHits).toHaveBeenCalledWith({
    requests: [{ indexName: "helix_products", query: "super serum", hitsPerPage: 5 }],
  });

  vi.stubEnv("HELIX_PRODUCTION_ALGOLIA_WRITE_API_KEY", "dedicated-writer");
  expect((await status()).status).toBe(503);
  vi.stubEnv("HELIX_PRODUCTION_CATALOG_WEBHOOK_SECRET", "production-signer");
  const enabled = await status();
  expect(enabled.status).toBe(200);
  expect(await enabled.json()).toMatchObject({
    features: { searchRead: true, searchWrite: true },
    searchCredentials: { writeKeySha256: digest("dedicated-writer"), webhookSecretSha256: digest("production-signer") },
  });
});

it("refuses an authenticated production reindex before reading the Catalog when only legacy writer material exists", async () => {
  vi.stubEnv("ALLOW_PRODUCTION_SEARCH_REINDEX", "true");
  expect((await requestReindex("retained-legacy-signer")).status).toBe(401);

  vi.stubEnv("HELIX_PRODUCTION_CATALOG_WEBHOOK_SECRET", "production-signer");
  vi.spyOn(console, "error").mockImplementation(() => {});
  const response = await requestReindex("production-signer");
  expect(response.status).toBe(502);
  expect(await response.json()).toMatchObject({
    error: "reindex failed", message: expect.stringContaining("HELIX_PRODUCTION_ALGOLIA_WRITE_API_KEY"),
    report: { read: 0, upserted: 0, failed: 1 },
  });
  expect(fetch).not.toHaveBeenCalled();
});

it.each([
  { writer: "retained-legacy-writer", signer: "dedicated-signer", reindexStatus: 502 },
  { writer: "retained-operator-key", signer: "dedicated-signer", reindexStatus: 502 },
  { writer: "dedicated-writer", signer: "retained-legacy-signer", reindexStatus: 401 },
  { writer: "dedicated-writer", signer: "development-signer", reindexStatus: 401 },
])("rejects a copied production credential at each serving boundary ($writer / $signer)", async ({ writer, signer, reindexStatus }) => {
  vi.stubEnv("HELIX_PRODUCTION_ALGOLIA_WRITE_API_KEY", writer);
  vi.stubEnv("HELIX_PRODUCTION_CATALOG_WEBHOOK_SECRET", signer);
  vi.stubEnv("HELIX_DEV_CATALOG_WEBHOOK_SECRET", "development-signer");
  vi.stubEnv("ALLOW_PRODUCTION_SEARCH_REINDEX", "true");
  vi.spyOn(console, "error").mockImplementation(() => {});
  await expect(upsertSearchRecord({ objectID: "synthetic-product" } as never)).rejects.toThrow(/writer|signer/i);
  expect((await requestReindex(signer)).status).toBe(reindexStatus);
  expect(fetch).not.toHaveBeenCalled();
  expect((await status()).status).toBe(503);
  expect(fetch).toHaveBeenCalledTimes(1); // Release authorization only.
  expect(saveObjects).not.toHaveBeenCalled();
});
