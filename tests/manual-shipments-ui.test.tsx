import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ManualShipmentConsole } from "@/components/admin/ManualShipmentConsole";
import { ManualShipmentTimeline } from "@/components/cart/ManualShipmentTimeline";
const id = "11111111-1111-4111-8111-111111111111";
const order = {
  orderId: id,
  orderNumber: "HX-1",
  environment: "sandbox",
  eligible: true,
  lines: [{ id, name: "Serum", quantity: 1, allocatedQuantity: 0 }],
  shipments: [],
};
afterEach(() => vi.unstubAllGlobals());
describe("manual shipment UI", () => {
  it("retains exact command for uncertain retry and never offers another edit", async () => {
    const bodies: unknown[] = [];
    let mutations = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, init) => {
        const body = JSON.parse(init.body);
        bodies.push(body);
        if (body.orderNumber)
          return { ok: true, json: async () => ({ order }) };
        mutations++;
        if (mutations === 1) throw Error("lost response");
        return { ok: true, json: async () => ({ status: "replayed" }) };
      }),
    );
    render(<ManualShipmentConsole enabled />);
    fireEvent.change(screen.getByLabelText("Order number"), {
      target: { value: "HX-1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Find order" }));
    await screen.findByText("Prepare a shipment");
    fireEvent.change(screen.getByLabelText("Serum quantity"), {
      target: { value: "1" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Save preparing shipment" }),
    );
    await screen.findByRole("button", { name: "Retry exact update" });
    expect(
      screen.getByRole("button", { name: "Save preparing shipment" }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Retry exact update" }));
    await screen.findByText("Shipment record saved. No email was sent.");
    expect(bodies[1]).toEqual(bodies[2]);
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Retry exact update" }),
      ).not.toBeInTheDocument(),
    );
  });
  it("defaults to the current delivered status when correcting a reference", async () => {
    const bodies: Record<string, unknown>[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, init) => {
        const body = JSON.parse(init.body);
        bodies.push(body);
        return {
          ok: true,
          json: async () =>
            body.orderNumber
              ? {
                  order: {
                    ...order,
                    shipments: [
                      {
                        id,
                        version: 3,
                        state: "delivered",
                        carrier: "UPS",
                        trackingReference: "TYPO",
                        dispatchedAt: null,
                        deliveredAt: null,
                        items: [],
                      },
                    ],
                  },
                }
              : { status: "applied" },
        };
      }),
    );
    render(<ManualShipmentConsole enabled />);
    fireEvent.change(screen.getByLabelText("Order number"), {
      target: { value: "HX-1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Find order" }));
    const status = await screen.findByLabelText("Next status");
    expect(status).toHaveValue("delivered");
    fireEvent.change(screen.getByLabelText("Tracking reference"), {
      target: { value: "CORRECT" },
    });
    fireEvent.change(screen.getByLabelText(/Correction reason/), {
      target: { value: "Tracking typo" },
    });
    fireEvent.submit(status.closest("form")!);
    await screen.findByText("Shipment record saved. No email was sent.");
    expect(bodies[1]).toMatchObject({
      state: "delivered",
      expectedVersion: 3,
      trackingReference: "CORRECT",
      correctionReason: "Tracking typo",
    });
  });
  it("labels customer records as manual demo and renders tracking references as text", () => {
    render(
      <ManualShipmentTimeline
        records={{
          environment: "sandbox",
          shipments: [
            {
              id,
              version: 1,
              state: "preparing",
              carrier: "UPS",
              trackingReference: "https://untrusted.invalid",
              dispatchedAt: null,
              deliveredAt: null,
              items: [{ name: "Serum", quantity: 1 }],
            },
          ],
        }}
      />,
    );
    expect(
      screen.getByText("Manually updated by helix. Not carrier-verified."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Demo only. No goods will ship."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
