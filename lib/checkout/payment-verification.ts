import type Stripe from "stripe";
import { STRIPE_API_VERSION, STRIPE_SANDBOX_ACCOUNT_ID } from "./config";

export type AcceptedCheckoutLine = {
  lineId?: string;
  productId: string;
  productSlug: string;
  variantKey: string;
  quantity: number;
  unitAmountCents: number;
};

/** Loaded from immutable local terms, never reconstructed from provider metadata. */
export type AcceptedCheckoutContract = {
  version: "checkout_v1" | "checkout_v2";
  legacyEligible: boolean;
  orderId: string;
  attemptId: string | null;
  sessionId: string;
  accountId: string;
  apiVersion: string;
  environment: "sandbox";
  currency: "USD";
  customerId: string | null;
  lines: AcceptedCheckoutLine[];
  merchandiseSubtotalCents: number;
  discountCents: number;
  shippingCents: number;
  preTaxTotalCents: number;
  couponId: string | null;
  shippingRateId: string | null;
  freeShipping: boolean;
  automaticTaxEnabled: boolean | null;
  taxBehavior: "exclusive" | "inclusive" | "unspecified" | null;
};

/** Supplied only by authenticated retrieval, including every provider line page. */
export type CheckoutPaymentProviderBundle = {
  accountId: string;
  apiVersion: string;
  session: Stripe.Checkout.Session;
  lineItems: Stripe.LineItem[];
  lineItemsComplete: boolean;
};

export type PaymentVerificationExceptionCode =
  | "invalid_contract" | "provider_context_mismatch" | "session_identity_mismatch"
  | "payment_identity_mismatch" | "payment_state_mismatch" | "unsupported_zero_total"
  | "line_items_mismatch" | "discount_mismatch" | "shipping_mismatch"
  | "tax_mismatch" | "unsupported_tax_behavior" | "amount_mismatch"
  | "missing_shipping_address";

export type VerifiedTaxComponent = {
  source: "line" | "shipping";
  lineId: string | null;
  rateId: string;
  amountCents: number;
  taxableAmountCents: number | null;
  inclusive: false;
  reason: string | null;
};

export type VerifiedCheckoutPaymentFacts = {
  orderId: string;
  attemptId: string | null;
  sessionId: string;
  contractVersion: AcceptedCheckoutContract["version"];
  paymentIntentId: string;
  paymentMethodType: string | null;
  customerId: string | null;
  customerEmail: string | null;
  currency: "USD";
  merchandiseSubtotalCents: number;
  discountCents: number;
  shippingCents: number;
  taxCents: number;
  totalCents: number;
  shippingName: string;
  shippingAddress: Stripe.Address;
  billingAddress: Stripe.Address | null;
  taxBreakdown: VerifiedTaxComponent[];
};

export type CheckoutPaymentVerification =
  | { status: "pending"; paymentIntentId: string | null }
  | { status: "expired"; paymentIntentId: string | null }
  | { status: "failed"; paymentIntentId: string | null }
  | { status: "paid"; facts: VerifiedCheckoutPaymentFacts }
  | { status: "exception"; code: PaymentVerificationExceptionCode;
      paymentIntentId: string | null; providerPaymentStatus: string; observedTotalCents: number | null };

export function checkoutSessionDefinitelyExpired(session: Stripe.Checkout.Session): boolean {
  const intent = session.payment_intent;
  return session.status === "expired" && session.payment_status === "unpaid" && session.recovered_from === null &&
    (session.after_expiration === null || session.after_expiration?.recovery?.enabled === false && !session.after_expiration.recovery.url) &&
    (intent === null || typeof intent === "object" && intent.livemode === false && intent.status === "canceled" && intent.amount_received === 0 && intent.amount_capturable === 0);
}

