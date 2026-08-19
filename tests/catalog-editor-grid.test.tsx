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
            items: Array<typeof catalogProduct>;
            nextCursor: string;
          },
        ) => void)
      | undefined;
    listProducts.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFirst = resolve;
      }),
    );

    render(<CatalogProductGrid />);
    expect(screen.getByText("helix Admin · Catalog")).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Catalog Editor" }),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Loading helix Catalog" }),
    ).toBeVisible();

    resolveFirst?.({ items: [catalogProduct], nextCursor: "cursor-2" });
    expect(
      await screen.findByRole("link", { name: /CLEANSE/ }),
    ).toHaveAttribute(
      "href",
      `/admin/catalog/products/${catalogProduct.id}`,
    );
    const mediaFallback = screen.getByRole("img", {
      name: "helix Product image unavailable",
    });
    expect(
      mediaFallback.querySelector('[data-helix-identity="symbol"]'),
    ).toHaveAttribute("aria-hidden", "true");
    expect(mediaFallback).not.toHaveTextContent("MEI PELLE");
    expect(screen.getByText("$22.00")).toBeVisible();

    listProducts.mockResolvedValueOnce({
      items: [{ ...catalogProduct, id: "product-seal", displayName: "SEAL" }],
      nextCursor: null,
    });
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("SEAL")).toBeVisible();

    listProducts.mockResolvedValueOnce({ items: [], nextCursor: null });
    fireEvent.change(screen.getByLabelText("Classification"), {
      target: { value: "beyond" },
    });
    await waitFor(() =>
      expect(listProducts).toHaveBeenLastCalledWith(
        expect.objectContaining({ routine: "beyond" }),
        expect.any(AbortSignal),
      ),
    );
    expect(
      await screen.findByRole("heading", {
        name: "No Catalog Products found",
      }),
    ).toBeVisible();
    expect(screen.getByText(/helix Catalog/)).toBeVisible();
  });

  it("submits search terms and offers an honest retry after API failure", async () => {
    listProducts.mockRejectedValueOnce(new Error("Admin backend unavailable"));
    render(<CatalogProductGrid />);

    expect(
      await screen.findByRole("heading", {
        name: "helix Catalog unavailable",
      }),
    ).toBeVisible();
    listProducts.mockResolvedValueOnce({
      items: [catalogProduct],
      nextCursor: null,
    });
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("CLEANSE")).toBeVisible();

    listProducts.mockResolvedValueOnce({
      items: [catalogProduct],
      nextCursor: null,
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
