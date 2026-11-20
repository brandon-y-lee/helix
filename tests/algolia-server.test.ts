// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { syntheticMainContext } from "./helpers/supabase-target";
import { FORMER_PRODUCTS_INDEX } from "@/tests/helpers/former-identifiers";

const { algoliasearch, saveObjects } = vi.hoisted(() => ({
  algoliasearch: vi.fn(),
  saveObjects: vi.fn(),
}));

vi.mock("algoliasearch", () => ({ algoliasearch }));

const ENV_KEYS = [
  "ALGOLIA_APP_ID",
  "HELIX_DEVELOPMENT_ALGOLIA_APP_ID",
  "ALGOLIA_WRITE_API_KEY",
  "ALGOLIA_INDEX_NAME",
  "NEXT_PUBLIC_ALGOLIA_APP_ID",
  "NEXT_PUBLIC_ALGOLIA_INDEX_NAME",
] as const;

const original = Object.fromEntries(
  ENV_KEYS.map((key) => [key, process.env[key]]),
) as Record<(typeof ENV_KEYS)[number], string | undefined>;

beforeEach(() => {
  algoliasearch.mockReturnValue({ saveObjects });
  saveObjects.mockResolvedValue({ taskID: 1 });
  process.env.ALGOLIA_APP_ID = "test-app";
  process.env.HELIX_DEVELOPMENT_ALGOLIA_APP_ID = "test-app";
  process.env.ALGOLIA_WRITE_API_KEY = "test-write-key";
  process.env.NEXT_PUBLIC_ALGOLIA_APP_ID = "test-app";
  process.env.NEXT_PUBLIC_ALGOLIA_INDEX_NAME = "helix_products_dev";
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  vi.resetModules();
});

describe("server Algolia configuration", () => {
  it("fails closed when the writer still names the legacy index", async () => {
    process.env.ALGOLIA_INDEX_NAME = FORMER_PRODUCTS_INDEX;
    const { getIndexName } = await import("@/lib/algolia/server");

    expect(() => getIndexName()).toThrow(/helix_products_dev/);
    expect(algoliasearch).not.toHaveBeenCalled();
  });

  it("refuses the production index on the development runtime before contacting Algolia", async () => {
    process.env.ALGOLIA_INDEX_NAME = "helix_products";
    const { getIndexName } = await import("@/lib/algolia/server");
    expect(() => getIndexName()).toThrow();
    expect(algoliasearch).not.toHaveBeenCalled();
  });

  it("refuses correctly named indices in the wrong Algolia app", async () => {
    process.env.ALGOLIA_INDEX_NAME = "helix_products_dev";
    process.env.HELIX_DEVELOPMENT_ALGOLIA_APP_ID = "different-app";
    const { getIndexName } = await import("@/lib/algolia/server");
    expect(() => getIndexName()).toThrow(/application/);
    expect(algoliasearch).not.toHaveBeenCalled();
  });

  it("permits the production index only on the production target", async () => {
    for (const [key, value] of Object.entries(syntheticMainContext)) vi.stubEnv(key, value);
    vi.stubEnv("NEXT_PUBLIC_HELIX_SUPABASE_TARGET", "production");
    vi.stubEnv("HELIX_PRODUCTION_ALGOLIA_APP_ID", "test-app");
    vi.stubEnv("NEXT_PUBLIC_ALGOLIA_INDEX_NAME", "helix_products");
    vi.stubEnv("ALGOLIA_INDEX_NAME", "helix_products");
    const { getIndexName } = await import("@/lib/algolia/server");
    expect(getIndexName()).toBe("helix_products");
    vi.stubEnv("ALGOLIA_INDEX_NAME", "helix_products_dev");
    expect(() => getIndexName()).toThrow();
  });

  it("writes to helix_products_dev with bounded provider retries", async () => {
    process.env.ALGOLIA_INDEX_NAME = "helix_products_dev";
    const { upsertSearchRecord } = await import("@/lib/algolia/server");
    const record = { objectID: "product-1" };

    await upsertSearchRecord(record as never);

    expect(saveObjects).toHaveBeenCalledWith({
      indexName: "helix_products_dev",
      objects: [record],
      waitForTasks: true,
      maxRetries: 20,
    });
  });
});
