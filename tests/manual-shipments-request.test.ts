import { beforeEach, describe, expect, it, vi } from "vitest";
const { access, lookup, apply } = vi.hoisted(() => ({
  access: vi.fn(),
  lookup: vi.fn(),
  apply: vi.fn(),
}));
vi.mock("@/lib/admin/capabilities", () => ({ requireAdminCapability: access }));
vi.mock("@/lib/shipments/server", () => ({
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
  it("gates mutation but keeps lookup available and binds authenticated actor", async () => {
    vi.stubEnv("HELIX_MANUAL_SHIPMENTS_ENABLED", "false");
    expect((await handleShipmentRequest(request(command))).status).toBe(503);
    expect(
      (await handleShipmentRequest(request({ orderNumber: "HX-1" }))).status,
    ).toBe(200);
    vi.stubEnv("HELIX_MANUAL_SHIPMENTS_ENABLED", "true");
    expect((await handleShipmentRequest(request(command))).status).toBe(200);
    expect(apply).toHaveBeenCalledWith(command, id);
  });
});
