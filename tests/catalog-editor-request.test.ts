import { describe, expect, it } from "vitest";
import {
  assertSameOrigin,
  readCatalogJson,
  requireExpectedVersion,
} from "@/lib/admin/catalog/request";
import {
  decodeCatalogGridCursor,
  encodeCatalogGridCursor,
  parseCatalogGridLimit,
  parseCatalogGridSort,
} from "@/lib/admin/catalog/pagination";

describe("catalog editor request boundary", () => {
  it("requires exact same-origin mutations", () => {
    expect(() =>
      assertSameOrigin(
        new Request("https://mei-pelle.test/api/admin/catalog/drafts/1", {
          method: "PATCH",
          headers: { origin: "https://mei-pelle.test" },
        }),
      ),
    ).not.toThrow();
    expect(() =>
      assertSameOrigin(
        new Request("https://mei-pelle.test/api/admin/catalog/drafts/1", {
          method: "PATCH",
          headers: { origin: "https://attacker.test" },
        }),
      ),
    ).toThrowError(expect.objectContaining({ code: "same_origin_required" }));
  });

  it("bounds and parses JSON bodies without accepting stale versions", async () => {
    const request = new Request(
      "https://mei-pelle.test/api/admin/catalog/drafts/1",
      {
        method: "PATCH",
        body: JSON.stringify({ expectedVersion: 2 }),
      },
    );
    await expect(readCatalogJson(request)).resolves.toEqual({
      expectedVersion: 2,
    });
    expect(requireExpectedVersion(2)).toBe(2);
    expect(() => requireExpectedVersion(0)).toThrowError(
      expect.objectContaining({ code: "invalid_version" }),
    );
  });
});

describe("catalog grid pagination", () => {
  it("round-trips opaque cursors and rejects malformed values", () => {
    const cursor = encodeCatalogGridCursor({ offset: 25 });
    expect(decodeCatalogGridCursor(cursor)).toEqual({ offset: 25 });
    expect(() => decodeCatalogGridCursor("not-a-cursor")).toThrowError(
      expect.objectContaining({ code: "invalid_cursor" }),
    );
  });

  it("bounds page size and sort values", () => {
    expect(parseCatalogGridLimit(null)).toBe(25);
    expect(parseCatalogGridLimit("100")).toBe(100);
    expect(() => parseCatalogGridLimit("101")).toThrow();
    expect(parseCatalogGridSort("routine_asc")).toBe("routine_asc");
    expect(() => parseCatalogGridSort("price_desc")).toThrow();
  });
});
