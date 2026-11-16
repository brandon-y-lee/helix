import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SimulatedTrackingConsole } from "@/components/admin/SimulatedTrackingConsole";
import type { SimulatedOrderView } from "@/lib/tracking/types";

const order: SimulatedOrderView = {
  orderId: "00000000-0000-4000-8000-000000000001", orderNumber: "HX-DEMO-1", eligible: true,
  frozen: false, shipments: [],
  lines: [{ id: "line-1", name: "Daily cleanser", variantLabel: "150 mL", quantity: 2, allocatedQuantity: 1 }],
};
const response = (body: unknown) => new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
const fetchApi = vi.fn();

beforeEach(() => { fetchApi.mockReset(); vi.stubGlobal("fetch", fetchApi); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("demo Order simulator", () => {
  it("keeps exact lookup and history available when new simulation is disabled", async () => {
    fetchApi.mockResolvedValueOnce(response({ order: {
      ...order,
      shipments: [{
        id: "shipment-1", number: 1, state: "dispatched", version: 1,
        items: [{ name: "Daily cleanser", variantLabel: "150 mL", quantity: 1 }],
        events: [{ state: "dispatched", occurredAt: "2026-09-28T13:00:00Z" }],
      }],
    } }));
    render(<SimulatedTrackingConsole simulationEnabled={false} />);
    expect(screen.getByText(/New simulated events are disabled/)).toBeVisible();
    fireEvent.change(screen.getByLabelText("Order Number"), { target: { value: "HX-DEMO-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Find demo Order" }));
    await screen.findByRole("heading", { name: "Order HX-DEMO-1" });
    expect(screen.getByRole("region", { name: "Simulated shipment 1" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Simulate dispatch" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Record simulated event" })).not.toBeInTheDocument();
    expect(fetchApi).toHaveBeenCalledOnce();
  });

  it("looks up exactly one Order and retains the exact event for an uncertain retry", async () => {
    fetchApi.mockResolvedValueOnce(response({ order })).mockRejectedValueOnce(new Error("connection lost"));
    render(<SimulatedTrackingConsole />);
    fireEvent.change(screen.getByLabelText("Order Number"), { target: { value: "HX-DEMO-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Find demo Order" }));
    await screen.findByRole("heading", { name: "Order HX-DEMO-1" });
    expect(fetchApi.mock.calls[0][0]).toBe("/api/admin/demo-orders/lookup");
    expect(JSON.parse(fetchApi.mock.calls[0][1].body)).toEqual({ orderNumber: "HX-DEMO-1" });
    const quantity = screen.getByRole("spinbutton", { name: "Daily cleanser · 150 mL quantity" });
    expect(quantity).toHaveAttribute("max", "1");
    fireEvent.change(quantity, { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Simulate dispatch" }));
    await screen.findByRole("button", { name: "Retry same event" });
    expect(quantity).toBeDisabled();
    expect(screen.getByRole("button", { name: "Find demo Order" })).toBeDisabled();
    const original = fetchApi.mock.calls[1][1].body;
    expect(JSON.parse(original)).toEqual({
      orderId: order.orderId, commandId: expect.any(String), shipmentId: null,
      expectedVersion: 0, state: "dispatched", lines: [{ orderItemId: "line-1", quantity: 1 }], resolutionReason: null,
    });
    fetchApi.mockResolvedValueOnce(response({ status: "replayed", order: { ...order, lines: [{ ...order.lines[0], allocatedQuantity: 2 }] } }));
    fireEvent.click(screen.getByRole("button", { name: "Retry same event" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("already recorded"));
    expect(fetchApi.mock.calls[2][1].body).toBe(original);
    expect(screen.queryByRole("button", { name: "Retry same event" })).not.toBeInTheDocument();
    expect(screen.getByText("All Order quantities have been allocated.")).toBeVisible();
  });

  it("allows a safe retry after the event response body stalls", async () => {
    fetchApi.mockResolvedValueOnce(response({ order }));
    render(<SimulatedTrackingConsole />);
    fireEvent.change(screen.getByLabelText("Order Number"), { target: { value: "HX-DEMO-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Find demo Order" }));
    await screen.findByRole("heading", { name: "Order HX-DEMO-1" });
    vi.useFakeTimers();
    fetchApi.mockImplementationOnce(async (_path, request) => ({
      ok: true,
      json: () => new Promise((_resolve, reject) => {
        request.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      }),
    }));
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Simulate dispatch" }));
    await act(() => vi.advanceTimersByTimeAsync(15_000));
    expect(screen.getByRole("button", { name: "Retry same event" })).toBeEnabled();
    expect(screen.getByRole("spinbutton")).toBeDisabled();
    expect(fetchApi).toHaveBeenCalledTimes(2);
  });

  it("requires an explicit internal reason to resolve an exception, then shows fresh conflict history", async () => {
    const exceptionOrder: SimulatedOrderView = {
      ...order,
      lines: [{ ...order.lines[0], allocatedQuantity: 2 }],
      shipments: [{
        id: "shipment-1", number: 1, state: "exception", version: 3,
        items: [{ name: "Daily cleanser", variantLabel: "150 mL", quantity: 2 }],
        events: [{ state: "exception", occurredAt: "2026-09-28T13:00:00Z" }],
      }],
    };
    fetchApi.mockResolvedValueOnce(response({ order: exceptionOrder }));
    render(<SimulatedTrackingConsole />);
    fireEvent.change(screen.getByLabelText("Order Number"), { target: { value: "HX-DEMO-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Find demo Order" }));
    const resolve = await screen.findByRole("button", { name: "Resolve simulated exception" });
    expect(resolve).toBeDisabled();
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual(["In transit", "Delivered"]);
    fireEvent.change(screen.getByLabelText("Resolution reason (internal only)"), { target: { value: "Operator checked the synthetic exception" } });
    fireEvent.change(screen.getByLabelText("Simulated status"), { target: { value: "delivered" } });
    const deliveredOrder: SimulatedOrderView = {
      ...exceptionOrder,
      shipments: [{ ...exceptionOrder.shipments[0], state: "delivered", version: 4 }],
    };
    fetchApi.mockResolvedValueOnce(response({ status: "conflict", order: deliveredOrder }));
    fireEvent.click(resolve);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Review the latest details"));
    expect(JSON.parse(fetchApi.mock.calls[1][1].body)).toEqual({
      orderId: order.orderId, commandId: expect.any(String), shipmentId: "shipment-1", expectedVersion: 3,
      state: "delivered", lines: [], resolutionReason: "Operator checked the synthetic exception",
    });
    expect(screen.queryByRole("button", { name: "Record simulated event" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Resolve simulated exception" })).not.toBeInTheDocument();
    expect(screen.queryByText("Operator checked the synthetic exception")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Order HX-DEMO-1" })).toHaveFocus();
  });

  it("preserves frozen history with no mutation controls", async () => {
    fetchApi.mockResolvedValueOnce(response({ order: {
      ...order, eligible: false, frozen: true,
      shipments: [{
        id: "shipment-1", number: 1, state: "dispatched", version: 1,
        items: [{ name: "Daily cleanser", variantLabel: "150 mL", quantity: 1 }],
        events: [{ state: "dispatched", occurredAt: "2026-09-28T13:00:00Z" }],
      }],
    } }));
    render(<SimulatedTrackingConsole />);
    fireEvent.change(screen.getByLabelText("Order Number"), { target: { value: "HX-DEMO-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Find demo Order" }));
    await screen.findByRole("heading", { name: "Order HX-DEMO-1" });
    expect(screen.getByRole("region", { name: "Simulated shipment 1" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Simulate dispatch" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Record simulated event" })).not.toBeInTheDocument();
    expect(fetchApi).toHaveBeenCalledOnce();
  });

  it("allows corrected inputs after a definitive first-attempt rejection", async () => {
    fetchApi.mockResolvedValueOnce(response({ order })).mockResolvedValueOnce(new Response("{}", { status: 400 }));
    render(<SimulatedTrackingConsole />);
    fireEvent.change(screen.getByLabelText("Order Number"), { target: { value: "HX-DEMO-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Find demo Order" }));
    await screen.findByRole("heading", { name: "Order HX-DEMO-1" });
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Simulate dispatch" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("The event was not accepted"));
    expect(screen.queryByRole("button", { name: "Retry same event" })).not.toBeInTheDocument();
    expect(screen.getByRole("spinbutton")).toBeEnabled();
    expect(screen.getByRole("spinbutton")).toHaveValue(1);
    const firstId = JSON.parse(fetchApi.mock.calls[1][1].body).commandId;
    fetchApi.mockResolvedValueOnce(response({ status: "applied", order }));
    fireEvent.click(screen.getByRole("button", { name: "Simulate dispatch" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Simulated event recorded"));
    expect(JSON.parse(fetchApi.mock.calls[2][1].body).commandId).not.toBe(firstId);
  });

  it("does not erase an earlier uncertain command when access is denied on its retry", async () => {
    fetchApi.mockResolvedValueOnce(response({ order })).mockRejectedValueOnce(new Error("connection lost"));
    render(<SimulatedTrackingConsole />);
    fireEvent.change(screen.getByLabelText("Order Number"), { target: { value: "HX-DEMO-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Find demo Order" }));
    await screen.findByRole("heading", { name: "Order HX-DEMO-1" });
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Simulate dispatch" }));
    await screen.findByRole("button", { name: "Retry same event" });
    fetchApi.mockResolvedValueOnce(new Response("{}", { status: 403 }));
    fireEvent.click(screen.getByRole("button", { name: "Retry same event" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("earlier event still needs confirmation"));
    expect(screen.getByRole("spinbutton")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Retry same event" })).toBeEnabled();
    expect(fetchApi.mock.calls[2][1].body).toBe(fetchApi.mock.calls[1][1].body);
  });
});
