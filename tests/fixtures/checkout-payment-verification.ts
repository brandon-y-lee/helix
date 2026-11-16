import type Stripe from "stripe";
import type { AcceptedCheckoutContract, CheckoutPaymentProviderBundle } from "@/lib/checkout/payment-verification";
import { STRIPE_API_VERSION, STRIPE_SANDBOX_ACCOUNT_ID } from "@/lib/checkout/config";

export function checkoutPaymentFixture(): {
  accepted: AcceptedCheckoutContract;
  provider: CheckoutPaymentProviderBundle;
} {
  const metadata = { order_id: "order-1", attempt_id: "attempt-1", schema: "checkout_v2", environment: "sandbox" };
  const accepted: AcceptedCheckoutContract = {
    version: "checkout_v2", legacyEligible: false, orderId: "order-1", attemptId: "attempt-1",
    sessionId: "cs_test_1", accountId: STRIPE_SANDBOX_ACCOUNT_ID, apiVersion: STRIPE_API_VERSION,
    environment: "sandbox", currency: "USD", customerId: "cus_1",
    lines: [{ productId: "product-1", productSlug: "super-serum", variantKey: "30ml", quantity: 2, unitAmountCents: 2500 }],
    merchandiseSubtotalCents: 5000, discountCents: 0, shippingCents: 500, preTaxTotalCents: 5500,
    couponId: null, shippingRateId: "shr_1", freeShipping: false, automaticTaxEnabled: false, taxBehavior: "unspecified",
  };
  const line = {
    id: "li_1", object: "item", quantity: 2, currency: "usd", amount_subtotal: 5000,
    amount_discount: 0, amount_tax: 0, amount_total: 5000, discounts: [], taxes: [],
    adjustable_quantity: null, metadata: {}, description: "Super Serum",
    price: { id: "price_1", object: "price", livemode: false, currency: "usd", unit_amount: 2500,
      unit_amount_decimal: "2500", type: "one_time", billing_scheme: "per_unit", transform_quantity: null,
      tax_behavior: "unspecified", product: { id: "prod_1", object: "product", livemode: false,
        metadata: { product_id: "product-1", slug: "super-serum", variant_key: "30ml" } } },
  } as unknown as Stripe.LineItem;
  const session = {
    id: "cs_test_1", object: "checkout.session", livemode: false, mode: "payment", currency: "usd",
    client_reference_id: "order-1", metadata: { ...metadata }, status: "complete", payment_status: "paid",
    customer: "cus_1", payment_method_types: ["card"], amount_subtotal: 5000, amount_total: 5500,
    automatic_tax: { enabled: false, status: null }, discounts: [], allow_promotion_codes: false,
    payment_intent: { id: "pi_1", object: "payment_intent", livemode: false, status: "succeeded", currency: "usd",
      amount: 5500, amount_received: 5500, customer: "cus_1", metadata: { ...metadata },
      payment_method: { id: "pm_1", object: "payment_method", livemode: false, type: "card" }, last_payment_error: null },
    shipping_cost: { amount_subtotal: 500, amount_tax: 0, amount_total: 500, taxes: [],
      shipping_rate: { id: "shr_1", object: "shipping_rate", livemode: false, type: "fixed_amount",
        fixed_amount: { amount: 500, currency: "usd" }, tax_behavior: "unspecified", metadata: {} } },
    total_details: { amount_discount: 0, amount_tax: 0, amount_shipping: 500, breakdown: { discounts: [], taxes: [] } },
    collected_information: { shipping_details: { name: " Shipping Recipient ", address: {
      line1: "10 Shipping Lane", line2: null, city: "Los Angeles", state: "CA", postal_code: "90001", country: "US",
    } } },
    customer_details: { email: "customer@example.test", address: {
      line1: "20 Billing Road", line2: null, city: "Austin", state: "TX", postal_code: "78701", country: "US",
    } },
  } as unknown as Stripe.Checkout.Session;
  return { accepted, provider: { accountId: STRIPE_SANDBOX_ACCOUNT_ID, apiVersion: STRIPE_API_VERSION,
    session, lineItems: [line], lineItemsComplete: true } };
}
