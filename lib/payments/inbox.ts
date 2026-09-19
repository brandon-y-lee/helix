import "server-only";
import { normalizePaymentEventEnvelope, PAYMENT_EVENT_TYPES, type PaymentEventEnvelope } from "@/lib/payments/events";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { CHECKOUT_ENVIRONMENT, STRIPE_SANDBOX_ACCOUNT_ID } from "@/lib/checkout/config";
import { isPaymentDeadlineError } from "@/lib/payments/deadline";

export type PaymentInboxState = "pending" | "processing" | "processed" | "ignored" | "dead_letter";
export type PaymentIncidentCode =
  | "identity_conflict" | "invalid_legacy_envelope" | "attempts_exhausted" | "overdue"
  | "provider_pending" | "binding_pending" | "provider_unavailable" | "storage_unavailable"
  | "verification_mismatch" | "provider_identity_mismatch" | "provider_schema_mismatch"
  | "refund_pending" | "refund_failed" | "refund_partial" | "refund_requires_action"
  | "refund_reconciliation_failed" | "refund_status_reversed" | "worker_deadline" | "unknown_failure";
export type PaymentWorkerRun = { token: string; expiresAt: string };
export type PaymentInboxClaim = {
  id: string; envelope: PaymentEventEnvelope; attempts: number; lifetimeAttempts: number;
  version: number; leaseToken: string; leaseExpiresAt: string;
};
export type PaymentLease = { runToken: string; itemId: string; leaseToken: string; expectedVersion: number };
export type PaymentRefundFact = {
  refundId: string; chargeId: string; paymentIntentId: string; orderId: string | null;
  amountCents: number; currency: string;
  status: "pending" | "requires_action" | "succeeded" | "failed" | "canceled" | "unknown";
};
export type PaymentRefundException = {
  orderId: string; sessionId: string; paymentIntentId: string; amountCents: number;
  paymentStatus: "unknown" | "refunded";
};
type PaymentRefundExceptionBinding = Pick<PaymentRefundException, "orderId" | "sessionId" | "paymentIntentId">;
export type PaymentRefundObservationInput = {
  facts: PaymentRefundFact[];
  exception?: PaymentRefundException;
  resolvedException?: PaymentRefundExceptionBinding;
};
export type PaymentEventFinish = PaymentLease & {
  disposition: "processed" | "ignored" | "pending" | "dead_letter";
  code?: PaymentIncidentCode; retryAfterSeconds?: number;
};
export type PaymentOperationsItem = {
  id: string; eventId: string; eventType: string; objectId: string | null; state: PaymentInboxState;
  attempts: number; lifetimeAttempts: number; version: number; receivedAt: string;
  nextAttemptAt: string; processedAt: string | null; incidentCode: PaymentIncidentCode | null;
  replayEligible: boolean; provenance: "webhook" | "legacy";
};
export type PaymentOperations = {
  accountId: string; environment: "sandbox"; observedAt: string;
  heartbeat: { startedAt: string | null; completedAt: string | null; processedCount: number; failureCount: number };
  counts: Record<PaymentInboxState, number>; oldestPendingAt: string | null;
  items: PaymentOperationsItem[];
  incidents: { id: string; itemId: string; code: PaymentIncidentCode; createdAt: string; resolvedAt: string | null }[];
  refunds: (PaymentRefundFact & { observedAt: string; succeededPreviously: boolean })[];
};
export type PaymentReplayInput = {
  actorId: string; itemId: string; expectedVersion: number; reason: string; requestId: string; dryRun: boolean;
};
export type PaymentReplayResult = {
  status: "eligible" | "applied" | "duplicate" | "conflict" | "denied" | "ineligible" | "dry_run_required";
  itemId: string; version: number | null;
};

