import "server-only";

import type Stripe from "stripe";
import type { PaymentRefundException } from "@/lib/payments/inbox";
import { PaymentLeaseLostError } from "@/lib/payments/lease";
import { PaymentProviderReadError, sanitizedPaymentProviderError } from "@/lib/payments/provider-errors";
import { isPaymentDeadlineError } from "@/lib/payments/deadline";
import { revalidatePath } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getStripeClient } from "@/lib/stripe/server";
import { verifyStripeAccount } from "@/lib/stripe/payment-verification";
import { reversePaidOrderPoints } from "@/lib/rewards/operations";
import { recordCheckoutPaymentException, resolveCheckoutPaymentExceptions } from "@/lib/orders/payment-contracts";

export async function readStripeChargeRefunds(stripe: Stripe, chargeId: string, paymentIntentId: string): Promise<Stripe.Refund[]> {
  let startingAfter: string | undefined;
  const current: Stripe.Refund[] = [];
  const seen = new Set<string>();
  // A larger history needs operator review; a truncated page never proves a full refund.
  for (let page = 0; page < 5; page += 1) {
    let refunds: Stripe.ApiList<Stripe.Refund>;
    try {
      refunds = await stripe.refunds.list({ charge: chargeId, limit: 100, starting_after: startingAfter });
    } catch (error) {
      if (isPaymentDeadlineError(error)) throw error;
      throw sanitizedPaymentProviderError(error);
    }
    if (!refunds || refunds.object !== "list" || !Array.isArray(refunds.data) || refunds.data.length > 100 ||
      typeof refunds.has_more !== "boolean" || (refunds.has_more && refunds.data.length === 0)) {
      throw new PaymentProviderReadError("provider_schema_mismatch");
    }
    for (const refund of refunds.data) {
      if (!refund || refund.object !== "refund") throw new PaymentProviderReadError("provider_schema_mismatch");
      const refundChargeId = typeof refund.charge === "string" ? refund.charge : refund.charge?.id;
      const refundIntentId = typeof refund.payment_intent === "string" ? refund.payment_intent : refund.payment_intent?.id;
      if (typeof refund.id !== "string" || !/^(?:re|pyr)_[A-Za-z0-9_]{1,200}$/.test(refund.id) ||
        seen.has(refund.id) || refundChargeId !== chargeId || refundIntentId !== paymentIntentId ||
        refund.currency !== "usd" || !Number.isSafeInteger(refund.amount) || refund.amount <= 0 || refund.amount > 2_147_483_647 ||
        !(refund.status === null || (typeof refund.status === "string" && /^[a-z_]{1,80}$/.test(refund.status)))) {
        throw new PaymentProviderReadError("provider_schema_mismatch");
      }
      seen.add(refund.id);
      current.push(refund);
    }
    if (!refunds.has_more) return current;
    startingAfter = refunds.data.at(-1)?.id;
    if (!startingAfter) break;
  }
  throw new PaymentProviderReadError("provider_schema_mismatch");
}

/** Trusted provider reconciliation; never called with browser-supplied payment references. */
export async function reconcileFullStripeRefund(chargeId: string): Promise<void> {
  try {
    await reconcileFullRefund(chargeId);
  } catch (error) {
    if (isPaymentDeadlineError(error) || error instanceof PaymentLeaseLostError) throw error;
    throw new Error("Refund reconciliation is temporarily unavailable.");
  }
}

async function reconcileFullRefund(chargeId: string): Promise<void> {
  const stripe = getStripeClient();
  await verifyStripeAccount(stripe);
  const charge = await stripe.charges.retrieve(chargeId);
  if (charge.id !== chargeId || charge.livemode !== false) {
    throw new Error("Refund reconciliation is temporarily unavailable.");
  }
  if (!charge.refunded) return;
  const paymentIntentId = typeof charge.payment_intent === "string"
    ? charge.payment_intent : charge.payment_intent?.id;
  if (!paymentIntentId) throw new Error("Refund reconciliation is temporarily unavailable.");
  const refunds = await readStripeChargeRefunds(stripe, chargeId, paymentIntentId);
  await reconcileVerifiedFullStripeRefund({ charge, refunds });
}

