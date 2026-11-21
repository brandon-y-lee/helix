import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createCheckoutSession } from "@/lib/cart/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const cart = vi.hoisted(() => ({
  useCartMutations: vi.fn(),
  useCart: vi.fn(),
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
    cart.useCart.mockReturnValue({ refresh: vi.fn() });
    cart.useCartMutations.mockReturnValue({
      checkoutPending: false,
      checkoutError: null,
      resetErrors: vi.fn(),
      startCheckout: vi.fn(),
    });
  });

  it("keeps a held cart visible without offering a payment or loading rewards", () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    render(<CheckoutPanel storefront={{ mode: "closed", admissionOpen: false }} disabled={false} subtotal={2500} cartUpdatedAt={1} />);
    expect(screen.getByText("Checkout is currently closed.")).toBeVisible();
    expect(screen.queryByRole("button", { name: /checkout/i })).not.toBeInTheDocument();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each(["business_sandbox", "live"] as const)("submits %s checkout without legacy offers or points", async (mode) => {
    const startCheckout = vi.fn().mockResolvedValue(null);
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    cart.useCartMutations.mockReturnValue({ resetErrors: vi.fn(), startCheckout });
    render(<CheckoutPanel storefront={{ mode, admissionOpen: true }} disabled={false} subtotal={2500} cartUpdatedAt={1} />);
    expect(Boolean(screen.queryByText(/test checkout/i))).toBe(mode === "business_sandbox");
    await userEvent.click(screen.getByRole("button", { name: "Checkout $25.00" }));
    expect(startCheckout).toHaveBeenCalledExactlyOnceWith(null, undefined);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("does not misrepresent a rewards outage as a signed-out customer", async () => {
    vi.stubGlobal("fetch", vi.fn(() => response({
      error: {
        code: "REWARDS_SERVICE_UNAVAILABLE",
        message: "helix rewards is temporarily unavailable.",
        retryable: true,
      },
    }, 503)));

    render(<CheckoutPanel storefront={{ mode: "historical_sandbox", admissionOpen: true }} disabled={false} subtotal={5_000} cartUpdatedAt={1} />);

    expect(screen.getByLabelText("Sandbox checkout")).toBeVisible();
    expect(screen.queryByText("Sandbox")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Checkout $50.00" })).toBeEnabled();
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

    render(<CheckoutPanel storefront={{ mode: "historical_sandbox", admissionOpen: true }} disabled={false} subtotal={5_000} cartUpdatedAt={1} />);

    expect(await screen.findByText(/an account is required/i)).toBeVisible();
    expect(screen.queryByText(/temporarily unavailable/i)).not.toBeInTheDocument();
  });
});

it("shows explicit local recovery only for the structured origin error, then requires a separate checkout click", async () => {
  cart.useCart.mockReturnValue({ refresh: vi.fn(), checkout: { mode: "historical_sandbox", admissionOpen: true } });
  const fetchRequest = vi.fn().mockResolvedValueOnce(Response.json({ error: { code: "CHECKOUT_ORIGIN_CHANGED", message: "This pending checkout was opened on another Helix site." } }, { status: 409 }));
  vi.stubGlobal("fetch", fetchRequest);
  const error = await createCheckoutSession(null).catch((value: unknown) => value);
  const resetErrors = vi.fn();
  const startCheckout = vi.fn().mockResolvedValue(null);
  const mutationState = { checkoutPending: false, checkoutError: error, resetErrors, startCheckout };
  cart.useCartMutations.mockReturnValue(mutationState);
  fetchRequest.mockImplementation((url) => url === "/cart/checkout-cancel"
    ? response({ status: "cancelled" }) : response({ authenticated: false, affordableTiers: [] }));
  const user = userEvent.setup();
  const view = render(<CheckoutPanel storefront={{ mode: "historical_sandbox", admissionOpen: true }} disabled={false} subtotal={5500} cartUpdatedAt={1} />);
  expect(screen.getByText("This pending checkout was opened on another Helix site.")).toBeVisible();
  expect(fetchRequest.mock.calls.filter(([url]) => url === "/cart/checkout-cancel")).toHaveLength(0);
  expect(startCheckout).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Cancel pending checkout" }));
  expect(await screen.findByText("Pending checkout was cancelled. You can check out again.")).toBeVisible();
  expect(resetErrors).toHaveBeenCalledOnce();
  expect(startCheckout).not.toHaveBeenCalled();
  cart.useCartMutations.mockReturnValue({ ...mutationState, checkoutError: null });
  view.rerender(<CheckoutPanel storefront={{ mode: "historical_sandbox", admissionOpen: true }} disabled={false} subtotal={5500} cartUpdatedAt={1} />);
  expect(screen.queryByRole("button", { name: "Cancel pending checkout" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Checkout $55.00" }));
  expect(startCheckout).toHaveBeenCalledExactlyOnceWith(null, undefined);
  expect(fetchRequest).toHaveBeenCalledWith("/cart/checkout-cancel", expect.objectContaining({ body: '{"recoverOriginChange":true}' }));
});
