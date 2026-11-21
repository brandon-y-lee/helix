import { beforeEach, describe, expect, it, vi } from "vitest";
const { access, lookup, apply, scope, production } = vi.hoisted(() => ({
  access: vi.fn(), scope: vi.fn(), production: vi.fn(),
  lookup: vi.fn(),
  apply: vi.fn(),
}));
vi.mock("@/lib/admin/capabilities", () => ({ requireAdminCapability: access }));
vi.mock("@/lib/release/deployment-authorization", () => ({ productionDeploymentAuthorized: production }));
vi.mock("@/lib/shipments/server", () => ({
  shipmentManagementScope: scope,
  lookupShipmentOrder: lookup,
  applyShipment: apply,
}));
import { handleShipmentRequest } from "@/lib/shipments/request";
import { CatalogAdminError } from "@/lib/admin/catalog/errors";
const id = "11111111-1111-4111-8111-111111111111";
const command = {
  commandId: id,
  orderId: id,
  shipmentId: null,
  expectedVersion: 0,
  state: "preparing",
  carrier: "",
  trackingReference: "",
  lines: [{ orderItemId: id, quantity: 1 }],
  correctionReason: null,
};
const request = (body: unknown, origin = "https://helix.test") =>
  new Request("https://helix.test/api/admin/shipments", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.clearAllMocks();
  scope.mockReturnValue(null);
  production.mockResolvedValue(false);
  vi.stubEnv("HELIX_MANUAL_SHIPMENTS_ENABLED", "true");
  access.mockResolvedValue({ userId: id });
  lookup.mockResolvedValue(null);
  apply.mockResolvedValue({ status: "applied" });
});
describe("shipment HTTP authorization and bounds", () => {
  it("requires dedicated capability and same origin before private reads", async () => {
    access.mockRejectedValueOnce(
      new CatalogAdminError("capability_required", "Denied", 403),
    );
    expect(
      (await handleShipmentRequest(request({ orderNumber: "HX-1" }))).status,
    ).toBe(403);
    expect(lookup).not.toHaveBeenCalled();
    expect(
      (
        await handleShipmentRequest(
          request({ orderNumber: "HX-1" }, "https://other.test"),
        )
      ).status,
    ).toBe(403);
    expect(lookup).not.toHaveBeenCalled();
  });
  it("bounds streamed payload and never trusts actor supplied by browser", async () => {
    expect(
      (await handleShipmentRequest(request({ orderNumber: "x".repeat(17000) })))
        .status,
    ).toBe(413);
    expect(
      (await handleShipmentRequest(request({ ...command, actorId: id })))
        .status,
    ).toBe(400);
    expect(apply).not.toHaveBeenCalled();
  });
  it("requires the serving live origin and authorized production deployment before revealing delivery or writing dispatch", async () => {
    const live = { environment: "live", accountId: "acct_Operator" };
    scope.mockReturnValue(live);
    expect((await handleShipmentRequest(request({ orderNumber: "HX-1" }))).status).toBe(403);
    const home = "https://www.helixskin.us";
    const send = (body: unknown, displayed = "live") => handleShipmentRequest(new Request(home+"/api/admin/shipments", {
      method: "POST", headers: { origin: home, "content-type": "application/json", "x-helix-shipment-environment": displayed }, body: JSON.stringify(body),
    }));
    expect((await send(command)).status).toBe(403);
    expect(lookup).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
    production.mockResolvedValue(true);
    expect((await send(command, "business_sandbox")).status).toBe(409);
    expect(apply).not.toHaveBeenCalled();
    expect((await send({ orderNumber: "HX-1" })).status).toBe(200);
    expect(lookup).toHaveBeenCalledWith("HX-1", id, live);
    expect((await send(command)).status).toBe(200);
    expect(apply).toHaveBeenCalledWith(command, id, live);
    expect((await send({ ...command, environment: "sandbox" })).status).toBe(400);
  });
  it("gates mutation but keeps lookup available and binds authenticated actor", async () => {
    vi.stubEnv("HELIX_MANUAL_SHIPMENTS_ENABLED", "false");
    expect((await handleShipmentRequest(request(command))).status).toBe(503);
    expect(
      (await handleShipmentRequest(request({ orderNumber: "HX-1" }))).status,
    ).toBe(200);
    vi.stubEnv("HELIX_MANUAL_SHIPMENTS_ENABLED", "true");
    expect((await handleShipmentRequest(request(command))).status).toBe(200);
    expect(apply).toHaveBeenCalledWith(command, id, null);
  });
});
