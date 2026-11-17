import "server-only";
import { readBoundedBody } from "@/lib/email/provider";
import { isEmailAddress } from "@/lib/email/config";
import { readProductionMarketingConfiguration } from "./config";
import { productionMarketingUuid } from "./delivery-config";
import type { ProductionMarketingEnvironment } from "./contract";
import type { ProductionMarketingHeldEnvelope } from "./capabilities";
import type { PreparedMarketingMessage, ProductionMarketingDeliveryStorage, ProductionMarketingIntent } from "./delivery-types";
const invalid=()=>new Error("Production marketing is unavailable.");
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==="object"&&!Array.isArray(v);
function prepared(value:unknown,id:string):PreparedMarketingMessage|null {
  if(value===null)return null;
  if(!record(value)||typeof value.body!=="string"||Buffer.byteLength(value.body)>100000||value.idempotencyKey!==`production-marketing/${id}`
    ||!["firstPreparedAt","admittedAt","payloadExpiresAt","leaseUntil"].every(k=>typeof value[k]==="string"&&Number.isFinite(Date.parse(value[k] as string))))throw invalid();
  return value as PreparedMarketingMessage;
}
function intent(value:unknown):ProductionMarketingIntent|null {
  if(value===null)return null;
  if(!record(value)||!["id","subscriberId","requestId"].every(k=>typeof value[k]==="string"&&(value[k] as string).length===36&&productionMarketingUuid.test(value[k] as string))
    ||typeof value.email!=="string"||!isEmailAddress(value.email)||value.email!==value.email.trim().toLowerCase()||value.email.length>254
    ||!["confirmation","welcome"].includes(String(value.purpose))
    ||!["generation","revision"].every(k=>typeof value[k]==="number"&&Number.isSafeInteger(value[k])&&(value[k] as number)>0)
    ||!["issuedAt","expiresAt"].every(k=>typeof value[k]==="string"&&Number.isFinite(Date.parse(value[k] as string)))
    ||!["confirmationHash","preferenceHash"].every(k=>typeof value[k]==="string"&&/^[a-f0-9]{64}$/.test(value[k] as string))
    ||(value.envelope!==null&&!record(value.envelope)))throw invalid();
  return {...value,prepared:prepared(value.prepared,value.id as string),envelope:value.envelope as ProductionMarketingHeldEnvelope|null} as ProductionMarketingIntent;
}
export function createProductionMarketingDeliveryStorage(env:ProductionMarketingEnvironment):ProductionMarketingDeliveryStorage {
  async function rpc(name:string,args:Record<string,unknown>,limit=150000):Promise<unknown> {
    const config=readProductionMarketingConfiguration(env),controller=new AbortController();
    let timer:ReturnType<typeof setTimeout>|undefined;
    try {
      const deadline=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(invalid());},3000);});
      return await Promise.race([(async()=>{
        const response=await fetch(`${config.supabaseUrl}/rest/v1/rpc/${name}`,{method:"POST",headers:{apikey:config.serviceKey,Authorization:`Bearer ${config.serviceKey}`,"Content-Type":"application/json"},
          body:JSON.stringify(args),cache:"no-store",redirect:"error",signal:controller.signal});
        if(!response.ok){await response.body?.cancel();throw invalid();}
        return JSON.parse(await readBoundedBody(response,limit)) as unknown;
      })(),deadline]);
    }catch{throw invalid();}finally{clearTimeout(timer);controller.abort();}
  }
  async function boolean(name:string,args:Record<string,unknown>) {const value=await rpc(name,args,128);if(typeof value!=="boolean")throw invalid();return value;}
  return {
    cleanup:async()=>{const value=await rpc("cleanup_production_marketing_delivery",{},128);if(typeof value!=="number"||!Number.isSafeInteger(value)||value<0)throw invalid();return value;},
    claim:async lease=>intent(await rpc("claim_production_marketing_message",{p_lease:lease})),
    prepare:async(id,lease,body,preferenceHash,contractHash)=>prepared(await rpc("prepare_production_marketing_message",{p_id:id,p_lease:lease,p_body:body,p_preference_hash:preferenceHash,p_contract_hash:contractHash}),id),
    admitRetry:async(id,lease,contractHash)=>prepared(await rpc("retry_production_marketing_message",{p_id:id,p_lease:lease,p_contract_hash:contractHash}),id),
    finish:(id,lease,outcome)=>boolean("finish_production_marketing_message",{p_id:id,p_lease:lease,p_kind:outcome.kind,p_provider_id:outcome.kind==="accepted"?outcome.id:null}),
    defer:(id,lease)=>boolean("defer_production_marketing_message",{p_id:id,p_lease:lease}),
  };
}
