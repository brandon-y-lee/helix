import { describe, expect, it } from "vitest";
import { resolveCheckoutOrigin } from "@/lib/checkout/origin";
import {
  checkoutCancellationState,
  checkoutSessionIsPaid,
  orderCanTransitionToPaymentFailed,
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


});

describe("trusted checkout return origins", () => {
  it("prefers the configured site URL over an untrusted request Origin", () => {
    expect(
      resolveCheckoutOrigin({
        env: {
          NODE_ENV: "production",
          NEXT_PUBLIC_SITE_URL: "https://helixskin.vercel.app",
        },
        requestOrigin: "https://attacker.example",
      }),
    ).toBe("https://helixskin.vercel.app");
  });

  it("does not derive a return origin from the browser even during development", () => {
    expect(
      resolveCheckoutOrigin({
        env: { NODE_ENV: "development" },
        requestOrigin: "http://127.0.0.1:3100",
      }),
    ).toBe("http://localhost:3000");
    expect(
      resolveCheckoutOrigin({
        env: { NODE_ENV: "development" },
        requestOrigin: "https://attacker.example",
      }),
    ).toBe("http://localhost:3000");
  });

  it("uses the controlled hostname instead of a generated Vercel return origin", () => {
    expect(
      resolveCheckoutOrigin({
        env: {
          NODE_ENV: "production",
          VERCEL_URL: "helix-random-build.vercel.app",
        },
        requestOrigin: "https://attacker.example",
      }),
    ).toBe("https://helixskin.vercel.app");
  });

  it("uses an explicit server-configured checkout origin", () => {
    expect(
      resolveCheckoutOrigin({
        env: { NODE_ENV: "production", CHECKOUT_ORIGIN: "https://staging.helix.test" },
        requestOrigin: "https://attacker.example",
      }),
    ).toBe("https://staging.helix.test");
    expect(
      resolveCheckoutOrigin({
        env: { NODE_ENV: "development", CHECKOUT_ORIGIN: "http://127.0.0.1:3100" },
      }),
    ).toBe("http://127.0.0.1:3100");
  });

  it("treats an optional blank setting as unset", () => {
    expect(
      resolveCheckoutOrigin({ env: { NODE_ENV: "production", CHECKOUT_ORIGIN: "  " } }),
    ).toBe("https://helixskin.vercel.app");
  });

  it.each([
    ["production", "http://localhost:3000"],
    ["production", "http://staging.helix.test"],
    ["production", "https://staging.helix.test/path"],
    ["production", "https://user:password@staging.helix.test"],
    ["production", "https://staging.helix.test?redirect=other"],
    ["production", "https://staging.helix.test#fragment"],
    ["development", "http://attacker.example"],
    ["development", "null"],
  ])("fails closed for an invalid %s checkout origin %s", (nodeEnv, origin) => {
    expect(() => resolveCheckoutOrigin({
      env: { NODE_ENV: nodeEnv, CHECKOUT_ORIGIN: origin } as NodeJS.ProcessEnv,
    })).toThrow("Checkout origin is not configured correctly.");
  });
});
