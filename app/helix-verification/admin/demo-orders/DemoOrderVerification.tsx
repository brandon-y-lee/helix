"use client";

import { useMemo } from "react";
import { SimulatedTrackingConsole, type SimulatedTrackingApi } from "@/components/admin/SimulatedTrackingConsole";
import type { SimulatedOrderView, SimulatedShipmentCommand } from "@/lib/tracking/types";

export type DemoOrderVerificationScenario = "default" | "uncertain" | "conflict" | "lookup-error";

const syntheticOrder: SimulatedOrderView = {
  orderId: "20000000-0000-4000-8000-000000000001",
  orderNumber: "SAMPLE-001",
  eligible: true,
  frozen: false,
  lines: [{
    id: "20000000-0000-4000-8000-000000000002",
    name: "Sample skincare product", variantLabel: "50 ml", quantity: 2, allocatedQuantity: 0,
  }],
  shipments: [],
};

// A tiny local presentation fixture, not the shipment authority. It cannot read
// accounts, persist Orders, contact providers, or send API requests.
export function createDemoOrderVerificationApi(scenario: DemoOrderVerificationScenario): SimulatedTrackingApi {
  let order = structuredClone(syntheticOrder);
  let lookupFailed = false;
  let firstSubmission = true;
  const recorded = new Map<string, string>();

  function apply(command: SimulatedShipmentCommand): boolean {
    if (command.orderId !== order.orderId) return false;
    if (command.shipmentId === null) {
      const allocation = command.lines[0];
      const line = order.lines[0];
      if (command.state !== "dispatched" || command.lines.length !== 1 || !allocation
        || allocation.orderItemId !== line.id || !Number.isInteger(allocation.quantity)
        || allocation.quantity < 1 || allocation.quantity > line.quantity - line.allocatedQuantity) return false;
      const number = order.shipments.length + 1;
      order = {
        ...order,
        lines: [{ ...line, allocatedQuantity: line.allocatedQuantity + allocation.quantity }],
        shipments: [...order.shipments, {
          id: `sample-shipment-${number}`, number, state: "dispatched", version: 1,
          items: [{ name: line.name, variantLabel: line.variantLabel, quantity: allocation.quantity }],
          events: [{ state: "dispatched", occurredAt: "2026-09-20T12:00:00.000Z" }],
        }],
      };
      return true;
    }
    const shipment = order.shipments.find((candidate) => candidate.id === command.shipmentId);
    if (!shipment || shipment.version !== command.expectedVersion || shipment.state === "delivered") return false;
    order = {
      ...order,
      shipments: order.shipments.map((candidate) => candidate.id !== shipment.id ? candidate : {
        ...candidate, state: command.state, version: candidate.version + 1,
        events: [...candidate.events, { state: command.state, occurredAt: "2026-09-21T12:00:00.000Z" }],
      }),
    };
    return true;
  }

  return {
    async lookup(orderNumber) {
      if (scenario === "lookup-error" && !lookupFailed) {
        lookupFailed = true;
        throw new Error("Synthetic lookup failure");
      }
      return { order: orderNumber === order.orderNumber ? structuredClone(order) : null };
    },
    async submit(command) {
      const fingerprint = JSON.stringify(command);
      const previous = recorded.get(command.commandId);
      if (previous) return { status: previous === fingerprint ? "replayed" : "conflict", order: structuredClone(order) };
      const wasFirst = firstSubmission;
      firstSubmission = false;
      const applied = apply(command);
      if (!applied) return { status: "conflict", order: structuredClone(order) };
      recorded.set(command.commandId, fingerprint);
      if (scenario === "uncertain" && wasFirst) {
        await new Promise((resolve) => setTimeout(resolve, 1_000));
        throw new Error("Synthetic response lost after local commit");
      }
      return { status: scenario === "conflict" && wasFirst ? "conflict" : "applied", order: structuredClone(order) };
    },
  };
}

export function DemoOrderVerification({ scenario }: { scenario: DemoOrderVerificationScenario }) {
  const api = useMemo(() => createDemoOrderVerificationApi(scenario), [scenario]);
  return <SimulatedTrackingConsole api={api} />;
}
