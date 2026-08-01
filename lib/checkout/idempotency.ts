import { createHash } from "node:crypto";

export type CheckoutFingerprintInput = {
  environment: "sandbox";
  cartId: string;
  checkoutGeneration: string;
  owner: {
    kind: "user" | "guest";
    id: string;
  };
  customerEmail: string | null;
  currency: "USD";
  lines: Array<{
    productId: string;
    variantKey: string;
    quantity: number;
    unitPriceCents: number;
  }>;
  reward: {
    tierId: string | null;
    points: number;
  };
  referralCode: string | null;
  discountCents: number;
  shippingCents: number;
  freeShipping: boolean;
};

type CheckoutSessionState = {
  orderStatus: "pending_payment" | "payment_failed" | "cancelled";
  status: "open" | "complete" | "expired" | null;
  paymentStatus: "paid" | "unpaid" | "no_payment_required";
  expiresAt: number;
  url: string | null;
};

export type CheckoutSessionDisposition =
  | "reuse"
  | "replace"
  | "paid"
  | "processing";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function checkoutFingerprint(input: CheckoutFingerprintInput): string {
  const lines = input.lines
    .map((line) => ({
      productId: line.productId,
      variantKey: line.variantKey,
      quantity: line.quantity,
      unitPriceCents: line.unitPriceCents,
    }))
    .sort(
      (left, right) =>
        left.productId.localeCompare(right.productId) ||
        left.variantKey.localeCompare(right.variantKey),
    );

  return sha256(
    JSON.stringify({
      environment: input.environment,
      cartId: input.cartId,
      checkoutGeneration: input.checkoutGeneration,
      owner: input.owner,
      customerEmail: input.customerEmail?.trim().toLowerCase() ?? null,
      currency: input.currency,
      lines,
      reward: input.reward,
      referralCode: input.referralCode,
      discountCents: input.discountCents,
      shippingCents: input.shippingCents,
      freeShipping: input.freeShipping,
    }),
  );
}

export function checkoutOrderIdempotencyKey(
  input: CheckoutFingerprintInput,
): string {
  return `checkout:${input.environment}:${checkoutFingerprint(input)}`;
}

export function stripeCheckoutIdempotencyKey(
  orderId: string,
  previousSessionId?: string | null,
): string {
  if (!previousSessionId) return `stripe-session:${orderId}:initial`;
  return `stripe-session:${orderId}:replace:${sha256(previousSessionId).slice(0, 24)}`;
}

export function checkoutSessionDisposition(
  session: CheckoutSessionState,
  nowSeconds = Math.floor(Date.now() / 1000),
): CheckoutSessionDisposition {
  if (session.paymentStatus === "paid") return "paid";
  if (session.orderStatus === "payment_failed" && session.status === "complete") {
    return "replace";
  }
  if (session.status === "complete") return "processing";
  if (
    session.status === "open" &&
    session.expiresAt > nowSeconds &&
    Boolean(session.url)
  ) {
    return "reuse";
  }
  return "replace";
}
