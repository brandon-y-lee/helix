import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CartProvider, useCartDrawer } from "@/components/cart/CartProvider";
import { useCart, useCartMutations } from "@/components/cart/useCart";
import { useProductPurchase } from "@/components/cart/useProductPurchase";
import { CART_IDENTITY_CHANGED_COOKIE } from "@/lib/cart/sync";
import type { CartAddInput, CartState } from "@/lib/cart/types";

const routeState = vi.hoisted(() => ({ pathname: "/products" }));

vi.mock("next/navigation", () => ({
  usePathname: () => routeState.pathname,
}));

const item: CartAddInput = {
  slug: "cleanse-01-calming-gel-cleanser",
  name: "CLEANSE",
  variantId: "200ml",
  variantLabel: "200 mL",
  price: 2200,
  swatch: ["#ffffff", "#dddddd"],
  imageUrl: null,
  imageAlt: null,
  placeholderMedia: null,
};

function cart(quantity: number): CartState {
  return {
    lines: quantity > 0
      ? [{
          ...item,
          key: "line-1",
          collection: "The Core",
          quantity,
          available: true,
          warning: null,
          lineSubtotal: 2200 * quantity,
        }]
      : [],
    count: quantity,
    subtotal: 2200 * quantity,
    currency: "USD",
  };
}

function response(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  }));
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function PurchaseProbe() {
  const { cartDrawerOpen } = useCartDrawer();
  const { count } = useCart();
  const { error, pending, purchase } = useProductPurchase();
  return (
    <>
      <output>{`drawer:${String(cartDrawerOpen)}`}</output>
      <output>{`count:${count}`}</output>
      <button
        type="button"
        disabled={pending}
        onClick={() => void purchase({ item })}
      >
        Add CLEANSE
      </button>
      <p role="status">{error}</p>
    </>
  );
}

function MutationProbe() {
  const currentCart = useCart();
  const mutations = useCartMutations();
  const quantity = currentCart.lines[0]?.quantity ?? 0;
  return (
    <>
      <output>{`quantity:${quantity}`}</output>
      <output>{`count:${currentCart.count}`}</output>
      <button
        type="button"
        onClick={() => {
          void mutations.setQuantity("line-1", 2);
          void mutations.setQuantity("line-1", 3);
        }}
      >
        Queue quantities
      </button>
      <button type="button" onClick={() => void mutations.remove("line-1")}>
        Remove CLEANSE
      </button>
      <p role="status">{mutations.error}</p>
    </>
  );
}

beforeEach(() => {
  routeState.pathname = "/products";
  document.cookie = `${CART_IDENTITY_CHANGED_COOKIE}=; Max-Age=0; Path=/`;
  vi.unstubAllGlobals();
});

