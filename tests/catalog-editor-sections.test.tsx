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

  it("groups every canonical table and exposes admin source fields", async () => {
    const user = userEvent.setup();
    render(<CatalogEditor productId="product-cleanse" />);

    expect(await screen.findByRole("heading", { name: "CLEANSE" })).toBeVisible();
    for (const table of [
      "products",
      "product_pdp_content",
      "product_variants",
      "product_media",
      "product_relationships",
      "product_sources",
    ]) {
      expect(screen.getByText(table)).toBeVisible();
    }

    expect(screen.getByDisplayValue("Supplier Cleanser")).toBeVisible();
    expect(
      screen.queryByRole("option", { name: "campaign" }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Display name")).not.toHaveAttribute("readonly");

    const navigation = screen.getByRole("navigation", {
      name: "Product tables",
    });
    expect(navigation).toHaveTextContent(
      "ProductsPDP contentVariantsMediaRelationshipsSourcesSystem Metadata",
    );
    await user.tab();
    expect(screen.getByRole("link", { name: "← Catalog" })).toHaveFocus();
  });

  it("keeps advanced and commerce controls read only for a catalog editor", async () => {
    vi.mocked(catalogEditorApi.getEditor).mockResolvedValue(editorResponse(false));
    render(<CatalogEditor productId="product-cleanse" />);

    expect(await screen.findByLabelText("Display name")).toBeEnabled();
    expect(screen.queryByLabelText("Supplier title")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Price (USD)")).not.toBeInTheDocument();
    expect(screen.getByText("Supplier Cleanser")).toBeVisible();
    expect(screen.getAllByText("$22.00")).toHaveLength(2);
    expect(screen.getByText("Publishing requires catalog.publish.")).toBeVisible();
  });

  it("allows an admin to edit safe source and variant commerce fields", async () => {
    render(<CatalogEditor productId="product-cleanse" />);

    const supplierTitle = await screen.findByLabelText("Supplier title");
    fireEvent.change(supplierTitle, {
      target: { value: "Corrected supplier title" },
    });
    const price = screen.getByLabelText("Price (USD)");
    fireEvent.change(price, { target: { value: "24.50" } });
    fireEvent.blur(price);

    expect(supplierTitle).toHaveValue("Corrected supplier title");
    expect(price).toHaveValue(24.5);
    expect(screen.getByText("Unsaved")).toBeVisible();
  }, 15_000);

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

    fireEvent.change(screen.getByLabelText("Display name"), {
      target: { value: "CLEANSE UPDATED" },
    });
    expect(screen.getByText("Unsaved")).toBeVisible();
    const leaveEvent = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(leaveEvent);
    expect(leaveEvent.defaultPrevented).toBe(true);

    fireEvent.click(
      screen.getByRole("button", { name: "Move CLEANSE texture earlier" }),
    );
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
    fireEvent.change(altInput!, { target: { value: "New CLEANSE media" } });
    await user.upload(fileInput!, file);
    await waitFor(() =>
      expect(catalogEditorApi.uploadMedia).toHaveBeenCalledWith(
        file,
        "product-cleanse",
        {
          alt: "New CLEANSE media",
          role: "gallery",
          sortOrder: 2,
          variantId: null,
        },
      ),
    );
    expect(
      screen.getByText(
        "Media uploaded. Save the draft to retain this association.",
      ),
    ).toBeVisible();
  }, 15_000);

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
    fireEvent.change(altInput!, {
      target: { value: "CLEANSE supporting routine editorial" },
    });
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
