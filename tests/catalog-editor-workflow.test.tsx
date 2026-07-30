import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
    const user = userEvent.setup();
    render(<CatalogEditor productId="product-cleanse" />);
    await screen.findByRole("heading", { name: "CLEANSE" });
    await user.clear(screen.getByLabelText("Display name"));
    await user.type(screen.getByLabelText("Display name"), "LOCAL CLEANSE");

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
    const user = userEvent.setup();
    vi.mocked(catalogEditorApi.publishDraft).mockResolvedValue({
      draft: { ...catalogDraft, status: "published", version: 6 },
      revision: {
        id: "123e4567-e89b-42d3-a456-426614174099",
        product_id: catalogDraft.product_id,
        revision_number: 4,
        schema_version: 1,
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
      },
    });
    render(<CatalogEditor productId="product-cleanse" />);
    await screen.findByRole("heading", { name: "CLEANSE" });
    await user.clear(screen.getByLabelText("Display name"));
    await user.type(screen.getByLabelText("Display name"), "CLEANSE+");

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
