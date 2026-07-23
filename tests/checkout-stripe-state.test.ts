import { describe, expect, it } from "vitest";
import { CheckoutConfigError } from "@/lib/checkout/config";
import { resolveCheckoutOrigin } from "@/lib/checkout/origin";
import {
  checkoutCancellationState,
  checkoutSessionIsPaid,
  orderCanTransitionToPaymentFailed,
  sanitizedStripeEventPayload,
  stripeWebhookClaimIsFresh,
  stripeWebhookProcessingMarker,
} from "@/lib/checkout/stripe-state";

describe("Stripe checkout state", () => {
  it("treats only Stripe's paid payment status as paid", () => {
    expect(checkoutSessionIsPaid({ payment_status: "paid" })).toBe(true);
    expect(checkoutSessionIsPaid({ payment_status: "unpaid" })).toBe(false);
    expect(checkoutSessionIsPaid({ payment_status: "no_payment_required" })).toBe(false);
  });

  it("keeps completed unpaid sessions processing instead of cancelling them", () => {
    expect(
      checkoutCancellationState({ payment_status: "paid", status: "complete" }),
    ).toBe("paid");
    expect(
      checkoutCancellationState({ payment_status: "unpaid", status: "complete" }),
    ).toBe("processing");
    expect(
      checkoutCancellationState({ payment_status: "unpaid", status: "open" }),
    ).toBe("open");
    expect(
      checkoutCancellationState({ payment_status: "unpaid", status: "expired" }),
    ).toBe("expired");
  });

  it("does not regress terminal orders to payment failed", () => {
    expect(orderCanTransitionToPaymentFailed("pending_payment")).toBe(true);
    expect(orderCanTransitionToPaymentFailed("payment_failed")).toBe(true);
    expect(orderCanTransitionToPaymentFailed("paid")).toBe(false);
    expect(orderCanTransitionToPaymentFailed("cancelled")).toBe(false);
    expect(orderCanTransitionToPaymentFailed("refunded")).toBe(false);
  });

  it("bounds duplicate webhook processing claims", () => {
    const startedAt = new Date("2026-07-23T12:00:00.000Z");
    const marker = stripeWebhookProcessingMarker(startedAt);

    expect(marker).toBe("processing:2026-07-23T12:00:00.000Z");
    expect(
      stripeWebhookClaimIsFresh(
        marker,
        new Date("2026-07-23T12:04:59.999Z"),
      ),
    ).toBe(true);
    expect(
      stripeWebhookClaimIsFresh(
        marker,
        new Date("2026-07-23T12:05:00.000Z"),
      ),
    ).toBe(false);
    expect(stripeWebhookClaimIsFresh("provider error", startedAt)).toBe(false);
  });

  it("stores a minimal event audit record without customer payload fields", () => {
    const event = {
      api_version: "2026-06-24.dahlia",
      data: {
        object: {
          id: "cs_test_123",
          customer_details: { email: "customer@example.com" },
        },
      },
      id: "evt_test_123",
      request: { id: "req_123", idempotency_key: null },
      type: "checkout.session.completed",
    } as unknown as Parameters<typeof sanitizedStripeEventPayload>[0];
    const payload = sanitizedStripeEventPayload(event);

    expect(payload).toEqual({
      api_version: "2026-06-24.dahlia",
      event_id: "evt_test_123",
      object_id: "cs_test_123",
      request_id: "req_123",
      type: "checkout.session.completed",
    });
    expect(JSON.stringify(payload)).not.toContain("customer@example.com");
  });
});

describe("trusted checkout return origins", () => {
  it("prefers the configured site URL over an untrusted request Origin", () => {
    expect(
      resolveCheckoutOrigin({
        env: {
          NODE_ENV: "production",
          NEXT_PUBLIC_SITE_URL: "https://mei-pelle.example/path",
        },
        requestOrigin: "https://attacker.example",
      }),
    ).toBe("https://mei-pelle.example");
  });

  it("allows only local HTTP request origins during development", () => {
    expect(
      resolveCheckoutOrigin({
        env: { NODE_ENV: "development" },
        requestOrigin: "http://127.0.0.1:3100",
      }),
    ).toBe("http://127.0.0.1:3100");
    expect(
      resolveCheckoutOrigin({
        env: { NODE_ENV: "development" },
        requestOrigin: "https://attacker.example",
      }),
    ).toBe("http://localhost:3000");
  });

  it("fails closed in production when no trusted return origin exists", () => {
    expect(() =>
      resolveCheckoutOrigin({
        env: { NODE_ENV: "production" },
        requestOrigin: "https://attacker.example",
      }),
    ).toThrow(CheckoutConfigError);
  });
});