export function verifyCheckoutPayment(input: {
  accepted: AcceptedCheckoutContract;
  provider: CheckoutPaymentProviderBundle;
}): CheckoutPaymentVerification {
  const { accepted, provider } = input;
  const { session } = provider;
  const paymentIntentId = objectId(session.payment_intent);
  const exception = (code: PaymentVerificationExceptionCode): CheckoutPaymentVerification => ({
    status: "exception", code, paymentIntentId,
    providerPaymentStatus: session.payment_status,
    observedTotalCents: money(session.amount_total) ? session.amount_total : null,
  });
  const legacy = accepted.version === "checkout_v1" && accepted.legacyEligible;
  if ((!legacy && accepted.version !== "checkout_v2") ||
      (!legacy && (!accepted.attemptId || typeof accepted.automaticTaxEnabled !== "boolean")) ||
      !accepted.orderId || !money(accepted.merchandiseSubtotalCents) || !money(accepted.discountCents) ||
      !money(accepted.shippingCents) || !money(accepted.preTaxTotalCents) ||
      accepted.discountCents > accepted.merchandiseSubtotalCents ||
      accepted.preTaxTotalCents !== accepted.merchandiseSubtotalCents - accepted.discountCents + accepted.shippingCents) {
    return exception("invalid_contract");
  }
  if (accepted.accountId !== STRIPE_SANDBOX_ACCOUNT_ID || provider.accountId !== accepted.accountId ||
      accepted.apiVersion !== STRIPE_API_VERSION || provider.apiVersion !== accepted.apiVersion ||
      accepted.environment !== "sandbox" || accepted.currency !== "USD" || session.livemode !== false) {
    return exception("provider_context_mismatch");
  }
  if (!accepted.sessionId || session.id !== accepted.sessionId || session.mode !== "payment" ||
      session.currency !== "usd" || session.client_reference_id !== accepted.orderId ||
      !identityMetadata(session.metadata, accepted, legacy)) {
    return exception("session_identity_mismatch");
  }
  const intent = session.payment_intent && typeof session.payment_intent === "object" ? session.payment_intent : null;
  if (session.payment_intent && (!intent || !intent.id || intent.livemode !== false || intent.currency !== "usd" ||
      !identityMetadata(intent.metadata, accepted, legacy) ||
      objectId(intent.customer) !== objectId(session.customer))) {
    return exception("payment_identity_mismatch");
  }
  if (accepted.customerId && objectId(session.customer) !== accepted.customerId) {
    return exception("payment_identity_mismatch");
  }
  if (session.payment_status === "no_payment_required" || session.amount_total === 0 || accepted.preTaxTotalCents === 0) {
    return exception("unsupported_zero_total");
  }
  if (session.payment_status !== "paid") {
    if (session.payment_status !== "unpaid" || intent?.status === "succeeded") return exception("payment_state_mismatch");
    if (session.status === "expired") return { status: checkoutSessionDefinitelyExpired(session) ? "expired" : "pending", paymentIntentId };
    if (session.status !== "open" && session.status !== "complete") return exception("payment_state_mismatch");
    return { status: "pending", paymentIntentId };
  }
  if (session.status !== "complete" || !intent || intent.status !== "succeeded") return exception("payment_state_mismatch");
  const method = intent.payment_method;
  if (!method || typeof method === "string" || method.livemode !== false || !method.id ||
      typeof method.type !== "string" || !/^[a-z0-9_]{1,80}$/.test(method.type) ||
      (!legacy && (!Array.isArray(session.payment_method_types) || session.payment_method_types.length !== 1 ||
        session.payment_method_types[0] !== "card" || method.type !== "card"))) {
    return exception("payment_identity_mismatch");
  }
  if (!session.shipping_cost) return exception("shipping_mismatch");
  const tax = verifiedTax(accepted, provider, legacy);
  if (typeof tax === "string") return exception(tax);
  if (!matchingLines(accepted, provider)) return exception("line_items_mismatch");
  if (!matchingDiscount(accepted, provider, legacy)) return exception("discount_mismatch");
  if (!matchingShipping(accepted, session, legacy)) return exception("shipping_mismatch");
  const details = session.total_details;
  if (!details || !money(session.amount_subtotal) || !money(session.amount_total) ||
      !money(details.amount_discount) || !money(details.amount_shipping) || !money(details.amount_tax) ||
      session.amount_subtotal !== accepted.merchandiseSubtotalCents || details.amount_discount !== accepted.discountCents ||
      details.amount_shipping !== accepted.shippingCents || session.amount_total !== accepted.preTaxTotalCents + details.amount_tax ||
      provider.lineItems.reduce((sum, line) => sum + line.amount_total, 0) + session.shipping_cost.amount_total !== session.amount_total ||
      !money(intent.amount) || !money(intent.amount_received) ||
      intent.amount !== session.amount_total || intent.amount_received !== session.amount_total) return exception("amount_mismatch");
  const shipping = session.collected_information?.shipping_details;
  const shippingAddress = shipping?.address;
  if (!shipping?.name?.trim() || !shippingAddress || shippingAddress.country !== "US" ||
      !shippingAddress.line1?.trim() || !shippingAddress.city?.trim() || !shippingAddress.state?.trim() ||
      !shippingAddress.postal_code?.trim()) return exception("missing_shipping_address");
  return { status: "paid", facts: {
    orderId: accepted.orderId, attemptId: accepted.attemptId, sessionId: session.id, contractVersion: accepted.version,
    paymentIntentId: intent.id, paymentMethodType: method.type,
    customerId: objectId(session.customer), customerEmail: session.customer_details?.email ?? null,
    currency: "USD", merchandiseSubtotalCents: session.amount_subtotal, discountCents: details.amount_discount,
    shippingCents: details.amount_shipping, taxCents: details.amount_tax, totalCents: session.amount_total,
    shippingName: shipping.name.trim(), shippingAddress: { ...shippingAddress },
    billingAddress: session.customer_details?.address ? { ...session.customer_details.address } : null,
    taxBreakdown: tax,
  } };
}

