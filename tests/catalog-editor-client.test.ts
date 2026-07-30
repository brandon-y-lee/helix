import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CatalogVersionConflictError,
  catalogEditorApi,
} from "@/lib/admin/catalog-editor/client";
import {
  catalogDocument,
  catalogDraft,
  catalogProduct,
} from "./fixtures/catalog-editor";

function response(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn(async () => data),
  } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("catalogEditorApi", () => {
  it("requests the narrow sorted grid and normalizes backend summaries", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      response({
        items: [
          catalogProduct,
        ],
        nextCursor: "next",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await catalogEditorApi.listProducts({
      search: "cleanse",
      publication: "active",
      routine: "core",
      draft: "draft",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/catalog/products?query=cleanse&catalogStatus=active&routineGroup=core&draftStatus=draft&sort=name_asc",
      expect.objectContaining({ credentials: "same-origin", cache: "no-store" }),
    );
    expect(result.items[0]).toMatchObject({
      displayName: "CLEANSE",
      activeDraft: { status: "draft" },
      variantCount: 1,
    });
  });

  it("uses the canonical backend editor contract without a compatibility document", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        response({
          canonical: catalogDocument,
          draft: null,
          latestRevision: 3,
          permissions: { "catalog.edit": true, "catalog.publish": true },
        }),
      ),
    );

    const result = await catalogEditorApi.getEditor("product-cleanse");
    expect(result.canonical.product.name).toBe("Supplier Cleanser");
    expect(result.canonical.variants[0].price_cents).toBe(2200);
    expect(result.permissions["catalog.publish"]).toBe(true);
  });

  it("sends expectedVersion and the backend wire document without UI-only fields", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      response({
        draft: {
          ...catalogDraft,
          version: 5,
          document: catalogDocument,
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await catalogEditorApi.saveDraft("draft-cleanse", 4, catalogDocument);
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(String(request.body));
    expect(body.expectedVersion).toBe(4);
    expect(body.document.product.display_name).toBe("CLEANSE");
    expect(body.document.product.name).toBe("Supplier Cleanser");
    expect(body.document.variants[0].price_cents).toBe(2200);
  });

  it("preserves conflict details and supplies explicit upload metadata", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response(
          {
            error: {
              code: "version_conflict",
              message: "The catalog operation could not be completed.",
              details: {
                stored: {
                  version: 9,
                  status: "draft",
                  updatedAt: "2026-07-22T12:00:00.000Z",
                  updatedBy: "123e4567-e89b-42d3-a456-426614174005",
                },
              },
            },
          },
          409,
        ),
      )
      .mockResolvedValueOnce(response({ media: catalogDocument.media[0] }, 201));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      catalogEditorApi.saveDraft("draft-cleanse", 4, catalogDocument),
    ).rejects.toMatchObject({
      name: "CatalogVersionConflictError",
      latestDraft: { version: 9, status: "draft" },
    });
    const file = new File(["image"], "asset.webp", { type: "image/webp" });
    await catalogEditorApi.uploadMedia(file, "product-cleanse", {
      role: "gallery",
      alt: "CLEANSE application",
      sortOrder: 2,
    });
    const upload = fetchMock.mock.calls[1][1] as RequestInit;
    expect(upload.body).toBeInstanceOf(FormData);
    expect((upload.body as FormData).get("role")).toBe("gallery");
    expect((upload.body as FormData).get("alt")).toBe("CLEANSE application");
    expect((upload.body as FormData).get("sortOrder")).toBe("2");
  });
});
