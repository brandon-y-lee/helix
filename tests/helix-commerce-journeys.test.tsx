import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const journey = vi.hoisted(() => ({
  checkoutErrorResponseMessage: vi.fn(),
  createStripeCheckoutSession: vi.fn(),
  getOrderConfirmationBySession: vi.fn(),
  markCartIdentityChanged: vi.fn(),
  mergeGuestCartIntoCurrentUser: vi.fn(),
  redirect: vi.fn(),
  signInWithPassword: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers({ origin: "https://attacker.example" })),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("next/navigation", () => ({
  redirect: journey.redirect,
}));

vi.mock("@/lib/cart/server", () => ({
  mergeGuestCartIntoCurrentUser: journey.mergeGuestCartIntoCurrentUser,
}));

vi.mock("@/lib/cart/auth-sync", () => ({
  markCartIdentityChanged: journey.markCartIdentityChanged,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: {
      signInWithPassword: journey.signInWithPassword,
    },
  })),
}));

vi.mock("@/lib/orders/server", () => ({
  checkoutErrorResponseMessage: journey.checkoutErrorResponseMessage,
  createStripeCheckoutSession: journey.createStripeCheckoutSession,
  getOrderConfirmationBySession: journey.getOrderConfirmationBySession,
}));

import { signInAction } from "@/app/account/actions";
import { POST as createCheckout } from "@/app/api/checkout/sessions/route";
import CheckoutSuccessPage from "@/app/checkout/success/page";

beforeEach(() => {
  vi.clearAllMocks();
  journey.signInWithPassword.mockResolvedValue({ error: null });
  journey.createStripeCheckoutSession.mockResolvedValue({
    orderId: "00000000-0000-4000-8000-000000000101",
    orderNumber: "HX-000101",
    sessionId: "cs_test_helix",
    url: "https://checkout.stripe.test/cs_test_helix",
  });
});

describe("Account and Cart identity transition", () => {
  it("merges the guest Cart and emits the identity signal after sign-in", async () => {
    const form = new FormData();
    form.set("email", "customer@example.test");
    form.set("password", "correct-password");
    form.set("next", "/cart");

    await signInAction({ status: "idle" }, form);

    expect(journey.signInWithPassword).toHaveBeenCalledWith({
      email: "customer@example.test",
      password: "correct-password",
    });
    expect(journey.mergeGuestCartIntoCurrentUser).toHaveBeenCalledOnce();
    expect(journey.markCartIdentityChanged).toHaveBeenCalledOnce();
    expect(journey.redirect).toHaveBeenCalledWith("/cart");
  });
});

describe("Checkout creation and verified completion", () => {
  it("creates Checkout through the server-authoritative route", async () => {
    const request = new Request("https://helixskin.vercel.app/api/checkout/sessions", {
      body: JSON.stringify({ rewardTierId: "tier-500" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    const response = await createCheckout(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      orderId: "00000000-0000-4000-8000-000000000101",
      orderNumber: "HX-000101",
      sessionId: "cs_test_helix",
      url: "https://checkout.stripe.test/cs_test_helix",
    });
    expect(journey.createStripeCheckoutSession).toHaveBeenCalledWith({
      rewardTierId: "tier-500",
    });
  });

  it("renders only a server-verified Sandbox Order confirmation", async () => {
    journey.getOrderConfirmationBySession.mockResolvedValue({
      items: [
        {
          id: "item-1",
          line_subtotal_cents: 4200,
          product_name: "TREAT",
          quantity: 1,
          variant_label: "30 mL",
        },
      ],
      notice: "Sandbox Checkout — no real charge or fulfillment.",
      order: {
        discount_cents: 0,
        merchandise_subtotal_cents: 4200,
        order_number: "HX-000101",
        reward_points_earned: 42,
        reward_points_redeemed: 0,
        shipping_cents: 0,
        status: "paid",
        tax_cents: 0,
        total_cents: 4200,
      },
      webhookPending: false,
    });

    render(
      await CheckoutSuccessPage({
        searchParams: Promise.resolve({ session_id: "cs_test_helix" }),
      }),
    );

    expect(
      screen.getByRole("heading", { level: 1, name: "Order confirmed" }),
    ).toBeVisible();
    expect(screen.getByText("HX-000101")).toBeVisible();
    expect(screen.getByText(/no real charge or fulfillment/i)).toBeVisible();
  });

  it("recovers safely when a Checkout return cannot be verified", async () => {
    journey.getOrderConfirmationBySession.mockRejectedValue(
      new Error("provider unavailable"),
    );

    render(
      await CheckoutSuccessPage({
        searchParams: Promise.resolve({ session_id: "cs_test_unavailable" }),
      }),
    );

    expect(
      screen.getByRole("heading", { level: 1, name: "Order status" }),
    ).toBeVisible();
    expect(
      screen.getByText("We could not verify that Checkout Session."),
    ).toBeVisible();
    expect(screen.queryByText("Order confirmed")).not.toBeInTheDocument();
  });
});
