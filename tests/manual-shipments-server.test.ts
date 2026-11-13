import { describe, expect, it, vi } from 'vitest';
const {rpc}=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('@/lib/supabase/admin',()=>({createSupabaseAdminClient:()=>({rpc})}));
import {parseShipmentView,readManualShipments} from '@/lib/shipments/server';
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
