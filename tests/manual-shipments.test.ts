import { describe, expect, it } from "vitest";
import {
  parseShipmentCommand,
  allowedShipmentTransition,
} from "@/lib/shipments/contract";
const id = "11111111-1111-4111-8111-111111111111";
const create = {
  commandId: id,
  orderId: id,
  shipmentId: null,
  expectedVersion: 0,
  state: "preparing",
  carrier: "UPS",
  trackingReference: "ABC",
  lines: [{ orderItemId: id, quantity: 1 }],
  correctionReason: null,
};
describe("manual shipment command boundary", () => {
  it("accepts bounded preparing allocation, rejects client identity and cross-duplicate lines", () => {
    expect(parseShipmentCommand(create).carrier).toBe("UPS");
    expect(() => parseShipmentCommand({ ...create, actorId: id })).toThrow();
    expect(() =>
      parseShipmentCommand({
        ...create,
        lines: [...create.lines, ...create.lines],
      }),
    ).toThrow();
    expect(() =>
      parseShipmentCommand({ ...create, state: "delivered" }),
    ).toThrow();
    expect(() =>
      parseShipmentCommand({ ...create, trackingReference: "bad\nvalue" }),
    ).toThrow();
  });
  it("fences edits and requires explicit delivered correction; cancellation is terminal", () => {
    expect(allowedShipmentTransition("preparing", "dispatched", null)).toBe(
      true,
    );
    expect(allowedShipmentTransition("delivered", "exception", null)).toBe(
      false,
    );
    expect(
      allowedShipmentTransition(
        "delivered",
        "exception",
        "Customer reported a correction",
      ),
    ).toBe(true);
    expect(allowedShipmentTransition("cancelled", "preparing", "undo")).toBe(
      false,
    );
    expect(() =>
      parseShipmentCommand({
        ...create,
        shipmentId: id,
        expectedVersion: 1,
        state: "dispatched",
      }),
    ).toThrow();
  });
});
