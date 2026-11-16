import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { SimulatedOrderView, SimulatedShipmentCommand, SimulatedShipmentResult, SimulatedTrackingView } from "@/lib/tracking/types";

export class SimulationError extends Error {
  constructor(readonly code: string, message: string, readonly status: number) { super(message); }
}
export const simulationUnavailable = () => new SimulationError("simulation_unavailable", "Demo tracking is temporarily unavailable.", 503);

async function rpc(name: string, args: Record<string, unknown>): Promise<unknown> {
  try {
    const { data, error } = await createSupabaseAdminClient().rpc(name, args);
    if (error) throw simulationUnavailable();
    return data;
  } catch { throw simulationUnavailable(); }
}
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const integer = (value: unknown, min: number, max: number): value is number => Number.isSafeInteger(value) && (value as number) >= min && (value as number) <= max;
function text(value: unknown, max: number, empty = false): string {
  if (typeof value !== "string" || value.length > max || (!empty && !value.trim()) || /[\x00-\x1f\x7f]/.test(value)) throw simulationUnavailable();
  return value;
}
function trackingView(value: unknown): SimulatedTrackingView {
  if (!object(value) || typeof value.frozen !== "boolean" || !Array.isArray(value.shipments) || value.shipments.length > 100) throw simulationUnavailable();
  const shipments = value.shipments.map((shipment) => {
    if (!object(shipment) || !integer(shipment.number, 1, 100) || !integer(shipment.version, 1, 100)
      || !["dispatched", "in_transit", "delivered", "exception"].includes(String(shipment.state))
      || !Array.isArray(shipment.items) || shipment.items.length > 100 || !Array.isArray(shipment.events) || shipment.events.length > 100) throw simulationUnavailable();
    return {
      id: text(shipment.id, 64), number: shipment.number, state: shipment.state as SimulatedTrackingView["shipments"][number]["state"], version: shipment.version,
      items: shipment.items.map((item) => {
        if (!object(item) || !integer(item.quantity, 1, 99)) throw simulationUnavailable();
        return { name: text(item.name, 200), variantLabel: text(item.variantLabel, 200, true), quantity: item.quantity };
      }),
      events: shipment.events.map((event) => {
        if (!object(event) || !["dispatched", "in_transit", "delivered", "exception"].includes(String(event.state))
          || typeof event.occurredAt !== "string" || event.occurredAt.length > 40 || !Number.isFinite(Date.parse(event.occurredAt))) throw simulationUnavailable();
        return { state: event.state as SimulatedTrackingView["shipments"][number]["state"], occurredAt: event.occurredAt };
      }),
    };
  });
  return { frozen: value.frozen, shipments };
}

function orderView(value: unknown): SimulatedOrderView | null {
  if (value === null) return null;
  if (!object(value) || typeof value.orderId !== "string" || typeof value.orderNumber !== "string"
    || typeof value.eligible !== "boolean" || !Array.isArray(value.lines) || value.lines.length > 100) throw simulationUnavailable();
  return { orderId: text(value.orderId, 64), orderNumber: text(value.orderNumber, 64), eligible: value.eligible,
    ...trackingView(value), lines: value.lines.map((line) => {
      if (!object(line) || !integer(line.quantity, 1, 99) || !integer(line.allocatedQuantity, 0, line.quantity)) throw simulationUnavailable();
      return { id: text(line.id, 64), name: text(line.name, 200), variantLabel: text(line.variantLabel, 200, true),
        quantity: line.quantity, allocatedQuantity: line.allocatedQuantity };
    }) };
}

export async function lookupSimulatedOrder(orderNumber: string, actorId: string): Promise<SimulatedOrderView | null> {
  return orderView(await rpc("read_simulated_order", { p_order_number: orderNumber, p_actor_id: actorId }));
}

export async function applySimulatedShipment(command: SimulatedShipmentCommand, actorId: string): Promise<SimulatedShipmentResult> {
  const data = await rpc("apply_simulated_shipment_event", {
    p_actor_id: actorId, p_order_id: command.orderId, p_command_id: command.commandId,
    p_shipment_id: command.shipmentId, p_expected_version: command.expectedVersion, p_state: command.state,
    p_lines: command.lines, p_resolution_reason: command.resolutionReason,
  });
  if (!object(data)) throw simulationUnavailable();
  if (data.status === "forbidden") throw new SimulationError("capability_required", "Demo tracking access is required.", 403);
  if (!["applied", "replayed", "conflict", "ineligible"].includes(String(data.status))) throw simulationUnavailable();
  return { status: data.status as SimulatedShipmentResult["status"], order: orderView(data.order) };
}

/** Receipt ownership is established by the caller before and after this private read. */
export async function readSimulatedTracking(orderId: string): Promise<SimulatedTrackingView | null> {
  const { data, error } = await createSupabaseAdminClient().rpc("read_simulated_tracking", { p_order_id: orderId });
  // Rolling source delivery precedes the separately approved database activation.
  // An absent optional function never changes established receipt availability.
  if (error?.code === "PGRST202" || error?.code === "42883") return null;
  if (error) throw simulationUnavailable();
  if (data === null) return null;
  return trackingView(data);
}
