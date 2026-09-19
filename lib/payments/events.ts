import { CHECKOUT_ENVIRONMENT, STRIPE_API_VERSION, STRIPE_SANDBOX_ACCOUNT_ID } from "@/lib/checkout/config";

export const PAYMENT_EVENT_TYPES = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
  "charge.refunded",
  "refund.created",
  "refund.updated",
  "refund.failed",
] as const;

export type PaymentEventType = typeof PAYMENT_EVENT_TYPES[number];
export type PaymentEventEnvelope = {
  accountId: typeof STRIPE_SANDBOX_ACCOUNT_ID;
  environment: typeof CHECKOUT_ENVIRONMENT;
  eventId: string;
  eventType: PaymentEventType;
  apiVersion: typeof STRIPE_API_VERSION;
  createdAt: string;
  objectKind: "checkout.session" | "charge" | "refund";
  objectId: string;
  chargeId: string | null;
  paymentIntentId: string | null;
};

export class PaymentEventError extends Error {
  constructor(readonly status: 400 | 403 = 400) {
    super("Invalid sandbox payment event.");
    this.name = "PaymentEventError";
  }
}

const identifiers = {
  event: /^evt_[A-Za-z0-9_]{1,200}$/,
  "checkout.session": /^cs_test_[A-Za-z0-9_]{1,200}$/,
  charge: /^(?:ch|py)_[A-Za-z0-9_]{1,200}$/,
  refund: /^(?:re|pyr)_[A-Za-z0-9_]{1,200}$/,
  payment_intent: /^pi_[A-Za-z0-9_]{1,200}$/,
};

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new PaymentEventError();
  return value as Record<string, unknown>;
}

function identifier(value: unknown, kind: keyof typeof identifiers): string {
  if (typeof value !== "string" || !identifiers[kind].test(value)) throw new PaymentEventError();
  return value;
}

function optionalIdentifier(value: unknown, kind: "charge" | "payment_intent"): string | null {
  return value === undefined || value === null ? null : identifier(value, kind);
}

function reference(value: unknown, kind: "charge" | "payment_intent"): string | null {
  if (value === undefined || value === null || typeof value === "string") return optionalIdentifier(value, kind);
  const expanded = record(value);
  if (expanded.object !== kind) throw new PaymentEventError();
  if (expanded.livemode !== false) throw new PaymentEventError(403);
  return identifier(expanded.id, kind);
}

function eventType(value: unknown): PaymentEventType {
  if (!(PAYMENT_EVENT_TYPES as readonly unknown[]).includes(value)) throw new PaymentEventError();
  return value as PaymentEventType;
}

function objectKind(type: PaymentEventType): PaymentEventEnvelope["objectKind"] {
  if (type.startsWith("checkout.session.")) return "checkout.session";
  return type === "charge.refunded" ? "charge" : "refund";
}

/** Validate the durable contract again at the storage boundary, dropping all other fields. */
export function normalizePaymentEventEnvelope(input: unknown): PaymentEventEnvelope {
  const value = record(input);
  if (value.accountId !== STRIPE_SANDBOX_ACCOUNT_ID || value.environment !== CHECKOUT_ENVIRONMENT) {
    throw new PaymentEventError(403);
  }
  if (value.apiVersion !== STRIPE_API_VERSION) throw new PaymentEventError();
  const type = eventType(value.eventType);
  const kind = objectKind(type);
  if (value.objectKind !== kind) throw new PaymentEventError();
  if (typeof value.createdAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z$/.test(value.createdAt)) {
    throw new PaymentEventError();
  }
  const created = Date.parse(value.createdAt);
  if (!Number.isFinite(created) || created < 0 || new Date(created).toISOString() !== value.createdAt) throw new PaymentEventError();
  const objectId = identifier(value.objectId, kind);
  const chargeId = optionalIdentifier(value.chargeId, "charge");
  if ((kind === "charge" && chargeId !== objectId) || (kind === "checkout.session" && chargeId !== null)) throw new PaymentEventError();
  return {
    accountId: STRIPE_SANDBOX_ACCOUNT_ID, environment: CHECKOUT_ENVIRONMENT,
    eventId: identifier(value.eventId, "event"), eventType: type, apiVersion: STRIPE_API_VERSION,
    createdAt: value.createdAt, objectKind: kind, objectId, chargeId,
    paymentIntentId: optionalIdentifier(value.paymentIntentId, "payment_intent"),
  };
}

/** Use only after verifying the untouched request bytes with the registered signing secret. */
export function extractPaymentEventEnvelope(input: unknown): PaymentEventEnvelope {
  const event = record(input);
  if (event.object !== "event") throw new PaymentEventError();
  if (event.livemode !== false) throw new PaymentEventError(403);
  for (const key of ["account", "context"]) {
    if (event[key] !== undefined && event[key] !== null && event[key] !== STRIPE_SANDBOX_ACCOUNT_ID) {
      throw new PaymentEventError(403);
    }
  }
  const type = eventType(event.type);
  const kind = objectKind(type);
  const object = record(record(event.data).object);
  if (object.object !== kind) throw new PaymentEventError();
  // Refund does not have livemode in the pinned Stripe API. Its signed Event does.
  if (kind !== "refund" ? object.livemode !== false : object.livemode !== undefined && object.livemode !== false) {
    throw new PaymentEventError(403);
  }
  if (typeof event.created !== "number" || !Number.isSafeInteger(event.created) || event.created < 0 || event.created > 253_402_300_799) {
    throw new PaymentEventError();
  }
  return normalizePaymentEventEnvelope({
    accountId: STRIPE_SANDBOX_ACCOUNT_ID, environment: CHECKOUT_ENVIRONMENT,
    eventId: event.id, eventType: type, apiVersion: event.api_version,
    createdAt: new Date(event.created * 1000).toISOString(), objectKind: kind,
    objectId: object.id, chargeId: kind === "charge" ? object.id : kind === "refund" ? reference(object.charge, "charge") : null,
    paymentIntentId: reference(object.payment_intent, "payment_intent"),
  });
}
