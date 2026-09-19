import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const journey = vi.hoisted(() => ({
  checkoutErrorResponseMessage: vi.fn(),
  createStripeCheckoutSession: vi.fn(),
  getOrderConfirmationBySession: vi.fn(),
  markCartIdentityChanged: vi.fn(),
  mergeGuestCartIntoCurrentUser: vi.fn(),
  redirect: vi.fn(),
  refresh: vi.fn(),
  signInWithPassword: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers({ origin: "https://attacker.example" })),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("next/navigation", () => ({
  redirect: journey.redirect,
  useRouter: () => journey,
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
  it("merges Cart ownership and emits the identity signal after sign-in", async () => {
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
  it.each([null, "points_200", "points_400", "points_600"])(
    "creates Checkout through the server-authoritative route with reward %s",
    async (rewardTierId) => {
      const request = new Request("https://helixskin.vercel.app/api/checkout/sessions", {
        body: JSON.stringify({ rewardTierId }),
        headers: {
          "content-type": "application/json",
          origin: "https://helixskin.vercel.app",
        },
        method: "POST",
      });

      const response = await createCheckout(request);

      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.json()).toEqual({
        orderId: "00000000-0000-4000-8000-000000000101",
        orderNumber: "HX-000101",
        sessionId: "cs_test_helix",
        url: "https://checkout.stripe.test/cs_test_helix",
      });
      expect(journey.createStripeCheckoutSession).toHaveBeenCalledWith({
        rewardTierId,
      });
    },
  );

  it("renders only a server-verified Sandbox Order confirmation", async () => {
    journey.getOrderConfirmationBySession.mockResolvedValue({
      items: [
        {
          line_subtotal_cents: 4200,
          product_name: "TREAT",
          quantity: 1,
          variant_label: "30 mL",
        },
      ],
      notice: "Sandbox Checkout — no real charge or fulfillment.",
      state: "paid",
      retryAfterSeconds: 5,
      shipping: null,
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
    });

    render(
      await CheckoutSuccessPage({
        searchParams: Promise.resolve({ session_id: "cs_test_helix" }),
      }),
    );

    expect(
      screen.getByRole("heading", { level: 1, name: "Sandbox payment verified" }),
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
      screen.getByText("We could not verify this payment status."),
    ).toBeVisible();
    expect(screen.queryByText("Payment verified")).not.toBeInTheDocument();
    expect(screen.queryByText("Checking for payment confirmation.")).not.toBeInTheDocument();
  });

  it("offers bounded checking only for an authorized pending receipt", async () => {
    journey.getOrderConfirmationBySession.mockResolvedValue({
      state: "pending",
      retryAfterSeconds: 5,
      notice: "Sandbox Checkout — no real charge or fulfillment.",
      order: {
        order_number: "HX-000102", status: "pending_payment", reward_points_earned: 0,
        reward_points_redeemed: 0, merchandise_subtotal_cents: 2500, discount_cents: 0,
        shipping_cents: 500, tax_cents: 0, total_cents: 3000,
      },
      items: [],
      shipping: null,
    });
    render(await CheckoutSuccessPage({ searchParams: Promise.resolve({ session_id: "cs_test_pending" }) }));
    expect(screen.getByRole("heading", { name: "Awaiting payment confirmation" })).toBeVisible();
    expect(screen.getByText("Checking for payment confirmation.")).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Sandbox payment verified" })).not.toBeInTheDocument();
  });
});