function money(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 2_147_483_647;
}

function objectId(value: string | { id: string } | null | undefined): string | null {
  return typeof value === "string" ? value : value?.id ?? null;
}

function identityMetadata(metadata: Stripe.Metadata | null, accepted: AcceptedCheckoutContract, legacy: boolean): boolean {
  return metadata?.order_id === accepted.orderId && metadata.environment === "sandbox" &&
    (legacy ? (!metadata.schema || metadata.schema === "checkout_v1") :
      metadata.schema === "checkout_v2" && metadata.attempt_id === accepted.attemptId);
}

function matchingLines(accepted: AcceptedCheckoutContract, provider: CheckoutPaymentProviderBundle): boolean {
  if (!provider.lineItemsComplete || !accepted.lines.length || provider.lineItems.length !== accepted.lines.length) return false;
  const expected = new Map<string, AcceptedCheckoutLine>();
  for (const line of accepted.lines) {
    const key = JSON.stringify([line.productId, line.variantKey]);
    if (!line.productId || !line.variantKey || !line.productSlug || expected.has(key) ||
        !money(line.quantity) || line.quantity === 0 || !money(line.unitAmountCents)) return false;
    expected.set(key, line);
  }
  const providerIds = new Set<string>();
  let subtotal = 0;
  for (const line of provider.lineItems) {
    const price = line.price;
    const product = price?.product;
    if (!price || !product || typeof product === "string" || product.deleted || product.livemode !== false ||
        price.livemode !== false || price.type !== "one_time" || price.billing_scheme !== "per_unit" ||
        price.transform_quantity || price.currency !== "usd" || line.currency !== "usd" ||
        !line.id || providerIds.has(line.id) || line.adjustable_quantity?.enabled ||
        !money(price.unit_amount) || !money(line.quantity) || line.quantity === 0 ||
        !money(line.amount_subtotal) || !money(line.amount_discount) || !money(line.amount_tax) || !money(line.amount_total) ||
        (price.unit_amount_decimal != null && Number(price.unit_amount_decimal) !== price.unit_amount)) return false;
    providerIds.add(line.id);
    const key = JSON.stringify([product.metadata?.product_id, product.metadata?.variant_key]);
    const local = expected.get(key);
    if (!local || product.metadata.slug !== local.productSlug || line.quantity !== local.quantity ||
        price.unit_amount !== local.unitAmountCents ||
        (accepted.version === "checkout_v2" && local.lineId && product.metadata.order_line_id !== local.lineId) ||
        line.amount_subtotal !== local.quantity * local.unitAmountCents ||
        line.amount_discount > line.amount_subtotal ||
        line.amount_total !== line.amount_subtotal - line.amount_discount + line.amount_tax) return false;
    expected.delete(key);
    subtotal += line.amount_subtotal;
    if (!money(subtotal)) return false;
  }
  return expected.size === 0 && subtotal === accepted.merchandiseSubtotalCents;
}

