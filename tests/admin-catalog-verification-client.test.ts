import { afterEach, describe, expect, it, vi } from "vitest";
import { createVerificationCatalogApi } from "@/app/helix-verification/admin/catalog-api";
import { CatalogVersionConflictError } from "@/lib/admin/catalog-editor/client";

afterEach(() => vi.unstubAllGlobals());

describe("isolated catalog presentation client", () => {
  it("exercises synthetic draft review without any provider requests", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const api = createVerificationCatalogApi("ready");
    const response = await api.getEditor("synthetic");
    const document = structuredClone(response.draft!.document);
    document.product.display_name = "Local presentation edit";
    const saved = await api.saveDraft(response.draft!.id, response.draft!.version, document);
    const validation = await api.validateDraft(saved.draft.id, saved.draft.version);
    expect(validation.valid).toBe(true);
    expect(validation.draft.document.product.display_name).toBe("Local presentation edit");
    const created = await api.createDraft("synthetic", document);
    expect(created.draft.document.product.display_name).toBe("Local presentation edit");
    expect((await api.listProducts({})).items.length).toBeGreaterThan(0);
    const ready = await api.markReady(saved.draft.id, saved.draft.version);
    expect(ready.draft.status).toBe("ready");
    expect((await api.listRevisions(saved.draft.id)).items.length).toBeGreaterThan(0);
    await expect(api.publishDraft(saved.draft.id, saved.draft.version)).rejects.toThrow("disabled in local verification");
    await expect(api.discardDraft(saved.draft.id, saved.draft.version)).rejects.toThrow("disabled in local verification");
    await expect(api.restoreRevision("synthetic")).rejects.toThrow("disabled in local verification");
    await expect(api.uploadMedia(new File([], "synthetic.webp"), "synthetic", { role: "gallery", alt: "Synthetic", sortOrder: 0 })).rejects.toThrow("disabled in local verification");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("shows local validation and conflict outcomes without making requests", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const invalid = createVerificationCatalogApi("validation");
    const validation = await invalid.validateDraft("synthetic", 1);
    expect(validation.valid).toBe(false);
    expect(validation.issues[0].message).toContain("Synthetic validation");
    const conflict = createVerificationCatalogApi("conflict");
    const response = await conflict.getEditor("synthetic");
    await expect(conflict.saveDraft("synthetic", 1, response.canonical)).rejects.toBeInstanceOf(CatalogVersionConflictError);
    expect(fetch).not.toHaveBeenCalled();
  });

});
