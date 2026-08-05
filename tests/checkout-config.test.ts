import { describe, expect, it } from "vitest";
import {
  CheckoutConfigError,
  readCheckoutConfig,
  assertSandboxStripeObject,
  stripeMessagingPublishableKey,
} from "@/lib/checkout/config";

describe("sandbox checkout config", () => {
  const baseEnv = {
    CHECKOUT_MODE: "sandbox",
    CHECKOUT_ENABLED: "true",
    STRIPE_SECRET_KEY: "sk_test_123",
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_123",
    STRIPE_WEBHOOK_SECRET: "whsec_123",
  } as unknown as NodeJS.ProcessEnv;

  it("accepts sandbox keys lazily", () => {
    const config = readCheckoutConfig(baseEnv);
    expect(config.environment).toBe("sandbox");
    expect(config.enabled).toBe(true);
  });

  it("rejects checkout when it is disabled", () => {
    expect(() =>
      readCheckoutConfig({ ...baseEnv, CHECKOUT_ENABLED: "false" }),
    ).toThrow(CheckoutConfigError);
  });

  it("rejects live keys and live objects", () => {
    expect(() =>
      readCheckoutConfig({ ...baseEnv, STRIPE_SECRET_KEY: "sk_live_123" }),
    ).toThrow(CheckoutConfigError);
    expect(() =>
      readCheckoutConfig({ ...baseEnv, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_live_123" }),
    ).toThrow(CheckoutConfigError);
    expect(() => assertSandboxStripeObject({ livemode: true })).toThrow(CheckoutConfigError);
  });

  it("exposes messaging only for a fully configured sandbox checkout", () => {
    expect(stripeMessagingPublishableKey(baseEnv)).toBe("pk_test_123");
    expect(
      stripeMessagingPublishableKey({
        ...baseEnv,
        STRIPE_WEBHOOK_SECRET: undefined,
      }),
    ).toBeNull();
    expect(
      stripeMessagingPublishableKey({
        ...baseEnv,
        NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_live_blocked",
      }),
    ).toBeNull();
  });
});
