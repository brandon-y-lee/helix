export const SHIPMENT_STATES = [
  "preparing",
  "dispatched",
  "delivered",
  "exception",
  "cancelled",
] as const;
export type ShipmentState = (typeof SHIPMENT_STATES)[number];
export type ShipmentCommand = {
  commandId: string;
  orderId: string;
  shipmentId: string | null;
  expectedVersion: number;
  state: ShipmentState;
  carrier: string;
  trackingReference: string;
  lines: { orderItemId: string; quantity: number }[];
  correctionReason: string | null;
};
export type ManualShipment = {
  id: string;
  version: number;
  state: ShipmentState;
  carrier: string;
  trackingReference: string;
  dispatchedAt: string | null;
  deliveredAt: string | null;
  items: { name: string; quantity: number }[];
};
export type ManualShipments = {
  environment: "sandbox";
  shipments: ManualShipment[];
};
export type ShipmentOrder = ManualShipments & {
  orderId: string;
  orderNumber: string;
  eligible: boolean;
  lines: {
    id: string;
    name: string;
    quantity: number;
    allocatedQuantity: number;
  }[];
};
export const isUuid = (v: unknown): v is string =>
  typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v,
  );
export const isShipmentState = (v: unknown): v is ShipmentState =>
  SHIPMENT_STATES.includes(v as ShipmentState);
function bounded(v: unknown, max: number): v is string {
  return typeof v === "string" && v.length <= max && !/[\x00-\x1f\x7f]/.test(v);
}
export function allowedShipmentTransition(
  from: ShipmentState,
  to: ShipmentState,
  reason: string | null,
) {
  if (from === to || from === "cancelled") return false;
  if (from === "delivered")
    return ["exception", "cancelled"].includes(to) && !!reason?.trim();
  return (
    (
      {
        preparing: ["dispatched", "exception", "cancelled"],
        dispatched: ["delivered", "exception", "cancelled"],
        exception: ["dispatched", "delivered", "cancelled"],
      } as Record<string, string[]>
    )[from]?.includes(to) ?? false
  );
}
export function parseShipmentCommand(value: unknown): ShipmentCommand {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("Invalid shipment details.");
  const v = value as Record<string, unknown>;
  if (
    Object.keys(v).sort().join(",") !==
      "carrier,commandId,correctionReason,expectedVersion,lines,orderId,shipmentId,state,trackingReference" ||
    !isUuid(v.commandId) ||
    !isUuid(v.orderId) ||
    (v.shipmentId !== null && !isUuid(v.shipmentId)) ||
    !isShipmentState(v.state) ||
    !Number.isSafeInteger(v.expectedVersion) ||
    Number(v.expectedVersion) < 0 ||
    Number(v.expectedVersion) > 100 ||
    !bounded(v.carrier, 100) ||
    !bounded(v.trackingReference, 200) ||
    !Array.isArray(v.lines) ||
    v.lines.length > 100 ||
    (v.correctionReason !== null &&
      (!bounded(v.correctionReason, 500) || !v.correctionReason.trim()))
  )
    throw Error("Invalid shipment details.");
  const ids = new Set();
  for (const l of v.lines) {
    if (
      !l ||
      typeof l !== "object" ||
      Object.keys(l).sort().join(",") !== "orderItemId,quantity" ||
      !isUuid(l.orderItemId) ||
      !Number.isInteger(l.quantity) ||
      l.quantity < 1 ||
      l.quantity > 99 ||
      ids.has(l.orderItemId)
    )
      throw Error("Invalid shipment allocation.");
    ids.add(l.orderItemId);
  }
  if (
    v.shipmentId === null
      ? v.expectedVersion !== 0 ||
        v.state !== "preparing" ||
        v.lines.length === 0 ||
        v.correctionReason !== null
      : v.expectedVersion === 0 || v.lines.length !== 0
  )
    throw Error("Invalid shipment revision.");
  return v as ShipmentCommand;
}
