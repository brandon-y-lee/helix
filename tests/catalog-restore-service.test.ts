import { beforeEach, describe, expect, it, vi } from "vitest";
import { catalogDraft } from "./fixtures/catalog-editor";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({ rpc }),
}));

import { restoreCatalogRevision } from "@/lib/admin/catalog/service";

describe("Catalog Restore service", () => {
  beforeEach(() => rpc.mockReset());

  it("does not claim current identity was kept when the database cannot confirm it", async () => {
    rpc.mockResolvedValue({
      data: { ok: true, draft: catalogDraft },
      error: null,
    });

    await expect(
      restoreCatalogRevision("revision-old", "catalog-editor"),
    ).rejects.toMatchObject({
      code: "restore_contract_unconfirmed",
      status: 503,
      message: expect.stringContaining("A draft may have been created"),
    });
  });

  it("returns the created draft and the fields the database confirmed it kept", async () => {
    const restored = {
      ok: true,
      draft: catalogDraft,
      retainedFields: [
        "slug", "display_name", "seo_title", "seo_description", "search_keywords",
      ],
    };
    rpc.mockResolvedValue({ data: restored, error: null });

    await expect(
      restoreCatalogRevision("revision-old", "catalog-editor"),
    ).resolves.toEqual(restored);
  });

  it.each([
    ["slug", "display_name"],
    ["slug", "display_name", "seo_title", "seo_description", "seo_description"],
  ])("does not accept an incomplete retention confirmation: %j", async (...retainedFields) => {
    rpc.mockResolvedValue({
      data: { ok: true, draft: catalogDraft, retainedFields },
      error: null,
    });

    await expect(
      restoreCatalogRevision("revision-old", "catalog-editor"),
    ).rejects.toMatchObject({ code: "restore_contract_unconfirmed", status: 503 });
  });

  it("preserves the active-draft conflict for the editor", async () => {
    rpc.mockResolvedValue({
      data: {
        ok: false,
        code: "active_draft_exists",
        stored: { id: catalogDraft.id, version: 4, status: "draft" },
      },
      error: null,
    });

    await expect(
      restoreCatalogRevision("revision-old", "catalog-editor"),
    ).rejects.toMatchObject({
      code: "active_draft_exists",
      status: 409,
      details: { stored: { id: catalogDraft.id, version: 4 } },
    });
  });
});
