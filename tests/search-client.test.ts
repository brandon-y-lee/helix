import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { verifyHostedSearchBinding } from "../lib/algolia/build-binding";
import { FORMER_PRODUCTS_INDEX } from "@/tests/helpers/former-identifiers";

const { searchForHits } = vi.hoisted(() => ({
  searchForHits: vi.fn(),
}));

vi.mock("algoliasearch/lite", () => ({
  liteClient: vi.fn(() => ({ searchForHits })),
}));

const ENV_KEYS = [
  "NEXT_PUBLIC_ALGOLIA_APP_ID",
  "NEXT_PUBLIC_ALGOLIA_SEARCH_API_KEY",
  "NEXT_PUBLIC_ALGOLIA_INDEX_NAME",
] as const;

const original = Object.fromEntries(
  ENV_KEYS.map((key) => [key, process.env[key]]),
) as Record<(typeof ENV_KEYS)[number], string | undefined>;

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
  searchForHits.mockReset();
  vi.resetModules();
});

describe("public Algolia configuration", () => {
  it("allows disabled hosted Search and rejects misbound or partial public builds", () => {
    const base = { VERCEL: "1", HELIX_PRODUCTION_ALGOLIA_APP_ID: "prod-app",
      HELIX_PRODUCTION_ALGOLIA_SEARCH_KEY_SHA256: createHash("sha256").update("public-search-only").digest("hex") };
    expect(() => verifyHostedSearchBinding(base, "production")).not.toThrow();
    expect(() => verifyHostedSearchBinding({ ...base, NEXT_PUBLIC_ALGOLIA_APP_ID: "prod-app" }, "production")).toThrow();
    const search = { ...base, NEXT_PUBLIC_ALGOLIA_APP_ID: "prod-app", NEXT_PUBLIC_ALGOLIA_SEARCH_API_KEY: "public-search-only", NEXT_PUBLIC_ALGOLIA_INDEX_NAME: "helix_products" };
    expect(() => verifyHostedSearchBinding(search, "production")).not.toThrow();
    expect(() => verifyHostedSearchBinding({ ...search, HELIX_PRODUCTION_ALGOLIA_SEARCH_KEY_SHA256: undefined }, "production")).toThrow();
    expect(() => verifyHostedSearchBinding({ ...search, NEXT_PUBLIC_ALGOLIA_SEARCH_API_KEY: "wrong-key" }, "production")).toThrow();
    expect(() => verifyHostedSearchBinding({ ...search, ALGOLIA_WRITE_API_KEY: "public-search-only" }, "production")).toThrow();
    expect(() => verifyHostedSearchBinding({ ...search, NEXT_PUBLIC_ALGOLIA_APP_ID: "dev-app" }, "production")).toThrow();
    expect(() => verifyHostedSearchBinding({ ...search, NEXT_PUBLIC_ALGOLIA_INDEX_NAME: "helix_products_dev" }, "production")).toThrow();
  });

  it("is not configured unless app, search key, and index are all present", async () => {
    process.env.NEXT_PUBLIC_ALGOLIA_APP_ID = "test-app";
    process.env.NEXT_PUBLIC_ALGOLIA_SEARCH_API_KEY = "test-key";
    delete process.env.NEXT_PUBLIC_ALGOLIA_INDEX_NAME;

    const { isSearchConfigured, searchProducts, SearchNotConfiguredError } =
      await import("@/lib/algolia/search-client");

    expect(isSearchConfigured()).toBe(false);
    await expect(searchProducts("serum")).rejects.toBeInstanceOf(
      SearchNotConfiguredError,
    );
  });

  it("reads only from the helix Product Search index", async () => {
    process.env.NEXT_PUBLIC_ALGOLIA_APP_ID = "test-app";
    process.env.NEXT_PUBLIC_ALGOLIA_SEARCH_API_KEY = "test-key";
    process.env.NEXT_PUBLIC_ALGOLIA_INDEX_NAME = "helix_products_dev";
    searchForHits.mockResolvedValueOnce({
      results: [{ hits: [], nbHits: 0 }],
    });

    const { isSearchConfigured, searchProducts } = await import(
      "@/lib/algolia/search-client"
    );

    expect(isSearchConfigured()).toBe(true);
    await expect(searchProducts("serum")).resolves.toMatchObject({
      hits: [],
      nbHits: 0,
      query: "serum",
    });
    expect(searchForHits).toHaveBeenCalledWith({
      requests: [
        { indexName: "helix_products_dev", query: "serum", hitsPerPage: 12 },
      ],
    });
  });

  it("fails closed when the public reader still names the legacy index", async () => {
    process.env.NEXT_PUBLIC_ALGOLIA_APP_ID = "test-app";
    process.env.NEXT_PUBLIC_ALGOLIA_SEARCH_API_KEY = "test-key";
    process.env.NEXT_PUBLIC_ALGOLIA_INDEX_NAME = FORMER_PRODUCTS_INDEX;

    const { isSearchConfigured, searchProducts, SearchNotConfiguredError } =
      await import("@/lib/algolia/search-client");

    expect(isSearchConfigured()).toBe(false);
    await expect(searchProducts("serum")).rejects.toBeInstanceOf(
      SearchNotConfiguredError,
    );
    expect(searchForHits).not.toHaveBeenCalled();
  });
});