describe("TanStack cart state", () => {
  it("opens the drawer only after an authoritative add and stays closed on failure", async () => {
    const addResponse = deferred<Response>();
    let addShouldFail = false;
    const fetchMock = vi.fn<typeof fetch>((input, init) => {
      if (String(input) === "/api/cart" && !init?.method) return response(cart(0));
      if (String(input) === "/api/cart/items" && init?.method === "POST") {
        return addShouldFail
          ? response({ error: "CLEANSE is unavailable." }, 400)
          : addResponse.promise;
      }
      throw new Error(`Unexpected request: ${String(input)}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const view = render(
      <CartProvider>
        <PurchaseProbe />
      </CartProvider>,
    );
    expect(await screen.findByText("drawer:false")).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "Add CLEANSE" }));
    expect(screen.getByText("drawer:false")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Add CLEANSE" })).toBeDisabled(),
    );

    await act(async () => addResponse.resolve(await response(cart(1))));
    expect(await screen.findByText("drawer:true")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    view.unmount();
    addShouldFail = true;
    render(
      <CartProvider>
        <PurchaseProbe />
      </CartProvider>,
    );
    await screen.findByText("drawer:false");
    fireEvent.click(screen.getByRole("button", { name: "Add CLEANSE" }));
    expect(await screen.findByText("CLEANSE is unavailable.")).toBeInTheDocument();
    expect(screen.getByText("drawer:false")).toBeInTheDocument();
  });

  it("serializes rapid quantity intents and finishes with the latest authoritative cart", async () => {
    const first = deferred<Response>();
    const second = deferred<Response>();
    const quantities: number[] = [];
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      if (String(input) === "/api/cart" && !init?.method) return response(cart(1));
      if (String(input) === "/api/cart/items" && init?.method === "PATCH") {
        const body = JSON.parse(String(init.body)) as { quantity: number };
        quantities.push(body.quantity);
        return quantities.length === 1 ? first.promise : second.promise;
      }
      throw new Error(`Unexpected request: ${String(input)}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <CartProvider>
        <MutationProbe />
      </CartProvider>,
    );
    expect(await screen.findByText("quantity:1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Queue quantities" }));

    await waitFor(() => expect(quantities).toEqual([2]));
    await act(async () => first.resolve(await response(cart(2))));
    await waitFor(() => expect(quantities).toEqual([2, 3]));
    await act(async () => second.resolve(await response(cart(3))));

    expect(await screen.findByText("quantity:3")).toBeInTheDocument();
    expect(screen.getByText("count:3")).toBeInTheDocument();
  });

  it("does not restore a stale optimistic snapshot when queued writes both fail", async () => {
    const first = deferred<Response>();
    const second = deferred<Response>();
    const quantities: number[] = [];
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      if (String(input) === "/api/cart" && !init?.method) return response(cart(1));
      if (String(input) === "/api/cart/items" && init?.method === "PATCH") {
        const body = JSON.parse(String(init.body)) as { quantity: number };
        quantities.push(body.quantity);
        return quantities.length === 1 ? first.promise : second.promise;
      }
      throw new Error(`Unexpected request: ${String(input)}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <CartProvider>
        <MutationProbe />
      </CartProvider>,
    );
    expect(await screen.findByText("quantity:1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Queue quantities" }));

    await waitFor(() => expect(quantities).toEqual([2]));
    await act(async () => first.resolve(await response(
      { error: "First update failed." },
      400,
    )));
    await waitFor(() => expect(quantities).toEqual([2, 3]));
    await act(async () => second.resolve(await response(
      { error: "Second update failed." },
      400,
    )));

    expect(await screen.findByText("quantity:1")).toBeInTheDocument();
    expect(screen.getByText("count:1")).toBeInTheDocument();
    expect(screen.getByText("Second update failed.")).toBeInTheDocument();
  });

  it("rolls back a confirmed remove but rereads after an ambiguous outcome", async () => {
    const removeResponse = deferred<Response>();
    let getRequests = 0;
    let ambiguous = false;
    const fetchMock = vi.fn<typeof fetch>((input, init) => {
      if (String(input) === "/api/cart" && !init?.method) {
        getRequests += 1;
        return response(cart(1));
      }
      if (String(input) === "/api/cart/items" && init?.method === "DELETE") {
        return ambiguous
          ? Promise.reject(new TypeError("connection closed"))
          : removeResponse.promise;
      }
      throw new Error(`Unexpected request: ${String(input)}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const firstView = render(
      <CartProvider>
        <MutationProbe />
      </CartProvider>,
    );
    await screen.findByText("quantity:1");
    fireEvent.click(screen.getByRole("button", { name: "Remove CLEANSE" }));
    expect(await screen.findByText("quantity:0")).toBeInTheDocument();
    await act(async () => removeResponse.resolve(await response(
      { error: "Line could not be removed." },
      400,
    )));
    expect(await screen.findByText("quantity:1")).toBeInTheDocument();
    expect(screen.getByText("Line could not be removed.")).toBeInTheDocument();
    expect(getRequests).toBe(1);

    firstView.unmount();
    ambiguous = true;
    getRequests = 0;
    render(
      <CartProvider>
        <MutationProbe />
      </CartProvider>,
    );
    await screen.findByText("quantity:1");
    fireEvent.click(screen.getByRole("button", { name: "Remove CLEANSE" }));
    await waitFor(() => expect(getRequests).toBe(2));
    expect(await screen.findByText("quantity:1")).toBeInTheDocument();
  });

  it("broadcasts only a change signal and invalidates on a remote signal", async () => {
    class FakeBroadcastChannel {
      static instance: FakeBroadcastChannel | null = null;
      listeners = new Set<(event: MessageEvent<unknown>) => void>();
      messages: unknown[] = [];

      constructor(readonly name: string) {
        FakeBroadcastChannel.instance = this;
      }

      addEventListener(_type: string, listener: (event: MessageEvent<unknown>) => void) {
        this.listeners.add(listener);
      }

      removeEventListener(_type: string, listener: (event: MessageEvent<unknown>) => void) {
        this.listeners.delete(listener);
      }

      postMessage(message: unknown) {
        this.messages.push(message);
      }

      emit(message: unknown) {
        for (const listener of this.listeners) {
          listener(new MessageEvent("message", { data: message }));
        }
      }

      close() {}
    }

    vi.stubGlobal("BroadcastChannel", FakeBroadcastChannel);
    let getRequests = 0;
    const fetchMock = vi.fn<typeof fetch>((input, init) => {
      if (String(input) === "/api/cart" && !init?.method) {
        getRequests += 1;
        return response(cart(1));
      }
      if (String(input) === "/api/cart/items" && init?.method === "DELETE") {
        return response(cart(0));
      }
      throw new Error(`Unexpected request: ${String(input)}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <CartProvider>
        <MutationProbe />
      </CartProvider>,
    );
    await screen.findByText("quantity:1");
    await waitFor(() => expect(FakeBroadcastChannel.instance).not.toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Remove CLEANSE" }));
    await screen.findByText("quantity:0");

    expect(FakeBroadcastChannel.instance?.messages).toEqual([
      { type: "cart-changed" },
    ]);
    expect(getRequests).toBe(1);

    act(() => FakeBroadcastChannel.instance?.emit({ type: "cart-changed" }));
    await waitFor(() => expect(getRequests).toBe(2));
  });

  it("replaces merged identity data and clears it again on sign out", async () => {
    let getRequests = 0;
    const fetchMock = vi.fn<typeof fetch>((input, init) => {
      if (String(input) === "/api/cart" && !init?.method) {
        getRequests += 1;
        return response(
          getRequests === 1 ? cart(1) : getRequests === 2 ? cart(3) : cart(0),
        );
      }
      throw new Error(`Unexpected request: ${String(input)}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const view = render(
      <CartProvider>
        <MutationProbe />
      </CartProvider>,
    );
    expect(await screen.findByText("quantity:1")).toBeInTheDocument();

    document.cookie = `${CART_IDENTITY_CHANGED_COOKIE}=1; Path=/; SameSite=Lax`;
    routeState.pathname = "/account";
    view.rerender(
      <CartProvider>
        <MutationProbe />
      </CartProvider>,
    );

    expect(await screen.findByText("quantity:3")).toBeInTheDocument();
    expect(getRequests).toBe(2);
    expect(document.cookie).not.toContain(CART_IDENTITY_CHANGED_COOKIE);

    document.cookie = `${CART_IDENTITY_CHANGED_COOKIE}=1; Path=/; SameSite=Lax`;
    routeState.pathname = "/account/sign-in";
    view.rerender(
      <CartProvider>
        <MutationProbe />
      </CartProvider>,
    );

    expect(await screen.findByText("quantity:0")).toBeInTheDocument();
    expect(getRequests).toBe(3);
  });
});
