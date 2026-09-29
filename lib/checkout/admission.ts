import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type CachedCheckoutSession = {
  kind: "session";
  id: string;
  status: "open" | "complete" | "expired";
  payment_status: "paid" | "unpaid" | "no_payment_required";
  expires_at: number;
  url: string | null;
  livemode: false;
  payment_method_types: string[];
};
export type CachedShippingRate = {
  kind: "shipping_rate";
  id: string;
  amountCents: number;
  currency: "usd";
};
export type PaymentRefreshSnapshot = CachedCheckoutSession | CachedShippingRate;
export type PaymentRefreshTarget =
  | { kind: "session"; orderId: string; sessionId: string }
  | { kind: "attempt"; orderId: string; attemptToken: string; stripeIdempotencyKey: string }
  | { kind: "shipping_rate"; shippingRateId: string };

type CreationIdentity = {
  accountId: string;
  orderId: string;
  attemptToken: string;
  stripeIdempotencyKey: string;
};

export class CheckoutAdmissionError extends Error {
  constructor(
    readonly status: 429 | 503,
    readonly retryAfterSeconds = 1,
  ) {
    super(status === 429
      ? "Checkout is busy. Wait a moment and try again."
      : "Sandbox checkout is temporarily unavailable. Try again in a moment.");
    this.name = "CheckoutAdmissionError";
  }
}

function unavailable(): never {
  throw new CheckoutAdmissionError(503);
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function integer(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max;
}
function exactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every((key) => key in value);
}
function validSnapshot(value: unknown): value is PaymentRefreshSnapshot {
  if (!record(value)) return false;
  if (value.kind === "shipping_rate") {
    return exactKeys(value, ["kind", "id", "amountCents", "currency"])
      && typeof value.id === "string" && /^shr_[A-Za-z0-9_]{1,200}$/.test(value.id)
      && value.currency === "usd" && integer(value.amountCents, 0, 2147483647);
  }
  return value.kind === "session"
    && exactKeys(value, ["kind", "id", "status", "payment_status", "expires_at", "url", "livemode", "payment_method_types"])
    && typeof value.id === "string" && /^cs_[A-Za-z0-9_]{1,200}$/.test(value.id)
    && ["open", "complete", "expired"].includes(value.status as string)
    && ["paid", "unpaid", "no_payment_required"].includes(value.payment_status as string)
    && integer(value.expires_at, 1, 9999999999)
    && (value.url === null || (typeof value.url === "string" && value.url.length <= 4096 && /^https:\/\//.test(value.url)))
    && value.livemode === false && Array.isArray(value.payment_method_types)
    && value.payment_method_types.length <= 30
    && value.payment_method_types.every((method) => typeof method === "string" && /^[a-z][a-z0-9_]{0,63}$/.test(method));
}
function creationArguments(input: CreationIdentity) {
  return {
    p_account_id: input.accountId,
    p_order_id: input.orderId,
    p_attempt_token: input.attemptToken,
    p_stripe_idempotency_key: input.stripeIdempotencyKey,
  };
}
function refreshArguments(input: { accountId: string; target: PaymentRefreshTarget }) {
  return {
    p_account_id: input.accountId,
    p_kind: input.target.kind,
    p_order_id: input.target.kind === "shipping_rate" ? null : input.target.orderId,
    p_attempt_token: input.target.kind === "attempt" ? input.target.attemptToken : null,
    p_target_id: input.target.kind === "session" ? input.target.sessionId
      : input.target.kind === "attempt" ? input.target.stripeIdempotencyKey : input.target.shippingRateId,
  };
}
async function call(name: string, args: Record<string, unknown>): Promise<unknown> {
  try {
    const { data, error } = await createSupabaseAdminClient().rpc(name, args);
    if (error) unavailable();
    return data;
  } catch {
    return unavailable();
  }
}

export async function admitCheckoutCreation(input: CreationIdentity): Promise<{ replay: boolean }> {
  const result = await call("admit_checkout_creation", creationArguments(input));
  if (!record(result) || typeof result.allowed !== "boolean" || typeof result.replay !== "boolean"
    || !integer(result.retry_after_seconds, 0, 60)) unavailable();
  if (!result.allowed) {
    if (result.replay || result.retry_after_seconds < 1) unavailable();
    throw new CheckoutAdmissionError(429, result.retry_after_seconds);
  }
  return { replay: result.replay };
}

export async function claimPaymentRefresh(input: { accountId: string; target: PaymentRefreshTarget }): Promise<{
  allowed: boolean;
  token: string | null;
  cached: PaymentRefreshSnapshot | null;
  retryAfterSeconds: number;
}> {
  const result = await call("claim_checkout_refresh", refreshArguments(input));
  if (!record(result) || typeof result.allowed !== "boolean" || !integer(result.retry_after_seconds, 0, 60)
    || (result.cached !== null && !validSnapshot(result.cached))
    || (result.allowed
      ? typeof result.token !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(result.token)
      : result.token !== null)) unavailable();
  const cached = result.cached as PaymentRefreshSnapshot | null;
  if (cached && (input.target.kind === "shipping_rate"
    ? cached.kind !== "shipping_rate" || cached.id !== input.target.shippingRateId
    : cached.kind !== "session" || (input.target.kind === "session" && cached.id !== input.target.sessionId))) unavailable();
  return {
    allowed: result.allowed,
    token: result.token as string | null,
    cached,
    retryAfterSeconds: result.retry_after_seconds,
  };
}

export async function finishPaymentRefresh(input: {
  accountId: string;
  target: PaymentRefreshTarget;
  token: string;
  snapshot: PaymentRefreshSnapshot | null;
}): Promise<boolean> {
  if (input.snapshot !== null && !validSnapshot(input.snapshot)) unavailable();
  const result = await call("finish_checkout_refresh", {
    ...refreshArguments(input), p_refresh_token: input.token, p_snapshot: input.snapshot,
  });
  if (typeof result !== "boolean") unavailable();
  return result;
}

// Bind the accepted Session and seed only an absent cache. A concurrent refresh
// owns any existing lease or newer snapshot and is never replaced by creation.
export async function cacheCreatedCheckoutSession(input: CreationIdentity & { snapshot: CachedCheckoutSession }): Promise<void> {
  if (!validSnapshot(input.snapshot) || input.snapshot.kind !== "session") unavailable();
  const result = await call("cache_created_checkout_session", {
    ...creationArguments(input), p_snapshot: input.snapshot,
  });
  if (result !== true) unavailable();
}
