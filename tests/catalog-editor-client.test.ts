import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CatalogVersionConflictError,
  catalogEditorApi,
} from "@/lib/admin/catalog-editor/client";
import { catalogDocument } from "./fixtures/catalog-editor";

function response(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn(async () => data),
  } as unknown as Response;
}

function wireDocument() {
  const { source_fields: _sourceFields, ...product } = catalogDocument.products;
  return {
    schemaVersion: catalogDocument.schemaVersion,
    productId: catalogDocument.productId,
    product: {
      ...product,
      name: catalogDocument.products.source_fields?.name,
      tagline: catalogDocument.products.source_fields?.tagline,
      description: catalogDocument.products.source_fields?.description,
      how_to_use: catalogDocument.products.source_fields?.how_to_use,
    },
    productPdpContent: catalogDocument.product_pdp_content,
    variants: catalogDocument.product_variants,
    media: catalogDocument.product_media,
    relationships: catalogDocument.product_relationships,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("catalogEditorApi", () => {
  it("requests the narrow sorted grid and normalizes backend summaries", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      response({
        items: [
          {
            id: "product-cleanse",
            slug: "cleanse",
            displayName: "CLEANSE",
            catalogStatus: "active",
            productStatus: "available",
            routineGroup: "core",
            updatedAt: "2026-07-20T12:00:00.000Z",
            activeDraft: {
              status: "draft",
              updatedAt: "2026-07-21T12:00:00.000Z",
            },
          },
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
    expect(result.products[0]).toMatchObject({
      display_name: "CLEANSE",
      draft_status: "draft",
      variant_count: null,
    });
  });

  it("adapts the editor document while marking supplier fields read only", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        response({
          canonical: wireDocument(),
          draft: null,
          latestRevision: 3,
          permissions: { "catalog.edit": true, "catalog.publish": true },
        }),
      ),
    );

    const result = await catalogEditorApi.getEditor("product-cleanse");
    expect(result.product.products.source_fields).toMatchObject({
      name: "Supplier Cleanser",
      description: "Supplier description",
    });
    expect(result.product.product_variants[0].price_cents).toBe(2200);
    expect(result.permissions.publish).toBe(true);
  });

  it("sends expectedVersion and the backend wire document without UI-only fields", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      response({
        draft: {
          id: "draft-cleanse",
          product_id: "product-cleanse",
          status: "draft",
          base_revision: 3,
          version: 5,
          updated_at: "2026-07-21T12:00:00.000Z",
          document: wireDocument(),
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await catalogEditorApi.saveDraft("draft-cleanse", 4, catalogDocument);
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(String(request.body));
    expect(body.expectedVersion).toBe(4);
    expect(body.document.product.display_name).toBe("CLEANSE");
    expect(body.document.product.source_fields).toBeUndefined();
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
              details: { stored: { version: 9 } },
            },
          },
          409,
        ),
      )
      .mockResolvedValueOnce(response({ media: catalogDocument.product_media[0] }, 201));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      catalogEditorApi.saveDraft("draft-cleanse", 4, catalogDocument),
    ).rejects.toBeInstanceOf(CatalogVersionConflictError);
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
