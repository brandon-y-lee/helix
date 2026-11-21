import "server-only";
import type { CheckoutEnvironment } from "@/lib/checkout/payment-verification";
import { configuredBusinessStripeReceiptScope, hasBusinessSandboxPaymentConfiguration, hasLivePaymentConfiguration, type BusinessStripeScope } from "@/lib/stripe/live-provider";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  isShipmentState,
  isUuid,
  type ManualShipments,
  type ShipmentCommand,
  type ShipmentOrder,
} from "./contract";
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown, max: number): v is string =>
  typeof v === "string" && v.length <= max && !/[\x00-\x1f\x7f]/.test(v);
const integer = (v: unknown, min: number, max: number): v is number =>
  Number.isSafeInteger(v) && Number(v) >= min && Number(v) <= max;
const timestamp = (v: unknown) =>
  v === null ||
  (typeof v === "string" && v.length <= 40 && Number.isFinite(Date.parse(v)));
export const shipmentUnavailable = () =>
  Error("Shipment records are temporarily unavailable.");
async function rpc(name: string, args: Record<string, unknown>) {
  const result = await createSupabaseAdminClient()
    .rpc(name, args)
    .abortSignal(AbortSignal.timeout(3000));
  if (result.error) throw shipmentUnavailable();
  return result.data as unknown;
}
export function parseShipmentView(v: unknown, environment: CheckoutEnvironment = "sandbox"): ManualShipments {
  if (
    !object(v) ||
    v.environment !== environment ||
    !Array.isArray(v.shipments) ||
    v.shipments.length > 100
  )
    throw shipmentUnavailable();
  return {
    environment,
    shipments: v.shipments.map((s) => {
      if (
        !object(s) ||
        !isUuid(s.id) ||
        !integer(s.version, 1, 100) ||
        !isShipmentState(s.state) ||
        !text(s.carrier, 100) ||
        !text(s.trackingReference, 200) ||
        !timestamp(s.dispatchedAt) ||
        !timestamp(s.deliveredAt) ||
        !Array.isArray(s.items) ||
        s.items.length > 100
      )
        throw shipmentUnavailable();
      return {
        id: s.id,
        version: s.version,
        state: s.state,
        carrier: s.carrier,
        trackingReference: s.trackingReference,
        dispatchedAt: s.dispatchedAt as string | null,
        deliveredAt: s.deliveredAt as string | null,
        items: s.items.map((i) => {
          if (!object(i) || !text(i.name, 200) || !integer(i.quantity, 1, 99))
            throw shipmentUnavailable();
          return { name: i.name, quantity: i.quantity };
        }),
      };
    }),
  };
}
function parseDelivery(value: unknown): NonNullable<ShipmentOrder["delivery"]> {
  if (!object(value) || !text(value.name, 200) || !value.name.trim() || !object(value.address)) throw shipmentUnavailable();
  const a = value.address;
  if (!text(a.line1, 200) || !a.line1.trim() || (a.line2 !== null && !text(a.line2, 200)) ||
      !text(a.city, 100) || !a.city.trim() || !text(a.state, 100) || !a.state.trim() ||
      !text(a.postal_code, 20) || !a.postal_code.trim() || a.country !== "US") throw shipmentUnavailable();
  return { name: value.name, address: { line1: a.line1, line2: a.line2, city: a.city, state: a.state, postal_code: a.postal_code, country: a.country } };
}

export function parseShipmentOrder(v: unknown, environment: CheckoutEnvironment = "sandbox"): ShipmentOrder | null {
  if (v === null) return null;
  if (
    !object(v) ||
    !isUuid(v.orderId) ||
    !text(v.orderNumber, 100) ||
    typeof v.eligible !== "boolean" ||
    !Array.isArray(v.lines) ||
    v.lines.length > 100
  )
    throw shipmentUnavailable();
  return {
    ...parseShipmentView(v, environment),
    ...(environment !== "sandbox" ? { delivery: parseDelivery(v.delivery) } : {}),
    orderId: v.orderId,
    orderNumber: v.orderNumber,
    eligible: v.eligible,
    lines: v.lines.map((l) => {
      if (
        !object(l) ||
        !isUuid(l.id) ||
        !text(l.name, 200) ||
        !integer(l.quantity, 1, 99) ||
        !integer(l.allocatedQuantity, 0, l.quantity)
      )
        throw shipmentUnavailable();
      return {
        id: l.id,
        name: l.name,
        quantity: l.quantity,
        allocatedQuantity: l.allocatedQuantity,
      };
    }),
  };
}
export function shipmentManagementScope(): BusinessStripeScope | null {
  const scope = configuredBusinessStripeReceiptScope();
  if (!scope && (hasBusinessSandboxPaymentConfiguration(process.env) || hasLivePaymentConfiguration(process.env))) {
    throw shipmentUnavailable();
  }
  return scope;
}

export async function lookupShipmentOrder(orderNumber: string, actorId: string, scope = shipmentManagementScope()) {
  const data = scope
    ? await rpc("read_business_shipment_order", { p_environment: scope.environment, p_account_id: scope.accountId,
        p_order_number: orderNumber, p_actor_id: actorId })
    : await rpc("read_manual_shipment_order", { p_order_number: orderNumber, p_actor_id: actorId });
  return parseShipmentOrder(data, scope?.environment ?? "sandbox");
}

export async function applyShipment(command: ShipmentCommand, actorId: string, scope = shipmentManagementScope()) {
  const v = scope
    ? await rpc("apply_business_shipment", { p_environment: scope.environment, p_account_id: scope.accountId, p_actor_id: actorId, p_command: command })
    : await rpc("apply_manual_shipment", { p_actor_id: actorId, p_command: command });
  if (
    !object(v) ||
    ![
      "applied",
      "replayed",
      "conflict",
      "invalid",
      "ineligible",
      "forbidden",
      "disabled",
    ].includes(String(v.status))
  )
    throw shipmentUnavailable();
  return { status: v.status as string };
}
/** Only called between existing receipt ownership/binding checks. Never a public order-ID read. */
export async function readManualShipments(
  orderId: string,
): Promise<ManualShipments | null> {
  const { data, error } = await createSupabaseAdminClient()
    .rpc("read_manual_shipments", { p_order_id: orderId })
    .abortSignal(AbortSignal.timeout(3000));
  if (error?.code === "PGRST202" || error?.code === "42883") return null;
  if (error) throw shipmentUnavailable();
  return data === null ? null : parseShipmentView(data);
}

export async function readBusinessOrderShipments(scope: BusinessStripeScope, orderId: string, sessionId: string,
  userId: string | null, receiptHash: string | null): Promise<ManualShipments | null> {
  const value = await rpc("read_business_order_shipments", {
    p_environment: scope.environment, p_account_id: scope.accountId, p_order_id: orderId, p_session_id: sessionId,
    p_user_id: userId, p_receipt_token_hash: receiptHash,
  });
  if (value === null) return null;
  const records = parseShipmentView(value, scope.environment);
  if (records.shipments.some(record => !record.dispatchedAt || record.state === "preparing")) throw shipmentUnavailable();
  return records;
}