function matchingDiscount(accepted: AcceptedCheckoutContract, provider: CheckoutPaymentProviderBundle, legacy: boolean): boolean {
  const { session, lineItems } = provider;
  const discounts = session.discounts ?? [];
  const breakdown = session.total_details?.breakdown?.discounts ?? [];
  if (!money(accepted.discountCents) || session.total_details?.amount_discount !== accepted.discountCents ||
      lineItems.reduce((sum, line) => sum + line.amount_discount, 0) !== accepted.discountCents) return false;
  if (discounts.length === 0) {
    return accepted.discountCents === 0 && accepted.couponId === null && breakdown.length === 0 &&
      lineItems.every((line) => !line.discounts?.length);
  }
  if (discounts.length !== 1 || discounts[0].promotion_code || session.allow_promotion_codes === true) return false;
  const coupon = discounts[0].coupon;
  if (!coupon || typeof coupon === "string" || coupon.deleted || coupon.livemode !== false ||
      (!legacy && accepted.couponId !== coupon.id) ||
      (legacy && accepted.couponId !== null && accepted.couponId !== coupon.id)) return false;
  const eligibleSubtotal = lineItems.reduce((sum, line) => {
    const eligible = !coupon.applies_to || coupon.applies_to.products.includes(objectId(line.price?.product) ?? "");
    return sum + (eligible ? line.amount_subtotal : 0);
  }, 0);
  let expected = accepted.discountCents;
  let percentageBasisPoints: number | null = null;
  if (coupon.amount_off !== null) {
    if (!money(coupon.amount_off) || coupon.currency !== "usd" || coupon.percent_off !== null) return false;
    expected = Math.min(eligibleSubtotal, coupon.amount_off);
  } else {
    if (typeof coupon.percent_off !== "number" || !Number.isFinite(coupon.percent_off) ||
        coupon.percent_off <= 0 || coupon.percent_off > 100) return false;
    const basisPoints = Math.round(coupon.percent_off * 100);
    if (basisPoints / 100 !== coupon.percent_off) return false;
    percentageBasisPoints = basisPoints;
  }
  if (expected !== accepted.discountCents) return false;
  const validComponent = (component: Stripe.LineItem.Discount) => money(component.amount) &&
    component.discount?.source?.type === "coupon" && objectId(component.discount.source.coupon) === coupon.id &&
    !component.discount.promotion_code &&
    (!component.discount.checkout_session || component.discount.checkout_session === session.id);
  if (!breakdown.every(validComponent) || breakdown.reduce((sum, item) => sum + item.amount, 0) !== expected) return false;
  for (const line of lineItems) {
    const parts = line.discounts ?? [];
    if (!parts.every(validComponent) || parts.reduce((sum, item) => sum + item.amount, 0) !== line.amount_discount) return false;
    if (line.amount_discount > 0 && coupon.applies_to &&
        !coupon.applies_to.products.includes(objectId(line.price?.product) ?? "")) return false;
    if (percentageBasisPoints !== null) {
      const eligible = !coupon.applies_to || coupon.applies_to.products.includes(objectId(line.price?.product) ?? "");
      const numerator = eligible ? line.amount_subtotal * percentageBasisPoints : 0;
      // Stripe does not promise an allocation-rounding direction. Only a single
      // fractional cent per line may round; the accepted total still matches exactly.
      if (line.amount_discount < Math.floor(numerator / 10_000) || line.amount_discount > Math.ceil(numerator / 10_000)) return false;
    }
  }
  return true;
}

function matchingShipping(accepted: AcceptedCheckoutContract, session: Stripe.Checkout.Session, legacy: boolean): boolean {
  const shipping = session.shipping_cost;
  const rate = shipping?.shipping_rate;
  if (!shipping || !rate || typeof rate === "string" || !rate.id || rate.livemode !== false ||
      rate.type !== "fixed_amount" || !rate.fixed_amount || rate.fixed_amount.currency !== "usd" ||
      !money(rate.fixed_amount.amount) || !money(shipping.amount_subtotal) || !money(shipping.amount_tax) ||
      !money(shipping.amount_total) || rate.fixed_amount.amount !== accepted.shippingCents ||
      shipping.amount_subtotal !== accepted.shippingCents || session.total_details?.amount_shipping !== accepted.shippingCents ||
      shipping.amount_total !== shipping.amount_subtotal + shipping.amount_tax ||
      (accepted.freeShipping && accepted.shippingCents !== 0)) return false;
  if (accepted.shippingRateId) return rate.id === accepted.shippingRateId;
  return legacy || (accepted.freeShipping && rate.metadata?.environment === "sandbox" && rate.metadata.free_shipping_threshold === "5000");
}

