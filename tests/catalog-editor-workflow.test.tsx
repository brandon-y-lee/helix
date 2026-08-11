import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogDraftDocument } from "@/lib/admin/catalog-editor/client";
import CatalogEditor from "@/components/admin/catalog-editor/CatalogEditor";
import {
  CatalogApiError,
  CatalogVersionConflictError,
  catalogEditorApi,
} from "@/lib/admin/catalog-editor/client";
import {
  catalogDraft,
  DRAFT_ID,
  editorResponse,
} from "./fixtures/catalog-editor";

vi.mock("@/lib/admin/catalog-editor/client", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/lib/admin/catalog-editor/client")>();
  return {
    ...original,
    catalogEditorApi: Object.fromEntries(
      Object.keys(original.catalogEditorApi).map((key) => [key, vi.fn()]),
    ),
  };
});

vi.mock(
  "@/components/admin/catalog-editor/CatalogEditorSections",
  async (importOriginal) => {
    const original =
      await importOriginal<
        typeof import("@/components/admin/catalog-editor/CatalogEditorSections")
      >();
    return {
      ...original,
      default: ({
        document,
        onChange,
      }: {
        document: CatalogDraftDocument;
        onChange: (document: CatalogDraftDocument) => void;
      }) => (
        <>
          <label>
            Display name
            <input
              value={document.product.display_name}
              onChange={(event) =>
                onChange({
                  ...document,
                  product: {
                    ...document.product,
                    display_name: event.target.value,
                  },
                })
              }
            />
          </label>
          <label>
            Slug
            <input
              value={document.product.slug}
              onChange={(event) =>
                onChange({
                  ...document,
                  product: {
                    ...document.product,
                    slug: event.target.value,
                  },
                })
              }
            />
          </label>
        </>
      ),
    };
  },
);

