import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CatalogProductGrid from "@/components/admin/catalog-editor/CatalogProductGrid";
import { catalogEditorApi } from "@/lib/admin/catalog-editor/client";
import { catalogProduct } from "./fixtures/catalog-editor";

vi.mock("@/lib/admin/catalog-editor/client", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/lib/admin/catalog-editor/client")>();
  return {
    ...original,
    catalogEditorApi: {
      ...original.catalogEditorApi,
      listProducts: vi.fn(),
    },
  };
});

const listProducts = vi.mocked(catalogEditorApi.listProducts);

describe("CatalogProductGrid", () => {
  beforeEach(() => {
    listProducts.mockReset();
  });

  it("shows loading, product summaries, editor links, filters, and pagination", async () => {
    let resolveFirst:
      | ((
          value: {
            products: Array<typeof catalogProduct>;
            next_cursor: string;
          },
        ) => void)
      | undefined;
    listProducts.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFirst = resolve;
      }),
    );

    render(<CatalogProductGrid />);
    expect(screen.getByRole("heading", { name: "Loading catalog" })).toBeVisible();

    resolveFirst?.({ products: [catalogProduct], next_cursor: "cursor-2" });
    expect(
      await screen.findByRole("link", { name: /CLEANSE/ }),
    ).toHaveAttribute("href", "/admin/catalog/products/product-cleanse");
    expect(screen.getByText("$22.00")).toBeVisible();

    listProducts.mockResolvedValueOnce({
      products: [{ ...catalogProduct, id: "product-seal", display_name: "SEAL" }],
      next_cursor: null,
    });
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("SEAL")).toBeVisible();

    listProducts.mockResolvedValueOnce({ products: [], next_cursor: null });
    fireEvent.change(screen.getByLabelText("Classification"), {
      target: { value: "beyond" },
    });
    await waitFor(() =>
      expect(listProducts).toHaveBeenLastCalledWith(
        expect.objectContaining({ routine: "beyond" }),
        expect.any(AbortSignal),
      ),
    );
    expect(await screen.findByRole("heading", { name: "No products found" })).toBeVisible();
  });

  it("submits search terms and offers an honest retry after API failure", async () => {
    listProducts.mockRejectedValueOnce(new Error("Admin backend unavailable"));
    render(<CatalogProductGrid />);

    expect(
      await screen.findByRole("heading", { name: "Catalog unavailable" }),
    ).toBeVisible();
    listProducts.mockResolvedValueOnce({
      products: [catalogProduct],
      next_cursor: null,
    });
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("CLEANSE")).toBeVisible();

    listProducts.mockResolvedValueOnce({
      products: [catalogProduct],
      next_cursor: null,
    });
    fireEvent.change(screen.getByLabelText("Search name or slug"), {
      target: { value: " cleanse " },
    });
    fireEvent.submit(screen.getByRole("search"));
    await waitFor(() =>
      expect(listProducts).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: "cleanse" }),
        expect.any(AbortSignal),
      ),
    );
  });
});
