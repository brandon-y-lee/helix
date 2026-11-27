import "server-only";
import { readBoundedBody } from "@/lib/email/provider";
import { resendMarketingContacts } from "@/lib/marketing/provider";
import { directProductionMarketingContract, productionMarketingUuid, readProductionMarketingDeliveryConfiguration } from "@/lib/production-marketing/delivery-config";
import type { ProductionMarketingEnvironment } from "@/lib/production-marketing/contract";
import type { ProductionMarketingOutcome } from "@/lib/production-marketing/delivery-types";
export const productionMarketingProvider={
  async permission(email:string,topic:string,env:ProductionMarketingEnvironment):Promise<boolean> {
    const config=readProductionMarketingDeliveryConfiguration(env),key=env.HELIX_PRODUCTION_MARKETING_PREFERENCE_KEY;
    if(directProductionMarketingContract(config.contract)||!key||[config.providerKey,config.serviceKey,env.RESEND_API_KEY,env.SUPABASE_SERVICE_ROLE_KEY,env.HELIX_PRODUCTION_MARKETING_WORKER_TOKEN].includes(key)||topic!==config.contract.topicId)return false;
    // Only pure bounded GET primitives are reused. No import, Contact creation or opt-in write.
    const contact=await resendMarketingContacts.getContact(email,key);
    if(!contact||contact.email.trim().toLowerCase()!==email||contact.unsubscribed)return false;
    return await resendMarketingContacts.getTopic(contact.id,topic,key)==="opt_in";
  },
  async send(body:string,idempotencyKey:string,expiresAt:string,env:ProductionMarketingEnvironment):Promise<ProductionMarketingOutcome> {
    const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
    try {
      const config=readProductionMarketingDeliveryConfiguration(env),remaining=Date.parse(expiresAt)-Date.now();
      if(!Number.isFinite(remaining)||remaining<=0)return {kind:"uncertain"};
      const deadline=new Promise<ProductionMarketingOutcome>(resolve=>{timer=setTimeout(()=>{controller.abort();resolve({kind:"uncertain"});},Math.min(8000,remaining));});
      return await Promise.race([(async():Promise<ProductionMarketingOutcome>=>{
        const response=await fetch("https://api.resend.com/emails",{method:"POST",body,cache:"no-store",redirect:"error",signal:controller.signal,
          headers:{Authorization:`Bearer ${config.providerKey}`,"Content-Type":"application/json","Idempotency-Key":idempotencyKey}});
        if(!response.ok){await response.body?.cancel();return {kind:"uncertain"};}
        const value:unknown=JSON.parse(await readBoundedBody(response,16384));
        if(!value||typeof value!=="object"||!("id"in value)||typeof value.id!=="string"||value.id.length!==36||!productionMarketingUuid.test(value.id))return {kind:"uncertain"};
        return {kind:"accepted",id:value.id};
      })(),deadline]);
    }catch{return {kind:"uncertain"};}finally{clearTimeout(timer);controller.abort();}
  },
};
