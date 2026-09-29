import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DemoOrdersPage from "@/app/admin/demo-orders/page";

const dependencies = vi.hoisted(() => ({ capability: vi.fn(), enabled: vi.fn(), environment: vi.fn(), redirect: vi.fn() }));
vi.mock("@/lib/admin/capabilities", () => ({
  ADMIN_CAPABILITIES: { ordersSimulate: "orders.simulate" }, checkAdminCapability: dependencies.capability,
}));
vi.mock("@/lib/tracking/config", () => ({
  isOrderSimulationEnabled: dependencies.enabled, isOrderSimulationEnvironmentAllowed: dependencies.environment,
}));
vi.mock("next/navigation", () => ({ redirect: dependencies.redirect }));
vi.mock("@/components/admin/SimulatedTrackingConsole", () => ({
  SimulatedTrackingConsole: ({ simulationEnabled }: { simulationEnabled: boolean }) => <h1>{simulationEnabled ? "Simulator controls" : "Tracking history"}</h1>,
}));
beforeEach(() => dependencies.environment.mockReturnValue(true));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("demo Order page access", () => {
  it("denies a catalog-only principal before checking whether simulation is enabled", async () => {
    dependencies.capability.mockResolvedValue({ status: "forbidden" });
    render(await DemoOrdersPage());
    expect(dependencies.capability).toHaveBeenCalledWith("orders.simulate");
    expect(dependencies.enabled).not.toHaveBeenCalled();
    expect(screen.getByText(/does not have permission to simulate shipments/)).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Simulator controls" })).not.toBeInTheDocument();
  });

  it("keeps history available when new simulation is disabled in an allowed environment", async () => {
    dependencies.capability.mockResolvedValue({ status: "allowed" });
    dependencies.enabled.mockReturnValue(false);
    render(await DemoOrdersPage());
    expect(screen.getByRole("heading", { name: "Tracking history" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Simulator controls" })).not.toBeInTheDocument();
  });

  it("denies history and simulation in a live or invalid environment", async () => {
    dependencies.capability.mockResolvedValue({ status: "allowed" });
    dependencies.environment.mockReturnValue(false);
    render(await DemoOrdersPage());
    expect(screen.getByText("This environment is not enabled for demo-order tracking.")).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Tracking history" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Simulator controls" })).not.toBeInTheDocument();
    expect(dependencies.enabled).not.toHaveBeenCalled();
  });

  it("shows controls only for an authorized principal in an enabled environment", async () => {
    dependencies.capability.mockResolvedValue({ status: "allowed" });
    dependencies.enabled.mockReturnValue(true);
    render(await DemoOrdersPage());
    expect(screen.getByRole("heading", { name: "Simulator controls" })).toBeVisible();
  });

  it("closes access when authorization is unavailable", async () => {
    dependencies.capability.mockResolvedValue({ status: "unavailable" });
    render(await DemoOrdersPage());
    expect(screen.getByRole("alert")).toHaveTextContent("permissions could not be verified");
    expect(dependencies.enabled).not.toHaveBeenCalled();
  });

  it("preserves the safe demo-order return path when sign-in is required", async () => {
    dependencies.capability.mockResolvedValue({ status: "unauthenticated" });
    dependencies.redirect.mockImplementation(() => { throw new Error("redirected"); });
    await expect(DemoOrdersPage()).rejects.toThrow("redirected");
    expect(dependencies.redirect).toHaveBeenCalledWith("/account/sign-in?next=%2Fadmin%2Fdemo-orders");
    expect(dependencies.enabled).not.toHaveBeenCalled();
  });
});
