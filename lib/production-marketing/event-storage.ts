import "server-only";
import { readBoundedBody } from "@/lib/email/provider";
import { productionMarketingRpcHeaders, readProductionMarketingConfiguration } from "./config";
import { parseDirectMarketingStatus, parseRetainedMarketingStatus } from "./status-contract";
import type { ProductionMarketingEnvironment } from "./contract";
import type { ProductionMarketingEvent,ProductionMarketingEventResult } from "./events";
import { sharedMarketingSender, type DirectPreference, type DirectPreferenceResult, type DirectReceiptHold, type DirectReceiptHoldResult } from "./direct-restrictions";
export function createProductionMarketingEventStorage(env:ProductionMarketingEnvironment) {
  async function rpc(name:string,args:Record<string,unknown>):Promise<unknown> {
    const config=readProductionMarketingConfiguration(env),controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
    try {
      const deadline=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error());},3000);});
      return await Promise.race([(async()=>{
        const response=await fetch(`${config.supabaseUrl}/rest/v1/rpc/${name}`,{method:"POST",cache:"no-store",redirect:"error",signal:controller.signal,
          headers:productionMarketingRpcHeaders(config.serviceKey),body:JSON.stringify(args)});
        if(!response.ok){await response.body?.cancel();throw new Error();}
        return JSON.parse(await readBoundedBody(response,8192)) as unknown;
      })(),deadline]);
    }catch{throw new Error("Production marketing is unavailable.");}finally{clearTimeout(timer);controller.abort();}
  }
  return {
    preference: async (event: DirectPreference): Promise<DirectPreferenceResult> => {
      const value = await rpc("record_direct_production_marketing_preference", event);
      if (value === "applied" || value === "held" || value === "ignored" || value === "duplicate" || value === "paused") return value;
      throw new Error("Production marketing is unavailable.");
    },
    hold: async (event: DirectReceiptHold): Promise<DirectReceiptHoldResult> => {
      const value = await rpc("hold_direct_production_marketing_receipt", event);
      if (value === "held" || value === "duplicate" || value === "paused") return value;
      throw new Error("Production marketing is unavailable.");
    },
    record:async(event:ProductionMarketingEvent):Promise<ProductionMarketingEventResult>=>{
      const name = sharedMarketingSender(event.sender) ? "record_direct_production_marketing_event" : "record_production_marketing_event";
      const value=await rpc(name,{p_event_id:event.eventId,p_message_id:event.messageId,p_provider_id:event.providerId,p_event_type:event.eventType,
        p_occurred_at:event.occurredAt,p_sender:event.sender,p_recipient:event.recipient,p_purpose:event.purpose,p_contract_version:event.contractVersion,p_environment:event.environment});
      if(value!=="recorded"&&value!=="rejected"&&value!=="paused")throw new Error("Production marketing is unavailable.");return value;
    },
    directStatus: async (actor: string) => parseDirectMarketingStatus(await rpc("read_direct_production_marketing_status", {p_actor_id: actor})),
    status:async(actor:string)=>parseRetainedMarketingStatus(await rpc("read_production_marketing_status",{p_actor_id:actor})),
  };
}
