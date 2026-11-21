import { beforeEach, describe, expect, it, vi } from "vitest";
import { STRIPE_API_VERSION } from "@/lib/checkout/config";
import { hasBusinessSandboxPaymentConfiguration, readBusinessStripeBinding, readBusinessStripeReceiptScope, verifyBusinessStripeAccount, hasLivePaymentConfiguration, observeClosedLivePaymentProvider, readLiveStripeBinding, readLiveStripeReceiptAccountId, verifyLiveStripeAccount } from "@/lib/stripe/live-provider";
import { HELIX_VERCEL_PROJECT_ID, supabaseOriginForTarget } from "@/lib/supabase/project-safety";

const { client, retrieve } = vi.hoisted(() => ({
  client: vi.fn(),
  retrieve: vi.fn(),
}));
vi.mock("stripe", () => ({ default: client }));

function production(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "production",
    VERCEL: "1",
    VERCEL_ENV: "production",
    VERCEL_GIT_COMMIT_REF: "main",
    VERCEL_PROJECT_ID: HELIX_VERCEL_PROJECT_ID,
    NEXT_PUBLIC_SITE_URL: "https://www.helixskin.us",
    NEXT_PUBLIC_SUPABASE_URL: supabaseOriginForTarget("production"),
    NEXT_PUBLIC_HELIX_SUPABASE_TARGET: "production",
    CHECKOUT_MODE: "live",
    HELIX_STRIPE_LIVE_ACCOUNT_ID: "acct_MerchantA",
    HELIX_STRIPE_LIVE_SECRET_KEY: "rk_live_fixtureMerchantA",
    HELIX_STRIPE_LIVE_WEBHOOK_SECRET: "whsec_fixtureLiveReceiver",
  };
}

beforeEach(() => {
  client.mockReset().mockImplementation(() => ({ accounts: { retrieve } }));
  retrieve.mockReset().mockResolvedValue({
    object: "account", id: "acct_MerchantA", charges_enabled: true, payouts_enabled: false,
  });
});

