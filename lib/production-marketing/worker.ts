import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { productionMarketingWorkerAuthorized, readProductionMarketingDeliveryConfiguration } from "./delivery-config";
import { openProductionMarketingCapabilities } from "./open-capabilities";
import { renderProductionMarketingMessage } from "./templates";
import type { ProductionMarketingEnvironment } from "./contract";
import type { ProductionMarketingDeliveryStorage, ProductionMarketingOutcome } from "./delivery-types";
export type ProductionMarketingWorkerDependencies={env:ProductionMarketingEnvironment;storage:ProductionMarketingDeliveryStorage;provider:{
  permission(email:string,topic:string,env:ProductionMarketingEnvironment):Promise<boolean>;
  send(body:string,idempotencyKey:string,expiresAt:string,env:ProductionMarketingEnvironment):Promise<ProductionMarketingOutcome>;
}};
const result=(status:number,value:string)=>Response.json({status:value},{status,headers:{"Cache-Control":"private, no-store","Referrer-Policy":"no-referrer"}});
export async function dispatchProductionMarketing(request:Request,deps:ProductionMarketingWorkerDependencies) {
  if(request.method!=="POST")return result(405,"unavailable");
  if(!productionMarketingWorkerAuthorized(request,deps.env))return result(401,"unavailable");
  try {
    const config=readProductionMarketingDeliveryConfiguration(deps.env);
    if(new URL(request.url).origin!==config.siteOrigin)return result(403,"unavailable");
    await deps.storage.cleanup();
    const lease=randomUUID(),intent=await deps.storage.claim(lease);
    if(!intent)return result(200,"idle");
    if(intent.purpose==="welcome") {
      let allowed=false;
      if(deps.env.HELIX_PRODUCTION_MARKETING_PREFERENCE_KEY && deps.env.HELIX_PRODUCTION_MARKETING_PREFERENCE_KEY!==config.providerKey
        && deps.env.HELIX_PRODUCTION_MARKETING_PREFERENCE_KEY!==config.serviceKey) {
        try {allowed=await deps.provider.permission(intent.email,config.contract.topicId,deps.env);}catch{/* A failed preference read never grants permission. */}
      }
      if(!allowed) {await deps.storage.defer(intent.id,lease);return result(200,"deferred");}
    }
    let prepared;
    if(intent.prepared)prepared=await deps.storage.admitRetry(intent.id,lease,config.contractHash);
    else {
      const tokens=intent.purpose==="confirmation"?openProductionMarketingCapabilities(intent,deps.env):{preferenceToken:randomBytes(32).toString("base64url")};
      const body=JSON.stringify(renderProductionMarketingMessage(intent,config.contract,tokens));
      prepared=await deps.storage.prepare(intent.id,lease,body,intent.purpose==="welcome"?createHash("sha256").update(tokens.preferenceToken).digest("hex"):null,config.contractHash);
      if(prepared && prepared.body!==body)throw new Error();
    }
    if(!prepared){await deps.storage.defer(intent.id,lease);return result(200,"deferred");}
    if(new Date(prepared.admittedAt).toISOString().slice(0,10)!==new Date().toISOString().slice(0,10)
      ||Date.parse(prepared.payloadExpiresAt)<=Date.now()||Date.parse(prepared.leaseUntil)<=Date.now()
      ||Date.now()-Date.parse(prepared.firstPreparedAt)>=23*60*60*1000)return result(200,"deferred");
    const outcome=await deps.provider.send(prepared.body,prepared.idempotencyKey,prepared.payloadExpiresAt,deps.env);
    if(!await deps.storage.finish(intent.id,lease,outcome))return result(503,"unavailable");
    return result(200,outcome.kind);
  }catch{return result(503,"unavailable");}
}
