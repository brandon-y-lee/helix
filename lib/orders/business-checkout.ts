import "server-only";
import type Stripe from "stripe";
import { getCheckoutCartSnapshot } from "@/lib/cart/server";
import { businessCheckoutOrigin } from "@/lib/checkout/business-origin";
import { STRIPE_API_VERSION } from "@/lib/checkout/config";
import { matchesBusinessCheckoutSessionId, type AcceptedCheckoutContract } from "@/lib/checkout/payment-verification";
import { businessAdmissionEnabled } from "@/lib/checkout/storefront";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { readBusinessStripeBinding, verifyBusinessStripeAccount, type BusinessStripeEnvironment, type BusinessStripeBinding } from "@/lib/stripe/live-provider";
import { prepareBusinessGuestReceipt } from "./business-receipt-cookie";
import { buildCheckoutCancelUrl } from "./checkout-cancel";
import { checkoutReturnDestinationState } from "./checkout-return";
import { isStoredCheckoutPaymentContract } from "./payment-contracts";

const closed = "The store is not accepting new payments yet.";
const uncertain = "Your checkout is being verified. Please check back before trying again.";
export class BusinessCheckoutError extends Error {
  constructor(message: string, readonly status: number, readonly code?: "CHECKOUT_RECEIPT_PREPARED") { super(message); }
}
function hold(): never { throw new BusinessCheckoutError(uncertain, 409); }
async function rpc(name: string, args: Record<string, unknown>) {
  const { data, error } = await createSupabaseAdminClient().rpc(name, args);
  if (error) throw new BusinessCheckoutError("Checkout is temporarily unavailable.", 503);
  return data;
}

type Reserved = { state: "reserved" | "bound" | "send"; orderId: string; attemptId: string; orderNumber: string;
  bindingNonce: string; idempotencyKey: string; productName: string; taxCode?: string | null;
  sessionId: string | null; terms: AcceptedCheckoutContract };

function reservation(data: unknown, binding: BusinessStripeBinding): Reserved {
  if (!data || typeof data !== "object") return hold();
  const row = data as Record<string, unknown>;
  if (row.state === "closed") throw new BusinessCheckoutError(closed, 503);
  if (row.state === "unavailable" || row.state === "stale") {
    throw new BusinessCheckoutError("The selected item or quantity is unavailable. Please review your cart.", 409);
  }
  if (row.state !== "reserved" && row.state !== "bound" && row.state !== "send") return hold();
  if (typeof row.orderNumber !== "string" || !row.orderNumber || typeof row.productName !== "string" || !row.productName ||
      typeof row.idempotencyKey !== "string" || !row.idempotencyKey.startsWith(binding.environment + ":") || row.idempotencyKey.length > 255 ||
      !isStoredCheckoutPaymentContract(row.terms, true, binding) || row.terms.orderId !== row.orderId ||
      row.terms.attemptId !== row.attemptId || row.terms.bindingNonce !== row.bindingNonce || row.terms.lines.length !== 1 ||
      row.sessionId !== row.terms.sessionId || (row.state === "bound") !== Boolean(row.sessionId)) return hold();
  return row as Reserved;
}

async function sessionParams(row: Reserved, binding: BusinessStripeBinding, origin: string): Promise<Stripe.Checkout.SessionCreateParams> {
  const terms = row.terms;
  if (terms.customerId !== null || !terms.preTaxTotalCents || (row.taxCode != null && !/^txcd_\d{8}$/.test(row.taxCode)) ||
      (terms.automaticTaxEnabled && !row.taxCode)) return hold();
  const line = terms.lines[0];
  if (!line.lineId || line.quantity * line.unitAmountCents !== terms.merchandiseSubtotalCents) return hold();
  let shipping: Stripe.Checkout.SessionCreateParams.ShippingOption;
  if (terms.shippingRateId) {
    const rate = await binding.stripe.shippingRates.retrieve(terms.shippingRateId);
    if (rate.id !== terms.shippingRateId || rate.object !== "shipping_rate" || rate.livemode !== (binding.environment === "live") ||
        !rate.active || rate.type !== "fixed_amount" || rate.fixed_amount?.currency !== "usd" ||
        rate.fixed_amount.amount !== terms.shippingCents || rate.tax_behavior === "inclusive") return hold();
    shipping = { shipping_rate: rate.id };
  } else {
    if (!terms.freeShipping || terms.shippingCents !== 0) return hold();
    shipping = { shipping_rate_data: { display_name: "Standard shipping", type: "fixed_amount", tax_behavior:"exclusive",
      fixed_amount: { amount: 0, currency: "usd" }, metadata: { environment: binding.environment } } };
  }
  const metadata = { application: "helix", environment: binding.environment, schema: "checkout_v2",
    order_id: row.orderId, attempt_id: row.attemptId, binding_nonce: row.bindingNonce };
  return {
    mode: "payment", payment_method_types: ["card"], allow_promotion_codes: false, adaptive_pricing: { enabled: false },
    client_reference_id: row.orderId, metadata, payment_intent_data: { metadata }, customer_creation: "if_required",
    shipping_address_collection: { allowed_countries: ["US"] }, shipping_options: [shipping],
    automatic_tax: { enabled: terms.automaticTaxEnabled === true }, after_expiration: { recovery: { enabled: false } },
    success_url: origin + "/checkout/success?session_id={CHECKOUT_SESSION_ID}", cancel_url: buildCheckoutCancelUrl(origin),
    line_items: [{ quantity: line.quantity, price_data: { currency: "usd", unit_amount: line.unitAmountCents, tax_behavior:"exclusive",
      product_data: { name: row.productName, ...(row.taxCode ? {tax_code: row.taxCode} : {}), metadata: {
        product_id: line.productId, slug: line.productSlug, variant_key: line.variantKey, order_line_id: line.lineId } } } }],
  };
}

