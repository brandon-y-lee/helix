import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CartProvider, useCartDrawer } from "@/components/CartProvider";
import { CartView } from "@/components/CartView";
import { useCart, useCartMutations } from "@/components/useCart";
import type { CartState } from "@/lib/cart/types";

const knownCart: CartState = {
  lines: [
    {
      key: "line-1",
      slug: "cleanse-01-calming-gel-cleanser",
      name: "CLEANSE",
      collection: "The Core",
      variantId: "default",
      variantLabel: "200 mL",
      price: 2200,
      swatch: ["#ffffff", "#dddddd"],
      imageUrl: null,
      imageAlt: null,
      placeholderMedia: null,
      quantity: 2,
      available: true,
      warning: null,
      lineSubtotal: 4400,
    },
  ],
  count: 2,
  subtotal: 4400,
  currency: "USD",
};

function response(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );
}

function CartStateProbe() {
  const { count, hasLoadedCart, refresh } = useCart();
  return (
    <>
      <output>{hasLoadedCart ? `known:${count}` : "unknown"}</output>
      <button type="button" onClick={() => void refresh()}>
        Refresh cart
      </button>
    </>
  );
}

function DisabledCartProbe() {
  const {
    add,
  } = useCartMutations();
  const {
    cartDrawerOpen,
    openCartDrawer,
  } = useCartDrawer();
  const { count, hasLoadedCart } = useCart();
  return (
    <>
      <output>
        {hasLoadedCart
          ? `disabled:${count}:${String(cartDrawerOpen)}`
          : "disabled:loading"}
      </output>
      <button
        type="button"
        onClick={() =>
          void add({
            slug: "cleanse-01-calming-gel-cleanser",
            name: "CLEANSE",
            variantId: "variant-1",
            variantLabel: "200 mL",
            price: 2200,
            swatch: ["#ffffff", "#dddddd"],
            imageUrl: null,
            imageAlt: null,
            placeholderMedia: null,
          })
        }
      >
        Add preview item
      </button>
      <button type="button" onClick={() => openCartDrawer()}>
        Open preview cart
      </button>
    </>
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("cart client outage recovery", () => {
  it("preserves a known cart through a retryable 503 and recovers on retry", async () => {
    let cartRequests = 0;
    const fetchMock = vi.fn<typeof fetch>((input) => {
      if (String(input).startsWith("/api/rewards/summary")) {
        return response({ authenticated: false });
      }

      cartRequests += 1;
      if (cartRequests === 2) {
        return response(
          {
            error: {
              code: "CART_SERVICE_UNAVAILABLE",
              message: "Your cart is temporarily unavailable.",
              retryable: true,
            },
          },
          503,
        );
      }
      return response(knownCart);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <CartProvider>
        <CartStateProbe />
        <CartView />
      </CartProvider>,
    );

    expect(await screen.findByText("known:2")).toBeInTheDocument();
    expect(cartRequests).toBe(1);
    fireEvent.click(screen.getByRole("button", { name: "Refresh cart" }));
    expect(
      await screen.findByText("Your cart is temporarily unavailable."),
    ).toBeInTheDocument();
    expect(screen.getByText("known:2")).toBeInTheDocument();
    expect(screen.getByText("CLEANSE")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("known:2")).toBeInTheDocument();
    expect(
      screen.queryByText("Your cart is temporarily unavailable."),
    ).not.toBeInTheDocument();
    expect(cartRequests).toBe(3);
  });

  it("shows a neutral retry state instead of claiming an unknown cart is empty", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(() =>
      response(
        {
          error: {
            code: "CART_SERVICE_UNAVAILABLE",
            message: "Your cart is temporarily unavailable.",
            retryable: true,
          },
        },
        503,
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <CartProvider>
        <CartStateProbe />
        <CartView />
      </CartProvider>,
    );

    expect(
      await screen.findByText("Your cart is temporarily unavailable."),
    ).toBeInTheDocument();
    expect(screen.getByText("unknown")).toBeInTheDocument();
    expect(screen.queryByText("Your cart is empty.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("performs no reads, mutations, or drawer changes when commerce is disabled", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    render(
      <CartProvider disabled>
        <DisabledCartProbe />
      </CartProvider>,
    );

    expect(await screen.findByText("disabled:0:false")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add preview item" }));
    fireEvent.click(screen.getByRole("button", { name: "Open preview cart" }));

    expect(screen.getByText("disabled:0:false")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
