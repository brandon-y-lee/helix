import "server-only";
import { readBoundedBody } from "@/lib/email/provider";
import { readProductionMarketingConfiguration } from "./config";
import { parseProductionMarketingStatus } from "./status-contract";
import type { ProductionMarketingEnvironment } from "./contract";
import type { ProductionMarketingEvent,ProductionMarketingEventResult } from "./events";
export function createProductionMarketingEventStorage(env:ProductionMarketingEnvironment) {
  async function rpc(name:string,args:Record<string,unknown>):Promise<unknown> {
    const config=readProductionMarketingConfiguration(env),controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
    try {
      const deadline=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error());},3000);});
      return await Promise.race([(async()=>{
        const response=await fetch(`${config.supabaseUrl}/rest/v1/rpc/${name}`,{method:"POST",cache:"no-store",redirect:"error",signal:controller.signal,
          headers:{apikey:config.serviceKey,Authorization:`Bearer ${config.serviceKey}`,"Content-Type":"application/json"},body:JSON.stringify(args)});
        if(!response.ok){await response.body?.cancel();throw new Error();}
        return JSON.parse(await readBoundedBody(response,8192)) as unknown;
      })(),deadline]);
    }catch{throw new Error("Production marketing is unavailable.");}finally{clearTimeout(timer);controller.abort();}
  }
  return {
    record:async(event:ProductionMarketingEvent):Promise<ProductionMarketingEventResult>=>{
      const value=await rpc("record_production_marketing_event",{p_event_id:event.eventId,p_message_id:event.messageId,p_provider_id:event.providerId,p_event_type:event.eventType,
        p_occurred_at:event.occurredAt,p_sender:event.sender,p_recipient:event.recipient,p_purpose:event.purpose,p_contract_version:event.contractVersion,p_environment:event.environment});
      if(value!=="recorded"&&value!=="rejected"&&value!=="paused")throw new Error("Production marketing is unavailable.");return value;
    },
    status:async(actor:string)=>parseProductionMarketingStatus(await rpc("read_production_marketing_status",{p_actor_id:actor})),
  };
}