/** Trusted current provider facts only; the hosted worker persists their observations first. */
export async function reconcileVerifiedFullStripeRefund(input: {
  charge: Stripe.Charge; refunds: Stripe.Refund[];
  onException?: (exception: PaymentRefundException) => Promise<void>;
  onReconciled?: (binding: { orderId: string; sessionId: string; paymentIntentId: string }) => Promise<void>;
}): Promise<void> {
  const { charge, refunds } = input;
  const paymentIntentId = typeof charge.payment_intent === "string"
    ? charge.payment_intent : charge.payment_intent?.id;
  if (!paymentIntentId) throw new Error("Refund facts disagree.");
  const admin = createSupabaseAdminClient();
  const { data: order, error } = await admin.from("orders")
    .select("id,order_number,user_id,status,checkout_environment,currency,total_cents,stripe_checkout_session_id,stripe_payment_intent_id,reward_points_earned,reward_points_redeemed")
    .eq("stripe_payment_intent_id", paymentIntentId).maybeSingle();
  if (error || !order) throw new Error("Refund reconciliation is temporarily unavailable.");

  let refundVerified = false;
  try {
    if (order.checkout_environment !== "sandbox" || order.currency !== "USD" ||
      !["paid", "refunded"].includes(order.status) || !order.stripe_checkout_session_id ||
      charge.currency !== "usd" || !charge.paid || !charge.captured || charge.status !== "succeeded" ||
      !Number.isSafeInteger(charge.amount) || charge.amount <= 0 ||
      charge.amount !== order.total_cents || charge.amount_captured !== charge.amount ||
      charge.amount_refunded !== charge.amount) throw new Error("Refund facts disagree.");
    const succeededAmount = refunds.filter((refund) => refund.status === "succeeded")
      .reduce((total, refund) => total + refund.amount, 0);
    if (!Number.isSafeInteger(succeededAmount) || succeededAmount !== charge.amount) {
      throw new Error("Refund facts disagree.");
    }
    refundVerified = true;
    if (order.user_id) {
      if (order.reward_points_earned > 0) {
        const { data: award, error: awardError } = await admin.from("rewards_ledger_entries")
          .select("user_id,order_id,entry_type,status,points")
          .eq("source_key", `purchase:${order.id}`).maybeSingle();
        // Finalization fixes the earned amount before the separate award posts.
        // Preserve paid/retryable state if a crash interrupted that award.
        if (awardError || !award || award.user_id !== order.user_id || award.order_id !== order.id ||
          award.entry_type !== "purchase_earn" || award.status !== "posted" ||
          award.points !== order.reward_points_earned) throw new Error("Purchase award is not reconciled.");
      }
      await reversePaidOrderPoints({
        userId: order.user_id, orderId: order.id, orderNumber: order.order_number,
        pointsEarned: order.reward_points_earned, pointsRedeemed: order.reward_points_redeemed,
      });
    }
    const { data: attribution, error: attributionError } = await admin.from("referral_attributions")
      .select("id").eq("order_id", order.id).maybeSingle();
    if (attributionError) throw new Error("Refund effect failed.");
    if (attribution) {
      const { error: voidAttributionError } = await admin.from("referral_attributions")
        .update({ status: "void" }).eq("id", attribution.id);
      if (voidAttributionError) throw new Error("Refund effect failed.");
      const { error: voidRewardError } = await admin.from("referral_rewards")
        .update({ status: "void" }).eq("referral_attribution_id", attribution.id).eq("status", "available");
      if (voidRewardError) throw new Error("Refund effect failed.");
    }
    const { data: attempts, error: attemptError } = await admin.from("payment_attempts")
      .update({ status: "refunded", raw_status: "charge.refunded" })
      .eq("order_id", order.id).eq("stripe_payment_intent_id", paymentIntentId).select("id");
    if (attemptError || !Array.isArray(attempts) || attempts.length === 0) throw new Error("Refund effect failed.");
    if (order.status === "paid") {
      const { data: completed, error: completionError } = await admin.from("orders")
        .update({ status: "refunded", refunded_at: new Date().toISOString() })
        .eq("id", order.id).eq("stripe_payment_intent_id", paymentIntentId)
        .eq("status", "paid").select("id").maybeSingle();
      if (completionError) throw new Error("Refund effect failed.");
      if (!completed) {
        const { data: current, error: currentError } = await admin.from("orders")
          .select("id,status").eq("id", order.id).eq("stripe_payment_intent_id", paymentIntentId).maybeSingle();
        if (currentError || current?.status !== "refunded") throw new Error("Refund effect failed.");
      }
    }
    const binding = { orderId: order.id, sessionId: order.stripe_checkout_session_id, paymentIntentId };
    if (input.onReconciled) await input.onReconciled(binding);
    else await resolveCheckoutPaymentExceptions({ orderId: binding.orderId, sessionId: binding.sessionId,
      code: "full_refund_reconciliation_failed" });
  } catch (error) {
    if (isPaymentDeadlineError(error) || error instanceof PaymentLeaseLostError) throw error;
    const exception = {
      orderId: order.id, sessionId: order.stripe_checkout_session_id, paymentIntentId,
      paymentStatus: refundVerified ? "refunded" as const : "unknown" as const,
      amountCents: Number.isSafeInteger(charge.amount_refunded) && charge.amount_refunded >= 0 &&
        charge.amount_refunded <= 2_147_483_647 ? charge.amount_refunded : null,
    };
    if (input.onException) {
      if (exception.amountCents === null) throw new Error("Refund facts disagree.");
      await input.onException({ ...exception, amountCents: exception.amountCents });
    } else await recordCheckoutPaymentException({ ...exception, attemptId: null, code: "full_refund_reconciliation_failed" });
    throw new Error("Refund reconciliation is temporarily unavailable.");
  }
  revalidatePath("/account");
  revalidatePath("/rewards");
}