type ProviderTaxComponent = Stripe.LineItem.Tax;

function validTaxPart(part: ProviderTaxComponent): boolean {
  return money(part.amount) && !!part.rate?.id && part.rate.livemode === false && part.rate.inclusive === false &&
    typeof part.rate.percentage === "number" && Number.isFinite(part.rate.percentage) && part.rate.percentage >= 0 &&
    (part.taxable_amount === null || money(part.taxable_amount)) &&
    (part.taxability_reason === null || /^[a-z_]{1,80}$/.test(part.taxability_reason));
}

function verifiedTax(accepted: AcceptedCheckoutContract, provider: CheckoutPaymentProviderBundle, legacy: boolean):
  VerifiedTaxComponent[] | "tax_mismatch" | "unsupported_tax_behavior" {
  const { session, lineItems } = provider;
  const enabled = legacy && accepted.automaticTaxEnabled === null ? session.automatic_tax?.enabled : accepted.automaticTaxEnabled;
  if (typeof enabled !== "boolean" || session.automatic_tax?.enabled !== enabled ||
      (enabled && session.automatic_tax.status !== "complete")) return "tax_mismatch";
  if (accepted.taxBehavior === "inclusive") return "unsupported_tax_behavior";
  const shipping = session.shipping_cost;
  const rate = shipping?.shipping_rate;
  const sources = lineItems.map((line) => ({ source: "line" as const, lineId: line.id,
    amount: line.amount_tax, behavior: line.price?.tax_behavior, parts: line.taxes ?? [] }));
  const shippingSource = { source: "shipping" as const, lineId: null, amount: shipping?.amount_tax,
    behavior: typeof rate === "object" && rate ? rate.tax_behavior : null, parts: shipping?.taxes ?? [] };
  const breakdown: VerifiedTaxComponent[] = [];
  const byRate = new Map<string, number>();
  let sum = 0;
  for (const source of [...sources, shippingSource]) {
    if (enabled && (source.behavior === "inclusive" || source.parts.some((part) => part.rate?.inclusive))) return "unsupported_tax_behavior";
    const zeroShipping = source.source === "shipping" && accepted.freeShipping && accepted.shippingCents === 0 &&
      shipping?.amount_subtotal === 0 && shipping.amount_tax === 0 && shipping.amount_total === 0;
    if (enabled && source.behavior !== "exclusive" && source.parts.length === 0 && !zeroShipping) return "unsupported_tax_behavior";
    if (!money(source.amount) || !source.parts.every(validTaxPart) ||
        source.parts.reduce((total, part) => total + part.amount, 0) !== source.amount ||
        (!enabled && source.amount !== 0)) return "tax_mismatch";
    for (const part of source.parts) {
      byRate.set(part.rate.id, (byRate.get(part.rate.id) ?? 0) + part.amount);
      breakdown.push({ source: source.source, lineId: source.lineId, rateId: part.rate.id,
        amountCents: part.amount, taxableAmountCents: part.taxable_amount, inclusive: false, reason: part.taxability_reason });
    }
    sum += source.amount;
    if (!money(sum)) return "tax_mismatch";
  }
  const aggregate = session.total_details?.breakdown?.taxes ?? [];
  if (!aggregate.every(validTaxPart) || session.total_details?.amount_tax !== sum) return "tax_mismatch";
  const aggregateByRate = new Map<string, number>();
  for (const part of aggregate) aggregateByRate.set(part.rate.id, (aggregateByRate.get(part.rate.id) ?? 0) + part.amount);
  if (aggregateByRate.size !== byRate.size || [...byRate].some(([id, amount]) => aggregateByRate.get(id) !== amount)) return "tax_mismatch";
  return breakdown;
}
