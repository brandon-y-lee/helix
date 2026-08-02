import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogDraftDocument } from "@/lib/admin/catalog-editor/client";
import CatalogEditor from "@/components/admin/catalog-editor/CatalogEditor";
import {
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
        productPdpContent: false,
        variants: false,
        media: false,
        relationships: false,
        productSource: false,
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