export class PaymentInboxStorageError extends Error {
  constructor() {
    super("Payment operations are temporarily unavailable.");
    this.name = "PaymentInboxStorageError";
  }
}
function unavailable(): never { throw new PaymentInboxStorageError(); }
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function uuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
function date(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && Number.isFinite(Date.parse(value));
}
function integer(value: unknown, minimum = 0, maximum = 2147483647): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= minimum && value <= maximum;
}
const incidentCodes: readonly PaymentIncidentCode[] = [
  "identity_conflict", "invalid_legacy_envelope", "attempts_exhausted", "overdue",
  "provider_pending", "binding_pending", "provider_unavailable", "storage_unavailable",
  "verification_mismatch", "provider_identity_mismatch", "provider_schema_mismatch",
  "refund_pending", "refund_failed", "refund_partial", "refund_requires_action",
  "refund_reconciliation_failed", "refund_status_reversed", "worker_deadline", "unknown_failure",
];
function incident(value: unknown): value is PaymentIncidentCode {
  return typeof value === "string" && incidentCodes.includes(value as PaymentIncidentCode);
}
function leaseArgs(input: PaymentLease): Record<string, unknown> {
  if (!uuid(input.runToken) || !uuid(input.itemId) || !uuid(input.leaseToken) || !integer(input.expectedVersion, 1)) unavailable();
  return { p_run_token: input.runToken, p_item_id: input.itemId, p_lease_token: input.leaseToken, p_expected_version: input.expectedVersion };
}
async function acknowledged(name: string, args: Record<string, unknown>): Promise<boolean> {
  const value = await rpc(name, args);
  if (typeof value !== "boolean") unavailable();
  return value;
}
async function rpc(name: string, args: Record<string, unknown> = {}): Promise<unknown> {
  try {
    const { data, error } = await createSupabaseAdminClient().rpc(name, args);
    if (isPaymentDeadlineError(error)) throw error;
    if (error) unavailable();
    return data;
  } catch (error) {
    if (isPaymentDeadlineError(error)) throw error;
    return unavailable();
  }
}
export async function claimPaymentWorkerRun(): Promise<PaymentWorkerRun | null> {
  const value = await rpc("claim_payment_worker_run");
  if (value === null) return null;
  if (!record(value) || !uuid(value.token) || !date(value.expiresAt)) unavailable();
  return { token: value.token, expiresAt: value.expiresAt };
}
function envelope(value: unknown, fromStorage = false): PaymentEventEnvelope {
  try {
    if (fromStorage) {
      if (!record(value) || !date(value.createdAt)) unavailable();
      return normalizePaymentEventEnvelope({ ...value, createdAt: new Date(value.createdAt).toISOString() });
    }
    return normalizePaymentEventEnvelope(value);
  } catch { return unavailable(); }
}
export async function receivePaymentEvent(input: PaymentEventEnvelope): Promise<{ status: "received" | "duplicate" | "conflict"; itemId: string }> {
  const value = await rpc("receive_payment_event", { p_envelope: envelope(input) });
  if (!record(value) || !uuid(value.itemId) || !["received", "duplicate", "conflict"].includes(String(value.status))) unavailable();
  return { status: value.status as "received" | "duplicate" | "conflict", itemId: value.itemId };
}
export async function claimPaymentEvents(input: { runToken: string; limit: number }): Promise<PaymentInboxClaim[]> {
  if (!uuid(input.runToken) || !integer(input.limit, 1, 20)) unavailable();
  const value = await rpc("claim_payment_events", { p_run_token: input.runToken, p_limit: input.limit });
  if (!Array.isArray(value) || value.length > input.limit) unavailable();
  const ids = new Set<string>();
  return value.map((item): PaymentInboxClaim => {
    if (!record(item) || !uuid(item.id) || ids.has(item.id) || !integer(item.attempts, 1, 12)
      || !integer(item.lifetimeAttempts, item.attempts) || !integer(item.version, 1)
      || !uuid(item.leaseToken) || !date(item.leaseExpiresAt)) unavailable();
    ids.add(item.id);
    return { id: item.id, envelope: envelope(item.envelope, true), attempts: item.attempts,
      lifetimeAttempts: item.lifetimeAttempts, version: item.version, leaseToken: item.leaseToken, leaseExpiresAt: item.leaseExpiresAt };
  });
}
export async function finishPaymentEvent(input: PaymentEventFinish): Promise<boolean> {
  const args = leaseArgs(input);
  if (!["processed", "ignored", "pending", "dead_letter"].includes(input.disposition)
    || (input.code !== undefined && !incident(input.code))
    || (input.retryAfterSeconds !== undefined && !integer(input.retryAfterSeconds))) unavailable();
  return acknowledged("finish_payment_event", { ...args, p_disposition: input.disposition,
    p_code: input.code ?? null, p_retry_after_seconds: input.retryAfterSeconds ?? null });
}
export async function recordPaymentEventIncident(input: PaymentLease & { code: PaymentIncidentCode }): Promise<boolean> {
  const args = leaseArgs(input);
  if (!incident(input.code)) unavailable();
  return acknowledged("record_payment_event_incident", { ...args, p_code: input.code });
}
export async function finishPaymentWorkerRun(input: { runToken: string; processedCount: number; failureCount: number }): Promise<boolean> {
  if (!uuid(input.runToken) || !integer(input.processedCount, 0, 20) || !integer(input.failureCount, 0, 20)) unavailable();
  return acknowledged("finish_payment_worker_run", { p_run_token: input.runToken,
    p_processed_count: input.processedCount, p_failure_count: input.failureCount });
}
function providerId(value: unknown, pattern: RegExp): value is string {
  return typeof value === "string" && pattern.test(value);
}
function refundFact(value: unknown): PaymentRefundFact {
  if (!record(value) || !providerId(value.refundId, /^(?:re|pyr)_[A-Za-z0-9_]{1,200}$/)
    || !providerId(value.chargeId, /^(?:ch|py)_[A-Za-z0-9_]{1,200}$/)
    || !providerId(value.paymentIntentId, /^pi_[A-Za-z0-9_]{1,200}$/)
    || (value.orderId !== null && !uuid(value.orderId)) || !integer(value.amountCents) || value.currency !== "usd"
    || !["pending", "requires_action", "succeeded", "failed", "canceled", "unknown"].includes(String(value.status))) unavailable();
  return { refundId: value.refundId, chargeId: value.chargeId, paymentIntentId: value.paymentIntentId,
    orderId: value.orderId, amountCents: value.amountCents, currency: "usd", status: value.status as PaymentRefundFact["status"] };
}
function refundExceptionBinding(value: unknown): PaymentRefundExceptionBinding {
  if (!record(value) || !uuid(value.orderId) || !providerId(value.sessionId, /^cs_test_[A-Za-z0-9_]{1,200}$/)
    || !providerId(value.paymentIntentId, /^pi_[A-Za-z0-9_]{1,200}$/)) unavailable();
  return { orderId: value.orderId, sessionId: value.sessionId, paymentIntentId: value.paymentIntentId };
}
function refundException(value: unknown): PaymentRefundException {
  const binding = refundExceptionBinding(value);
  if (!record(value) || !integer(value.amountCents) || (value.paymentStatus !== "unknown" && value.paymentStatus !== "refunded")) unavailable();
  return { ...binding, amountCents: value.amountCents, paymentStatus: value.paymentStatus };
}
export async function recordPaymentRefundObservations(input: PaymentLease & PaymentRefundObservationInput): Promise<boolean> {
  const args = leaseArgs(input);
  if (!Array.isArray(input.facts) || input.facts.length > 500
    || (input.exception !== undefined && input.resolvedException !== undefined)) unavailable();
  const facts = input.facts.map(refundFact);
  if (new Set(facts.map((fact) => fact.refundId)).size !== facts.length) unavailable();
  return acknowledged("record_payment_refund_observations", { ...args, p_facts: facts,
    p_exception: input.exception === undefined ? null : refundException(input.exception),
    p_resolved_exception: input.resolvedException === undefined ? null : refundExceptionBinding(input.resolvedException) });
}
export async function replayPaymentEvent(input: PaymentReplayInput): Promise<PaymentReplayResult> {
  if (!uuid(input.actorId) || !uuid(input.itemId) || !uuid(input.requestId) || !integer(input.expectedVersion, 1)
    || typeof input.dryRun !== "boolean" || typeof input.reason !== "string" || input.reason.trim().length < 10
    || input.reason.length > 500 || /[\u0000-\u001f\u007f]/.test(input.reason)) unavailable();
  const value = await rpc("replay_payment_event", { p_actor_id: input.actorId, p_item_id: input.itemId,
    p_expected_version: input.expectedVersion, p_reason: input.reason, p_request_id: input.requestId, p_dry_run: input.dryRun });
  if (!record(value) || value.itemId !== input.itemId || (value.version !== null && !integer(value.version, 1))
    || !["eligible", "applied", "duplicate", "conflict", "denied", "ineligible", "dry_run_required"].includes(String(value.status))) unavailable();
  return { status: value.status as PaymentReplayResult["status"], itemId: input.itemId, version: value.version };
}
const states: readonly PaymentInboxState[] = ["pending", "processing", "processed", "ignored", "dead_letter"];
function nullableDate(value: unknown): value is string | null { return value === null || date(value); }
function operationsItem(value: unknown): PaymentOperationsItem {
  if (!record(value) || !uuid(value.id) || !providerId(value.eventId, /^evt_[A-Za-z0-9_]{1,200}$/)
    || !(PAYMENT_EVENT_TYPES as readonly unknown[]).includes(value.eventType) && value.eventType !== "legacy.invalid"
    || typeof value.eventType !== "string"
    || (value.objectId !== null && !providerId(value.objectId, /^(?:cs_test|ch|py|re|pyr)_[A-Za-z0-9_]{1,200}$/))
    || !states.includes(value.state as PaymentInboxState) || !integer(value.attempts, 0, 12)
    || !integer(value.lifetimeAttempts, value.attempts) || !integer(value.version, 1)
    || !date(value.receivedAt) || !date(value.nextAttemptAt) || !nullableDate(value.processedAt)
    || (value.incidentCode !== null && !incident(value.incidentCode)) || typeof value.replayEligible !== "boolean"
    || (value.provenance !== "webhook" && value.provenance !== "legacy")) unavailable();
  return { id: value.id, eventId: value.eventId, eventType: value.eventType, objectId: value.objectId,
    state: value.state as PaymentInboxState, attempts: value.attempts, lifetimeAttempts: value.lifetimeAttempts,
    version: value.version, receivedAt: value.receivedAt, nextAttemptAt: value.nextAttemptAt,
    processedAt: value.processedAt, incidentCode: value.incidentCode, replayEligible: value.replayEligible, provenance: value.provenance };
}
function operationsIncident(value: unknown): PaymentOperations["incidents"][number] {
  if (!record(value) || !uuid(value.id) || !uuid(value.itemId) || !incident(value.code)
    || !date(value.createdAt) || !nullableDate(value.resolvedAt)) unavailable();
  return { id: value.id, itemId: value.itemId, code: value.code, createdAt: value.createdAt, resolvedAt: value.resolvedAt };
}
function operationsRefund(value: unknown): PaymentOperations["refunds"][number] {
  if (!record(value) || !date(value.observedAt) || typeof value.succeededPreviously !== "boolean") unavailable();
  return { ...refundFact(value), observedAt: value.observedAt, succeededPreviously: value.succeededPreviously };
}
/** Omit actorId only for trusted service-only operational tooling. Admin callers must supply the verified actor. */
export async function readPaymentOperations(input: { actorId?: string }): Promise<PaymentOperations> {
  if (input.actorId !== undefined && !uuid(input.actorId)) unavailable();
  const value = await rpc("read_payment_operations", { p_actor_id: input.actorId ?? null });
  if (!record(value) || value.accountId !== STRIPE_SANDBOX_ACCOUNT_ID || value.environment !== CHECKOUT_ENVIRONMENT
    || !date(value.observedAt) || !nullableDate(value.oldestPendingAt) || !record(value.heartbeat) || !record(value.counts)
    || !nullableDate(value.heartbeat.startedAt) || !nullableDate(value.heartbeat.completedAt)
    || !integer(value.heartbeat.processedCount, 0, 20) || !integer(value.heartbeat.failureCount, 0, 20)
    || !states.every((state) => integer((value.counts as Record<string, unknown>)[state]))
    || !Array.isArray(value.items) || value.items.length > 500
    || !Array.isArray(value.incidents) || value.incidents.length > 500
    || !Array.isArray(value.refunds) || value.refunds.length > 500) unavailable();
  return { accountId: STRIPE_SANDBOX_ACCOUNT_ID, environment: CHECKOUT_ENVIRONMENT, observedAt: value.observedAt,
    heartbeat: { startedAt: value.heartbeat.startedAt, completedAt: value.heartbeat.completedAt,
      processedCount: value.heartbeat.processedCount, failureCount: value.heartbeat.failureCount },
    counts: { pending: value.counts.pending as number, processing: value.counts.processing as number,
      processed: value.counts.processed as number, ignored: value.counts.ignored as number, dead_letter: value.counts.dead_letter as number },
    oldestPendingAt: value.oldestPendingAt, items: value.items.map(operationsItem),
    incidents: value.incidents.map(operationsIncident), refunds: value.refunds.map(operationsRefund) };
}