describe("CatalogEditor draft workflow", () => {
  beforeEach(() => {
    for (const method of Object.values(catalogEditorApi)) {
      vi.mocked(method).mockReset();
    }
    vi.mocked(catalogEditorApi.getEditor).mockResolvedValue(editorResponse());
    vi.mocked(catalogEditorApi.saveDraft).mockImplementation(
      async (_draftId, _version, document) => ({
        ok: true as const,
        draft: { ...catalogDraft, version: 5, document },
      }),
    );
    vi.mocked(catalogEditorApi.validateDraft).mockResolvedValue({
      valid: true,
      issues: [],
      affected_tables: ["products"],
      draft: { ...catalogDraft, status: "ready", version: 6 },
      diff: {
        products: [
          { field: "display_name", before: "CLEANSE", after: "CLEANSE+" },
        ],
      },
    });
  });

  it("saves with the draft version and preserves local edits on conflict", async () => {
    render(<CatalogEditor productId="product-cleanse" />);
    await screen.findByRole("heading", { name: "CLEANSE" });
    fireEvent.change(screen.getByLabelText("Display name"), {
      target: { value: "LOCAL CLEANSE" },
    });
    const leaveEvent = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(leaveEvent);
    expect(leaveEvent.defaultPrevented).toBe(true);

    vi.mocked(catalogEditorApi.saveDraft).mockRejectedValueOnce(
      new CatalogVersionConflictError("Another edit was saved.", {
        id: catalogDraft.id,
        version: 9,
        status: "draft",
        updatedAt: catalogDraft.updated_at,
        updatedBy: catalogDraft.updated_by,
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));

    expect(await screen.findByText("Newer draft detected")).toBeVisible();
    expect(screen.getByLabelText("Display name")).toHaveValue("LOCAL CLEANSE");
    expect(catalogEditorApi.saveDraft).toHaveBeenCalledWith(
      DRAFT_ID,
      4,
      expect.objectContaining({
        product: expect.objectContaining({ display_name: "LOCAL CLEANSE" }),
      }),
    );
    expect(screen.getByRole("button", { name: "Reload latest" })).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Copy/review local changes" }),
    ).toBeVisible();
  });

  it("saves before opening the isolated draft preview", async () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    render(<CatalogEditor productId="product-cleanse" />);
    await screen.findByRole("heading", { name: "CLEANSE" });
    fireEvent.change(screen.getByLabelText("Display name"), {
      target: { value: "CLEANSE+" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    await waitFor(() =>
      expect(open).toHaveBeenCalledWith(
        `/admin/catalog/preview/${DRAFT_ID}`,
        "_blank",
        "noopener,noreferrer",
      ),
    );
    expect(catalogEditorApi.saveDraft).toHaveBeenCalled();
    open.mockRestore();
  });

  it("requires publish capability, validated diff review, and confirmation", async () => {
    vi.mocked(catalogEditorApi.publishDraft).mockResolvedValue({
      draft: { ...catalogDraft, status: "published", version: 6 },
      revision: {
        id: "123e4567-e89b-42d3-a456-426614174099",
        product_id: catalogDraft.product_id,
        revision_number: 4,
        schema_version: 3,
        document: catalogDraft.document,
        source_draft_id: catalogDraft.id,
        published_at: "2026-07-22T12:00:00.000Z",
        published_by: catalogDraft.updated_by,
      },
      ok: true,
      changedTables: {
        products: true,
        productSlugRoutes: false,
        productPdpContent: false,
        variants: false,
        media: false,
        relationships: false,
      productSource: false,
      productFamily: false,
      },
      mediaVerification: {
        status: "healthy",
        report: {
          results: [],
          summary: {
            expectedRecords: 0,
            distinctUrls: 0,
            successes: 0,
            failures: 0,
            receivedBodyBytes: 0,
            bodyBudgetBytes: 0,
          },
        },
      },
    });
    render(<CatalogEditor productId="product-cleanse" />);
    await screen.findByRole("heading", { name: "CLEANSE" });
    fireEvent.change(screen.getByLabelText("Display name"), {
      target: { value: "CLEANSE+" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Review publish" }));
    expect(await screen.findByText("Confirm publication")).toBeVisible();
    expect(screen.getByRole("heading", { name: "products" })).toBeVisible();
    expect(screen.getByText(/CLEANSE → CLEANSE\+/)).toBeVisible();
    expect(catalogEditorApi.publishDraft).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Confirm publish" }));
    await waitFor(() =>
      expect(catalogEditorApi.publishDraft).toHaveBeenCalledWith(
        DRAFT_ID,
        6,
      ),
    );
    expect(await screen.findByText("Revision 4 published")).toBeVisible();
    expect(screen.getByText(/not reported/)).toBeVisible();
  });

  it("shows the exact permanent redirect consequence before publishing a slug change", async () => {
    vi.mocked(catalogEditorApi.validateDraft).mockResolvedValue({
      valid: true,
      issues: [],
      affected_tables: ["products"],
      draft: { ...catalogDraft, status: "ready", version: 6 },
      diff: {
        products: [
          {
            field: "slug",
            before: "cleanse-01-calming-gel-cleanser",
            after: "biotic-reset",
            disruptive: true,
            adminOnly: true,
          },
        ],
      },
    });
    render(<CatalogEditor productId="product-cleanse" />);
    await screen.findByRole("heading", { name: "CLEANSE" });
    fireEvent.change(screen.getByLabelText("Slug"), {
      target: { value: "biotic-reset" },
    });

    expect(
      screen.getByText(
        /\/products\/cleanse-01-calming-gel-cleanser will permanently redirect to \/products\/biotic-reset/i,
      ),
    ).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Review publish" }));
    expect(await screen.findByText("Confirm publication")).toBeVisible();
    expect(
      screen.getAllByText(/old public URL remains in redirect history/i).length,
    ).toBeGreaterThan(0);
    expect(screen.getByLabelText(/acknowledge disruptive changes/i)).not.toBeChecked();
  });

  it("shows a Product Media warning without misreporting the committed revision", async () => {
    const failedUrl = catalogDraft.document.media[0].url!;
    vi.mocked(catalogEditorApi.publishDraft).mockResolvedValue({
      draft: { ...catalogDraft, status: "published", version: 6 },
      revision: {
        id: "123e4567-e89b-42d3-a456-426614174099",
        product_id: catalogDraft.product_id,
        revision_number: 4,
        schema_version: 3,
        document: catalogDraft.document,
        source_draft_id: catalogDraft.id,
        published_at: "2026-07-22T12:00:00.000Z",
        published_by: catalogDraft.updated_by,
      },
      ok: true,
      changedTables: {
        products: true,
        productSlugRoutes: false,
        productPdpContent: false,
        variants: false,
        media: false,
        relationships: false,
      productSource: false,
      productFamily: false,
      },
      mediaVerification: {
        status: "warning",
        message:
          "The revision was published, but its Product Media failed verification.",
        report: {
          results: [{
            url: failedUrl,
            expectedMediaType: "image",
            outcome: "failed",
            failure: {
              code: "network_error",
              message:
                "The Product Media request failed before verification completed.",
            },
            status: null,
            receivedBytes: 0,
            totalBytes: null,
            contentType: null,
            redirects: 0,
          }],
          summary: {
            expectedRecords: 1,
            distinctUrls: 1,
            successes: 0,
            failures: 1,
            receivedBodyBytes: 0,
            bodyBudgetBytes: 32,
          },
        },
      },
    });
    render(<CatalogEditor productId="product-cleanse" />);
    await screen.findByRole("heading", { name: "CLEANSE" });
    fireEvent.change(screen.getByLabelText("Display name"), {
      target: { value: "CLEANSE+" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Review publish" }));
    await screen.findByText("Confirm publication");
    fireEvent.click(screen.getByRole("button", { name: "Confirm publish" }));

    expect(await screen.findByText("Revision 4 published")).toBeVisible();
    expect(screen.getByText("Product Media warning")).toBeVisible();
    expect(
      screen.getByText(/revision remains published/i),
    ).toBeVisible();
    expect(screen.getByText(failedUrl)).toBeVisible();
    expect(
      screen.getByText(/failed before verification completed/i),
    ).toBeVisible();
  });

  it("shows actionable candidate Product Media failures when Publish is prevented", async () => {
    vi.mocked(catalogEditorApi.publishDraft).mockRejectedValue(
      new CatalogApiError(
        "Candidate Product Media failed publication verification.",
        422,
        {
          issues: [{
            path: "media.0.url",
            code: "network_error",
            message:
              "The Product Media request failed before verification completed.",
          }],
        },
      ),
    );
    render(<CatalogEditor productId="product-cleanse" />);
    await screen.findByRole("heading", { name: "CLEANSE" });
    fireEvent.change(screen.getByLabelText("Display name"), {
      target: { value: "CLEANSE+" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Review publish" }));
    await screen.findByText("Confirm publication");
    fireEvent.click(screen.getByRole("button", { name: "Confirm publish" }));

    expect(
      await screen.findByText(
        "Candidate Product Media failed publication verification.",
      ),
    ).toBeVisible();
    expect(screen.getByText("Validation issues")).toBeVisible();
    expect(
      screen.getByText(/Product Media request failed before verification completed/i),
    ).toBeVisible();
    expect(catalogEditorApi.getEditor).toHaveBeenCalledOnce();
  });

  it("preserves ready status when publish review has no unsaved changes", async () => {
    const readyDocument = {
      ...catalogDraft.document,
      product: {
        ...catalogDraft.document.product,
        display_name: "CLEANSE+",
      },
    };
    vi.mocked(catalogEditorApi.validateDraft).mockResolvedValue({
      valid: true,
      issues: [],
      affected_tables: ["products"],
      draft: {
        ...catalogDraft,
        status: "ready",
        version: 6,
        document: readyDocument,
      },
      diff: {
        products: [
          { field: "display_name", before: "CLEANSE", after: "CLEANSE+" },
        ],
      },
    });
    vi.mocked(catalogEditorApi.markReady).mockResolvedValue({
      ok: true,
      draft: {
        ...catalogDraft,
        status: "ready",
        version: 7,
        document: readyDocument,
      },
    });
    render(<CatalogEditor productId="product-cleanse" />);
    await screen.findByRole("heading", { name: "CLEANSE" });
    fireEvent.change(screen.getByLabelText("Display name"), {
      target: { value: "CLEANSE+" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Mark ready" }));
    expect(await screen.findByText("Draft marked ready.")).toBeVisible();
    expect(catalogEditorApi.saveDraft).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Review publish" }));
    expect(await screen.findByText("Confirm publication")).toBeVisible();
    expect(catalogEditorApi.saveDraft).toHaveBeenCalledTimes(1);
  });

  it("does not expose an active publish command without catalog.publish", async () => {
    vi.mocked(catalogEditorApi.getEditor).mockResolvedValue(editorResponse(false));
    render(<CatalogEditor productId="product-cleanse" />);
    await screen.findByRole("heading", { name: "CLEANSE" });

    expect(
      screen.queryByRole("button", { name: /publish/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Publishing requires catalog.publish.")).toBeVisible();
  });
});