describe("closed live payment provider", () => {
  it("detects the live selector and partial enrollment without examining legacy sandbox credentials", () => {
    expect(hasLivePaymentConfiguration({ CHECKOUT_MODE: "sandbox", STRIPE_SECRET_KEY: "sk_test_fixture" })).toBe(false);
    expect(hasLivePaymentConfiguration({ HELIX_STRIPE_LIVE_ACCOUNT_ID: "  " })).toBe(false);
    for (const env of [
      { CHECKOUT_MODE: " live " },
      { HELIX_STRIPE_LIVE_ACCOUNT_ID: "acct_MerchantA" },
      { HELIX_STRIPE_LIVE_SECRET_KEY: "rk_live_fixture" },
      { HELIX_STRIPE_LIVE_WEBHOOK_SECRET: "whsec_fixtureLiveReceiver" },
    ]) expect(hasLivePaymentConfiguration(env)).toBe(true);
  });

  it.each(["rk_live_fixtureMerchantA", "sk_live_fixtureMerchantA"])(
    "recognizes the authenticated live merchant without opening sales",
    async (secretKey) => {
      const env = { ...production(), HELIX_STRIPE_LIVE_SECRET_KEY: secretKey, CHECKOUT_ENABLED: "true" };
      await expect(observeClosedLivePaymentProvider(env)).resolves.toEqual({
        providerMode: "live",
        merchantVerified: true,
        chargesEnabled: true,
        payoutsEnabled: false,
        settlementConfigured: true,
        admissionOpen: false,
      });
      expect(client).toHaveBeenCalledWith(secretKey, expect.objectContaining({ apiVersion: STRIPE_API_VERSION }));
      expect(retrieve).toHaveBeenCalledTimes(1);
      // A connected-account parameter could return a different merchant from the key owner.
      expect(retrieve.mock.calls[0][0] ?? null).toBeNull();
    },
  );

  it("qualifies the merchant before its live receiver is enrolled and ignores the historical signer", async () => {
    const env = { ...production(), HELIX_STRIPE_LIVE_WEBHOOK_SECRET: undefined, STRIPE_WEBHOOK_SECRET: "whsec_fixtureLegacy" };
    await expect(observeClosedLivePaymentProvider(env)).resolves.toEqual({
      providerMode: "live",
      merchantVerified: true,
      chargesEnabled: true,
      payoutsEnabled: false,
      settlementConfigured: false,
      admissionOpen: false,
    });
  });

  it("reports the merchant's independent charge and payout capabilities without opening admission", async () => {
    retrieve.mockResolvedValue({ object: "account", id: "acct_MerchantA", charges_enabled: false, payouts_enabled: true });
    await expect(observeClosedLivePaymentProvider(production())).resolves.toMatchObject({
      merchantVerified: true, chargesEnabled: false, payoutsEnabled: true, admissionOpen: false,
    });
  });

  it.each([
    { payouts_enabled: true },
    { charges_enabled: true, payouts_enabled: "false" },
  ])("rejects incomplete or malformed account capability evidence", async (capabilities) => {
    retrieve.mockResolvedValue({ object: "account", id: "acct_MerchantA", ...capabilities });
    await expect(observeClosedLivePaymentProvider(production())).rejects.toThrow("Live payment merchant could not be verified.");
  });

  it.each([
    ["development deployment", { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "dev" }],
    ["another project", { VERCEL_PROJECT_ID: "prj_other" }],
    ["conflicting Vercel target", { VERCEL_TARGET_ENV: "preview" }],
    ["wrong public site", { NEXT_PUBLIC_SITE_URL: "https://helixskin.vercel.app" }],
    ["wrong Checkout origin", { CHECKOUT_ORIGIN: "https://helixskin.vercel.app" }],
    ["development database", { NEXT_PUBLIC_SUPABASE_URL: supabaseOriginForTarget("development") }],
    ["different build lane", { NEXT_PUBLIC_HELIX_SUPABASE_TARGET: "development" }],
    ["sandbox mode", { CHECKOUT_MODE: "sandbox" }],
    ["absent expected merchant", { HELIX_STRIPE_LIVE_ACCOUNT_ID: undefined }],
    ["malformed expected merchant", { HELIX_STRIPE_LIVE_ACCOUNT_ID: "acct_" }],
    ["test secret", { HELIX_STRIPE_LIVE_SECRET_KEY: "sk_test_fixtureMerchantA" }],
    ["public key", { HELIX_STRIPE_LIVE_SECRET_KEY: "pk_live_fixtureMerchantA" }],
    ["only a legacy key", { HELIX_STRIPE_LIVE_SECRET_KEY: undefined, STRIPE_SECRET_KEY: "sk_live_fixtureLegacy" }],
    ["malformed live signer", { HELIX_STRIPE_LIVE_WEBHOOK_SECRET: "invalid" }],
    ["shared live and sandbox signer", { STRIPE_WEBHOOK_SECRET: "whsec_fixtureLiveReceiver" }],
  ] as const)("rejects %s before contacting Stripe", async (_label, invalid) => {
    await expect(observeClosedLivePaymentProvider({ ...production(), ...invalid })).rejects.toThrow(
      "Live payment provider configuration could not be verified.",
    );
    expect(client).not.toHaveBeenCalled();
  });

  it("checks the authenticated account again if the expected merchant changes", async () => {
    const env = production();
    await observeClosedLivePaymentProvider(env);
    await expect(observeClosedLivePaymentProvider({ ...env, HELIX_STRIPE_LIVE_ACCOUNT_ID: "acct_MerchantB" }))
      .rejects.toThrow("Live payment merchant could not be verified.");
    expect(retrieve).toHaveBeenCalledTimes(2);
  });

  it("redacts provider failures without substituting configured account data", async () => {
    retrieve.mockRejectedValue(new Error("private provider failure detail"));
    await expect(observeClosedLivePaymentProvider(production())).rejects.toThrow(
      /^Live payment merchant could not be verified\.$/,
    );
  });
});

describe("live provider binding before signature validation", () => {
  it("parses the guarded binding without making an account request", async () => {
    const binding = readLiveStripeBinding(production());
    expect(binding).toMatchObject({ environment: "live", accountId: "acct_MerchantA" });
    expect(retrieve).not.toHaveBeenCalled();
    await expect(verifyLiveStripeAccount(binding)).resolves.toEqual({
      accountId: "acct_MerchantA", chargesEnabled: true, payoutsEnabled: false,
    });
    expect(retrieve).toHaveBeenCalledTimes(1);
  });

  it("reads the archived receipt account on the canonical parent after admission closes and credentials are removed", () => {
    const env = {
      ...production(), CHECKOUT_MODE: undefined, HELIX_STRIPE_LIVE_SECRET_KEY: undefined,
      HELIX_STRIPE_LIVE_WEBHOOK_SECRET: undefined,
    };
    expect(readLiveStripeReceiptAccountId(env)).toBe("acct_MerchantA");
    expect(() => readLiveStripeReceiptAccountId({ ...env, VERCEL_ENV: "preview" })).toThrow();
    expect(() => readLiveStripeReceiptAccountId({ ...env, HELIX_STRIPE_LIVE_ACCOUNT_ID: "" })).toThrow();
    expect(() => readLiveStripeReceiptAccountId({ ...env, NEXT_PUBLIC_SUPABASE_URL: supabaseOriginForTarget("development") })).toThrow();
    expect(client).not.toHaveBeenCalled();
    expect(retrieve).not.toHaveBeenCalled();
  });
});

