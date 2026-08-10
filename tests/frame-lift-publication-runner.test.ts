import { describe, expect, it, vi } from "vitest";
import type { ProductEditorDocumentV4 } from "@/lib/admin/catalog/types";
import { catalogDocument } from "@/tests/fixtures/catalog-editor";
import {
  FRAME_LIFT_PUBLICATIONS,
  type FrameLiftStep,
} from "@/lib/catalog/frame-lift-publication";
import {
  publishFrameLiftProduct,
  type FrameLiftPublicationGateway,
} from "@/lib/catalog/frame-lift-publication-runner";

function sourceDocument(step: FrameLiftStep): ProductEditorDocumentV4 {
  const definition = FRAME_LIFT_PUBLICATIONS[step];
  const document = structuredClone(catalogDocument) as ProductEditorDocumentV4;
  document.productId = definition.productId;
  document.product = {
    ...document.product,
    id: definition.productId,
    display_name: step,
    system_step_name: step,
    slug: definition.sourceSlug,
    product_type: step === "FRAME" ? "Eye contour cream" : "Sheet mask",
    ingredients:
      step === "FRAME"
        ? "Water, Sodium DNA, Acetyl Tetrapeptide-5"
        : "Water, Sodium DNA (5,000 ppm), Hydrolyzed Collagen",
  };
  document.productPdpContent = {
    ...document.productPdpContent!,
    product_id: definition.productId,
  };
  document.variants = document.variants.map((variant) => ({
    ...variant,
    product_id: definition.productId,
  }));
  document.media = document.media.map((media) => ({
    ...media,
    product_id: definition.productId,
  }));
  document.productSource = {
    ...document.productSource!,
    product_id: definition.productId,
    supplier_title: definition.sourceTitle,
    supplier_url: definition.sourceUrl,
  };
  return document;
}

function gateway(step: FrameLiftStep): FrameLiftPublicationGateway {
  let current = sourceDocument(step);
  let redirected = false;
  return {
    readState: vi.fn(async () => ({
      canonical: current,
      activeDraftId: null,
      sourceRedirectExists: redirected,
    })),
    createDraft: vi.fn(async () => ({
      created: true,
      draft: { id: "draft-id", version: 1, document: current },
    })),
    validateDocument: vi.fn(() => []),
    saveDraft: vi.fn(async ({ document }) => ({
      draft: { id: "draft-id", version: 2, document },
    })),
    markReady: vi.fn(async () => ({
      draft: { id: "draft-id", version: 3 },
    })),
    publishDraft: vi.fn(async ({ document }) => {
      current = document;
      redirected = true;
      return { revisionId: "revision-id", revisionNumber: 1 };
    }),
  };
}

describe("FRAME/LIFT publication runner", () => {
  it("uses the versioned draft → ready → publish protocol and verifies the redirect", async () => {
    const adapter = gateway("FRAME");

    await expect(publishFrameLiftProduct("FRAME", adapter)).resolves.toEqual({
      step: "FRAME",
      status: "published",
      slug: "peptide-eye-cream",
      revisionId: "revision-id",
      revisionNumber: 1,
    });
    expect(adapter.saveDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        draftId: "draft-id",
        expectedVersion: 1,
        role: "admin",
      }),
    );
    expect(adapter.markReady).toHaveBeenCalledWith({
      draftId: "draft-id",
      expectedVersion: 2,
    });
    expect(adapter.publishDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        draftId: "draft-id",
        expectedVersion: 3,
        role: "admin",
      }),
    );
  });

  it("skips an already verified publication without creating a draft", async () => {
    const adapter = gateway("LIFT");
    await publishFrameLiftProduct("LIFT", adapter);

    await expect(publishFrameLiftProduct("LIFT", adapter)).resolves.toEqual(
      expect.objectContaining({
        step: "LIFT",
        status: "already_published",
        slug: "peptide-nourish-mask",
      }),
    );
    expect(adapter.createDraft).toHaveBeenCalledTimes(1);
  });

  it("fails closed rather than overwriting an active draft", async () => {
    const adapter = gateway("FRAME");
    vi.mocked(adapter.readState).mockResolvedValueOnce({
      canonical: sourceDocument("FRAME"),
      activeDraftId: "someone-elses-draft",
      sourceRedirectExists: false,
    });

    await expect(publishFrameLiftProduct("FRAME", adapter)).rejects.toThrow(
      /active draft/i,
    );
    expect(adapter.createDraft).not.toHaveBeenCalled();
  });

  it("does not publish when local validation reports any issue", async () => {
    const adapter = gateway("LIFT");
    vi.mocked(adapter.validateDocument).mockReturnValue([
      { path: "product.slug", code: "invalid", message: "invalid" },
    ]);

    await expect(publishFrameLiftProduct("LIFT", adapter)).rejects.toThrow(
      /validation/i,
    );
    expect(adapter.createDraft).not.toHaveBeenCalled();
    expect(adapter.saveDraft).not.toHaveBeenCalled();
    expect(adapter.publishDraft).not.toHaveBeenCalled();
  });

  it("fails closed if a completed document is missing its permanent redirect", async () => {
    const adapter = gateway("FRAME");
    await publishFrameLiftProduct("FRAME", adapter);
    const publishedState = await adapter.readState(
      FRAME_LIFT_PUBLICATIONS.FRAME.productId,
    );
    vi.mocked(adapter.readState).mockResolvedValueOnce({
      canonical: publishedState.canonical,
      activeDraftId: null,
      sourceRedirectExists: false,
    });

    await expect(publishFrameLiftProduct("FRAME", adapter)).rejects.toThrow(
      /redirect/i,
    );
    expect(adapter.createDraft).toHaveBeenCalledTimes(1);
  });
});
