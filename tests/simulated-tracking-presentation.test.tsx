import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SimulatedTrackingTimeline } from "@/components/cart/SimulatedTrackingTimeline";
import type { SimulatedTrackingView } from "@/lib/tracking/types";

afterEach(cleanup);

describe("private simulated tracking presentation", () => {
  it("shows split quantities and accepted history as a demo without exposing internal metadata", () => {
    const tracking = {
      frozen: true,
      shipments: [{
        id: "private-shipment-id", number: 1, state: "exception", version: 2,
        items: [{ name: "Daily cleanser", variantLabel: "150 mL", quantity: 1 }],
        events: [
          { state: "dispatched", occurredAt: "2026-09-28T12:00:00.000Z", resolutionReason: "private investigation" },
          { state: "exception", occurredAt: "2026-09-28T13:00:00.000Z", operatorId: "private-operator-id" },
        ],
      }],
    } as unknown as SimulatedTrackingView;
    const { container } = render(<SimulatedTrackingTimeline tracking={tracking} />);
    expect(screen.getByRole("heading", { name: "Simulated tracking" })).toBeVisible();
    expect(screen.getByText(/No goods will ship/)).toBeVisible();
    expect(screen.getByText(/Carrier events are simulated/)).toBeVisible();
    expect(screen.getByText(/Further simulation is frozen/)).toBeVisible();
    const shipment = screen.getByRole("region", { name: "Simulated shipment 1" });
    expect(within(shipment).getByText(/Daily cleanser/)).toHaveTextContent("Daily cleanser · 150 mL · Qty 1");
    expect(within(shipment).getAllByText("Exception")).toHaveLength(2);
    expect(container.querySelectorAll("time")[0]).toHaveAttribute("dateTime", "2026-09-28T12:00:00.000Z");
    expect(container).not.toHaveTextContent(/private-investigation|private investigation|private-operator-id|private-shipment-id/);
    expect(container.querySelector("a")).toBeNull();
  });
});
