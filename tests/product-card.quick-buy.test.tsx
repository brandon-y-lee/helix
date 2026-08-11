import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const cartMock = vi.hoisted(() => ({
  add: vi.fn(),
  openCartDrawer: vi.fn(),
  cartDrawerOpen: false,
  resetErrors: vi.fn(),
}));

vi.mock("@/components/cart/CartProvider", () => ({
  useCartDrawer: () => cartMock,
}));
vi.mock("@/components/cart/useCart", async () => {
  const { useState } = await import("react");
  return {
    useCartMutations: () => {
      const [addError, setAddError] = useState<Error | null>(null);
      const [addPending, setAddPending] = useState(false);
      return {
        add: async (...args: Parameters<typeof cartMock.add>) => {
          setAddError(null);
          setAddPending(true);
          const added = await cartMock.add(...args);
          if (!added) {
            setAddError(new Error(
              "Cart is temporarily unavailable. Try again in a moment.",
            ));
          }
          setAddPending(false);
          return added;
        },
        addError,
        addPending,
        isAdding: () => addPending,
        resetErrors: () => {
          cartMock.resetErrors();
          setAddError(null);
        },
      };
    },
  };
});

import { ProductCard } from "@/components/product/ProductCard";
import { ProductGrid } from "@/components/product/ProductGrid";
import type {
  OfferAvailability,
  ProductCard as ProductCardModel,
} from "@/lib/catalog/models";
import type { Variant } from "@/lib/products";

