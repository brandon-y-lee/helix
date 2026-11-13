import "server-only";
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
export function parseShipmentView(v: unknown): ManualShipments {
  if (
    !object(v) ||
    v.environment !== "sandbox" ||
    !Array.isArray(v.shipments) ||
    v.shipments.length > 100
  )
    throw shipmentUnavailable();
  return {
    environment: "sandbox",
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
export function parseShipmentOrder(v: unknown): ShipmentOrder | null {
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
    ...parseShipmentView(v),
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
export async function lookupShipmentOrder(
  orderNumber: string,
  actorId: string,
) {
  return parseShipmentOrder(
    await rpc("read_manual_shipment_order", {
      p_order_number: orderNumber,
      p_actor_id: actorId,
    }),
  );
}
export async function applyShipment(command: ShipmentCommand, actorId: string) {
  const v = await rpc("apply_manual_shipment", {
    p_actor_id: actorId,
    p_command: command,
  });
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
