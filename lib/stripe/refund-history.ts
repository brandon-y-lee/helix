import "server-only";
import type Stripe from "stripe";

export class RefundHistoryMismatch extends Error {}

/** Stripe's Refund has no livemode field. Its parent Charge must be bound to the
 * expected account and mode before making this account-scoped list request. */
export async function readChargeRefundHistory(
  stripe: Stripe, chargeId: string, paymentIntentId: string, expectedLiveMode?: boolean,
) {
  let startingAfter: string | undefined;
  let succeededCents = 0;
  let unsettled = false;
  const seen = new Set<string>();
  for (let page = 0; page < 5; page += 1) {
    const refunds = await stripe.refunds.list({ charge: chargeId, limit: 100, starting_after: startingAfter });
    if (!Array.isArray(refunds.data) || refunds.data.length > 100 || typeof refunds.has_more !== "boolean") {
      throw new RefundHistoryMismatch("Incomplete refund history.");
    }
    for (const refund of refunds.data) {
      const charge = typeof refund.charge === "string" ? refund.charge : refund.charge?.id;
      const intent = typeof refund.payment_intent === "string" ? refund.payment_intent : refund.payment_intent?.id;
      if (expectedLiveMode !== undefined && (refund.object !== "refund" ||
          (typeof refund.charge === "object" && refund.charge?.livemode !== expectedLiveMode) ||
          (typeof refund.payment_intent === "object" && refund.payment_intent?.livemode !== expectedLiveMode))) {
        throw new RefundHistoryMismatch("Refund references have the wrong provider mode.");
      }
      if (!refund.id || seen.has(refund.id) || charge !== chargeId || intent !== paymentIntentId ||
          refund.currency !== "usd" || !Number.isSafeInteger(refund.amount) || refund.amount <= 0) {
        throw new RefundHistoryMismatch("Refund facts disagree.");
      }
      seen.add(refund.id);
      if (refund.status === "succeeded") succeededCents += refund.amount;
      else if (refund.status !== "failed" && refund.status !== "canceled") unsettled = true;
      if (!Number.isSafeInteger(succeededCents) || succeededCents > 2_147_483_647) {
        throw new RefundHistoryMismatch("Invalid successful refund total.");
      }
    }
    if (!refunds.has_more) return { succeededCents, unsettled };
    startingAfter = refunds.data.at(-1)?.id;
    if (!startingAfter) break;
  }
  throw new RefundHistoryMismatch("Incomplete refund history.");
}