function payable(session: Stripe.Checkout.Session, row: Reserved, binding: BusinessStripeBinding, origin: string) {
  const metadata = session.metadata;
  if (session.object !== "checkout.session" || !matchesBusinessCheckoutSessionId(session.id, binding.environment) ||
      (row.sessionId && session.id !== row.sessionId) || session.livemode !== (binding.environment === "live") ||
      session.mode !== "payment" || session.status !== "open" || session.payment_status !== "unpaid" || session.currency !== "usd" ||
      session.customer !== row.terms.customerId || session.payment_method_types?.length !== 1 || session.payment_method_types[0] !== "card" ||
      (session.allow_promotion_codes !== null && session.allow_promotion_codes !== false) || session.discounts?.length ||
      session.recovered_from !== null || (session.after_expiration !== null &&
        (session.after_expiration?.recovery?.enabled !== false || Boolean(session.after_expiration.recovery.url))) ||
      session.client_reference_id !== row.orderId || metadata?.order_id !== row.orderId || metadata.attempt_id !== row.attemptId ||
      metadata.binding_nonce !== row.bindingNonce || metadata.environment !== binding.environment || metadata.schema !== "checkout_v2" ||
      metadata.application !== "helix" ||
      session.amount_subtotal !== row.terms.merchandiseSubtotalCents || session.expires_at <= Date.now()/1000 ||
      checkoutReturnDestinationState(session, origin) !== "match" || !session.url) return hold();
  const url = new URL(session.url);
  if (url.origin !== "https://checkout.stripe.com" || url.username || url.password ||
      url.pathname !== "/c/pay/" + session.id) return hold();
  return session.url;
}

export async function createBusinessCheckout(mode: BusinessStripeEnvironment, input: {
  requestOrigin?: string; rewardTierId?: unknown; offerId?: unknown;
}) {
  if (!businessAdmissionEnabled(mode, process.env)) throw new BusinessCheckoutError(closed, 503);
  const origin = businessCheckoutOrigin(mode, process.env);
  if (input.requestOrigin !== origin) throw new BusinessCheckoutError("Checkout is unavailable on this address.", 403);
  if (input.rewardTierId != null || input.offerId != null) throw new BusinessCheckoutError("This checkout does not accept points or discount offers.", 400);
  const binding = readBusinessStripeBinding(mode);
  if (!binding.webhookSecret) throw new BusinessCheckoutError(closed, 503);
  const cart = await getCheckoutCartSnapshot();
  if (cart.lines.length !== 1 || !cart.lines[0].available || cart.lines[0].quantity < 1) {
    throw new BusinessCheckoutError("Please choose an available item before checkout.", 409);
  }
  const guest = cart.userId ? null : await prepareBusinessGuestReceipt(cart.cartId, cart.checkoutGeneration);
  if (!cart.userId && !guest) throw new BusinessCheckoutError("Preparing private checkout. Please try again.", 409, "CHECKOUT_RECEIPT_PREPARED");
  const account = await verifyBusinessStripeAccount(binding);
  if (!account.chargesEnabled || !account.payoutsEnabled) throw new BusinessCheckoutError(closed, 503);
  const scope = { p_environment: mode, p_account_id: binding.accountId };
  const row = reservation(await rpc("reserve_business_checkout", { ...scope, p_cart_id: cart.cartId,
    p_checkout_generation: cart.checkoutGeneration, p_user_id: cart.userId, p_guest_cart_hash: guest?.guestHash ?? null,
    p_receipt_hash: guest?.receiptHash ?? null }), binding);
  const attempt = { ...scope, p_order_id:row.orderId, p_attempt_id:row.attemptId, p_binding_nonce:row.bindingNonce };
  let session: Stripe.Checkout.Session;
  if (row.state === "bound" && row.sessionId) {
    session = await binding.stripe.checkout.sessions.retrieve(row.sessionId);
  } else {
    if (row.state !== "reserved") return hold();
    let params: Stripe.Checkout.SessionCreateParams;
    try {
      const line = row.terms.lines[0], displayed = cart.lines[0];
      if (line.productId !== displayed.productId || line.variantKey !== displayed.variantId || line.productSlug !== displayed.slug ||
          line.quantity !== displayed.quantity || line.unitAmountCents !== displayed.price) return hold();
      params = await sessionParams(row, binding, origin);
    } catch (error) {
      await rpc("release_unsent_business_checkout", attempt);
      throw error;
    }
    const decision = await rpc("start_business_checkout_send", attempt);
    // The database returned a confirmed denial before this request could send.
    // Its locked release still refuses if a concurrent request has started Stripe.
    if (["stale", "unavailable", "closed"].includes(decision?.state)) {
      await rpc("release_unsent_business_checkout", attempt);
    }
    const admitted = reservation(decision, binding);
    if (admitted.state !== "send" || admitted.orderId !== row.orderId || admitted.attemptId !== row.attemptId ||
        admitted.bindingNonce !== row.bindingNonce || admitted.idempotencyKey !== row.idempotencyKey) return hold();
    // Once sending starts, a timeout can mean Stripe accepted the original request. Keep the stock held.
    try {
      session = await binding.stripe.checkout.sessions.create(params, { idempotencyKey: row.idempotencyKey,
        apiVersion: STRIPE_API_VERSION, maxNetworkRetries: 1, timeout: 8000 });
    } catch { return hold(); }
  }
  const url = payable(session, row, binding, origin);
  if (!row.sessionId && await rpc("bind_recovered_business_checkout_session", { ...attempt, p_session_id:session.id }) !== true) return hold();
  guest?.bindSession(session.id);
  return { orderId:row.orderId, orderNumber:row.orderNumber, sessionId:session.id, url };
}
