import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const cartMock = vi.hoisted(() => ({
  add: vi.fn(),
  openCartDrawer: vi.fn(),
  cartDrawerOpen: false,
}));

vi.mock("@/components/CartProvider", () => ({
  useCart: () => cartMock,
}));

import { ProductCard } from "@/components/ProductCard";
import { ProductGrid } from "@/components/ProductGrid";
import type { Product, Variant } from "@/lib/products";

function makeVariant(overrides: Partial<Variant> = {}): Variant {
  return {
    id: "50ml",
    label: "50 ml",
    price: 2000,
    compareAtPrice: null,
    sku: null,
    available: true,
    inventoryStatus: "in_stock",
    volume: "50 ml",
    packCount: null,
    optionValues: { size: "50 ml" },
    sortOrder: 0,
    ...overrides,
  };
}

function makeProduct(overrides: Partial<Product> = {}): Product {
  const displayName = overrides.displayName ?? "RESET";
  const base: Product = {
    id: "11111111-1111-4111-8111-111111111111",
    slug: "reset-01-calming-gel-cleanser",
    displayName,
    formalTitle: `${displayName} 01 Calming Gel Cleanser`,
    name: displayName,
    tagline: "Fresh, balanced skin",
    cardTagline: "Fresh, balanced skin",
    collection: "The System",
    actionName: null,
    routineNumber: "01",
    subtitle: "Fresh, balanced skin",
    descriptor: "A short descriptor.",
    productType: "Gel cleanser",
    badge: null,
    currency: "USD",
    featuredRank: 0,
    sortOrder: 0,
    blurb: "A short descriptor.",
    description: "Description.",
    editorialDescription: "Description.",
    benefits: [],
    howToUse: "",
    editorialHowToUse: "",
    formulaNotes: [],
    variants: [makeVariant()],
    swatch: ["#f8f4ec", "#b4aea2"],
    media: [],
    cardMedia: null,
    cardHoverMedia: null,
    heroMedia: null,
    detailMedia: null,
    cartMedia: null,
    searchMedia: null,
    status: "available",
    catalogStatus: "active",
    madeFor: "All skin types",
    goodFor: "Everyday",
    texture: "Light gel",
    keyIngredients: [],
    ingredients: null,
    productDetails: {},
    cautions: [],
    finish: null,
    volume: "50 ml",
    skinTypes: [],
    concerns: [],
    routineStep: "Cleanse",
    routineOrder: 1,
    usageTime: ["AM", "PM"],
    seoTitle: null,
    seoDescription: null,
    searchKeywords: [],
    createdAt: "2026-06-14T00:00:00.000Z",
  };
  return { ...base, ...overrides };
}

beforeEach(() => {
  cartMock.add.mockReset();
  cartMock.add.mockResolvedValue(true);
  cartMock.openCartDrawer.mockReset();
  cartMock.cartDrawerOpen = false;
});

