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

function disclosure(container: HTMLElement, id: string) {
  const element = container.querySelector<HTMLDetailsElement>(`#${id}`);
  if (!element) throw new Error(`Missing disclosure #${id}`);
  return element;
}

function toggleDisclosure(container: HTMLElement, id: string) {
  const element = disclosure(container, id);
  const summary = element.querySelector<HTMLElement>(":scope > summary");
  if (!summary) throw new Error(`Missing summary for #${id}`);
  fireEvent.click(summary);
  return element;
}

describe("CatalogEditor sections", () => {
  beforeEach(() => {
    vi.mocked(catalogEditorApi.getEditor).mockReset();
    vi.mocked(catalogEditorApi.getEditor).mockResolvedValue(editorResponse());
    vi.mocked(catalogEditorApi.uploadMedia).mockReset();
  });

  it("groups every canonical table and exposes admin source fields", async () => {
    const user = userEvent.setup();
    const { container } = render(<CatalogEditor productId="product-cleanse" />);

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

    for (const section of container.querySelectorAll<HTMLDetailsElement>(
      'details[data-editor-disclosure="table"]',
    )) {
      expect(section.open).toBe(false);
      expect(section.querySelector(":scope > summary")).toHaveAttribute(
        "aria-expanded",
        "false",
      );
    }

    toggleDisclosure(container, "section-product_sources");
    toggleDisclosure(container, "group-source-fields");
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
    const { container } = render(<CatalogEditor productId="product-cleanse" />);

    await screen.findByRole("heading", { name: "CLEANSE" });
    toggleDisclosure(container, "section-products");
    toggleDisclosure(container, "group-products-editorial");
    expect(screen.getByLabelText("Display name")).toBeEnabled();
    expect(screen.queryByLabelText("Supplier title")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Price (USD)")).not.toBeInTheDocument();
    toggleDisclosure(container, "section-product_sources");
    toggleDisclosure(container, "group-source-fields");
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

    toggleDisclosure(container, "section-product_media");
    toggleDisclosure(container, "group-core-routine-media");
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

  it("shows ordered outcome associations and their canonical provenance", async () => {
    const outcomeDocument = structuredClone(catalogDocument);
    outcomeDocument.media.push(
      ...[1, 2, 3].map((position) => ({
        ...catalogDocument.media[0],
        id: `223e4567-e89b-42d3-a456-42661417400${position}`,
        role: "pdp_outcome" as const,
        sort_order: position,
        source_filename: `cleanse-pdp-outcomes-0${position}.webp`,
        url: `https://erasogmsqpgiirovubjh.supabase.co/storage/v1/object/public/mei-pelle-catalog/products/cleanse/outcomes/outcome-${position}.webp`,
        alt: `CLEANSE outcome visual ${position}`,
      })),
    );
    vi.mocked(catalogEditorApi.getEditor).mockResolvedValue({
      ...editorResponse(),
      canonical: outcomeDocument,
      draft: { ...catalogDraft, document: outcomeDocument },
    });

    const { container } = render(
      <CatalogEditor productId="product-cleanse" />,
    );
    await screen.findByRole("heading", { name: "CLEANSE" });
    toggleDisclosure(container, "section-product_media");
    toggleDisclosure(container, "group-media-records");

    for (const position of [1, 2, 3]) {
      expect(screen.getByText(`pdp_outcome #${position}`)).toBeVisible();
      expect(
        container.querySelector(
          `#product_media-223e4567-e89b-42d3-a456-42661417400${position}-source_filename`,
        ),
      ).toHaveTextContent(`cleanse-pdp-outcomes-0${position}.webp`);
    }
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
    const { container } = render(<CatalogEditor productId="product-cleanse" />);
    await screen.findByRole("heading", { name: "CLEANSE" });

    fireEvent.click(screen.getByRole("button", { name: "Validate" }));
    expect(
      await screen.findByText("SKU must be unique within this product."),
    ).toBeVisible();
    expect(screen.getByRole("alert", { name: "" })).toBeInTheDocument();
    await waitFor(() => {
      expect(disclosure(container, "section-product_variants").open).toBe(true);
      expect(disclosure(container, "group-variant-records").open).toBe(true);
      expect(
        container.querySelector("#product_variants-variant-duplicate-sku"),
      ).toHaveFocus();
    });
  });

  it("preserves edits across disclosures and supports expand and collapse all", async () => {
    const { container } = render(<CatalogEditor productId="product-cleanse" />);
    await screen.findByRole("heading", { name: "CLEANSE" });

    const productsLink = screen.getByRole("link", { name: "Products" });
    fireEvent.click(productsLink);
    await waitFor(() =>
      expect(disclosure(container, "section-products").open).toBe(true),
    );
    toggleDisclosure(container, "group-products-editorial");
    fireEvent.change(screen.getByLabelText("Display name"), {
      target: { value: "CLEANSE DENSE" },
    });
    toggleDisclosure(container, "group-products-editorial");
    expect(screen.getByLabelText("Display name")).not.toBeVisible();
    expect(screen.getAllByText("1 changed").length).toBeGreaterThanOrEqual(2);
    toggleDisclosure(container, "group-products-editorial");
    expect(screen.getByLabelText("Display name")).toHaveValue("CLEANSE DENSE");

    fireEvent.click(screen.getByRole("button", { name: "Expand all" }));
    await waitFor(() => {
      for (const details of container.querySelectorAll<HTMLDetailsElement>(
        "details[data-editor-disclosure]",
      )) {
        expect(details.open).toBe(true);
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "Collapse all" }));
    await waitFor(() => {
      for (const details of container.querySelectorAll<HTMLDetailsElement>(
        "details[data-editor-disclosure]",
      )) {
        expect(details.open).toBe(false);
      }
    });
    expect(screen.getByLabelText("Display name")).not.toBeVisible();
  }, 15_000);
});
