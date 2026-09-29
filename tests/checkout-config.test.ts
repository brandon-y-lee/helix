import { describe, expect, it } from "vitest";
import {
  CheckoutConfigError,
  readCheckoutConfig,
  readPaymentProviderConfig,
  assertSandboxStripeObject,
  stripeMessagingPublishableKey,
} from "@/lib/checkout/config";

describe("sandbox checkout config", () => {
  const baseEnv = {
    CHECKOUT_MODE: "sandbox",
    CHECKOUT_ENABLED: "true",
    STRIPE_ACCOUNT_ID: "acct_1Tm9WRFEzyaKzdmq",
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

  it("keeps validated payment settlement available when new checkout is disabled", () => {
    expect(
      readPaymentProviderConfig({ ...baseEnv, CHECKOUT_ENABLED: "false" }),
    ).toMatchObject({
      environment: "sandbox",
      accountId: "acct_1Tm9WRFEzyaKzdmq",
      secretKey: "sk_test_123",
      webhookSecret: "whsec_123",
    });
  });

  it("preserves existing settlement configuration for the fixed approved account", () => {
    expect(readPaymentProviderConfig({
      ...baseEnv,
      CHECKOUT_ENABLED: "false",
      STRIPE_ACCOUNT_ID: undefined,
    }).accountId).toBe("acct_1Tm9WRFEzyaKzdmq");
  });

  it("rejects an unapproved account even when checkout is disabled", () => {
    expect(() => readPaymentProviderConfig({
      ...baseEnv,
      CHECKOUT_ENABLED: "false",
      STRIPE_ACCOUNT_ID: "acct_unapproved",
    })).toThrow(CheckoutConfigError);
  });

  it.each([
    ["STRIPE_SECRET_KEY", undefined],
    ["STRIPE_SECRET_KEY", "sk_test_"],
    ["STRIPE_SECRET_KEY", "sk_test_contains whitespace"],
    ["STRIPE_SECRET_KEY", "sk_live_blocked"],
    ["NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "pk_test_"],
    ["NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "pk_live_blocked"],
    ["STRIPE_WEBHOOK_SECRET", undefined],
    ["STRIPE_WEBHOOK_SECRET", "whsec_"],
    ["STRIPE_WEBHOOK_SECRET", "not-a-signing-secret"],
    ["CHECKOUT_MODE", "live"],
  ])("fails closed for invalid %s provider configuration (%s)", (key, value) => {
    expect(() => readPaymentProviderConfig({
      ...baseEnv,
      CHECKOUT_ENABLED: "false",
      [key]: value,
    })).toThrow(CheckoutConfigError);
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
