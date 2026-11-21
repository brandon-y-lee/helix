import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const edge = vi.hoisted(() => ({ binding: vi.fn(), account: vi.fn(), cart: vi.fn(), guest: vi.fn(), rpc: vi.fn(),
  create: vi.fn(), retrieve: vi.fn(), shippingRate: vi.fn(), setReceipt: vi.fn() }));
vi.mock("@/lib/stripe/live-provider", async original => ({ ...await original<typeof import("@/lib/stripe/live-provider")>(),
  readBusinessStripeBinding: edge.binding, verifyBusinessStripeAccount: edge.account }));
vi.mock("@/lib/cart/server", () => ({ getCheckoutCartSnapshot: edge.cart }));
vi.mock("@/lib/orders/business-receipt-cookie", () => ({ prepareBusinessGuestReceipt: edge.guest }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({ rpc: edge.rpc }) }));
import { createStripeCheckoutSession } from "@/lib/orders/server";
import { BUSINESS_SANDBOX_STOREFRONT_ORIGIN } from "@/lib/checkout/business-origin";
import { HELIX_VERCEL_PROJECT_ID, supabaseOriginForTarget } from "@/lib/supabase/project-safety";
const accountId = "acct_BusinessFixture", origin = "https://www.helixskin.us";
const order = "00000000-0000-4000-8000-000000000001", attempt = "00000000-0000-4000-8000-000000000002";
const nonce = "00000000-0000-4000-8000-000000000003", lineId = "00000000-0000-4000-8000-000000000004";
const sessionId = "cs_live_Fixture";
const terms = { orderId: order, attemptId: attempt, accountId, bindingNonce: nonce, sessionId: null, legacyEligible: false,
  version: "checkout_v2", environment: "live", apiVersion: "2026-06-24.dahlia", currency: "USD", couponId: null,
  customerId: null, automaticTaxEnabled: false, freeShipping: true, taxBehavior: "exclusive", shippingRateId: null,
  shippingCents: 0, discountCents: 0, preTaxTotalCents: 3000, merchandiseSubtotalCents: 3000,
  lines: [{ lineId, productId: "fixture-product", productSlug: "serum", variantKey: "30ml", quantity: 1, unitAmountCents: 3000 }] };
const reservation = { state: "reserved", orderId: order, attemptId: attempt, orderNumber: "HX-TEST",
  bindingNonce: nonce, sessionId: null, idempotencyKey: "live:fixture-order", terms, productName: "Fixture serum",
  taxCode: "txcd_99999999", shipper: "Fixture shipper", dispatchTerms: "Fixture dispatch", returnTerms: "Fixture returns" };
const metadata = { order_id: order, attempt_id: attempt, binding_nonce: nonce, schema: "checkout_v2", environment: "live", application: "helix" };
const hosted = { id: sessionId, object: "checkout.session", status: "open", payment_status: "unpaid", currency: "usd",
  mode: "payment", client_reference_id: order, metadata, livemode: true, payment_intent: null, customer: null,
  payment_method_types: ["card"], allow_promotion_codes: false, amount_total: 3000, amount_subtotal: 3000,
  success_url: origin + "/checkout/success?session_id={CHECKOUT_SESSION_ID}", cancel_url: origin + "/cart?checkout=cancelled",
  recovered_from: null, after_expiration: { recovery: { enabled: false } }, expires_at: Math.floor(Date.now()/1000)+3600,
  url: "https://checkout.stripe.com/c/pay/cs_live_Fixture" };
