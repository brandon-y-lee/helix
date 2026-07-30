import { describe, expect, it, vi } from "vitest";
import { loadCatalogDraftPreview } from "@/lib/catalog-editor/draft-loader";

const draftId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const backendUrl = "https://admin.meipelle.test/api/admin/catalog";

function response(version: number, status = "draft") {
  return new Response(
    JSON.stringify({
      draftId,
      status,
      version,
      lastSavedAt: "2026-07-29T18:30:00.000Z",
      editorPath: `/admin/catalog/${draftId}`,
      publishedSlug: "cleanse-01-calming-gel-cleanser",
      document: { schemaVersion: 1 },
    }),
    {
      status: 200,
      headers: { "content-type": "application/json" },
    },
  );
}

describe("protected catalog draft loader", () => {
  it("uses bearer authentication and bypasses every fetch cache", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(4));

    const result = await loadCatalogDraftPreview({
      draftId,
      accessToken: "verified-access-token",
      backendUrl,
      fetchImpl,
    });

    expect(result).toMatchObject({
      ok: true,
      record: { version: 4, status: "draft" },
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      new URL(`${backendUrl}/drafts/${draftId}`),
      expect.objectContaining({
        method: "GET",
        cache: "no-store",
        next: { revalidate: 0 },
        headers: expect.objectContaining({
          authorization: "Bearer verified-access-token",
        }),
      }),
    );
  });

  it("reads the newly saved version on each manual refresh", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response(5))
      .mockResolvedValueOnce(response(6));
    const options = {
      draftId,
      accessToken: "verified-access-token",
      backendUrl,
      fetchImpl,
    };

    const first = await loadCatalogDraftPreview(options);
    const refreshed = await loadCatalogDraftPreview(options);

    expect(first).toMatchObject({ ok: true, record: { version: 5 } });
    expect(refreshed).toMatchObject({ ok: true, record: { version: 6 } });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it.each([
    [401, "permission_revoked"],
    [403, "permission_revoked"],
    [404, "draft_not_found"],
    [409, "draft_published"],
    [410, "draft_discarded"],
    [422, "validation_error"],
    [503, "backend_unavailable"],
  ] as const)("maps HTTP %s to %s", async (status, reason) => {
    const result = await loadCatalogDraftPreview({
      draftId,
      accessToken: "verified-access-token",
      backendUrl,
      fetchImpl: vi.fn().mockResolvedValue(new Response(null, { status })),
    });

    expect(result).toEqual({ ok: false, reason });
  });

  it("fails closed when the backend contract is absent", async () => {
    await expect(
      loadCatalogDraftPreview({
        draftId,
        accessToken: "verified-access-token",
        backendUrl: "",
      }),
    ).resolves.toEqual({ ok: false, reason: "backend_unavailable" });
  });

  it.each(["published", "discarded"] as const)(
    "preserves the backend %s state",
    async (status) => {
      const result = await loadCatalogDraftPreview({
        draftId,
        accessToken: "verified-access-token",
        backendUrl,
        fetchImpl: vi.fn().mockResolvedValue(response(8, status)),
      });

      expect(result).toMatchObject({ ok: true, record: { status } });
    },
  );
});
