import "server-only";

import type Stripe from "stripe";
import { STRIPE_API_VERSION, STRIPE_SANDBOX_ACCOUNT_ID } from "@/lib/checkout/config";
import { getStripeClient } from "@/lib/stripe/server";

export type StripeAccountProvenance = {
  accountId: string;
  apiVersion: typeof STRIPE_API_VERSION;
};

export type CheckoutPaymentProviderBundle = StripeAccountProvenance & {
  session: Stripe.Checkout.Session;
  lineItems: Stripe.LineItem[];
  lineItemsComplete: true;
};

const readErrorMessages = {
  account_mismatch: "Payment provider account could not be verified.",
  account_unverified: "Payment provider account could not be verified.",
  incomplete_line_items: "Complete payment line items could not be retrieved.",
  invalid_session: "Sandbox checkout reference could not be verified.",
  provider_unavailable: "Payment provider could not be reached.",
} as const;

export class StripePaymentVerificationReadError extends Error {
  constructor(readonly code: keyof typeof readErrorMessages) {
    super(readErrorMessages[code]);
    this.name = "StripePaymentVerificationReadError";
  }
}

const accountProofs = new WeakMap<Stripe, Promise<StripeAccountProvenance>>();
const requestOptions = { apiVersion: STRIPE_API_VERSION, timeout: 4_000, maxNetworkRetries: 0 };
const sessionExpansions = [
  "payment_intent.payment_method",
  "discounts.coupon.applies_to",
  "discounts.coupon.currency_options",
  "shipping_cost.shipping_rate",
  "shipping_cost.taxes",
  "total_details.breakdown",
];
const lineExpansions = ["data.price.product", "data.discounts", "data.taxes"];

export async function verifyStripeAccount(
  stripe: Stripe = getStripeClient(),
): Promise<StripeAccountProvenance> {
  const cached = accountProofs.get(stripe);
  if (cached) return cached;
  const proof = Promise.resolve().then(async (): Promise<StripeAccountProvenance> => {
    try {
      const account = await stripe.accounts.retrieve(null, {}, requestOptions);
      if (account.id !== STRIPE_SANDBOX_ACCOUNT_ID) {
        throw new StripePaymentVerificationReadError("account_mismatch");
      }
      return { accountId: account.id, apiVersion: STRIPE_API_VERSION };
    } catch (error) {
      accountProofs.delete(stripe);
      if (error instanceof StripePaymentVerificationReadError) throw error;
      throw new StripePaymentVerificationReadError("account_unverified");
    }
  });
  accountProofs.set(stripe, proof);
  return proof;
}

export async function retrieveCheckoutPaymentProviderBundle(input: {
  sessionId: string;
  stripe?: Stripe;
}): Promise<CheckoutPaymentProviderBundle> {
  if (typeof input.sessionId !== "string" || !/^cs_test_[A-Za-z0-9_]+$/.test(input.sessionId)) {
    throw new StripePaymentVerificationReadError("invalid_session");
  }
  const stripe = input.stripe ?? getStripeClient();
  const provenance = await verifyStripeAccount(stripe);
  try {
    const session = await stripe.checkout.sessions.retrieve(
      input.sessionId,
      { expand: sessionExpansions },
      requestOptions,
    );
    if (!session || session.object !== "checkout.session" || session.id !== input.sessionId ||
      session.livemode !== false) {
      throw new StripePaymentVerificationReadError("invalid_session");
    }
    const lineItems: Stripe.LineItem[] = [];
    const seenLineIds = new Set<string>();
    let startingAfter: string | undefined;
    // Payment-mode Checkout permits 100 lines. The page bound also keeps retrieval
    // inside the shared refresh lease when the provider unexpectedly underfills pages.
    for (let pageNumber = 0; pageNumber < 5; pageNumber += 1) {
      const page = await stripe.checkout.sessions.listLineItems(
        input.sessionId,
        { limit: 100, expand: lineExpansions, ...(startingAfter ? { starting_after: startingAfter } : {}) },
        requestOptions,
      );
      if (!page || page.object !== "list" || !Array.isArray(page.data) ||
        typeof page.has_more !== "boolean" || (page.has_more && page.data.length === 0) ||
        lineItems.length + page.data.length > 100) {
        throw new StripePaymentVerificationReadError("incomplete_line_items");
      }
      for (const line of page.data) {
        if (!line || typeof line.id !== "string" || !line.id || seenLineIds.has(line.id)) {
          throw new StripePaymentVerificationReadError("incomplete_line_items");
        }
        seenLineIds.add(line.id);
      }
      lineItems.push(...page.data);
      if (!page.has_more) {
        return { ...provenance, session, lineItems, lineItemsComplete: true };
      }
      startingAfter = page.data.at(-1)?.id;
    }
    throw new StripePaymentVerificationReadError("incomplete_line_items");
  } catch (error) {
    if (error instanceof StripePaymentVerificationReadError) throw error;
    throw new StripePaymentVerificationReadError("provider_unavailable");
  }
}

export async function expireCheckoutPaymentProviderSession(input: {
  sessionId: string;
  stripe?: Stripe;
}): Promise<Stripe.Checkout.Session> {
  if (typeof input.sessionId !== "string" || !/^cs_test_[A-Za-z0-9_]+$/.test(input.sessionId)) {
    throw new StripePaymentVerificationReadError("invalid_session");
  }
  const stripe = input.stripe ?? getStripeClient();
  await verifyStripeAccount(stripe);
  try {
    const session = await stripe.checkout.sessions.expire(
      input.sessionId,
      { expand: sessionExpansions },
      requestOptions,
    );
    if (!session || session.object !== "checkout.session" || session.id !== input.sessionId ||
      session.livemode !== false || session.mode !== "payment" || session.status !== "expired") {
      throw new StripePaymentVerificationReadError("invalid_session");
    }
    return session;
  } catch (error) {
    if (error instanceof StripePaymentVerificationReadError) throw error;
    throw new StripePaymentVerificationReadError("provider_unavailable");
  }
}