function makeVariant(overrides: Partial<Variant> = {}): OfferAvailability {
  const variant: Variant = {
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
  return {
    productId: "11111111-1111-4111-8111-111111111111",
    productSlug: "cleanse-01-calming-gel-cleanser",
    productStatus: "available",
    id: variant.id,
    label: variant.label,
    price: variant.price,
    available: variant.available,
    inventoryStatus: variant.inventoryStatus,
    volume: variant.volume,
    packCount: variant.packCount,
    sortOrder: variant.sortOrder,
  };
}

function makeProduct(
  overrides: Partial<ProductCardModel> = {},
): ProductCardModel {
  const displayName = overrides.displayName ?? "CLEANSE";
  const base: ProductCardModel = {
    id: "11111111-1111-4111-8111-111111111111",
    slug: "cleanse-01-calming-gel-cleanser",
    displayName,
    routineGroup: "core",
    systemStepName: "CLEANSE",
    systemStepPosition: 1,
    routineSort: 10,
    productType: "Gel cleanser",
    sortOrder: 0,
    variants: [makeVariant()],
    swatch: ["#f8f4ec", "#b4aea2"],
    cardMedia: null,
    cardHoverMedia: null,
    cartMedia: null,
    status: "available",
    volume: "50 ml",
    usageTime: ["AM", "PM"],
    createdAt: "2026-06-14T00:00:00.000Z",
  };
  return { ...base, ...overrides };
}

beforeEach(() => {
  cartMock.add.mockReset();
  cartMock.add.mockResolvedValue(true);
  cartMock.openCartDrawer.mockReset();
  cartMock.resetErrors.mockReset();
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

  it("shows waitlist Products without a price or purchase affordance", () => {
    render(
      <ProductCard
        product={makeProduct({ status: "waitlist", variants: [] })}
      />,
    );

    expect(screen.getByText("Waitlist")).toBeInTheDocument();
    expect(screen.queryByText("$0.00")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "CLEANSE" })).toHaveAttribute(
      "href",
      "/products/cleanse-01-calming-gel-cleanser",
    );
  });

  it("fails closed when stale waitlist card data still contains an Offer", () => {
    render(<ProductCard product={makeProduct({ status: "waitlist" })} />);

    expect(screen.getByText("Waitlist")).toBeInTheDocument();
    expect(screen.queryByText("$20.00")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("opens the inline panel without adding to cart", async () => {
    const user = userEvent.setup();
    render(<ProductCard product={makeProduct()} />);

    const trigger = screen.getByRole("button", {
      name: "Open quick buy for CLEANSE",
    });
    expect(trigger).toHaveTextContent("BUY CLEANSE - $20.00");
    await user.click(trigger);
    fireEvent.mouseLeave(screen.getByRole("listitem"));

    expect(cartMock.add).not.toHaveBeenCalled();
    expect(cartMock.openCartDrawer).not.toHaveBeenCalled();
    expect(cardSurface()).toHaveAttribute("data-visual-state", "quick-buy");
    expect(
      screen.getByRole("button", {
      name: "BUY CLEANSE - $20.00",
    }),
    ).toBeInTheDocument();
  });

  it("fails closed with standardized out-of-stock card controls", () => {
    const product = makeProduct({
      variants: [
        makeVariant({
          available: true,
          inventoryStatus: "out_of_stock",
        }),
      ],
    });
    const { rerender } = render(<ProductCard product={product} />);
    const trigger = screen.getByRole("button", { name: "OUT OF STOCK" });

    expect(trigger).toHaveTextContent("OUT OF STOCK");
    expect(trigger).toBeDisabled();
    fireEvent.click(trigger);
    expect(cartMock.add).not.toHaveBeenCalled();
    expect(cartMock.openCartDrawer).not.toHaveBeenCalled();

    rerender(<ProductCard product={product} quickBuyOpen />);
    const final = document.querySelector<HTMLButtonElement>(
      "[data-product-card-buy]",
    );
    expect(final).toHaveTextContent("OUT OF STOCK");
    expect(final).toBeDisabled();
    fireEvent.click(final as HTMLButtonElement);
    expect(cartMock.add).not.toHaveBeenCalled();
    expect(cartMock.openCartDrawer).not.toHaveBeenCalled();
  });

  it("omits fabricated pricing when a coming-soon Product has no Offer", () => {
    render(
      <ProductCard
        product={makeProduct({
          displayName: "Peptide Eye Cream",
          productType: "PDRN eye cream",
          status: "coming_soon",
          variants: [],
        })}
      />,
    );

    const status = screen.getByRole("button", { name: "COMING SOON" });
    expect(status).toBeDisabled();
    expect(screen.queryByText("$0.00")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "OUT OF STOCK" })).toBeNull();
  });

  it("labels coming-soon Products truthfully without presenting a price", () => {
    render(
      <ProductCard
        product={makeProduct({
          displayName: "Biotic Reset",
          status: "coming_soon",
          variants: [
            makeVariant({
              available: false,
              inventoryStatus: "unavailable",
            }),
          ],
        })}
      />,
    );

    expect(screen.getByRole("button", { name: "COMING SOON" })).toBeDisabled();
    expect(screen.queryByText("$20.00")).not.toBeInTheDocument();
    expect(cartMock.add).not.toHaveBeenCalled();
  });

  it("withholds Offer presentation when inventory evidence is unavailable", () => {
    render(
      <ProductCard
        product={makeProduct({
          status: "available",
          variants: [
            makeVariant({
              available: false,
              inventoryStatus: "unavailable",
            }),
          ],
        })}
      />,
    );

    expect(screen.getByRole("button", { name: "OUT OF STOCK" })).toBeDisabled();
    expect(screen.queryByText("$20.00")).not.toBeInTheDocument();
  });

  it("adds from the final buy button and opens the cart drawer", async () => {
    const user = userEvent.setup();
    render(<ProductCard product={makeProduct()} />);

    const trigger = screen.getByRole("button", {
      name: "Open quick buy for CLEANSE",
    });
    await user.click(trigger);
    const finalButton = screen.getByRole("button", {
      name: "BUY CLEANSE - $20.00",
    });
    expect(finalButton).toHaveTextContent("BUY CLEANSE - $20.00");
    expect(finalButton).not.toHaveTextContent(/[–—]/);
    await user.click(finalButton);

    await waitFor(() => expect(cartMock.add).toHaveBeenCalledTimes(1));
    expect(cartMock.add).toHaveBeenCalledWith({
      slug: "cleanse-01-calming-gel-cleanser",
      name: "CLEANSE",
      variantId: "50ml",
      variantLabel: "50 ml",
      price: 2000,
      swatch: ["#f8f4ec", "#b4aea2"],
      imageUrl: null,
      imageAlt: null,
      placeholderMedia: null,
    });
    expect(cartMock.openCartDrawer).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole("button", { name: "BUY CLEANSE - $20.00" }),
    ).toBeNull();

    trigger.blur();
    act(() => cartMock.openCartDrawer.mock.calls[0][0]());
    expect(trigger).toHaveFocus();
  });

  it("derives preview from live pointer state after pointer close", async () => {
    const user = userEvent.setup();
    render(<ProductCard product={makeProduct()} />);

    const surface = cardSurface();
    const trigger = screen.getByRole("button", {
      name: "Open quick buy for CLEANSE",
    });
    fireEvent.pointerEnter(surface, { pointerType: "mouse" });
    expect(surface).toHaveAttribute("data-visual-state", "preview");

    await user.click(trigger);
    expect(surface).toHaveAttribute("data-visual-state", "quick-buy");
    await user.click(
      screen.getByRole("button", { name: "Close quick buy for CLEANSE" }),
    );

    await waitFor(() => expect(trigger).toHaveFocus());
    expect(surface).toHaveAttribute("data-visual-state", "preview");
    expect(
      screen.queryByRole("button", {
        name: "BUY CLEANSE - $20.00",
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
    const productLink = screen.getByRole("link", { name: "CLEANSE" });
    const trigger = screen.getByRole("button", {
      name: "Open quick buy for CLEANSE",
    });

    expect(trigger).toHaveAttribute("tabindex", "-1");
    act(() => {
      fireEvent.keyDown(window, { key: "Tab" });
      productLink.focus();
      fireEvent.focusIn(productLink);
    });
    expect(surface).toHaveAttribute("data-visual-state", "preview");
    expect(trigger).not.toHaveAttribute("tabindex");

    act(() => {
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
      name: "Open quick buy for CLEANSE",
    });

    fireEvent.pointerDown(surface, { pointerType: "touch" });
    fireEvent.click(trigger);
    expect(surface).toHaveAttribute("data-visual-state", "quick-buy");

    const close = screen.getByRole("button", {
      name: "Close quick buy for CLEANSE",
    });
    close.focus();
    fireEvent.touchStart(close);
    fireEvent.click(close);

    expect(surface).toHaveAttribute("data-visual-state", "default");
    expect(close).not.toHaveFocus();
    expect(trigger).not.toHaveFocus();
  });

  it("restores the viewport captured before a touch close changes focus", () => {
    let scrollX = 0;
    let scrollY = 472;
    const scrollXSpy = vi.spyOn(window, "scrollX", "get").mockImplementation(
      () => scrollX,
    );
    const scrollYSpy = vi.spyOn(window, "scrollY", "get").mockImplementation(
      () => scrollY,
    );
    const scrollToSpy = vi.spyOn(window, "scrollTo").mockImplementation((x, y) => {
      scrollX = Number(x);
      scrollY = Number(y);
    });
    const animationFrameSpy = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) => {
        callback(0);
        return 1;
      });

    try {
      render(<ProductCard product={makeProduct()} />);
      const surface = cardSurface();
      fireEvent.pointerDown(surface, { pointerType: "touch" });
      fireEvent.click(
        screen.getByRole("button", { name: "Open quick buy for CLEANSE" }),
      );
      const close = screen.getByRole("button", {
        name: "Close quick buy for CLEANSE",
      });

      scrollY = 472;
      scrollToSpy.mockClear();
      fireEvent.touchStart(close);
      scrollY = 129;
      fireEvent.click(close);

      expect(scrollToSpy).toHaveBeenCalledWith(0, 472);
      expect(scrollY).toBe(472);
    } finally {
      animationFrameSpy.mockRestore();
      scrollToSpy.mockRestore();
      scrollYSpy.mockRestore();
      scrollXSpy.mockRestore();
    }
  });

  it("restores keyboard focus after an earlier touch close", async () => {
    render(<ProductCard product={makeProduct()} />);

    const trigger = screen.getByRole("button", {
      name: "Open quick buy for CLEANSE",
    });
    fireEvent.pointerDown(trigger, { pointerType: "touch" });
    fireEvent.click(trigger);
    const touchClose = screen.getByRole("button", {
      name: "Close quick buy for CLEANSE",
    });
    fireEvent.touchStart(touchClose);
    fireEvent.click(touchClose);

    act(() => {
      fireEvent.keyDown(window, { key: "Tab" });
      trigger.focus();
      fireEvent.focusIn(trigger);
    });
    fireEvent.click(trigger);
    const keyboardClose = screen.getByRole("button", {
      name: "Close quick buy for CLEANSE",
    });
    act(() => keyboardClose.focus());
    fireEvent.click(keyboardClose);

    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("restores keyboard focus after a canceled touch close", async () => {
    render(<ProductCard product={makeProduct()} />);

    const trigger = screen.getByRole("button", {
      name: "Open quick buy for CLEANSE",
    });
    fireEvent.click(trigger);
    const close = screen.getByRole("button", {
      name: "Close quick buy for CLEANSE",
    });
    fireEvent.touchStart(close);
    act(() => {
      fireEvent.keyDown(window, { key: "Tab" });
      close.focus();
      fireEvent.focusIn(close);
    });
    fireEvent.click(close);

    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("uses Escape to close the inline panel", async () => {
    const user = userEvent.setup();
    render(<ProductCard product={makeProduct()} />);

    await user.click(
      screen.getByRole("button", { name: "Open quick buy for CLEANSE" }),
    );
    await user.keyboard("{Escape}");

    await waitFor(() =>
      expect(
        screen.queryByRole("button", {
          name: "BUY CLEANSE - $20.00",
        }),
      ).not.toBeInTheDocument(),
    );
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
      screen.getByRole("button", { name: "Open quick buy for CLEANSE" }),
    );
    const details = document.querySelector(".product-card__quick-details");
    const fullDetails = screen.getByRole("link", { name: "Full details" });
    const variants = screen.getByRole("group", { name: "Size" });
    const finalBuy = screen.getByRole("button", {
      name: "BUY CLEANSE - $20.00",
    });
    expect(
      details?.compareDocumentPosition(fullDetails) ?? 0,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(fullDetails.compareDocumentPosition(variants)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(variants.compareDocumentPosition(finalBuy)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    await user.click(screen.getByRole("radio", { name: "100 ml $32.00" }));
    await user.click(
      screen.getByRole("button", {
        name: "BUY CLEANSE - $32.00",
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
      screen.getByRole("button", { name: "Open quick buy for CLEANSE" }),
    );
    await user.click(
      screen.getByRole("button", {
        name: "BUY CLEANSE - $20.00",
      }),
    );

    expect(
      await screen.findByText(
        "Cart is temporarily unavailable. Try again in a moment.",
      ),
    ).toBeInTheDocument();
    expect(cartMock.openCartDrawer).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", {
        name: "BUY CLEANSE - $20.00",
      }),
    ).toBeInTheDocument();
  });

  it("guards a pending purchase against duplicate activation", async () => {
    let resolveAdd: ((value: boolean) => void) | undefined;
    cartMock.add.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          resolveAdd = resolve;
        }),
    );
    render(<ProductCard product={makeProduct()} />);

    fireEvent.click(
      screen.getByRole("button", { name: "Open quick buy for CLEANSE" }),
    );
    const finalButton = screen.getByRole("button", {
      name: "BUY CLEANSE - $20.00",
    });
    fireEvent.click(finalButton);
    fireEvent.click(finalButton);

    expect(cartMock.add).toHaveBeenCalledTimes(1);
    expect(finalButton).toBeDisabled();

    await act(async () => {
      resolveAdd?.(true);
    });

    await waitFor(() =>
      expect(cartMock.openCartDrawer).toHaveBeenCalledTimes(1),
    );
  });
});

describe("ProductGrid quick buy coordination", () => {
  it("keeps one product panel open and clears it when the cart opens", async () => {
    const user = userEvent.setup();
    const products = [
      makeProduct(),
      makeProduct({
        id: "22222222-2222-4222-8222-222222222222",
        slug: "lift-02-daily-face-cream",
        displayName: "LIFT",
      }),
    ];
    const view = render(<ProductGrid products={products} />);

    const cards = screen.getAllByRole("listitem");
    await user.click(
      within(cards[0]).getByRole("button", {
        name: "Open quick buy for CLEANSE",
      }),
    );
    expect(
      within(cards[0]).getByRole("button", {
        name: "BUY CLEANSE - $20.00",
      }),
    ).toBeInTheDocument();

    await user.click(
      within(cards[1]).getByRole("button", {
        name: "Open quick buy for LIFT",
      }),
    );

    expect(
      within(cards[0]).queryByRole("button", {
        name: "BUY CLEANSE - $20.00",
      }),
    ).not.toBeInTheDocument();
    expect(
      within(cards[1]).getByRole("button", {
        name: "BUY LIFT - $20.00",
      }),
    ).toBeInTheDocument();

    cartMock.cartDrawerOpen = true;
    view.rerender(<ProductGrid products={products} />);
    expect(
      within(cards[1]).queryByRole("button", {
        name: "BUY LIFT - $20.00",
      }),
    ).toBeNull();

    cartMock.cartDrawerOpen = false;
    view.rerender(<ProductGrid products={products} />);
    expect(
      within(cards[1]).queryByRole("button", {
        name: "BUY LIFT - $20.00",
      }),
    ).toBeNull();
  });
});
