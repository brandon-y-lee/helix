import "server-only";
import { configuredMarketingSigningKey, marketingSigningKey } from "./callback-config";
import { productionDeploymentAuthorized } from "@/lib/release/deployment-authorization";
import { Resend } from "resend";
import { readProductionMarketingConfiguration } from "./config";
import type { ProductionMarketingEnvironment } from "./contract";
import { claimsMarketingReceipt, directPreference, negativeDelivery, object, sharedMarketingSender, uuid,
  type DirectPreference, type DirectPreferenceResult, type DirectReceiptHold, type DirectReceiptHoldResult } from "./direct-restrictions";
export type ProductionMarketingEvent={eventId:string;messageId:string;providerId:string;eventType:string;occurredAt:string;sender:string;recipient:string;purpose:"confirmation"|"welcome";contractVersion:"production_welcome_delivery_v1";environment:"production"};
export type ProductionMarketingEventResult="recorded"|"rejected"|"paused";
const types=new Set(["email.sent","email.delivered","email.delivery_delayed","email.failed","email.bounced","email.complained","email.suppressed"]);
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
  preference?: (event: DirectPreference) => Promise<DirectPreferenceResult>;
  hold?: (event: DirectReceiptHold) => Promise<DirectReceiptHoldResult>;
  supportSent?: (request: Request, secret: string) => Promise<Response>;
};

function occurrence(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(value)) return null;
  const millis = Date.parse(value);
  if (!Number.isFinite(millis) || millis > Date.now() + 300000) return null;
  const iso = new Date(millis).toISOString();
  return iso.slice(0, 19) === value.slice(0, 19) ? iso : null;
}

async function recordRawReceipt(type: string, raw: unknown, occurredAt: string | null, id: string, deps: EventDependencies) {
  if (!types.has(type) || !object(raw)) return response(400);
  const data = raw, tags = data.tags;
  const direct = sharedMarketingSender(data.from);
  // This RPC's new strict proof cannot be reconstructed by an older client which discarded extra tags/recipients.
  const exactEnvelope = object(tags) && Object.keys(tags).length === 4 &&
    [data.cc, data.bcc].every(value => value == null || (Array.isArray(value) && value.length === 0)) &&
    data.template_id == null && data.broadcast_id == null;
  if (!occurredAt || !object(tags) || tags.environment !== "production" || !uuid(tags.helix_message_id) ||
      (tags.helix_purpose !== "confirmation" && tags.helix_purpose !== "welcome") || tags.helix_contract !== "production_welcome_delivery_v1" ||
      !uuid(data.email_id) || typeof data.from !== "string" || !data.from || data.from.length > 320 || /[\r\n\x00]/.test(data.from) ||
      !Array.isArray(data.to) || data.to.length !== 1 || typeof data.to[0] !== "string" || !data.to[0] || data.to[0].length > 254 ||
      data.to[0] !== data.to[0].trim().toLowerCase() || ((direct || negativeDelivery.has(type)) && !exactEnvelope)) {
    if (!deps.hold || !negativeDelivery.has(type) || !claimsMarketingReceipt(data)) return response(400);
    const held = await deps.hold({ p_event_id: id, p_message_id: object(tags) && uuid(tags.helix_message_id) ? tags.helix_message_id : null,
      p_provider_id: uuid(data.email_id) ? data.email_id : null });
    return held === "held" || held === "duplicate" ? response(200, true) : response(503);
  }
  const result=await deps.record({eventId:id,messageId:tags.helix_message_id,providerId:data.email_id,eventType:type,occurredAt,
    sender:data.from,recipient:data.to[0],purpose:tags.helix_purpose as "confirmation"|"welcome",contractVersion:tags.helix_contract,environment:"production"});
  return result==="recorded"?response(200,true):response(result==="paused"?503:400);
}

export async function receiveProductionMarketingEvent(request: Request, deps: EventDependencies) {
  if(request.method!=="POST")return response(405);
  let secret:string;
  try {
    const origin = deps.supportSent ? "https://www.helixskin.us" : readProductionMarketingConfiguration(deps.env).siteOrigin;
    secret = deps.supportSent ? configuredMarketingSigningKey(deps.env, true) : marketingSigningKey(deps.env, Boolean(deps.preference));
    if(new URL(request.url).origin!==origin)return response(403);
  }catch{return response(503);}
  let event:unknown;
  let payload: string;
  const id=request.headers.get("svix-id")??"",timestamp=request.headers.get("svix-timestamp")??"",signature=request.headers.get("svix-signature")??"";
  if(!/^[A-Za-z0-9_-]{1,200}$/.test(id)||!/^[0-9]{1,12}$/.test(timestamp)||Math.abs(Date.now()/1000-Number(timestamp))>300||!signature||signature.length>1024)return response(400);
  try {
    payload=await rawBody(request);
    // Local verification only; this dummy key never authorizes or performs provider I/O.
    event=new Resend("re_webhook_verification_only").webhooks.verify({payload,webhookSecret:secret,headers:{id,timestamp,signature}});
  }catch(error){return response(error instanceof RangeError?413:400);}
  if(!object(event)||typeof event.type!=="string" || !/^[a-z][a-z0-9_.]{0,99}$/.test(event.type))return response(400);
  try {
    if (!await productionDeploymentAuthorized(deps.env)) return response(503);
    if (deps.supportSent) {
      const tags = object(event.data) ? event.data.tags : undefined;
      const supportClaim = object(tags) && Object.keys(tags).some(key => key === "helix_support" || key.startsWith("helix_support_"));
      if (supportClaim) {
        if (claimsMarketingReceipt(event.data)) {
          if (!negativeDelivery.has(event.type)) return response(400);
        } else if (event.type === "email.sent") {
          return await deps.supportSent(new Request(request.url, { method: "POST", headers: request.headers, body: payload }), secret);
        }
      }
      readProductionMarketingConfiguration(deps.env);
      marketingSigningKey(deps.env, Boolean(deps.preference));
    }
    const occurredAt = occurrence(event.created_at);
    if (deps.preference) {
      const observation = directPreference(event.type, event.data, id, occurredAt);
      if (observation) {
        const result = await deps.preference(observation);
        return ["applied", "duplicate", "ignored", "held"].includes(result) ? response(200, true) : response(503);
      }
      if (!types.has(event.type) || !claimsMarketingReceipt(event.data)) return response(200, true);
    }
    return await recordRawReceipt(event.type, event.data, occurredAt, id, deps);
  }catch{return response(503);}
}
