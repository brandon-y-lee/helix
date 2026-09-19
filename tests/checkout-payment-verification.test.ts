import type Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { verifyCheckoutPayment } from "@/lib/checkout/payment-verification";
import { checkoutPaymentFixture } from "./fixtures/checkout-payment-verification";

function discountedFixture() {
  const input = checkoutPaymentFixture();
  input.accepted.couponId = "coupon_reward";
  input.accepted.discountCents = 500;
  input.accepted.preTaxTotalCents = 5000;
  input.provider.session.amount_total = 5000;
  input.provider.session.total_details!.amount_discount = 500;
  const coupon = { id: "coupon_reward", object: "coupon", livemode: false, amount_off: 500,
    percent_off: null, currency: "usd" } as Stripe.Coupon;
  input.provider.session.discounts = [{ coupon, promotion_code: null }];
  const discount = { id: "di_1", object: "discount", source: { type: "coupon", coupon: "coupon_reward" },
    checkout_session: "cs_test_1", promotion_code: null } as Stripe.Discount;
  input.provider.session.total_details!.breakdown!.discounts = [{ amount: 500, discount }];
  input.provider.lineItems[0].amount_discount = 500;
  input.provider.lineItems[0].amount_total = 4500;
  input.provider.lineItems[0].discounts = [{ amount: 500, discount }];
  const intent = input.provider.session.payment_intent as Stripe.PaymentIntent;
  intent.amount = 5000;
  intent.amount_received = 5000;
  return input;
}

function taxedFixture() {
  const input = checkoutPaymentFixture();
  input.accepted.automaticTaxEnabled = true;
  input.accepted.taxBehavior = "exclusive";
  input.provider.session.automatic_tax = { enabled: true, status: "complete", liability: null, provider: "stripe" };
  const rate = { id: "txr_1", object: "tax_rate", livemode: false, inclusive: false, percentage: 10 } as Stripe.TaxRate;
  input.provider.lineItems[0].price!.tax_behavior = "exclusive";
  input.provider.lineItems[0].amount_tax = 500;
  input.provider.lineItems[0].amount_total = 5500;
  input.provider.lineItems[0].taxes = [{ amount: 500, rate, taxable_amount: 5000, taxability_reason: "standard_rated" }];
  const shipping = input.provider.session.shipping_cost!;
  (shipping.shipping_rate as Stripe.ShippingRate).tax_behavior = "exclusive";
  shipping.amount_tax = 50;
  shipping.amount_total = 550;
  shipping.taxes = [{ amount: 50, rate, taxable_amount: 500, taxability_reason: "standard_rated" }];
  input.provider.session.total_details!.amount_tax = 550;
  input.provider.session.total_details!.breakdown!.taxes = [{ amount: 550, rate, taxable_amount: 5500, taxability_reason: "standard_rated" }];
  input.provider.session.amount_total = 6050;
  const intent = input.provider.session.payment_intent as Stripe.PaymentIntent;
  intent.amount = 6050;
  intent.amount_received = 6050;
  return input;
}

function legacyFixture(input = checkoutPaymentFixture()) {
  input.accepted.version = "checkout_v1";
  input.accepted.legacyEligible = true;
  input.accepted.attemptId = null;
  input.accepted.automaticTaxEnabled = null;
  input.accepted.taxBehavior = null;
  input.accepted.couponId = null;
  input.accepted.shippingRateId = null;
  input.provider.session.metadata = { order_id: "order-1", schema: "checkout_v1", environment: "sandbox" };
  const intent = input.provider.session.payment_intent as Stripe.PaymentIntent;
  intent.metadata = { ...input.provider.session.metadata };
  input.provider.session.payment_method_types = ["us_bank_account", "card"];
  (intent.payment_method as Stripe.PaymentMethod).type = "us_bank_account";
  return input;
}

