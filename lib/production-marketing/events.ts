import "server-only";
import { marketingSigningKey } from "./callback-config";
import { productionDeploymentAuthorized } from "@/lib/release/deployment-authorization";
import { Resend } from "resend";
import { readProductionMarketingConfiguration } from "./config";
import { productionMarketingUuid } from "./delivery-config";
import type { ProductionMarketingEnvironment } from "./contract";
import { nativeRestriction, type NativeRestriction, type NativeRestrictionResult } from "./native-restrictions";
export type ProductionMarketingEvent={eventId:string;messageId:string;providerId:string;eventType:string;occurredAt:string;sender:string;recipient:string;purpose:"confirmation"|"welcome";contractVersion:"production_welcome_delivery_v1";environment:"production"};
export type ProductionMarketingEventResult="recorded"|"rejected"|"paused";
const types=new Set(["email.sent","email.delivered","email.delivery_delayed","email.failed","email.bounced","email.complained","email.suppressed"]);
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==="object"&&!Array.isArray(v);
const uuid=(v:unknown):v is string=>typeof v==="string"&&v.length===36&&productionMarketingUuid.test(v);
const response=(status:number,ok=false)=>Response.json({ok},{status,headers:{"Cache-Control":"private, no-store","Referrer-Policy":"no-referrer","X-Content-Type-Options":"nosniff"}});
async function rawBody(request:Request) {
  const limit=128*1024;if(Number(request.headers.get("content-length"))>limit)throw new RangeError();
  if(!request.body)return "";
  const reader=request.body.getReader(),chunks:Uint8Array[]=[];let bytes=0,timedOut=false,timer:ReturnType<typeof setTimeout>|undefined;
  const cancel=()=>{void reader.cancel().catch(()=>{});};
  try {
    const deadline=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{timedOut=true;cancel();reject(new Error());},3000);});
    return await Promise.race([(async()=>{
      for(;;){const value=await reader.read();if(timedOut)throw new Error();if(value.done)break;bytes+=value.value.byteLength;if(bytes>limit){cancel();throw new RangeError();}chunks.push(value.value);}
      return new TextDecoder("utf-8",{fatal:true,ignoreBOM:true}).decode(Buffer.concat(chunks));
    })(),deadline]);
  }finally{clearTimeout(timer);reader.releaseLock();}
}
type EventDependencies = {
  env: ProductionMarketingEnvironment;
  record: (event: ProductionMarketingEvent) => Promise<ProductionMarketingEventResult>;
  restrict?: (event: NativeRestriction) => Promise<NativeRestrictionResult>;
};

function occurrence(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(value)) return null;
  const millis = Date.parse(value);
  if (!Number.isFinite(millis) || millis > Date.now() + 300000) return null;
  const iso = new Date(millis).toISOString();
  return iso.slice(0, 19) === value.slice(0, 19) ? iso : null;
}

function claimsRawReceipt(data: unknown) {
  if (!object(data) || !object(data.tags)) return false;
  const tags = data.tags;
  return tags.environment === "production" || tags.helix_contract !== undefined ||
    (tags.helix_environment !== "sandbox" && (tags.helix_message_id !== undefined || tags.helix_purpose !== undefined));
}

async function recordRawReceipt(type: string, raw: unknown, occurredAt: string | null, id: string, deps: EventDependencies) {
  if (!types.has(type) || !occurredAt || !object(raw)) return response(400);
  const data = raw, tags = data.tags;
  if(!object(tags)||tags.environment!=="production"||!uuid(tags.helix_message_id)||!["confirmation","welcome"].includes(String(tags.helix_purpose))||tags.helix_contract!=="production_welcome_delivery_v1"
    ||!uuid(data.email_id)||typeof data.from!=="string"||!data.from||data.from.length>320||/[\r\n\x00]/.test(data.from)
    ||!Array.isArray(data.to)||data.to.length!==1||typeof data.to[0]!=="string"||!data.to[0]||data.to[0].length>254||data.to[0]!==data.to[0].trim().toLowerCase())return response(400);
  const result=await deps.record({eventId:id,messageId:tags.helix_message_id,providerId:data.email_id,eventType:type,occurredAt,
    sender:data.from,recipient:data.to[0],purpose:tags.helix_purpose as "confirmation"|"welcome",contractVersion:tags.helix_contract,environment:"production"});
  return result==="recorded"?response(200,true):response(result==="paused"?503:400);
}

export async function receiveProductionMarketingEvent(request: Request, deps: EventDependencies) {
  if(request.method!=="POST")return response(405);
  let secret:string;
  try {
    const config=readProductionMarketingConfiguration(deps.env);
    secret = marketingSigningKey(deps.env, Boolean(deps.restrict));
    if(new URL(request.url).origin!==config.siteOrigin)return response(403);
  }catch{return response(503);}
  let event:unknown;
  const id=request.headers.get("svix-id")??"",timestamp=request.headers.get("svix-timestamp")??"",signature=request.headers.get("svix-signature")??"";
  if(!/^[A-Za-z0-9_-]{1,200}$/.test(id)||!/^[0-9]{1,12}$/.test(timestamp)||Math.abs(Date.now()/1000-Number(timestamp))>300||!signature||signature.length>1024)return response(400);
  try {
    const payload=await rawBody(request);
    // Local verification only; this dummy key never authorizes or performs provider I/O.
    event=new Resend("re_webhook_verification_only").webhooks.verify({payload,webhookSecret:secret,headers:{id,timestamp,signature}});
  }catch(error){return response(error instanceof RangeError?413:400);}
  if(!object(event)||typeof event.type!=="string" || !/^[a-z][a-z0-9_.]{0,99}$/.test(event.type))return response(400);
  try {
    if (!await productionDeploymentAuthorized(deps.env)) return response(503);
    const occurredAt = occurrence(event.created_at);
    // The shared gateway continues to delegate only already-owned raw receipts.
    if (!deps.restrict) return await recordRawReceipt(event.type, event.data, occurredAt, id, deps);
    const observation = nativeRestriction(event.type, event.data, id, occurredAt, deps.env);
    let restrictionUnavailable = false;
    if (observation) {
      try {
        const result = await deps.restrict(observation);
        restrictionUnavailable = !["applied", "duplicate", "ignored", "held"].includes(result);
      } catch { restrictionUnavailable = true; }
    }
    // A signed collision may produce both an address-level hold and an existing
    // prepared-message receipt. Each owner must durably acknowledge its own work.
    const raw = types.has(event.type) && claimsRawReceipt(event.data)
      ? await recordRawReceipt(event.type, event.data, occurredAt, id, deps)
      : response(200, true);
    return restrictionUnavailable ? response(503) : raw;
  }catch{return response(503);}
}