function development(): NodeJS.ProcessEnv {
  return {
    ...production(),
    VERCEL_ENV: "preview",
    VERCEL_GIT_COMMIT_REF: "codex/558-verified-dev-preview",
    NEXT_PUBLIC_SITE_URL: "https://helixskin.vercel.app",
    NEXT_PUBLIC_HELIX_SUPABASE_TARGET: "development",
    NEXT_PUBLIC_SUPABASE_URL: supabaseOriginForTarget("development"),
    HELIX_STRIPE_LIVE_ACCOUNT_ID: undefined,
    HELIX_STRIPE_LIVE_SECRET_KEY: undefined,
    HELIX_STRIPE_LIVE_WEBHOOK_SECRET: undefined,
    CHECKOUT_MODE: "business_sandbox",
    HELIX_STRIPE_DEV_ACCOUNT_ID: "acct_DevMerchant",
    HELIX_STRIPE_DEV_SECRET_KEY: "rk_test_DevMerchant",
    HELIX_STRIPE_DEV_WEBHOOK_SECRET: "whsec_DevMerchant",
  };
}

describe("business Stripe sandbox qualification", () => {
  it("selects the independently configured child test account and authenticates only on demand", async () => {
    const binding = readBusinessStripeBinding("business_sandbox", development());
    expect(binding).toMatchObject({ environment: "business_sandbox", accountId: "acct_DevMerchant" });
    expect(retrieve).not.toHaveBeenCalled();
    await expect(verifyBusinessStripeAccount(binding)).rejects.toThrow();
    retrieve.mockResolvedValue({ object: "account", id: "acct_DevMerchant", charges_enabled: true, payouts_enabled: false });
    await expect(verifyBusinessStripeAccount(binding)).resolves.toEqual({ accountId: "acct_DevMerchant", chargesEnabled: true, payoutsEnabled: false });
  });

  it("preserves the scoped receipt reader when checkout is closed after key rotation", () => {
    const env = { ...development(), CHECKOUT_MODE: "disabled", HELIX_STRIPE_DEV_SECRET_KEY: undefined,
      HELIX_STRIPE_DEV_WEBHOOK_SECRET: undefined };
    expect(readBusinessStripeReceiptScope("business_sandbox", env)).toEqual({ environment: "business_sandbox", accountId: "acct_DevMerchant" });
    expect(client).not.toHaveBeenCalled();
  });

  it.each([
    { VERCEL_GIT_COMMIT_REF: "dev" }, { VERCEL_GIT_COMMIT_REF: "feature" }, { VERCEL_ENV: "development" },
    { VERCEL_PROJECT_ID: "prj_other" }, { NEXT_PUBLIC_SUPABASE_URL: supabaseOriginForTarget("production") },
    { NEXT_PUBLIC_HELIX_SUPABASE_TARGET: "production" }, { HELIX_STRIPE_DEV_ACCOUNT_ID: "acct_1Tm9WRFEzyaKzdmq" },
    { HELIX_STRIPE_DEV_SECRET_KEY: "rk_live_other" }, { HELIX_STRIPE_DEV_SECRET_KEY: "sk_test_" },
    { HELIX_STRIPE_DEV_SECRET_KEY: "rk_test_DevMerchant", STRIPE_SECRET_KEY: "rk_test_DevMerchant" },
    { STRIPE_WEBHOOK_SECRET: "whsec_DevMerchant" }, { HELIX_STRIPE_LIVE_WEBHOOK_SECRET: "whsec_DevMerchant" },
    { CHECKOUT_MODE: "sandbox" },
  ])("fails before provider I/O for a crossed target or credential %j", (change) => {
    expect(() => readBusinessStripeBinding("business_sandbox", { ...development(), ...change })).toThrow();
    expect(client).not.toHaveBeenCalled();
    expect(retrieve).not.toHaveBeenCalled();
  });

  it("recognizes partial enrollment without accepting historical settings", () => {
    expect(hasBusinessSandboxPaymentConfiguration({ HELIX_STRIPE_DEV_ACCOUNT_ID: "acct_partial" })).toBe(true);
    expect(hasBusinessSandboxPaymentConfiguration({ CHECKOUT_MODE: "business_sandbox" })).toBe(true);
    expect(hasBusinessSandboxPaymentConfiguration({ CHECKOUT_MODE: "sandbox", STRIPE_SECRET_KEY: "sk_test_historical" })).toBe(false);
  });
});
