import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { verifyPublicSearchBinding } from "../lib/algolia/build-binding";
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
  it.each([
    { build: "local Next", context: {}, target: "development", app: "dev-app", index: "helix_products_dev" },
    { build: "pull request", context: { CI: "true", GITHUB_ACTIONS: "true" }, target: "development", app: "dev-app", index: "helix_products_dev" },
    { build: "Vercel Production", context: { VERCEL: "1" }, target: "production", app: "prod-app", index: "helix_products" },
  ] as const)("binds public Search settings before a $build artifact or server starts", ({
    context, target, app, index,
  }) => {
    const appBinding = `HELIX_${target.toUpperCase()}_ALGOLIA_APP_ID`;
    const keyBinding = `HELIX_${target.toUpperCase()}_ALGOLIA_SEARCH_KEY_SHA256`;
    const pins = {
      ...context,
      [appBinding]: app,
      [keyBinding]: createHash("sha256").update("public-search-only").digest("hex"),
    };
    const search = {
      ...pins,
      NEXT_PUBLIC_ALGOLIA_APP_ID: app,
      NEXT_PUBLIC_ALGOLIA_INDEX_NAME: index,
      NEXT_PUBLIC_ALGOLIA_SEARCH_API_KEY: "public-search-only",
    };
    expect(() => verifyPublicSearchBinding(pins, target)).not.toThrow();
    expect(() => verifyPublicSearchBinding(search, target)).not.toThrow();
    for (const settings of [
      { ...pins, NEXT_PUBLIC_ALGOLIA_APP_ID: app },
      { ...search, [keyBinding]: undefined },
      { ...search, [appBinding]: undefined },
      { ...search, NEXT_PUBLIC_ALGOLIA_SEARCH_API_KEY: "unchecked-key" },
      { ...search, NEXT_PUBLIC_ALGOLIA_APP_ID: target === "production" ? "dev-app" : "prod-app" },
      { ...search, NEXT_PUBLIC_ALGOLIA_INDEX_NAME: target === "production" ? "helix_products_dev" : "helix_products" },
      // Even a matching fingerprint cannot make a copied writer or admin key public.
      { ...search, ALGOLIA_WRITE_API_KEY: search.NEXT_PUBLIC_ALGOLIA_SEARCH_API_KEY },
      { ...search, HELIX_PRODUCTION_ALGOLIA_WRITE_API_KEY: search.NEXT_PUBLIC_ALGOLIA_SEARCH_API_KEY },
      { ...search, ALGOLIA_ADMIN_API_KEY: search.NEXT_PUBLIC_ALGOLIA_SEARCH_API_KEY },
    ]) {
      expect(() => verifyPublicSearchBinding(settings, target)).toThrowError(
        "Public Search settings do not match the deployment target.",
      );
    }
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
