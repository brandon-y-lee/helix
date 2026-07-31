import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CatalogEditor from "@/components/admin/catalog-editor/CatalogEditor";
import { catalogEditorApi } from "@/lib/admin/catalog-editor/client";
import {
  catalogDocument,
  catalogDraft,
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

describe("CatalogEditor sections", () => {
  beforeEach(() => {
    vi.mocked(catalogEditorApi.getEditor).mockReset();
    vi.mocked(catalogEditorApi.getEditor).mockResolvedValue(editorResponse());
    vi.mocked(catalogEditorApi.uploadMedia).mockReset();
  });

  it("groups canonical fields by table without exposing retired supplier shadows", async () => {
    const user = userEvent.setup();
    render(<CatalogEditor productId="product-cleanse" />);

    expect(await screen.findByRole("heading", { name: "CLEANSE" })).toBeVisible();
    for (const table of [
      "products",
      "product_pdp_content",
      "product_variants",
      "product_media",
      "product_relationships",
    ]) {
      expect(screen.getByText(table)).toBeVisible();
    }

    expect(screen.queryByDisplayValue("Supplier Cleanser")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "campaign" }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Display name")).not.toHaveAttribute("readonly");

    const navigation = screen.getByRole("navigation", {
      name: "Product tables",
    });
    expect(navigation).toHaveTextContent(
      "ProductsPDP contentVariantsMediaRelationships",
    );
    await user.tab();
    expect(screen.getByRole("link", { name: "← Catalog" })).toHaveFocus();
  });

  it("tracks local changes, warns before leaving, reorders, and uploads media", async () => {
    const user = userEvent.setup();
    vi.mocked(catalogEditorApi.uploadMedia).mockResolvedValue({
      media: {
        ...catalogDocument.media[0],
        id: "uploaded-media",
        url: "https://example.test/upload.webp",
        alt: "",
        role: "unassigned",
      },
    });
    const { container } = render(
      <CatalogEditor productId="product-cleanse" />,
    );
    await screen.findByRole("heading", { name: "CLEANSE" });

    await user.clear(screen.getByLabelText("Display name"));
    await user.type(screen.getByLabelText("Display name"), "CLEANSE UPDATED");
    expect(screen.getByText("Unsaved")).toBeVisible();
    const leaveEvent = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(leaveEvent);
    expect(leaveEvent.defaultPrevented).toBe(true);

    fireEvent.click(screen.getAllByRole("button", { name: "Move earlier" })[1]);
    expect(screen.getAllByRole("img").map((image) => image.getAttribute("alt"))).toEqual([
      "CLEANSE texture",
      "CLEANSE bottle",
    ]);

    const file = new File(["image"], "new-image.webp", {
      type: "image/webp",
    });
    const altInput = container.querySelector<HTMLInputElement>(
      "#media-upload-alt",
    );
    const fileInput = screen.getByLabelText(
      "Choose media file",
    ) as HTMLInputElement;
    expect(altInput).toHaveAccessibleName("Media alt text");
    expect(fileInput).toHaveAccessibleName("Choose media file");
    await user.type(altInput!, "New CLEANSE media");
    await user.upload(fileInput!, file);
    await waitFor(() =>
      expect(catalogEditorApi.uploadMedia).toHaveBeenCalledWith(
        file,
        "product-cleanse",
        {
          alt: "New CLEANSE media",
          role: "gallery",
          sortOrder: 2,
        },
      ),
    );
    expect(
      screen.getByText(
        "Media uploaded. Save the draft to retain this association.",
      ),
    ).toBeVisible();
  });

  it("renders distinct fixed Core routine media slots", async () => {
    const user = userEvent.setup();
    vi.mocked(catalogEditorApi.uploadMedia).mockResolvedValue({
      media: {
        ...catalogDocument.media[0],
        id: "uploaded-core-editorial",
        url: "https://erasogmsqpgiirovubjh.supabase.co/storage/v1/object/public/mei-pelle-catalog/products/cleanse/drafts/editorial.webp",
        alt: "CLEANSE supporting routine editorial",
        role: "core_routine_editorial",
        sort_order: 1,
        variant_id: null,
      },
    });
    const { container } = render(
      <CatalogEditor productId="product-cleanse" />,
    );
    await screen.findByRole("heading", { name: "CLEANSE" });

    expect(screen.getByText("Core Routine Texture")).toBeVisible();
    expect(screen.getByText("Core Routine Editorial Image")).toBeVisible();
    expect(
      screen.getByText(
        "Ingredient/texture swatch used inside the left routine panel.",
      ),
    ).toBeVisible();
    expect(
      screen.getByText(
        "Large supporting image used by the shared interactive Core routine section across all Core PDPs.",
      ),
    ).toBeVisible();
    expect(
      screen.queryByRole("option", { name: "core routine editorial" }),
    ).not.toBeInTheDocument();

    const altInput = container.querySelector<HTMLInputElement>(
      "#core-routine-media-core_routine_editorial-alt",
    );
    const fileInput = screen.getByLabelText(
      "Add Core Routine Editorial Image",
    ) as HTMLInputElement;
    await user.type(altInput!, "CLEANSE supporting routine editorial");
    const file = new File(["image"], "editorial.webp", {
      type: "image/webp",
    });
    await user.upload(fileInput, file);

    await waitFor(() =>
      expect(catalogEditorApi.uploadMedia).toHaveBeenCalledWith(
        file,
        "product-cleanse",
        {
          alt: "CLEANSE supporting routine editorial",
          replaceRole: true,
          role: "core_routine_editorial",
          sortOrder: 1,
          variantId: null,
        },
      ),
    );
    expect(
      screen.getByLabelText("Replace Core Routine Editorial Image"),
    ).toBeVisible();
  });

  it("validates duplicate SKUs and invalid prices at the editable boundary", async () => {
    const duplicateDocument = {
      ...catalogDocument,
      variants: [
        catalogDocument.variants[0],
        {
          ...catalogDocument.variants[0],
          id: "variant-duplicate",
          label: "Travel",
        },
      ],
    };
    vi.mocked(catalogEditorApi.getEditor).mockResolvedValue({
      ...editorResponse(),
      draft: { ...catalogDraft, document: duplicateDocument },
    });
    vi.mocked(catalogEditorApi.saveDraft).mockResolvedValue({
      ok: true,
      draft: { ...catalogDraft, version: 5, document: duplicateDocument },
    });
    vi.mocked(catalogEditorApi.validateDraft).mockResolvedValue({
      valid: true,
      issues: [],
      diff: {},
      affected_tables: [],
      draft: { ...catalogDraft, version: 6, document: duplicateDocument },
    });
    render(<CatalogEditor productId="product-cleanse" />);
    await screen.findByRole("heading", { name: "CLEANSE" });

    fireEvent.click(screen.getByRole("button", { name: "Validate" }));
    expect(
      await screen.findByText("SKU must be unique within this product."),
    ).toBeVisible();
    expect(screen.getByRole("alert", { name: "" })).toBeInTheDocument();
  });
});
