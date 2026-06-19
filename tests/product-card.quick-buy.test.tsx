import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act } from "react";
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
  function cardSurface() {
    const surface = screen
      .getByRole("listitem")
      .querySelector<HTMLElement>(".product-card__surface");
    if (!surface) throw new Error("Product card surface not found");
    return surface;
  }

  it("opens the inline panel without adding to cart", async () => {
    const user = userEvent.setup();
    render(<ProductCard product={makeProduct()} />);

    await user.click(
      screen.getByRole("button", { name: "Open quick buy for RESET" }),
    );
    fireEvent.mouseLeave(screen.getByRole("listitem"));

    expect(cartMock.add).not.toHaveBeenCalled();
    expect(cartMock.openCartDrawer).not.toHaveBeenCalled();
    expect(cardSurface()).toHaveAttribute("data-visual-state", "quick-buy");
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
    act(() => cartMock.openCartDrawer.mock.calls[0][0]());
    expect(finalButton).toHaveFocus();
  });

  it("derives preview from live pointer state after pointer close", async () => {
    const user = userEvent.setup();
    render(<ProductCard product={makeProduct()} />);

    const surface = cardSurface();
    const trigger = screen.getByRole("button", {
      name: "Open quick buy for RESET",
    });
    fireEvent.pointerEnter(surface, { pointerType: "mouse" });
    expect(surface).toHaveAttribute("data-visual-state", "preview");

    await user.click(trigger);
    expect(surface).toHaveAttribute("data-visual-state", "quick-buy");
    await user.click(
      screen.getByRole("button", { name: "Close quick buy for RESET" }),
    );

    await waitFor(() => expect(trigger).toHaveFocus());
    expect(surface).toHaveAttribute("data-visual-state", "preview");
    expect(
      screen.queryByRole("button", {
        name: "Buy RESET 50 ml for $20.00",
      }),
    ).not.toBeInTheDocument();

    fireEvent.pointerLeave(surface, { pointerType: "mouse" });
    expect(surface).toHaveAttribute("data-visual-state", "default");
  });

  it("clears pointer preview when document movement shows the pointer left", async () => {
    render(<ProductCard product={makeProduct()} />);

    const surface = cardSurface();
    Object.defineProperty(surface, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        x: 100,
        y: 100,
        top: 100,
        right: 500,
        bottom: 500,
        left: 100,
        width: 400,
        height: 400,
        toJSON: () => ({}),
      }),
    });

    fireEvent.pointerEnter(surface, { pointerType: "mouse" });
    await waitFor(() =>
      expect(surface).toHaveAttribute("data-visual-state", "preview"),
    );

    fireEvent.pointerMove(window, {
      pointerType: "mouse",
      clientX: 10,
      clientY: 10,
    });

    expect(surface).toHaveAttribute("data-visual-state", "default");
  });

  it("keeps focus-equivalent preview after keyboard close until focus leaves", async () => {
    const user = userEvent.setup();
    render(
      <>
        <ProductCard product={makeProduct()} />
        <button type="button">After card</button>
      </>,
    );

    const surface = cardSurface();
    const trigger = screen.getByRole("button", {
      name: "Open quick buy for RESET",
    });

    act(() => {
      fireEvent.keyDown(window, { key: "Tab" });
      trigger.focus();
      fireEvent.focusIn(trigger);
    });
    expect(surface).toHaveAttribute("data-visual-state", "preview");

    await user.keyboard("{Enter}");
    expect(surface).toHaveAttribute("data-visual-state", "quick-buy");
    await user.keyboard("{Escape}");

    await waitFor(() => expect(trigger).toHaveFocus());
    expect(surface).toHaveAttribute("data-visual-state", "preview");

    await user.tab();
    expect(screen.getByRole("button", { name: "After card" })).toHaveFocus();
    expect(surface).toHaveAttribute("data-visual-state", "default");
  });

  it("does not pin desktop preview after touch close", async () => {
    render(<ProductCard product={makeProduct()} />);

    const surface = cardSurface();
    const trigger = screen.getByRole("button", {
      name: "Open quick buy for RESET",
    });

    fireEvent.pointerDown(surface, { pointerType: "touch" });
    fireEvent.click(trigger);
    expect(surface).toHaveAttribute("data-visual-state", "quick-buy");

    const close = screen.getByRole("button", {
      name: "Close quick buy for RESET",
    });
    fireEvent.touchStart(close);
    fireEvent.click(close);

    expect(surface).toHaveAttribute("data-visual-state", "default");
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
