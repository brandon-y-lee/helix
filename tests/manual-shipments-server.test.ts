import { describe, expect, it, vi } from 'vitest';
const {rpc}=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('@/lib/supabase/admin',()=>({createSupabaseAdminClient:()=>({rpc})}));
import {applyShipment, lookupShipmentOrder, parseShipmentOrder, parseShipmentView, readBusinessOrderShipments, readManualShipments} from '@/lib/shipments/server';
describe('private shipment projection',()=>{
 it('copies only allowed customer fields and rejects forged environment/status',()=>{
  const v={environment:'sandbox',shipments:[{id:'11111111-1111-4111-8111-111111111111',version:1,state:'preparing',carrier:'',trackingReference:'',dispatchedAt:null,deliveredAt:null,items:[],actorId:'secret',reason:'internal'}]};
  expect(parseShipmentView(v).shipments[0]).not.toHaveProperty('actorId');expect(parseShipmentView(v).shipments[0]).not.toHaveProperty('reason');
  expect(()=>parseShipmentView({...v,environment:'live'})).toThrow();
 });
 it('treats missing optional migration differently from unavailable data',async()=>{
  rpc.mockReturnValue({abortSignal:()=>Promise.resolve({data:null,error:{code:'PGRST202'}})});expect(await readManualShipments('id')).toBeNull();
  rpc.mockReturnValue({abortSignal:()=>Promise.resolve({data:null,error:{code:'failed'}})});await expect(readManualShipments('id')).rejects.toThrow('temporarily unavailable');
 });
});

const ownerId = "00000000-0000-4000-8000-000000000001";
const orderId = "00000000-0000-4000-8000-000000000002";
const receiptHash = "c".repeat(64);
const live = { environment: "live" as const, accountId: "acct_TestBusiness" };
const shipTo = { name: "Test Recipient", address: { line1: "10 Shipping Road", line2: null,
  city: "Test City", state: "CA", postal_code: "90001", country: "US" } };
function answer(data: unknown) {
  rpc.mockReturnValue({ abortSignal: async () => ({ data, error: null }) });
}

describe("business shipment records", () => {
  it("copies the verified ship-to address only into the protected operator DTO", async () => {
    const order = { environment: "live", orderId, orderNumber: "HX-1", eligible: true, shipments: [], lines: [],
      billingAddress: "private billing", actorId: ownerId, delivery: { ...shipTo, billingAddress: "private billing" } };
    answer(order);
    const view = await lookupShipmentOrder("HX-1", ownerId, live);
    expect(rpc).toHaveBeenCalledWith("read_business_shipment_order", { p_environment: "live",
      p_account_id: live.accountId, p_order_number: "HX-1", p_actor_id: ownerId });
    expect(view?.delivery).toEqual(shipTo);
    expect(JSON.stringify(view)).not.toMatch(/private billing|actorId/);
    expect(() => parseShipmentOrder({ ...order, delivery: undefined }, "live")).toThrow();
    expect(() => parseShipmentOrder({ ...order, environment: "business_sandbox" }, "live")).toThrow();
    answer(null);
    await expect(lookupShipmentOrder("HX-1", ownerId, live)).resolves.toBeNull();
  });

  it("sends the unchanged idempotent operator command under the server-selected merchant", async () => {
    const command = { commandId: ownerId, orderId, shipmentId: null, expectedVersion: 0, state: "preparing" as const,
      carrier: "", trackingReference: "", lines: [{ orderItemId: orderId, quantity: 1 }], correctionReason: null };
    answer({ status: "replayed", actorId: ownerId, shippingAddress: shipTo });
    await expect(applyShipment(command, ownerId, live)).resolves.toEqual({ status: "replayed" });
    expect(rpc).toHaveBeenCalledWith("apply_business_shipment", { p_environment: "live", p_account_id: live.accountId,
      p_actor_id: ownerId, p_command: command });
  });

  it("reads only a first-party dispatch through the owner's scoped receipt and rejects premature or crossed records", async () => {
    const shipment = { id: orderId, version: 2, state: "dispatched", carrier: "USPS", trackingReference: "TEST",
      dispatchedAt: "2026-11-21T10:00:00Z", deliveredAt: null, items: [{ name: "Serum", quantity: 1 }] };
    const result = { environment: "live", shipments: [shipment], delivery: shipTo, operatorNote: "private" };
    answer(result);
    await expect(readBusinessOrderShipments(live, orderId, "cs_live_1", null, receiptHash))
      .resolves.toEqual({ environment: "live", shipments: [shipment] });
    expect(rpc).toHaveBeenCalledWith("read_business_order_shipments", { p_environment: "live", p_account_id: live.accountId,
      p_order_id: orderId, p_session_id: "cs_live_1", p_user_id: null, p_receipt_token_hash: receiptHash });
    for (const invalid of [{ ...result, environment: "business_sandbox" },
      { ...result, shipments: [{ ...shipment, dispatchedAt: null }] }]) {
      answer(invalid);
      await expect(readBusinessOrderShipments(live, orderId, "cs_live_1", null, receiptHash)).rejects.toThrow();
    }
  });
});
