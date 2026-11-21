import { beforeEach, describe, expect, it, vi } from "vitest";

const cartServer = vi.hoisted(() => ({
  clearCart: vi.fn(),
  getCartState: vi.fn(),
}));

vi.mock("@/lib/cart/server", () => cartServer);

const checkout = vi.hoisted(() => ({ readCheckoutStorefrontForOrigin: vi.fn() }));
vi.mock("@/lib/checkout/storefront", () => checkout);

import { GET, DELETE } from "@/app/api/cart/route";

function dnsFailure() {
  const cause = Object.assign(new Error("getaddrinfo ENOTFOUND"), {
    code: "ENOTFOUND",
  });
  return new TypeError("fetch failed", { cause });
}

describe("/api/cart resilience", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a retryable 503 instead of a false empty cart", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    cartServer.getCartState.mockRejectedValueOnce(dnsFailure());
    const startedAt = Date.now();

    const response = await GET(new Request("http://localhost/api/cart"));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("5");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(body).toEqual({
      error: {
        code: "CART_SERVICE_UNAVAILABLE",
        message: "Your cart is temporarily unavailable.",
        retryable: true,
      },
    });
    expect(body).not.toMatchObject({ lines: [], count: 0 });
    expect(Date.now() - startedAt).toBeLessThan(500);
    expect(log).toHaveBeenCalledTimes(1);
    log.mockRestore();
  });

  it("returns the active checkout alongside the successful cart", async () => {
    const cart = {
      lines: [],
      count: 0,
      subtotal: 0,
      currency: "USD",
    };
    cartServer.getCartState.mockResolvedValueOnce(cart);
    const availability = { mode: "live", admissionOpen: false };
    checkout.readCheckoutStorefrontForOrigin.mockResolvedValueOnce(availability);

    const response = await GET(new Request("http://localhost/api/cart"));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(checkout.readCheckoutStorefrontForOrigin).toHaveBeenCalledWith("http://localhost");
    expect(await response.json()).toEqual({ ...cart, checkout: availability });
  });

  it("keeps a completed mutation successful when availability cannot be read", async () => {
    const cart = { lines: [], subtotal: 0, count: 0, currency: "USD" };
    cartServer.clearCart.mockResolvedValueOnce(cart);
    checkout.readCheckoutStorefrontForOrigin.mockRejectedValueOnce(new Error("inventory unavailable"));

    const response = await DELETE(new Request("http://localhost/api/cart", { method: "DELETE" }));
    expect(response.status).toBe(200);
    expect(cartServer.clearCart).toHaveBeenCalledTimes(1);
    expect(await response.json()).toEqual({ ...cart, checkout: { mode: "closed", admissionOpen: false } });
  });
});
