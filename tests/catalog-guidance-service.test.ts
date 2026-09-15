import { beforeEach, describe, expect, it, vi } from "vitest";
import { catalogDraft } from "./fixtures/catalog-editor";

const { rpc, maybeSingle } = vi.hoisted(() => ({ rpc: vi.fn(), maybeSingle: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    rpc,
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }),
  }),
}));

import { getCatalogDraftForPreview, transitionCatalogDraft } from "@/lib/admin/catalog/service";

describe("Catalog guidance readiness", () => {
  beforeEach(() => { rpc.mockReset(); maybeSingle.mockReset(); });

  it.each(["validate", "ready", "discard"] as const)(
    "keeps missing guidance editable during %s and forwards current readiness issues",
    async (action) => {
      const draft = structuredClone(catalogDraft);
      draft.document.media = [];
      draft.document.relationships = [];
      draft.document.productPdpContent = null;
      maybeSingle.mockResolvedValue({ data: draft, error: null });
      rpc.mockImplementation(async (name: string) => ({
        data: name === "get_catalog_editor_document" ? draft.document : { ok: true, draft },
        error: null,
      }));

      await expect(getCatalogDraftForPreview(draft.id)).resolves.toEqual(draft);
      await transitionCatalogDraft({
        draftId: draft.id, expectedVersion: draft.version,
        actorId: draft.updated_by, role: "admin", action,
      });
      expect(rpc).toHaveBeenLastCalledWith("transition_catalog_product_draft", expect.objectContaining({
        p_action: action,
        p_validation_errors: action === "discard" ? [] : [expect.objectContaining({
          path: "productPdpContent.how_to_use_steps", code: "guidance_review_required",
        })],
      }));
    },
  );

  it.each([
    { steps: null, code: "guidance_review_required" },
    { steps: [" "], code: "guidance_invalid_steps" },
    { steps: [], code: null },
    { steps: ["Reviewed application step."], code: null },
  ])("validates authored instructions $steps without paragraph parsing", async ({ steps, code }) => {
    const draft = structuredClone(catalogDraft);
    draft.document.media = [];
    draft.document.relationships = [];
    draft.document.productPdpContent!.how_to_use_steps = steps;
    maybeSingle.mockResolvedValue({ data: draft, error: null });
    rpc.mockImplementation(async (name: string) => ({
      data: name === "get_catalog_editor_document" ? draft.document : { ok: true, draft }, error: null,
    }));
    await transitionCatalogDraft({
      draftId: draft.id, expectedVersion: draft.version,
      actorId: draft.updated_by, role: "admin", action: "ready",
    });
    expect(rpc).toHaveBeenLastCalledWith("transition_catalog_product_draft", expect.objectContaining({
      p_validation_errors: code ? [expect.objectContaining({ code })] : [],
    }));
  });
});
