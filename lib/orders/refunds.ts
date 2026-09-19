import "server-only";

import type Stripe from "stripe";
import { revalidatePath } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getStripeClient } from "@/lib/stripe/server";
import { verifyStripeAccount } from "@/lib/stripe/payment-verification";
import { reversePaidOrderPoints } from "@/lib/rewards/operations";
import { recordCheckoutPaymentException, resolveCheckoutPaymentExceptions } from "@/lib/orders/payment-contracts";

async function successfulRefundAmount(stripe: Stripe, chargeId: string, paymentIntentId: string): Promise<number> {
  let startingAfter: string | undefined;
  let total = 0;
  const seen = new Set<string>();
  // A larger history needs operator review; a truncated page never proves a full refund.
  for (let page = 0; page < 5; page += 1) {
    const refunds = await stripe.refunds.list({ charge: chargeId, limit: 100, starting_after: startingAfter });
    if (!Array.isArray(refunds.data) || refunds.data.length > 100 || typeof refunds.has_more !== "boolean") {
      throw new Error("Refund history could not be verified.");
    }
    for (const refund of refunds.data) {
      const refundChargeId = typeof refund.charge === "string" ? refund.charge : refund.charge?.id;
      const refundIntentId = typeof refund.payment_intent === "string" ? refund.payment_intent : refund.payment_intent?.id;
      if (!refund.id || seen.has(refund.id) || refundChargeId !== chargeId || refundIntentId !== paymentIntentId ||
        refund.currency !== "usd" || !Number.isSafeInteger(refund.amount) || refund.amount <= 0) {
        throw new Error("Refund facts disagree.");
      }
      seen.add(refund.id);
      if (refund.status === "succeeded") total += refund.amount;
      if (!Number.isSafeInteger(total) || total > 2_147_483_647) throw new Error("Refund facts disagree.");
    }
    if (!refunds.has_more) return total;
    startingAfter = refunds.data.at(-1)?.id;
    if (!startingAfter) break;
  }
  throw new Error("Refund history could not be verified.");
}

/** Trusted provider reconciliation; never called with browser-supplied payment references. */
export async function reconcileFullStripeRefund(chargeId: string): Promise<void> {
  try {
    await reconcileFullRefund(chargeId);
  } catch {
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
    if (await successfulRefundAmount(stripe, chargeId, paymentIntentId) !== charge.amount) {
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
    await resolveCheckoutPaymentExceptions({
      orderId: order.id, sessionId: order.stripe_checkout_session_id,
      code: "full_refund_reconciliation_failed",
    });
  } catch {
    await recordCheckoutPaymentException({
      orderId: order.id, attemptId: null, sessionId: order.stripe_checkout_session_id,
      code: "full_refund_reconciliation_failed", paymentIntentId,
      paymentStatus: refundVerified ? "refunded" : "unknown",
      amountCents: Number.isSafeInteger(charge.amount_refunded) && charge.amount_refunded >= 0 &&
        charge.amount_refunded <= 2_147_483_647 ? charge.amount_refunded : null,
    });
    throw new Error("Refund reconciliation is temporarily unavailable.");
  }
  revalidatePath("/account");
  revalidatePath("/rewards");
}
