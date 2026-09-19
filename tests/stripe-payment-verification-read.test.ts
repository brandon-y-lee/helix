import Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";
import { STRIPE_API_VERSION } from "@/lib/checkout/config";
import {
  expireCheckoutPaymentProviderSession,
  retrieveCheckoutPaymentProviderBundle,
  verifyStripeAccount,
} from "@/lib/stripe/payment-verification";

function stripeClient() {
  return new Stripe("sk_test_payment_verification", {
    apiVersion: STRIPE_API_VERSION,
    maxNetworkRetries: 0,
  });
}

function account(id = "acct_1Tm9WRFEzyaKzdmq") {
  return { id, object: "account" } as Stripe.Response<Stripe.Account>;
}

function session() {
  return {
    id: "cs_test_accepted",
    object: "checkout.session",
    livemode: false,
    mode: "payment",
    status: "complete",
    payment_status: "paid",
    payment_intent: { id: "pi_test_accepted", status: "succeeded", payment_method: { type: "card" } },
    discounts: [{ coupon: { id: "coupon_test", amount_off: 500, currency: "usd" }, promotion_code: null }],
    total_details: { amount_discount: 500, amount_shipping: 500, amount_tax: 200, breakdown: { discounts: [], taxes: [] } },
    shipping_cost: { amount_subtotal: 500, amount_tax: 0, amount_total: 500, shipping_rate: { id: "shr_test" }, taxes: [] },
    collected_information: { shipping_details: { name: "Sandbox recipient", address: { country: "US" } } },
  } as unknown as Stripe.Response<Stripe.Checkout.Session>;
}

function line(id = "li_first") {
  return {
    id,
    object: "item",
    quantity: 1,
    currency: "usd",
    amount_subtotal: 2500,
    amount_discount: 500,
    amount_tax: 200,
    amount_total: 2200,
    price: { id: "price_test", product: { id: "prod_test", metadata: { product_id: "product-1", variant_key: "30ml" } } },
    discounts: [{ amount: 500, discount: { id: "di_test", source: { type: "coupon", coupon: "coupon_test" } } }],
    taxes: [{ amount: 200, rate: { id: "txr_test", inclusive: false }, taxable_amount: 2000, taxability_reason: "standard_rated" }],
  } as unknown as Stripe.LineItem;
}

function page(data: Stripe.LineItem[], hasMore = false) {
  return { object: "list", data, has_more: hasMore, url: "/v1/checkout/sessions/cs_test_accepted/line_items" } as Stripe.Response<Stripe.ApiList<Stripe.LineItem>>;
}