describe("payment verification", () => {
  it("verifies free shipping with zero tax under a completed automatic-tax calculation", () => {
    const input = taxedFixture();
    input.accepted.shippingCents = 0;
    input.accepted.preTaxTotalCents = 5000;
    input.accepted.freeShipping = true;
    input.accepted.shippingRateId = null;
    const shipping = input.provider.session.shipping_cost!;
    const rate = shipping.shipping_rate as Stripe.ShippingRate;
    rate.fixed_amount!.amount = 0;
    rate.tax_behavior = "unspecified";
    rate.metadata = { environment: "sandbox", free_shipping_threshold: "5000" };
    shipping.amount_subtotal = shipping.amount_tax = shipping.amount_total = 0;
    shipping.taxes = [];
    input.provider.session.total_details!.amount_shipping = 0;
    input.provider.session.total_details!.amount_tax = 500;
    input.provider.session.total_details!.breakdown!.taxes[0].amount = 500;
    input.provider.session.total_details!.breakdown!.taxes[0].taxable_amount = 5000;
    input.provider.session.amount_total = 5500;
    const intent = input.provider.session.payment_intent as Stripe.PaymentIntent;
    intent.amount = intent.amount_received = 5500;
    expect(verifyCheckoutPayment(input)).toMatchObject({ status: "paid", facts: { shippingCents: 0, taxCents: 500, totalCents: 5500 } });
    rate.metadata = {};
    expect(verifyCheckoutPayment(input)).toMatchObject({ status: "exception", code: "shipping_mismatch" });
  });
  it("rejects a paid Session whose new payment-method policy cannot be proven", () => {
    const input = checkoutPaymentFixture();
    input.provider.session.payment_method_types = undefined as unknown as string[];
    expect(verifyCheckoutPayment(input)).toMatchObject({ status: "exception", code: "payment_identity_mismatch" });
  });
  it("accepts exact accepted percentage discounts without inventing Stripe's fractional-cent rounding direction", () => {
    const input = discountedFixture();
    const coupon = input.provider.session.discounts![0].coupon as Stripe.Coupon;
    coupon.amount_off = null;
    coupon.percent_off = 15;
    coupon.currency = null;
    input.accepted.lines[0].unitAmountCents = 2502;
    input.accepted.merchandiseSubtotalCents = 5004;
    input.accepted.discountCents = 750;
    input.accepted.preTaxTotalCents = 4754;
    const line = input.provider.lineItems[0];
    line.price!.unit_amount = 2502;
    line.price!.unit_amount_decimal = null;
    line.amount_subtotal = 5004;
    line.amount_discount = 750;
    line.amount_total = 4254;
    line.discounts![0].amount = 750;
    input.provider.session.total_details!.breakdown!.discounts[0].amount = 750;
    input.provider.session.total_details!.amount_discount = 750;
    input.provider.session.amount_subtotal = 5004;
    input.provider.session.amount_total = 4754;
    const intent = input.provider.session.payment_intent as Stripe.PaymentIntent;
    intent.amount = intent.amount_received = 4754;
    expect(verifyCheckoutPayment(input)).toMatchObject({ status: "paid", facts: { discountCents: 750, totalCents: 4754 } });
    line.amount_discount = 751;
    line.amount_total = 4253;
    line.discounts![0].amount = 751;
    input.provider.session.total_details!.breakdown!.discounts[0].amount = 751;
    input.provider.session.total_details!.amount_discount = 751;
    input.provider.session.amount_total = 4753;
    intent.amount = intent.amount_received = 4753;
    expect(verifyCheckoutPayment(input)).toMatchObject({ status: "exception", code: "discount_mismatch" });
  });

  it("checks percentage allocation on each eligible line while keeping the accepted aggregate exact", () => {
    const input = discountedFixture();
    const coupon = input.provider.session.discounts![0].coupon as Stripe.Coupon;
    coupon.amount_off = null;
    coupon.percent_off = 15;
    coupon.currency = null;
    input.accepted.lines = [1, 2, 3].map((index) => ({ productId: `product-${index}`, productSlug: `product-${index}`,
      variantKey: "30ml", quantity: 1, unitAmountCents: 5003 }));
    input.accepted.merchandiseSubtotalCents = 15009;
    input.accepted.discountCents = 2250;
    input.accepted.preTaxTotalCents = 13259;
    input.provider.lineItems = [1, 2, 3].map((index) => {
      const line = structuredClone(input.provider.lineItems[0]);
      line.id = `li_${index}`;
      line.quantity = 1;
      line.price!.unit_amount = 5003;
      line.price!.unit_amount_decimal = null;
      line.price!.product = { id: `prod_${index}`, livemode: false,
        metadata: { product_id: `product-${index}`, slug: `product-${index}`, variant_key: "30ml" } } as unknown as Stripe.Product;
      line.amount_subtotal = 5003;
      line.amount_discount = 750;
      line.amount_total = 4253;
      line.discounts![0].amount = 750;
      return line;
    });
    input.provider.session.total_details!.breakdown!.discounts[0].amount = 2250;
    input.provider.session.total_details!.amount_discount = 2250;
    input.provider.session.amount_subtotal = 15009;
    input.provider.session.amount_total = 13259;
    const intent = input.provider.session.payment_intent as Stripe.PaymentIntent;
    intent.amount = intent.amount_received = 13259;
    expect(verifyCheckoutPayment(input)).toMatchObject({ status: "paid", facts: { discountCents: 2250, totalCents: 13259 } });
    input.provider.lineItems[0].amount_discount = 748;
    input.provider.lineItems[0].amount_total = 4255;
    input.provider.lineItems[0].discounts![0].amount = 748;
    input.provider.lineItems[1].amount_discount = 752;
    input.provider.lineItems[1].amount_total = 4251;
    input.provider.lineItems[1].discounts![0].amount = 752;
    expect(verifyCheckoutPayment(input)).toMatchObject({ status: "exception", code: "discount_mismatch" });
  });

  it("never returns paid without the provider payment reference", () => {
    const input = checkoutPaymentFixture();
    (input.provider.session.payment_intent as Stripe.PaymentIntent).id = "";
    expect(verifyCheckoutPayment(input)).toMatchObject({ status: "exception", code: "payment_identity_mismatch" });
  });
  it.each(["tax off", "tax on", "discount"])("settles a locally eligible legacy delayed-method payment with %s", (terms) => {
    const input = legacyFixture(terms === "tax on" ? taxedFixture() : terms === "discount" ? discountedFixture() : checkoutPaymentFixture());
    expect(verifyCheckoutPayment(input)).toMatchObject({ status: "paid", facts: { contractVersion: "checkout_v1", paymentMethodType: "us_bank_account" } });
  });

  it.each(["not locally eligible", "new attempt pretending to be old"])("never selects weaker legacy verification from provider metadata: %s", (caseName) => {
    const input = legacyFixture();
    if (caseName === "not locally eligible") input.accepted.legacyEligible = false;
    else {
      input.accepted = checkoutPaymentFixture().accepted;
      input.provider.session.payment_status = "unpaid";
    }
    expect(verifyCheckoutPayment(input).status).toBe("exception");
  });

  it.each(["order", "client reference", "attempt", "schema", "session", "currency", "live mode", "PI order", "PI attempt", "PI currency", "PI live mode", "customer", "API version"])(
    "refuses contradictory %s identity", (field) => {
      const input = checkoutPaymentFixture();
      const session = input.provider.session;
      const intent = session.payment_intent as Stripe.PaymentIntent;
      if (field === "order") session.metadata!.order_id = "order-other";
      if (field === "client reference") session.client_reference_id = "order-other";
      if (field === "attempt") session.metadata!.attempt_id = "attempt-other";
      if (field === "schema") session.metadata!.schema = "checkout_v1";
      if (field === "session") session.id = "cs_test_other";
      if (field === "currency") session.currency = "eur";
      if (field === "live mode") session.livemode = true;
      if (field === "PI order") intent.metadata.order_id = "order-other";
      if (field === "PI attempt") intent.metadata.attempt_id = "attempt-other";
      if (field === "PI currency") intent.currency = "eur";
      if (field === "PI live mode") intent.livemode = true;
      if (field === "customer") session.customer = "cus_other";
      if (field === "API version") input.provider.apiVersion = "different";
      expect(verifyCheckoutPayment(input)).toMatchObject({ status: "exception", paymentIntentId: "pi_1" });
    },
  );

  it.each([null, undefined, -1, 5500.1, Number.NaN, Number.POSITIVE_INFINITY, 2_147_483_648, "5500"])(
    "never substitutes local totals for an invalid provider amount %s", (amount) => {
      const input = checkoutPaymentFixture();
      input.provider.session.amount_total = amount as number;
      expect(verifyCheckoutPayment(input).status).toBe("exception");
    },
  );

  it.each(["name", "line1", "city", "state", "postal_code", "country", "shipping_details"])(
    "retains an exception for missing physical shipping %s even with a complete billing address", (field) => {
      const input = checkoutPaymentFixture();
      const shipping = input.provider.session.collected_information!.shipping_details!;
      if (field === "shipping_details") input.provider.session.collected_information!.shipping_details = null;
      else if (field === "name") shipping.name = "  ";
      else shipping.address![field as keyof Stripe.Address] = null;
      expect(verifyCheckoutPayment(input)).toMatchObject({ status: "exception", code: "missing_shipping_address", paymentIntentId: "pi_1" });
    },
  );

  it("accepts an incomplete billing address without substituting it for shipping", () => {
    const input = checkoutPaymentFixture();
    input.provider.session.customer_details!.address = null;
    expect(verifyCheckoutPayment(input)).toMatchObject({ status: "paid", facts: { billingAddress: null, shippingAddress: { line1: "10 Shipping Lane" } } });
  });

  it("retains a historical no-payment-required Session as an explicit operator exception", () => {
    const input = legacyFixture();
    input.provider.session.payment_status = "no_payment_required";
    input.provider.session.amount_total = 0;
    input.provider.session.payment_intent = null;
    expect(verifyCheckoutPayment(input)).toMatchObject({ status: "exception", code: "unsupported_zero_total", paymentIntentId: null, observedTotalCents: 0 });
  });

  it.each(["pending", "expired", "failed"])("classifies an authenticated legacy %s Session without requiring a paid address", (state) => {
    const input = legacyFixture();
    const session = input.provider.session;
    const intent = session.payment_intent as Stripe.PaymentIntent;
    session.payment_status = "unpaid";
    session.status = state === "expired" ? "expired" : "complete";
    intent.status = state === "failed" ? "requires_payment_method" : "processing";
    intent.last_payment_error = state === "failed" ? { type: "card_error", code: "card_declined" } : null;
    session.collected_information = null;
    expect(verifyCheckoutPayment(input)).toEqual({ status: state, paymentIntentId: "pi_1" });
  });
  it("refuses a corrupted accepted pre-tax total even if Stripe reports that same amount", () => {
    const input = checkoutPaymentFixture();
    input.accepted.preTaxTotalCents = 5600;
    input.provider.session.amount_total = 5600;
    const intent = input.provider.session.payment_intent as Stripe.PaymentIntent;
    intent.amount = intent.amount_received = 5600;
    expect(verifyCheckoutPayment(input)).toMatchObject({ status: "exception", code: "invalid_contract" });
  });

  it("does not classify contradictory succeeded-payment evidence as an expired unpaid checkout", () => {
    const input = checkoutPaymentFixture();
    input.provider.session.status = "expired";
    input.provider.session.payment_status = "unpaid";
    expect(verifyCheckoutPayment(input)).toMatchObject({ status: "exception", code: "payment_state_mismatch", paymentIntentId: "pi_1" });
  });

  it("rejects a new completed payment outside the accepted cards policy", () => {
    const input = checkoutPaymentFixture();
    input.provider.session.payment_method_types = ["us_bank_account"];
    const intent = input.provider.session.payment_intent as Stripe.PaymentIntent;
    (intent.payment_method as Stripe.PaymentMethod).type = "us_bank_account";
    expect(verifyCheckoutPayment(input)).toMatchObject({ status: "exception", code: "payment_identity_mismatch" });
  });
  it("retains completed exclusive tax components while preserving the accepted pre-tax terms", () => {
    const input = taxedFixture();
    expect(verifyCheckoutPayment(input)).toMatchObject({ status: "paid", facts: { taxCents: 550, totalCents: 6050,
      taxBreakdown: [{ source: "line", amountCents: 500, taxableAmountCents: 5000, inclusive: false },
        { source: "shipping", amountCents: 50, taxableAmountCents: 500, inclusive: false }] } });
    expect(input.accepted.preTaxTotalCents).toBe(5500);
  });

  it.each(["disabled contract", "incomplete calculation", "missing component", "wrong aggregate"])(
    "rejects tax with %s", (change) => {
      const input = taxedFixture();
      if (change === "disabled contract") input.accepted.automaticTaxEnabled = false;
      if (change === "incomplete calculation") input.provider.session.automatic_tax.status = "requires_location_inputs";
      if (change === "missing component") input.provider.lineItems[0].taxes = [];
      if (change === "wrong aggregate") input.provider.session.total_details!.breakdown!.taxes[0].amount = 549;
      expect(verifyCheckoutPayment(input)).toMatchObject({ status: "exception", code: "tax_mismatch" });
    },
  );

  it("quarantines inclusive tax instead of adding it to an already tax-inclusive amount", () => {
    const input = taxedFixture();
    input.accepted.taxBehavior = "inclusive";
    expect(verifyCheckoutPayment(input)).toMatchObject({ status: "exception", code: "unsupported_tax_behavior", paymentIntentId: "pi_1" });
  });
  it.each(["different rate", "unexpanded rate", "different shipping amount", "missing shipping", "live rate"])(
    "rejects %s despite a matching total", (change) => {
      const input = checkoutPaymentFixture();
      const shipping = input.provider.session.shipping_cost!;
      if (change === "different rate") (shipping.shipping_rate as Stripe.ShippingRate).id = "shr_other";
      if (change === "unexpanded rate") shipping.shipping_rate = "shr_1";
      if (change === "different shipping amount") shipping.amount_subtotal = 100;
      if (change === "missing shipping") input.provider.session.shipping_cost = null;
      if (change === "live rate") (shipping.shipping_rate as Stripe.ShippingRate).livemode = true;
      expect(verifyCheckoutPayment(input)).toMatchObject({ status: "exception", code: "shipping_mismatch" });
    },
  );
  it.each(["coupon economics", "coupon identity", "promotion", "line source", "missing breakdown"])(
    "rejects an unproven discount: %s", (change) => {
      const input = discountedFixture();
      if (change === "coupon economics") (input.provider.session.discounts![0].coupon as Stripe.Coupon).amount_off = 1000;
      if (change === "coupon identity") input.accepted.couponId = "coupon_other";
      if (change === "promotion") input.provider.session.discounts![0].promotion_code = "promo_unapproved";
      if (change === "line source") input.provider.lineItems[0].discounts![0].discount.source.coupon = "coupon_other";
      if (change === "missing breakdown") input.provider.lineItems[0].discounts = [];
      expect(verifyCheckoutPayment(input)).toMatchObject({ status: "exception", code: "discount_mismatch" });
    },
  );

  it("accepts the fixed discount when coupon economics and every discount component agree", () => {
    expect(verifyCheckoutPayment(discountedFixture())).toMatchObject({ status: "paid", facts: { discountCents: 500, totalCents: 5000 } });
  });
  it.each(["identity", "quantity", "unit price", "duplicate", "missing page", "deleted product", "recurring price", "fractional amount"])(
    "refuses %s changes even when the grand total still matches", (change) => {
      const input = checkoutPaymentFixture();
      const line = input.provider.lineItems[0];
      if (change === "identity") (line.price!.product as Stripe.Product).metadata.variant_key = "60ml";
      if (change === "quantity") line.quantity = 1;
      if (change === "unit price") line.price!.unit_amount = 5000;
      if (change === "duplicate") input.provider.lineItems.push(structuredClone(line));
      if (change === "missing page") input.provider.lineItemsComplete = false;
      if (change === "deleted product") line.price!.product = { id: "prod_1", deleted: true } as Stripe.DeletedProduct;
      if (change === "recurring price") line.price!.type = "recurring";
      if (change === "fractional amount") line.amount_subtotal = 5000.1;
      expect(verifyCheckoutPayment(input)).toMatchObject({ status: "exception", code: "line_items_mismatch", paymentIntentId: "pi_1" });
    },
  );
  it("verifies the fixed paid amount and keeps the physical destination separate from billing", () => {
    expect(verifyCheckoutPayment(checkoutPaymentFixture())).toMatchObject({
      status: "paid", facts: { paymentIntentId: "pi_1", totalCents: 5500, taxCents: 0,
        shippingName: "Shipping Recipient", shippingAddress: { line1: "10 Shipping Lane" },
        billingAddress: { line1: "20 Billing Road" } },
    });
  });
  it("refuses an otherwise paid Session retrieved under a different provider account", () => {
    const input = checkoutPaymentFixture();
    input.provider.accountId = "acct_other";
    expect(verifyCheckoutPayment(input)).toMatchObject({ status: "exception", code: "provider_context_mismatch", paymentIntentId: "pi_1" });
  });

  it("keeps a completed but unpaid legacy delayed-method Session pending without new attempt metadata", () => {
    const input = checkoutPaymentFixture();
    input.accepted.version = "checkout_v1";
    input.accepted.legacyEligible = true;
    input.accepted.attemptId = null;
    input.accepted.automaticTaxEnabled = null;
    input.accepted.taxBehavior = null;
    input.provider.session.metadata = { order_id: "order-1", schema: "checkout_v1", environment: "sandbox" };
    const intent = input.provider.session.payment_intent as Stripe.PaymentIntent;
    intent.metadata = { ...input.provider.session.metadata };
    intent.status = "processing";
    input.provider.session.payment_status = "unpaid";
    input.provider.session.payment_method_types = ["us_bank_account"];
    expect(verifyCheckoutPayment(input)).toEqual({ status: "pending", paymentIntentId: "pi_1" });
  });
});
