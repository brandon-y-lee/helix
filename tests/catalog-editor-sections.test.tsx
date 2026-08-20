import type { ComponentProps } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CatalogEditor from "@/components/admin/catalog-editor/CatalogEditor";
import CatalogEditorSections from "@/components/admin/catalog-editor/CatalogEditorSections";
import { catalogEditorApi } from "@/lib/admin/catalog-editor/client";
import type {
  CatalogDraftDocument,
  CatalogValidationIssue,
} from "@/lib/admin/catalog-editor/client";
import { catalogDocumentDiff } from "@/lib/admin/catalog/diff";
import type { CatalogEditorRole } from "@/lib/catalog/field-ownership";
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

function SectionsHarness({
  initialDocument = catalogDocument,
  role = "admin",
  issues = [],
  onChange = () => {},
  onUpload = async () => {},
}: {
  initialDocument?: CatalogDraftDocument;
  role?: CatalogEditorRole;
  issues?: CatalogValidationIssue[];
  onChange?: ComponentProps<typeof CatalogEditorSections>["onChange"];
  onUpload?: ComponentProps<typeof CatalogEditorSections>["onUpload"];
}) {
  const document = structuredClone(initialDocument);
  const response = editorResponse(role === "admin");
  const changes = catalogDocumentDiff(catalogDocument, document).diff;

  return (
    <CatalogEditorSections
      document={document}
      role={role}
      issues={issues}
      relationshipTargets={response.relationshipTargets}
      systemMetadata={response.systemMetadata}
      changes={changes}
      onChange={onChange}
      onUpload={onUpload}
      uploading={false}
    />
  );
}

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
  });

  it("groups canonical tables and exposes admin source fields", () => {
    const { container } = render(<SectionsHarness />);

    for (const table of [
      "products",
      "product_families",
      "product_family_memberships",
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
  });

  it("shows administrator-governed Product Family identity and memberships", () => {
    const familyDocument = structuredClone(catalogDocument);
    familyDocument.product.system_step_name = "REFINE";
    familyDocument.product.routine_group = "beyond_core";
    familyDocument.productFamily = {
      family: {
        id: "123e4567-e89b-42d3-a456-426614174143",
        slug: "refine",
        display_name: "REFINE",
        system_step_name: "REFINE",
        created_at: "2026-08-10T00:00:00.000Z",
        updated_at: "2026-08-10T00:00:00.000Z",
      },
      memberships: [
        {
          family_id: "123e4567-e89b-42d3-a456-426614174143",
          product_id: familyDocument.productId,
          option_label: "General",
          sort_order: 0,
          is_entry: true,
          created_at: "2026-08-10T00:00:00.000Z",
          updated_at: "2026-08-10T00:00:00.000Z",
        },
      ],
    };
    const onChange = vi.fn();
    const { container } = render(
      <SectionsHarness initialDocument={familyDocument} onChange={onChange} />,
    );

    toggleDisclosure(container, "section-product_families");
    toggleDisclosure(container, "group-product-family");
    expect(
      container.querySelector("#product_families-display_name"),
    ).toHaveValue("REFINE");

    toggleDisclosure(container, "section-product_family_memberships");
    toggleDisclosure(container, "group-product-family-memberships");
    fireEvent.change(screen.getByLabelText("Option label"), {
      target: { value: "Daily" },
    });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        productFamily: expect.objectContaining({
          memberships: [expect.objectContaining({ option_label: "Daily" })],
        }),
      }),
    );
  });

  it("allows an admin to edit safe source and commerce fields", () => {
    const onChange = vi.fn();
    render(<SectionsHarness onChange={onChange} />);
    const supplierTitle = screen.getByLabelText("Supplier title");
    fireEvent.change(supplierTitle, {
      target: { value: "Corrected supplier title" },
    });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        productSource: expect.objectContaining({
          supplier_title: "Corrected supplier title",
        }),
      }),
    );

    const price = screen.getByLabelText("Price (USD)");
    fireEvent.change(price, { target: { value: "24.50" } });
    fireEvent.blur(price);
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        variants: [expect.objectContaining({ price_cents: 2450 })],
      }),
    );
  }, 10_000);

  it("warns an administrator that a slug edit creates a permanent redirect", () => {
    const onChange = vi.fn();
    const { container } = render(<SectionsHarness onChange={onChange} />);

    toggleDisclosure(container, "section-products");
    toggleDisclosure(container, "group-products-advanced");
    expect(screen.getByLabelText("Slug")).toBeEnabled();
    expect(screen.getByText(/old public URL will permanently redirect/i)).toBeVisible();
    fireEvent.change(screen.getByLabelText("Slug"), {
      target: { value: "biotic-reset" },
    });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        product: expect.objectContaining({ slug: "biotic-reset" }),
      }),
    );
  });

  it("keeps advanced and commerce controls read only for a catalog editor", () => {
    const { container } = render(<SectionsHarness role="catalog_editor" />);

    toggleDisclosure(container, "section-products");
    toggleDisclosure(container, "group-products-editorial");
    expect(screen.getByLabelText("Display name")).toBeEnabled();
    expect(screen.queryByLabelText("Supplier title")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Price (USD)")).not.toBeInTheDocument();
    toggleDisclosure(container, "section-product_sources");
    toggleDisclosure(container, "group-source-fields");
    expect(screen.getByText("Supplier Cleanser")).toBeVisible();
    expect(screen.getAllByText("$22.00")).toHaveLength(2);
  });

  it("shows append-only Product slug history as read-only system metadata", () => {
    const { container } = render(<SectionsHarness />);

    toggleDisclosure(container, "section-system_metadata");
    toggleDisclosure(container, "group-system-product-slug-routes");
    expect(screen.getByText("reset-01-calming-gel-cleanser")).toBeVisible();
    expect(screen.getByText("rename")).toBeVisible();
    expect(screen.getAllByText("Read only").length).toBeGreaterThan(0);
    expect(
      screen.getByText(/redirect history is append-only/i),
    ).toBeVisible();
  });

  it("reorders media and delegates fixed Core uploads", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onUpload = vi.fn().mockResolvedValue(undefined);
    const { container } = render(
      <SectionsHarness onChange={onChange} onUpload={onUpload} />,
    );

    toggleDisclosure(container, "section-product_media");
    toggleDisclosure(container, "group-media-records");
    fireEvent.click(
      screen.getByRole("button", { name: "Move CLEANSE texture earlier" }),
    );
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        media: [
          expect.objectContaining({ alt: "CLEANSE texture", sort_order: 0 }),
          expect.objectContaining({ alt: "CLEANSE bottle", sort_order: 1 }),
        ],
      }),
    );

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
      expect(onUpload).toHaveBeenCalledWith(
        file,
        {
          alt: "CLEANSE supporting routine editorial",
          replaceRole: true,
          role: "core_routine_editorial",
          sortOrder: 1,
          variantId: null,
        },
      ),
    );
  }, 10_000);

  it("shows ordered outcome associations and their canonical provenance", () => {
    const outcomeDocument = structuredClone(catalogDocument);
    outcomeDocument.media.push(
      ...[1, 2, 3].map((position) => ({
        ...catalogDocument.media[0],
        id: `223e4567-e89b-42d3-a456-42661417400${position}`,
        role: "pdp_outcome" as const,
        sort_order: position,
        source_filename: `cleanse-pdp-outcomes-0${position}.webp`,
        url: `https://erasogmsqpgiirovubjh.supabase.co/storage/v1/object/public/helix-catalog/products/cleanse/outcomes/outcome-${position}.webp`,
        alt: `CLEANSE outcome visual ${position}`,
      })),
    );
    const { container } = render(
      <SectionsHarness initialDocument={outcomeDocument} />,
    );
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

  it("reveals and focuses section validation errors through the full editor", async () => {
    const user = userEvent.setup();
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

    await user.click(screen.getByRole("button", { name: "Validate" }));
    await waitFor(() => {
      expect(
        screen.getByText("SKU must be unique within this product."),
      ).toBeVisible();
    });
    expect(screen.getByRole("alert", { name: "" })).toBeInTheDocument();
    await waitFor(() => {
      expect(disclosure(container, "section-product_variants").open).toBe(true);
      expect(disclosure(container, "group-variant-records").open).toBe(true);
      expect(
        container.querySelector("#product_variants-variant-duplicate-sku"),
      ).toHaveFocus();
    });
  });
});