describe("Stripe payment verification reads", () => {
  it("returns complete expanded expiration evidence without rereading the Session or lines", async () => {
    const stripe = stripeClient();
    const ownAccount = vi.spyOn(stripe.accounts, "retrieve").mockResolvedValue(account());
    const expiredSession = { ...session(), status: "expired", payment_status: "unpaid" } as ReturnType<typeof session>;
    const expireSession = vi.spyOn(stripe.checkout.sessions, "expire").mockResolvedValue(expiredSession);
    const retrieveSession = vi.spyOn(stripe.checkout.sessions, "retrieve");
    const listLines = vi.spyOn(stripe.checkout.sessions, "listLineItems");

    const result = await expireCheckoutPaymentProviderSession({ stripe, sessionId: "cs_test_accepted" });

    expect(result).toEqual(expiredSession);
    expect(result.payment_intent).toEqual({
      id: "pi_test_accepted", status: "succeeded", payment_method: { type: "card" },
    });
    expect(ownAccount.mock.invocationCallOrder[0]).toBeLessThan(expireSession.mock.invocationCallOrder[0]);
    expect(expireSession).toHaveBeenCalledWith("cs_test_accepted", {
      expand: [
        "payment_intent.payment_method", "discounts.coupon.applies_to", "discounts.coupon.currency_options",
        "shipping_cost.shipping_rate", "shipping_cost.taxes", "total_details.breakdown",
      ],
    }, { apiVersion: "2026-06-24.dahlia", timeout: 4_000, maxNetworkRetries: 0 });
    expect(retrieveSession).not.toHaveBeenCalled();
    expect(listLines).not.toHaveBeenCalled();
  });

  it.each(["cs_live_unapproved", "", "cs_test_with whitespace"])("rejects invalid sandbox expiration reference %s before provider access", async (sessionId) => {
    const stripe = stripeClient();
    const ownAccount = vi.spyOn(stripe.accounts, "retrieve").mockResolvedValue(account());
    const expireSession = vi.spyOn(stripe.checkout.sessions, "expire").mockResolvedValue(session());

    await expect(expireCheckoutPaymentProviderSession({ stripe, sessionId }))
      .rejects.toMatchObject({ code: "invalid_session" });
    expect(ownAccount).not.toHaveBeenCalled();
    expect(expireSession).not.toHaveBeenCalled();
  });

  it.each([
    { id: "cs_test_different" },
    { object: "payment_intent" },
    { livemode: true },
    { livemode: undefined },
    { mode: "subscription" },
    { status: "open" },
    { status: "complete" },
    { status: undefined },
  ])("rejects unverified expiration evidence %j", async (override) => {
    const stripe = stripeClient();
    vi.spyOn(stripe.accounts, "retrieve").mockResolvedValue(account());
    vi.spyOn(stripe.checkout.sessions, "expire").mockResolvedValue({
      ...session(), status: "expired", ...override,
    } as ReturnType<typeof session>);

    await expect(expireCheckoutPaymentProviderSession({ stripe, sessionId: "cs_test_accepted" }))
      .rejects.toMatchObject({ code: "invalid_session", message: "Sandbox checkout reference could not be verified." });
  });

  it.each(["account failure", "account mismatch", "expiration failure"])("redacts %s and refuses unproven expiration", async (failure) => {
    const stripe = stripeClient();
    const ownAccount = vi.spyOn(stripe.accounts, "retrieve").mockResolvedValue(account());
    const expireSession = vi.spyOn(stripe.checkout.sessions, "expire");
    const privateError = new Error("Private provider payload with recipient address and secret");
    if (failure === "account failure") ownAccount.mockRejectedValueOnce(privateError);
    else if (failure === "account mismatch") ownAccount.mockResolvedValueOnce(account("acct_unapproved"));
    else expireSession.mockRejectedValueOnce(privateError);

    const error = await expireCheckoutPaymentProviderSession({ stripe, sessionId: "cs_test_accepted" })
      .catch((reason: unknown) => reason);

    expect(error).toMatchObject(failure === "expiration failure"
      ? { code: "provider_unavailable", message: "Payment provider could not be reached." }
      : {
        code: failure === "account mismatch" ? "account_mismatch" : "account_unverified",
        message: "Payment provider account could not be verified.",
      });
    expect((error as Error).cause).toBeUndefined();
    if (failure !== "expiration failure") expect(expireSession).not.toHaveBeenCalled();
  });

  it("rejects credentials belonging to a different account", async () => {
    const stripe = stripeClient();
    vi.spyOn(stripe.accounts, "retrieve").mockResolvedValue(account("acct_unapproved"));

    await expect(verifyStripeAccount(stripe)).rejects.toMatchObject({
      code: "account_mismatch",
      message: "Payment provider account could not be verified.",
    });
  });

  it("shares in-flight and successful proof only for the same credential client", async () => {
    const stripe = stripeClient();
    const ownAccount = vi.spyOn(stripe.accounts, "retrieve").mockResolvedValue(account());
    const expected = { accountId: "acct_1Tm9WRFEzyaKzdmq", apiVersion: "2026-06-24.dahlia" };

    expect(await Promise.all([verifyStripeAccount(stripe), verifyStripeAccount(stripe)]))
      .toEqual([expected, expected]);
    expect(await verifyStripeAccount(stripe)).toEqual(expected);
    expect(ownAccount).toHaveBeenCalledTimes(1);
    expect(ownAccount).toHaveBeenCalledWith(null, {}, expect.objectContaining({
      apiVersion: "2026-06-24.dahlia",
    }));

    const rotated = stripeClient();
    const rotatedProof = vi.spyOn(rotated.accounts, "retrieve").mockResolvedValue(account());
    expect(await verifyStripeAccount(rotated)).toEqual(expected);
    expect(rotatedProof).toHaveBeenCalledTimes(1);
  });

  it.each(["provider failure", "account mismatch"])("does not retain %s as account proof", async (failure) => {
    const stripe = stripeClient();
    const ownAccount = vi.spyOn(stripe.accounts, "retrieve");
    if (failure === "provider failure") {
      ownAccount.mockRejectedValueOnce(new Error("Sensitive provider response"));
    } else {
      ownAccount.mockResolvedValueOnce(account("acct_wrong"));
    }
    ownAccount.mockResolvedValue(account());

    const error = await verifyStripeAccount(stripe).catch((reason: unknown) => reason);
    expect(error).toMatchObject({
      code: failure === "provider failure" ? "account_unverified" : "account_mismatch",
      message: "Payment provider account could not be verified.",
    });
    expect((error as Error).cause).toBeUndefined();
    await expect(verifyStripeAccount(stripe)).resolves.toMatchObject({ accountId: "acct_1Tm9WRFEzyaKzdmq" });
  });

  it("retrieves the expanded authoritative payment evidence without losing tax or coupon fields", async () => {
    const stripe = stripeClient();
    vi.spyOn(stripe.accounts, "retrieve").mockResolvedValue(account());
    const sourceSession = session();
    const sourceLine = line();
    const retrieveSession = vi.spyOn(stripe.checkout.sessions, "retrieve").mockResolvedValue(sourceSession);
    const listLines = vi.spyOn(stripe.checkout.sessions, "listLineItems").mockResolvedValue(page([sourceLine]));

    expect(await retrieveCheckoutPaymentProviderBundle({ stripe, sessionId: "cs_test_accepted" })).toEqual({
      accountId: "acct_1Tm9WRFEzyaKzdmq",
      apiVersion: "2026-06-24.dahlia",
      session: sourceSession,
      lineItems: [sourceLine],
      lineItemsComplete: true,
    });
    expect(retrieveSession).toHaveBeenCalledWith("cs_test_accepted", {
      expand: expect.arrayContaining([
        "payment_intent.payment_method", "discounts.coupon.applies_to", "discounts.coupon.currency_options",
        "shipping_cost.shipping_rate", "shipping_cost.taxes", "total_details.breakdown",
      ]),
    }, expect.objectContaining({ apiVersion: "2026-06-24.dahlia" }));
    expect(listLines).toHaveBeenCalledWith("cs_test_accepted", {
      limit: 100,
      expand: ["data.price.product", "data.discounts", "data.taxes"],
    }, expect.objectContaining({ apiVersion: "2026-06-24.dahlia" }));
  });

  it("collects every line page before exposing evidence as complete", async () => {
    const stripe = stripeClient();
    vi.spyOn(stripe.accounts, "retrieve").mockResolvedValue(account());
    vi.spyOn(stripe.checkout.sessions, "retrieve").mockResolvedValue(session());
    const first = line("li_first");
    const second = line("li_second");
    const listLines = vi.spyOn(stripe.checkout.sessions, "listLineItems")
      .mockResolvedValueOnce(page([first], true))
      .mockResolvedValueOnce(page([second]));

    const result = await retrieveCheckoutPaymentProviderBundle({ stripe, sessionId: "cs_test_accepted" });
    expect(result.lineItems).toEqual([first, second]);
    expect(result.lineItemsComplete).toBe(true);
    expect(listLines).toHaveBeenLastCalledWith("cs_test_accepted", {
      limit: 100,
      expand: ["data.price.product", "data.discounts", "data.taxes"],
      starting_after: "li_first",
    }, expect.objectContaining({ apiVersion: "2026-06-24.dahlia" }));
  });

  it.each([
    ["empty continuing page", [page([], true), page([])]],
    ["duplicate cursor", [page([line()], true), page([line()])]],
    ["missing completion flag", [{ ...page([line()]), has_more: undefined }]],
    ["too many items", [page(Array.from({ length: 101 }, (_, index) => line(`li_${index}`)))]],
    ["too many pages", Array.from({ length: 6 }, (_, index) => page([line(`li_${index}`)], index < 5))],
  ])("rejects %s instead of presenting incomplete financial evidence", async (_reason, pages) => {
    const stripe = stripeClient();
    vi.spyOn(stripe.accounts, "retrieve").mockResolvedValue(account());
    vi.spyOn(stripe.checkout.sessions, "retrieve").mockResolvedValue(session());
    const listLines = vi.spyOn(stripe.checkout.sessions, "listLineItems");
    for (const nextPage of pages) listLines.mockResolvedValueOnce(nextPage as ReturnType<typeof page>);

    await expect(retrieveCheckoutPaymentProviderBundle({ stripe, sessionId: "cs_test_accepted" }))
      .rejects.toMatchObject({ code: "incomplete_line_items" });
    expect(listLines.mock.calls.length).toBeLessThanOrEqual(5);
  });

  it.each(["session", "line page"])("redacts a failed %s read without returning partial evidence", async (failure) => {
    const stripe = stripeClient();
    vi.spyOn(stripe.accounts, "retrieve").mockResolvedValue(account());
    const retrieveSession = vi.spyOn(stripe.checkout.sessions, "retrieve").mockResolvedValue(session());
    const listLines = vi.spyOn(stripe.checkout.sessions, "listLineItems").mockResolvedValueOnce(page([line()], true));
    const privateError = new Error("Provider payload includes secret and recipient address");
    if (failure === "session") retrieveSession.mockRejectedValueOnce(privateError);
    else listLines.mockRejectedValueOnce(privateError);

    const error = await retrieveCheckoutPaymentProviderBundle({ stripe, sessionId: "cs_test_accepted" })
      .catch((reason: unknown) => reason);
    expect(error).toMatchObject({ code: "provider_unavailable", message: "Payment provider could not be reached." });
    expect((error as Error).cause).toBeUndefined();
  });

  it("does not retrieve payment data before the authenticating account is verified", async () => {
    const stripe = stripeClient();
    vi.spyOn(stripe.accounts, "retrieve").mockResolvedValue(account("acct_unapproved"));
    const retrieveSession = vi.spyOn(stripe.checkout.sessions, "retrieve");
    const listLines = vi.spyOn(stripe.checkout.sessions, "listLineItems");

    await expect(retrieveCheckoutPaymentProviderBundle({ stripe, sessionId: "cs_test_accepted" }))
      .rejects.toMatchObject({ code: "account_mismatch" });
    expect(retrieveSession).not.toHaveBeenCalled();
    expect(listLines).not.toHaveBeenCalled();
  });

  it.each(["cs_live_unapproved", "", "cs_test_with whitespace"])("rejects invalid sandbox reference %s before provider reads", async (sessionId) => {
    const stripe = stripeClient();
    const ownAccount = vi.spyOn(stripe.accounts, "retrieve").mockResolvedValue(account());
    const retrieveSession = vi.spyOn(stripe.checkout.sessions, "retrieve").mockResolvedValue(session());
    vi.spyOn(stripe.checkout.sessions, "listLineItems").mockResolvedValue(page([line()]));

    await expect(retrieveCheckoutPaymentProviderBundle({ stripe, sessionId }))
      .rejects.toMatchObject({ code: "invalid_session" });
    expect(ownAccount).not.toHaveBeenCalled();
    expect(retrieveSession).not.toHaveBeenCalled();
  });

  it.each([
    { id: "cs_test_different" },
    { livemode: true },
    { livemode: undefined },
    { object: "payment_intent" },
  ])("rejects mismatched or unproven sandbox Session identity %j", async (override) => {
    const stripe = stripeClient();
    vi.spyOn(stripe.accounts, "retrieve").mockResolvedValue(account());
    vi.spyOn(stripe.checkout.sessions, "retrieve").mockResolvedValue({ ...session(), ...override } as ReturnType<typeof session>);
    const listLines = vi.spyOn(stripe.checkout.sessions, "listLineItems").mockResolvedValue(page([line()]));

    await expect(retrieveCheckoutPaymentProviderBundle({ stripe, sessionId: "cs_test_accepted" }))
      .rejects.toMatchObject({ code: "invalid_session" });
    expect(listLines).not.toHaveBeenCalled();
  });

  it("evicts proof even when the SDK fails synchronously before sending a request", async () => {
    const stripe = stripeClient();
    vi.spyOn(stripe.accounts, "retrieve")
      .mockImplementationOnce(() => { throw new Error("Private request validation details"); })
      .mockResolvedValue(account());

    await expect(verifyStripeAccount(stripe)).rejects.toMatchObject({ code: "account_unverified" });
    await expect(verifyStripeAccount(stripe)).resolves.toMatchObject({ accountId: "acct_1Tm9WRFEzyaKzdmq" });
  });
});