describe("ProductCard quick buy", () => {
  it("opens the inline panel without adding to cart", async () => {
    const user = userEvent.setup();
    render(<ProductCard product={makeProduct()} />);

    await user.click(
      screen.getByRole("button", { name: "Open quick buy for RESET" }),
    );
    fireEvent.mouseLeave(screen.getByRole("listitem"));

    expect(cartMock.add).not.toHaveBeenCalled();
    expect(cartMock.openCartDrawer).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", {
        name: "Buy RESET 50 ml for $20.00",
      }),
    ).toBeInTheDocument();
  });

  it("adds from the final buy button and opens the cart drawer", async () => {
    const user = userEvent.setup();
    render(<ProductCard product={makeProduct()} />);

    await user.click(
      screen.getByRole("button", { name: "Open quick buy for RESET" }),
    );
    const finalButton = screen.getByRole("button", {
      name: "Buy RESET 50 ml for $20.00",
    });
    await user.click(finalButton);

    await waitFor(() => expect(cartMock.add).toHaveBeenCalledTimes(1));
    expect(cartMock.add).toHaveBeenCalledWith({
      slug: "reset-01-calming-gel-cleanser",
      name: "RESET",
      variantId: "50ml",
      variantLabel: "50 ml",
      price: 2000,
      swatch: ["#f8f4ec", "#b4aea2"],
      imageUrl: null,
      imageAlt: null,
      placeholderMedia: null,
    });
    expect(cartMock.openCartDrawer).toHaveBeenCalledTimes(1);

    finalButton.blur();
    cartMock.openCartDrawer.mock.calls[0][0]();
    expect(finalButton).toHaveFocus();
  });

  it("collapses from the minus button and returns focus to the trigger", async () => {
    const user = userEvent.setup();
    render(<ProductCard product={makeProduct()} />);

    const trigger = screen.getByRole("button", {
      name: "Open quick buy for RESET",
    });
    await user.click(trigger);
    await user.click(
      screen.getByRole("button", { name: "Close quick buy for RESET" }),
    );

    await waitFor(() => expect(trigger).toHaveFocus());
    expect(
      screen.queryByRole("button", {
        name: "Buy RESET 50 ml for $20.00",
      }),
    ).not.toBeInTheDocument();
  });

  it("uses Escape for inline close unless the cart drawer is already open", async () => {
    const user = userEvent.setup();
    const product = makeProduct();
    const { unmount } = render(<ProductCard product={product} />);

    await user.click(
      screen.getByRole("button", { name: "Open quick buy for RESET" }),
    );
    await user.keyboard("{Escape}");

    await waitFor(() =>
      expect(
        screen.queryByRole("button", {
          name: "Buy RESET 50 ml for $20.00",
        }),
      ).not.toBeInTheDocument(),
    );

    unmount();
    cartMock.cartDrawerOpen = true;
    render(<ProductCard product={product} />);
    await user.click(
      screen.getByRole("button", { name: "Open quick buy for RESET" }),
    );
    await user.keyboard("{Escape}");

    expect(
      screen.getByRole("button", {
        name: "Buy RESET 50 ml for $20.00",
      }),
    ).toBeInTheDocument();
  });

  it("lets shoppers choose a variant before the final buy", async () => {
    const user = userEvent.setup();
    render(
      <ProductCard
        product={makeProduct({
          variants: [
            makeVariant(),
            makeVariant({
              id: "100ml",
              label: "100 ml",
              price: 3200,
              volume: "100 ml",
              optionValues: { size: "100 ml" },
              sortOrder: 1,
            }),
          ],
        })}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Open quick buy for RESET" }),
    );
    await user.click(screen.getByRole("radio", { name: "100 ml $32.00" }));
    await user.click(
      screen.getByRole("button", {
        name: "Buy RESET 100 ml for $32.00",
      }),
    );

    await waitFor(() => expect(cartMock.add).toHaveBeenCalledTimes(1));
    expect(cartMock.add.mock.calls[0][0]).toMatchObject({
      variantId: "100ml",
      variantLabel: "100 ml",
      price: 3200,
    });
  });

  it("keeps the inline panel open when add fails", async () => {
    const user = userEvent.setup();
    cartMock.add.mockResolvedValue(false);
    render(<ProductCard product={makeProduct()} />);

    await user.click(
      screen.getByRole("button", { name: "Open quick buy for RESET" }),
    );
    await user.click(
      screen.getByRole("button", {
        name: "Buy RESET 50 ml for $20.00",
      }),
    );

    expect(await screen.findByText("Cart is temporarily unavailable.")).toBeInTheDocument();
    expect(cartMock.openCartDrawer).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", {
        name: "Buy RESET 50 ml for $20.00",
      }),
    ).toBeInTheDocument();
  });
});

describe("ProductGrid quick buy coordination", () => {
  it("keeps only one product panel open", async () => {
    const user = userEvent.setup();
    render(
      <ProductGrid
        products={[
          makeProduct(),
          makeProduct({
            id: "22222222-2222-4222-8222-222222222222",
            slug: "lift-02-daily-face-cream",
            displayName: "LIFT",
            formalTitle: "LIFT 02 Daily Face Cream",
            name: "LIFT",
          }),
        ]}
      />,
    );

    const cards = screen.getAllByRole("listitem");
    await user.click(
      within(cards[0]).getByRole("button", {
        name: "Open quick buy for RESET",
      }),
    );
    expect(
      within(cards[0]).getByRole("button", {
        name: "Buy RESET 50 ml for $20.00",
      }),
    ).toBeInTheDocument();

    await user.click(
      within(cards[1]).getByRole("button", {
        name: "Open quick buy for LIFT",
      }),
    );

    expect(
      within(cards[0]).queryByRole("button", {
        name: "Buy RESET 50 ml for $20.00",
      }),
    ).not.toBeInTheDocument();
    expect(
      within(cards[1]).getByRole("button", {
        name: "Buy LIFT 50 ml for $20.00",
      }),
    ).toBeInTheDocument();
  });
});
