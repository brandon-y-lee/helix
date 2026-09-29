import { afterEach, beforeEach, expect, it, vi } from "vitest";

const boundary = vi.hoisted(() => ({ capability: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/admin/capabilities", () => ({ requireAdminCapability: boundary.capability }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({ rpc: boundary.rpc }) }));
import { POST as lookup } from "@/app/api/admin/demo-orders/lookup/route";
import { POST as apply } from "@/app/api/admin/demo-orders/events/route";
import { CatalogAdminError } from "@/lib/admin/catalog/errors";

const actor = "10000000-0000-4000-8000-000000000001";
const orderId = "10000000-0000-4000-8000-000000000002";
const orderItemId = "10000000-0000-4000-8000-000000000003";
const command = { orderId, commandId: "10000000-0000-4000-8000-000000000004", shipmentId: null,
  expectedVersion: 0, state: "dispatched", lines: [{ orderItemId, quantity: 1 }], resolutionReason: null };
const order = { orderId, orderNumber: "HX-DEMO-1", eligible: true, frozen: false, shipments: [],
  lines: [{ id: orderItemId, name: "Cleanser", variantLabel: "100 ml", quantity: 2, allocatedQuantity: 0 }] };
function request(body: unknown, origin = "https://helixskin.vercel.app") {
  return new Request("https://helixskin.vercel.app/api/admin/demo-orders/events", {
    method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("HELIX_ORDER_SIMULATION_ENABLED", "true");
  vi.stubEnv("HELIX_EMAIL_ENVIRONMENT", "sandbox");
  vi.stubEnv("HELIX_EMAIL_MODE", "restricted");
  vi.stubEnv("CHECKOUT_MODE", "sandbox");
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_synthetic");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_synthetic");
  vi.stubEnv("STRIPE_ACCOUNT_ID", "acct_1Tm9WRFEzyaKzdmq");
  vi.stubEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "pk_test_synthetic");
  boundary.capability.mockResolvedValue({ userId: actor, capabilities: ["orders.simulate"] });
  boundary.rpc.mockResolvedValue({ data: { status: "applied", order }, error: null });
});
afterEach(() => vi.unstubAllEnvs());

it("uses the verified operator for one bounded simulated dispatch and returns a private result", async () => {
  const response = await apply(request(command));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ status: "applied", order });
  expect(boundary.capability).toHaveBeenCalledWith("orders.simulate");
  expect(boundary.rpc).toHaveBeenCalledWith("apply_simulated_shipment_event", {
    p_actor_id: actor, p_order_id: orderId, p_command_id: command.commandId, p_shipment_id: null,
    p_expected_version: 0, p_state: "dispatched", p_lines: command.lines, p_resolution_reason: null,
  });
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
});

it("looks up one exact Order only after operator authorization", async () => {
  boundary.rpc.mockResolvedValue({ data: order, error: null });
  const response = await lookup(request({ orderNumber: "HX-DEMO-1" }));
  expect(await response.json()).toEqual({ order });
  expect(boundary.rpc).toHaveBeenCalledWith("read_simulated_order", { p_order_number: "HX-DEMO-1", p_actor_id: actor });
});

it("keeps authorized history readable when new simulation is disabled", async () => {
  vi.stubEnv("HELIX_ORDER_SIMULATION_ENABLED", "false");
  boundary.rpc.mockResolvedValue({ data: order, error: null });
  expect(await (await lookup(request({ orderNumber: "HX-DEMO-1" }))).json()).toEqual({ order });
  boundary.rpc.mockClear();
  expect((await apply(request(command))).status).toBe(503);
  expect(boundary.rpc).not.toHaveBeenCalled();
});

it("projects only the bounded display contract from private storage", async () => {
  boundary.rpc.mockResolvedValue({ data: { ...order, customerEmail: "private@example.test", actorId: actor,
    lines: order.lines.map((line) => ({ ...line, internal: "private" })) }, error: null });
  const response = await lookup(request({ orderNumber: "HX-DEMO-1" }));
  expect(await response.json()).toEqual({ order });
});

it.each([401, 403, 503])("does not inspect private Orders when authorization fails with %s", async (status) => {
  boundary.capability.mockRejectedValue(new CatalogAdminError("capability_required", "Access unavailable.", status));
  const response = await lookup(request({ orderNumber: "HX-DEMO-1" }));
  expect(response.status).toBe(status);
  expect(boundary.rpc).not.toHaveBeenCalled();
  expect(response.headers.get("cache-control")).toBe("private, no-store");
});

it.each([
  { ...command, actorId: actor },
  { ...command, lines: [{ orderItemId, quantity: 0 }] },
  { ...command, lines: [{ orderItemId, quantity: 100 }] },
  { ...command, lines: [{ orderItemId, quantity: 0.5 }] },
  { ...command, lines: [{ orderItemId, quantity: 1 }, { orderItemId, quantity: 1 }] },
  { ...command, expectedVersion: 1 },
  { ...command, state: "delivered" },
  { ...command, resolutionReason: "private\ncontrol" },
])("rejects malformed or spoofed simulation commands before storage", async (body) => {
  expect((await apply(request(body))).status).toBe(400);
  expect(boundary.rpc).not.toHaveBeenCalled();
});

it("rejects foreign or absent origins without applying a transition", async () => {
  expect((await apply(request(command, "https://other.example"))).status).toBe(403);
  expect((await apply(request(command, ""))).status).toBe(403);
  expect(boundary.rpc).not.toHaveBeenCalled();
});

it.each([
  ["HELIX_ORDER_SIMULATION_ENABLED", "false"], ["HELIX_EMAIL_ENVIRONMENT", "live"],
  ["HELIX_EMAIL_MODE", "live"], ["STRIPE_SECRET_KEY", "sk_live_blocked"],
  ["CHECKOUT_MODE", "live"], ["STRIPE_ACCOUNT_ID", "acct_other"],
])("fails closed when %s is %s", async (key, value) => {
  vi.stubEnv(key, value);
  expect((await apply(request(command))).status).toBe(503);
  expect(boundary.rpc).not.toHaveBeenCalled();
});

it("rejects an oversized body even without its declared length", async () => {
  expect((await apply(request({ ...command, extra: "x".repeat(17_000) }))).status).toBe(400);
  expect(boundary.rpc).not.toHaveBeenCalled();
});

it("returns stale revision and replay outcomes without retrying the business mutation", async () => {
  boundary.rpc.mockResolvedValueOnce({ data: { status: "conflict", order }, error: null })
    .mockResolvedValueOnce({ data: { status: "replayed", order }, error: null });
  expect(await (await apply(request(command))).json()).toEqual({ status: "conflict", order });
  expect(await (await apply(request(command))).json()).toEqual({ status: "replayed", order });
  expect(boundary.rpc).toHaveBeenCalledTimes(2);
});

it("redacts database failures and refuses a membership revoked during the request", async () => {
  boundary.rpc.mockResolvedValueOnce({ data: null, error: { message: "private customer record" } })
    .mockResolvedValueOnce({ data: { status: "forbidden" }, error: null });
  const failed = await apply(request(command));
  expect(failed.status).toBe(503);
  expect(await failed.text()).not.toContain("private customer");
  expect((await apply(request(command))).status).toBe(403);
});
