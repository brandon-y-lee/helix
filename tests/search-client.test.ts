import { afterEach, describe, expect, it, vi } from "vitest";

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
    process.env.NEXT_PUBLIC_ALGOLIA_INDEX_NAME = "helix_products";
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
        { indexName: "helix_products", query: "serum", hitsPerPage: 12 },
      ],
    });
  });

  it("fails closed when the public reader still names the legacy index", async () => {
    process.env.NEXT_PUBLIC_ALGOLIA_APP_ID = "test-app";
    process.env.NEXT_PUBLIC_ALGOLIA_SEARCH_API_KEY = "test-key";
    process.env.NEXT_PUBLIC_ALGOLIA_INDEX_NAME = "mei_pelle_products";

    const { isSearchConfigured, searchProducts, SearchNotConfiguredError } =
      await import("@/lib/algolia/search-client");

    expect(isSearchConfigured()).toBe(false);
    await expect(searchProducts("serum")).rejects.toBeInstanceOf(
      SearchNotConfiguredError,
    );
    expect(searchForHits).not.toHaveBeenCalled();
  });
});
