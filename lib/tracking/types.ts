export type SimulatedShipmentState = "dispatched" | "in_transit" | "delivered" | "exception";

export type SimulatedTrackingView = {
  frozen: boolean;
  shipments: Array<{
    id: string;
    number: number;
    state: SimulatedShipmentState;
    version: number;
    items: Array<{ name: string; variantLabel: string; quantity: number }>;
    events: Array<{ state: SimulatedShipmentState; occurredAt: string }>;
  }>;
};

export type SimulatedOrderView = SimulatedTrackingView & {
  orderId: string;
  orderNumber: string;
  eligible: boolean;
  lines: Array<{ id: string; name: string; variantLabel: string; quantity: number; allocatedQuantity: number }>;
};

export type SimulatedShipmentCommand = {
  orderId: string;
  commandId: string;
  shipmentId: string | null;
  expectedVersion: number;
  state: SimulatedShipmentState;
  lines: Array<{ orderItemId: string; quantity: number }>;
  resolutionReason: string | null;
};

export type SimulatedShipmentResult = {
  status: "applied" | "replayed" | "conflict" | "ineligible";
  order: SimulatedOrderView | null;
};