function storage(overrides: Record<string, unknown> = {}) {
  const values: Record<string, unknown> = { reserve_business_checkout: reservation,
    start_business_checkout_send: { ...reservation, state: "send" }, bind_recovered_business_checkout_session: true, ...overrides };
  edge.rpc.mockImplementation(async (name: string) => {
    if (!(name in values)) throw new Error("Unexpected storage operation");
    return { data: values[name], error: null };
  });
}
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("CHECKOUT_MODE","live"); vi.stubEnv("HELIX_STRIPE_LIVE_ADMISSION_ENABLED","true");
  edge.binding.mockReturnValue({ accountId, environment: "live", webhookSecret: "whsec_fixture",
    stripe: { checkout: { sessions: { create: edge.create, retrieve: edge.retrieve } }, shippingRates: { retrieve:edge.shippingRate } } });
  edge.account.mockResolvedValue({ accountId, chargesEnabled:true, payoutsEnabled:true });
  edge.cart.mockResolvedValue({ cartId:"cart-fixture", checkoutGeneration:"generation", userId:null,
    userEmail:null, lines:[{ productId:"fixture-product",slug:"serum",variantId:"30ml",price:3000,quantity:1,available:true }] });
  edge.guest.mockResolvedValue({ guestHash:"a".repeat(64), receiptHash:"b".repeat(64), bindSession:edge.setReceipt });
  edge.create.mockResolvedValue(hosted); edge.retrieve.mockResolvedValue(hosted); storage();
});
afterEach(() => vi.unstubAllEnvs());
describe("business Checkout admission from the normal cart service", () => {
  it("commits stock and the first send before a merchant-bound Session and binds it before redirect", async () => {
    const result = await createStripeCheckoutSession({requestOrigin:origin});
    expect(result).toEqual({ orderId:order, orderNumber:"HX-TEST", sessionId, url:hosted.url });
    expect(edge.rpc.mock.calls.map(([name]) => name)).toEqual(["reserve_business_checkout","start_business_checkout_send","bind_recovered_business_checkout_session"]);
    const [params, options] = edge.create.mock.calls[0];
    expect(params.metadata).toMatchObject(metadata);
    expect(params.payment_intent_data.metadata).toMatchObject(metadata);
    expect(params.shipping_address_collection).toEqual({allowed_countries:["US"]});
    expect(params.line_items[0].price_data).toMatchObject({unit_amount:3000,tax_behavior:"exclusive",currency:"usd"});
    expect(options.idempotencyKey).toBe(reservation.idempotencyKey);
    expect(edge.setReceipt).toHaveBeenCalledWith(sessionId);
  });
  it("leaves a lost send unresolved without a replacement or stock release", async () => {
    edge.create.mockRejectedValue(new Error("network"));
    await expect(createStripeCheckoutSession({requestOrigin:origin})).rejects.toThrow();
    expect(edge.rpc.mock.calls.map(([name]) => name)).toEqual(["reserve_business_checkout","start_business_checkout_send"]);
    storage({reserve_business_checkout:{...reservation,state:"send_started"}});
    await expect(createStripeCheckoutSession({requestOrigin:origin})).rejects.toThrow();
    expect(edge.create).toHaveBeenCalledTimes(1); expect(edge.setReceipt).not.toHaveBeenCalled();
  });
  it("creates a business sandbox Session for the stable child and binds the buyer return there", async () => {
    const mode = "business_sandbox", childAccount = "acct_ChildFixture", childSession = "cs_test_ChildFixture";
    const childOrigin = BUSINESS_SANDBOX_STOREFRONT_ORIGIN;
    for (const [name, value] of Object.entries({
      VERCEL: "1", VERCEL_ENV: "preview", VERCEL_TARGET_ENV: "preview", VERCEL_PROJECT_ID: HELIX_VERCEL_PROJECT_ID,
      VERCEL_GIT_COMMIT_REF: "codex/558-verified-dev-preview", NEXT_PUBLIC_HELIX_SUPABASE_TARGET: "development",
      NEXT_PUBLIC_SUPABASE_URL: supabaseOriginForTarget("development"), CHECKOUT_MODE: mode,
      CHECKOUT_ORIGIN: childOrigin, HELIX_STRIPE_DEV_ADMISSION_ENABLED: "true",
    })) vi.stubEnv(name, value);
    edge.binding.mockReturnValue({ accountId: childAccount, environment: mode, webhookSecret: "whsec_childfixture",
      stripe: { checkout: { sessions: { create: edge.create, retrieve: edge.retrieve } } } });
    edge.account.mockResolvedValue({ accountId: childAccount, chargesEnabled: true, payoutsEnabled: true });
    const accepted = { ...reservation, terms: { ...terms, accountId: childAccount, environment: mode }, idempotencyKey: mode + ":fixture-order" };
    storage({reserve_business_checkout: accepted, start_business_checkout_send: { ...accepted, state: "send" }});
    const session = { ...hosted, id: childSession, livemode: false, metadata: { ...metadata, environment: mode },
      success_url: childOrigin + "/checkout/success?session_id={CHECKOUT_SESSION_ID}",
      cancel_url: childOrigin + "/cart?checkout=cancelled", url: "https://checkout.stripe.com/c/pay/" + childSession };
    edge.create.mockResolvedValue(session);
    await expect(createStripeCheckoutSession({requestOrigin:origin})).rejects.toThrow("unavailable on this address");
    expect(edge.account).not.toHaveBeenCalled();
    expect(edge.rpc).not.toHaveBeenCalled();
    const result = await createStripeCheckoutSession({requestOrigin:childOrigin});
    expect(result).toMatchObject({ sessionId: childSession, url: session.url });
    expect(edge.rpc.mock.calls.map(([,args]) => [args.p_environment, args.p_account_id])).toEqual(
      Array.from({length:3}, () => [mode, childAccount]));
    expect(edge.create.mock.calls[0][0]).toMatchObject({ success_url: session.success_url, cancel_url: session.cancel_url,
      payment_intent_data: { metadata: { environment: mode } } });
  });
  it.each([true,false])("uses only the original merchant's verified fixed shipping rate (matches=%s)", async matches => {
    const shippingRateId = "shr_Fixture";
    const priced = { ...terms, shippingRateId, shippingCents: 500, freeShipping: false, preTaxTotalCents: 3500 };
    const accepted = { ...reservation, terms: priced };
    storage({reserve_business_checkout: accepted, start_business_checkout_send: { ...accepted, state: "send" },
      release_unsent_business_checkout: true });
    edge.shippingRate.mockResolvedValue({ id: shippingRateId, object: "shipping_rate", livemode: matches, type: "fixed_amount",
      active: true, fixed_amount: { currency: "usd", amount: 500 }, tax_behavior: "exclusive" });
    const call = createStripeCheckoutSession({ requestOrigin: origin });
    if (matches) {
      await expect(call).resolves.toMatchObject({ sessionId });
      expect(edge.create.mock.calls[0][0].shipping_options).toEqual([{shipping_rate:shippingRateId}]);
    } else {
      await expect(call).rejects.toThrow();
      expect(edge.create).not.toHaveBeenCalled();
      expect(edge.rpc.mock.calls.map(([name]) => name)).toEqual(["reserve_business_checkout","release_unsent_business_checkout"]);
    }
    expect(edge.shippingRate).toHaveBeenCalledWith(shippingRateId);
  });
  it("prepares missing guest proof without opening an Order or payment", async () => {
    edge.guest.mockResolvedValue(null);
    await expect(createStripeCheckoutSession({requestOrigin:origin})).rejects.toMatchObject({code:"CHECKOUT_RECEIPT_PREPARED"});
    expect(edge.rpc).not.toHaveBeenCalled(); expect(edge.create).not.toHaveBeenCalled();
  });
  it.each(["unavailable","unauthorized","stale","terminal","closed"])("refuses a %s reservation before Stripe creation",async state => {
    storage({reserve_business_checkout:{state}});
    await expect(createStripeCheckoutSession({requestOrigin:origin})).rejects.toThrow();
    expect(edge.create).not.toHaveBeenCalled();
  });
  it("never exposes an unbound or foreign URL after a successful provider response", async () => {
    edge.create.mockResolvedValue({...hosted,url:"https://wrong.example/pay"});
    await expect(createStripeCheckoutSession({requestOrigin:origin})).rejects.toThrow();
    expect(edge.setReceipt).not.toHaveBeenCalled();
    expect(edge.rpc.mock.calls.map(([name]) => name)).toEqual(["reserve_business_checkout","start_business_checkout_send"]);
  });
  it.each([{recovered_from:"cs_live_original"}, {livemode:false}, {allow_promotion_codes:true}, {payment_method_types:["card","link"]},
    {after_expiration:{recovery:{enabled:true}}}, {customer:"cus_foreign"}, {metadata:{...metadata,binding_nonce:order}}])(
    "holds an ambiguous create response that contradicts the submitted terms", async changes => {
      edge.create.mockResolvedValue({...hosted,...changes});
      await expect(createStripeCheckoutSession({requestOrigin:origin})).rejects.toThrow();
      expect(edge.setReceipt).not.toHaveBeenCalled();
      expect(edge.rpc.mock.calls.map(([name]) => name)).toEqual(["reserve_business_checkout","start_business_checkout_send"]);
    });
  it("resumes a verified bound Session without starting a second payment", async () => {
    storage({reserve_business_checkout:{...reservation,state:"bound",sessionId,terms:{...terms,sessionId}}});
    expect((await createStripeCheckoutSession({requestOrigin:origin})).url).toBe(hosted.url);
    expect(edge.create).not.toHaveBeenCalled(); expect(edge.retrieve).toHaveBeenCalledWith(sessionId);
    expect(edge.setReceipt).toHaveBeenCalledWith(sessionId);
  });
  it("releases only an unsent reservation whose new quote differs from the displayed cart", async () => {
    edge.cart.mockResolvedValue({cartId:"cart-fixture",checkoutGeneration:"generation",userId:"user-fixture",
      lines:[{productId:"fixture-product",slug:"serum",variantId:"30ml",price:9999,quantity:1,available:true}]});
    storage({release_unsent_business_checkout:true});
    await expect(createStripeCheckoutSession({requestOrigin:origin})).rejects.toThrow();
    expect(edge.create).not.toHaveBeenCalled();
    expect(edge.rpc.mock.calls.map(([name]) => name)).toEqual(["reserve_business_checkout","release_unsent_business_checkout"]);
  });
  it("releases a confirmed pre-send denial when the offer closes after reservation", async () => {
    storage({start_business_checkout_send:{state:"closed"},release_unsent_business_checkout:true});
    await expect(createStripeCheckoutSession({requestOrigin:origin})).rejects.toThrow("not accepting");
    expect(edge.create).not.toHaveBeenCalled();
    expect(edge.rpc.mock.calls.map(([name]) => name)).toEqual(["reserve_business_checkout","start_business_checkout_send","release_unsent_business_checkout"]);
  });
});
