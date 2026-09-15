import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

describe("public Product Search source", () => {
  beforeAll(() => {
    vi.resetModules();
  });

  beforeEach(() => {
    vi.stubEnv(
      "NEXT_PUBLIC_SUPABASE_URL",
      "https://erasogmsqpgiirovubjh.supabase.co",
    );
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-public-key");
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      const requestsPrivateHistory =
        url.searchParams.get("select")?.includes("product_slug_routes");
      return new Response(
        requestsPrivateHistory
          ? JSON.stringify({ message: "permission denied for table product_slug_routes" })
          : "[]",
        {
          status: requestsPrivateHistory ? 403 : 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it.each(["all", "product", "family"] as const)(
    "reads the %s projection when slug history is private",
    async (scope) => {
      const {
        fetchAllSearchRecords,
        fetchSearchRecordById,
        fetchSearchRecordsByFamilyId,
      } = await import("@/lib/algolia/source");
      const result = scope === "all"
        ? fetchAllSearchRecords()
        : scope === "product"
          ? fetchSearchRecordById("11111111-1111-4111-8111-111111111111")
          : fetchSearchRecordsByFamilyId("22222222-2222-4222-8222-222222222222");

      await expect(result).resolves.toEqual(scope === "product" ? null : []);
    },
  );
});
