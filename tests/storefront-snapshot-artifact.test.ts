import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { StorefrontSnapshot } from "@/test-support/storefront-baseline";
import {
  STOREFRONT_SNAPSHOT_ENV,
  loadStorefrontSnapshot,
  writeStorefrontSnapshot,
} from "@/test-support/storefront-snapshot-artifact";

const snapshot = {
  schemaVersion: 1,
  products: [],
  routineComplements: [],
  journeys: {
    coreProductId: "core-id",
    beyondCoreProductId: "beyond-id",
    purchasableProductId: "buy-id",
    richPdpProductId: "rich-id",
    searchableProductId: "search-id",
    systemNavigationProductId: "system-id",
  },
} as const satisfies StorefrontSnapshot;

afterEach(() => {
  delete process.env[STOREFRONT_SNAPSHOT_ENV];
});

describe("Storefront snapshot artifact", () => {
  it("writes one deterministic ignored-output artifact for worker processes", async () => {
    const outputDirectory = await mkdtemp(
      join(tmpdir(), "mei-pelle-storefront-snapshot-"),
    );
    try {
      const artifactPath = await writeStorefrontSnapshot(
        snapshot,
        outputDirectory,
      );

      expect(artifactPath).toBe(
        join(outputDirectory, "storefront-baseline.json"),
      );
      expect(process.env[STOREFRONT_SNAPSHOT_ENV]).toBe(artifactPath);
      const contents = await readFile(artifactPath, "utf8");
      expect(contents).toMatch(/\n$/);
      expect(contents).not.toMatch(
        /anon.?key|service.?role|supplier|raw_source|catalog_editor|audit/i,
      );
      const loaded = await loadStorefrontSnapshot(artifactPath);
      expect(loaded).toEqual(snapshot);
      expect(Object.isFrozen(loaded)).toBe(true);
      expect(Object.isFrozen(loaded.journeys)).toBe(true);
    } finally {
      await rm(outputDirectory, { recursive: true, force: true });
    }
  });
});
