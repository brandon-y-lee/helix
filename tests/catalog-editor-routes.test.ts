import { beforeEach, describe, expect, it, vi } from "vitest";
import { CatalogAdminError } from "@/lib/admin/catalog/errors";
import { requireAdminCapability } from "@/lib/admin/capabilities";
import { stageCatalogMedia } from "@/lib/admin/catalog/media";
import { publishCatalogDraft } from "@/lib/admin/catalog/service";
import { POST as uploadMedia } from "@/app/api/admin/catalog/media/upload/route";
import { POST as publishDraft } from "@/app/api/admin/catalog/drafts/[draftId]/publish/route";

vi.mock("@/lib/admin/capabilities", () => ({
  requireAdminCapability: vi.fn(),
}));
vi.mock("@/lib/admin/catalog/media", () => ({
  stageCatalogMedia: vi.fn(),
}));
vi.mock("@/lib/admin/catalog/service", () => ({
  publishCatalogDraft: vi.fn(),
}));

const requireCapabilityMock = vi.mocked(requireAdminCapability);
const stageMediaMock = vi.mocked(stageCatalogMedia);
const publishDraftMock = vi.mocked(publishCatalogDraft);
const USER_ID = "123e4567-e89b-42d3-a456-426614174000";

beforeEach(() => {
  requireCapabilityMock.mockReset();
  stageMediaMock.mockReset();
  publishDraftMock.mockReset();
});

function uploadRequest() {
  const form = new FormData();
  form.set("file", new File(["image"], "product.webp", { type: "image/webp" }));
  form.set("productId", "123e4567-e89b-42d3-a456-426614174001");
  form.set("role", "gallery");
  form.set("sortOrder", "0");
  form.set("alt", "Product texture");
  const request = new Request(
    "https://mei-pelle.test/api/admin/catalog/media/upload",
    {
      method: "POST",
      headers: {
        "content-type": "multipart/form-data; boundary=vitest",
        origin: "https://mei-pelle.test",
      },
    },
  );
  vi.spyOn(request, "formData").mockResolvedValue(form);
  return request;
}

describe("catalog editor protected routes", () => {
  it("rejects media upload before storage work without catalog.edit", async () => {
    requireCapabilityMock.mockRejectedValue(
      new CatalogAdminError("capability_required", "Forbidden", 403),
    );

    const response = await uploadMedia(uploadRequest());

    expect(response.status).toBe(403);
    expect(requireCapabilityMock).toHaveBeenCalledWith("catalog.edit");
    expect(stageMediaMock).not.toHaveBeenCalled();
  });

  it("stages authorized media without creating a canonical association", async () => {
    requireCapabilityMock.mockResolvedValue({
      userId: USER_ID,
      email: "editor@example.test",
      role: "catalog_editor",
      capabilities: ["admin.access", "catalog.read", "catalog.edit"],
    });
    stageMediaMock.mockResolvedValue({
      id: "123e4567-e89b-42d3-a456-426614174002",
      variant_id: null,
      media_type: "image",
      media_kind: "image",
      url: "https://erasogmsqpgiirovubjh.supabase.co/storage/v1/object/public/mei-pelle-catalog/products/refine/drafts/hash.webp",
      alt: "Product texture",
      width: 1200,
      height: 1600,
      role: "gallery",
      sort_order: 0,
      palette_id: null,
      placeholder_palette: {},
      original_source_url: null,
      source_filename: "product.webp",
      pendingUpload: {
        bucket: "mei-pelle-catalog",
        path: "products/refine/drafts/hash.webp",
        sha256: "a".repeat(64),
        mimeType: "image/webp",
        sizeBytes: 5,
        uploadedBy: USER_ID,
      },
    });

    const response = await uploadMedia(uploadRequest());

    expect(response.status).toBe(201);
    expect(stageMediaMock).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: USER_ID, role: "gallery" }),
    );
  });

  it("requires catalog.publish and forwards the expected draft version", async () => {
    requireCapabilityMock.mockResolvedValue({
      userId: USER_ID,
      email: "publisher@example.test",
      role: "catalog_publisher",
      capabilities: [
        "admin.access",
        "catalog.read",
        "catalog.edit",
        "catalog.publish",
        "catalog.delivery",
      ],
    });
    publishDraftMock.mockResolvedValue({
      ok: true,
      draft: {} as never,
      revision: {} as never,
      changedTables: {
        products: false,
        productPdpContent: true,
        variants: false,
        media: false,
        relationships: false,
      },
    });

    const response = await publishDraft(
      new Request(
        "https://mei-pelle.test/api/admin/catalog/drafts/draft-1/publish",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: "https://mei-pelle.test",
          },
          body: JSON.stringify({ expectedVersion: 7 }),
        },
      ),
      { params: Promise.resolve({ draftId: "draft-1" }) },
    );

    expect(response.status).toBe(200);
    expect(requireCapabilityMock).toHaveBeenCalledWith("catalog.publish");
    expect(publishDraftMock).toHaveBeenCalledWith({
      draftId: "draft-1",
      expectedVersion: 7,
      actorId: USER_ID,
    });
  });
});
