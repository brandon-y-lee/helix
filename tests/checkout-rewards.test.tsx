import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const cart = vi.hoisted(() => ({
  useCartMutations: vi.fn(),
}));

vi.mock("@/components/cart/useCart", () => cart);

import { CheckoutPanel } from "@/components/cart/CheckoutPanel";

function response(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  }));
}

describe("Checkout helix rewards state", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    cart.useCartMutations.mockReturnValue({
      checkoutPending: false,
      checkoutError: null,
      resetErrors: vi.fn(),
      startCheckout: vi.fn(),
    });
  });

  it("does not misrepresent a rewards outage as a signed-out customer", async () => {
    vi.stubGlobal("fetch", vi.fn(() => response({
      error: {
        code: "REWARDS_SERVICE_UNAVAILABLE",
        message: "helix rewards is temporarily unavailable.",
        retryable: true,
      },
    }, 503)));

    render(<CheckoutPanel disabled={false} subtotal={5_000} />);

    expect(await screen.findByText("helix rewards is temporarily unavailable."))
      .toBeVisible();
    expect(screen.queryByText(/an account is required/i)).not.toBeInTheDocument();
  });

  it("shows the signed-out explanation only after an authoritative response", async () => {
    vi.stubGlobal("fetch", vi.fn(() => response({
      authenticated: false,
      programName: "helix rewards",
      affordableTiers: [],
    })));

    render(<CheckoutPanel disabled={false} subtotal={5_000} />);

    expect(await screen.findByText(/an account is required/i)).toBeVisible();
    expect(screen.queryByText(/temporarily unavailable/i)).not.toBeInTheDocument();
  });
});
