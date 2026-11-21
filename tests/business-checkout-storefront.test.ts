import { beforeEach, describe, expect, it, vi } from "vitest";
const edges = vi.hoisted(() => ({ binding: vi.fn(), offer: vi.fn() }));
vi.mock("@/lib/stripe/live-provider", async original => ({
  ...await original<typeof import("@/lib/stripe/live-provider")>(), readBusinessStripeBinding: edges.binding,
}));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({ rpc: edges.offer }) }));
import { readCheckoutStorefront, readCheckoutStorefrontForOrigin } from "@/lib/checkout/storefront";
const prod = { VERCEL: "1", VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main", CHECKOUT_ENABLED: "true" };
const publicTerms = { shippingCents: 500, freeShippingThresholdCents: null, dispatchTerms: "Within two days", returnTerms: "Returns within 30 days" };
const offer = { admissionOpen: true, sku: "FIXTURE", productSlug: "serum", variantKey: "30ml", unitPriceCents: 3000, currency: "USD", ...publicTerms };
beforeEach(() => {
  vi.resetAllMocks();
  edges.binding.mockReturnValue({ environment: "live", accountId: "acct_Fixture", webhookSecret: "whsec_fixture" });
  edges.offer.mockResolvedValue({ data: offer, error: null });
});
describe("public checkout availability", () => {
  it("closes main and arbitrary previews before storage or provider work", async () => {
    expect(await readCheckoutStorefront(prod)).toEqual({ mode: "closed", admissionOpen: false });
    expect(await readCheckoutStorefront({ ...prod, VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "unrelated" })).toEqual({ mode: "closed", admissionOpen: false });
    expect(edges.offer).not.toHaveBeenCalled();
    expect(edges.binding).not.toHaveBeenCalled();
  });
  it("requires an independent flag, complete signer and confirmed offer for live sales", async () => {
    const env = { ...prod, CHECKOUT_MODE: "live" };
    expect(await readCheckoutStorefront(env)).toEqual({ mode: "live", admissionOpen: false });
    expect(edges.offer).not.toHaveBeenCalled();
    const candidate = { ...env, HELIX_STRIPE_LIVE_ADMISSION_ENABLED: "true" };
    expect(await readCheckoutStorefront(candidate)).toEqual({ mode: "live", admissionOpen: true,
      offer: { productSlug: "serum", variantId: "30ml", unitPriceCents: 3000, ...publicTerms } });
    expect(edges.offer).toHaveBeenCalledWith("read_business_checkout_offer", { p_environment: "live", p_account_id: "acct_Fixture" });
    edges.offer.mockResolvedValue({ data: null, error: null });
    expect((await readCheckoutStorefront(candidate)).admissionOpen).toBe(false);
    edges.binding.mockReturnValue({ accountId: "acct_Fixture", webhookSecret: "" });
    edges.offer.mockClear();
    expect((await readCheckoutStorefront(candidate)).admissionOpen).toBe(false);
    expect(edges.offer).not.toHaveBeenCalled();
  });
  it.each([
    { shippingCents: undefined }, { shippingCents: -1 }, { freeShippingThresholdCents: undefined },
    { freeShippingThresholdCents: 1.5 }, { dispatchTerms: " " }, { returnTerms: null },
  ])("closes new admission when the approved policy is incomplete: %o", async invalid => {
    edges.offer.mockResolvedValue({ data: { ...offer, ...invalid }, error: null });
    expect(await readCheckoutStorefront({ ...prod, CHECKOUT_MODE: "live", HELIX_STRIPE_LIVE_ADMISSION_ENABLED: "true" }))
      .toEqual({ mode: "live", admissionOpen: false });
  });
});

const mirror = "https://helix-git-codex-558-verified-e87038-brandons-projects-5060bad5.vercel.app";
const canonical = "https://www.helixskin.us";
const live = { ...prod, VERCEL_PROJECT_ID: "prj_N9nyPL9SixJHOROIovS8PDQ9aKny", CHECKOUT_MODE: "live",
  HELIX_STRIPE_LIVE_ADMISSION_ENABLED: "true", NEXT_PUBLIC_SUPABASE_URL: "https://erasogmsqpgiirovubjh.supabase.co" };
const dev = { ...live, VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "codex/558-verified-dev-preview",
  CHECKOUT_MODE: "business_sandbox", NEXT_PUBLIC_HELIX_SUPABASE_TARGET: "development",
  HELIX_STRIPE_LIVE_ADMISSION_ENABLED: undefined, HELIX_STRIPE_DEV_ADMISSION_ENABLED: "true",
  NEXT_PUBLIC_SUPABASE_URL: "https://zyfkunnpnlmgvrojmrbg.supabase.co" };

describe("origin-qualified checkout availability", () => {
  it("reads the offer only on the canonical live storefront or protected development mirror", async () => {
    expect(await readCheckoutStorefrontForOrigin(canonical, live)).toMatchObject({ mode: "live", admissionOpen: true });
    edges.binding.mockReturnValue({ environment: "business_sandbox", accountId: "acct_DevFixture", webhookSecret: "whsec_fixture" });
    expect(await readCheckoutStorefrontForOrigin(mirror, dev)).toMatchObject({ mode: "business_sandbox", admissionOpen: true });
    expect(edges.offer).toHaveBeenCalledTimes(2);
  });
  it.each([
    [canonical, dev], [mirror, live], ["https://helix-immutable.vercel.app", live],
    ["https://helixskin-dev-payments.vercel.app", dev], [null, live], [undefined, dev],
    [canonical, { ...live, VERCEL_GIT_COMMIT_REF: "feature" }], [mirror, { ...dev, VERCEL_GIT_COMMIT_REF: "dev" }],
    [canonical, { ...live, VERCEL_PROJECT_ID: "prj_other" }], [mirror, { ...dev, CHECKOUT_MODE: "live" }],
    [canonical + "/", live], ["https://www.helixskin.us.example.test", live],
  ] as const)("closes %s outside its exact qualified deployment before any merchant or database read", async (origin, env) => {
    expect((await readCheckoutStorefrontForOrigin(origin, env)).admissionOpen).toBe(false);
    expect(edges.binding).not.toHaveBeenCalled();
    expect(edges.offer).not.toHaveBeenCalled();
  });
  it("keeps historical local loopback functional without admitting remote hosts on an unhosted process", async () => {
    const local = { CHECKOUT_ENABLED: "true", STRIPE_SECRET_KEY: "sk_test_localFixture", STRIPE_WEBHOOK_SECRET: "whsec_localFixture" };
    expect((await readCheckoutStorefrontForOrigin("http://localhost:3000", { CHECKOUT_ENABLED: "true" })).admissionOpen).toBe(false);
    expect((await readCheckoutStorefrontForOrigin("http://localhost:3000", { ...local, STRIPE_ACCOUNT_ID: "acct_unapproved" })).admissionOpen).toBe(false);
    expect(await readCheckoutStorefrontForOrigin("http://127.0.0.1:4100", local)).toEqual({ mode: "historical_sandbox", admissionOpen: true });
    expect(await readCheckoutStorefrontForOrigin("http://localhost:3000", local)).toEqual({ mode: "historical_sandbox", admissionOpen: true });
    expect((await readCheckoutStorefrontForOrigin(canonical, local)).admissionOpen).toBe(false);
    expect((await readCheckoutStorefrontForOrigin(null, local)).admissionOpen).toBe(false);
    expect(edges.offer).not.toHaveBeenCalled();
  });
});
