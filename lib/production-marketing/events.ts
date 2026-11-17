import "server-only";
import { Resend } from "resend";
import { readProductionMarketingConfiguration } from "./config";
import { productionMarketingUuid } from "./delivery-config";
import type { ProductionMarketingEnvironment } from "./contract";
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
      return Buffer.concat(chunks).toString("utf8");
    })(),deadline]);
  }finally{clearTimeout(timer);reader.releaseLock();}
}
export async function receiveProductionMarketingEvent(request:Request,deps:{env:ProductionMarketingEnvironment;record:(event:ProductionMarketingEvent)=>Promise<ProductionMarketingEventResult>}) {
  if(request.method!=="POST")return response(405);
  let secret:string;
  try {
    const config=readProductionMarketingConfiguration(deps.env),value=deps.env.HELIX_PRODUCTION_MARKETING_WEBHOOK_SECRET;
    if(deps.env.HELIX_PRODUCTION_MARKETING_EVENTS_ENABLED!=="true"||!value||!value.startsWith("whsec_")||value===deps.env.RESEND_WEBHOOK_SECRET||value.length>256)throw new Error();
    const encoded=value.slice(6),bytes=Buffer.from(encoded,"base64");
    if(bytes.length<16||bytes.length>64||bytes.toString("base64")!==encoded)throw new Error();
    if(new URL(request.url).origin!==config.siteOrigin)return response(403);secret=value;
  }catch{return response(503);}
  let event:unknown;
  const id=request.headers.get("svix-id")??"",timestamp=request.headers.get("svix-timestamp")??"",signature=request.headers.get("svix-signature")??"";
  if(!/^[A-Za-z0-9_-]{1,200}$/.test(id)||!/^[0-9]{1,12}$/.test(timestamp)||Math.abs(Date.now()/1000-Number(timestamp))>300||!signature||signature.length>1024)return response(400);
  try {
    const payload=await rawBody(request);
    // Local verification only; this dummy key never authorizes or performs provider I/O.
    event=new Resend("re_webhook_verification_only").webhooks.verify({payload,webhookSecret:secret,headers:{id,timestamp,signature}});
  }catch(error){return response(error instanceof RangeError?413:400);}
  if(!object(event)||typeof event.type!=="string"||!types.has(event.type)||typeof event.created_at!=="string"
    ||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(event.created_at)||event.created_at.trim()!==event.created_at||!Number.isFinite(Date.parse(event.created_at))
    ||new Date(event.created_at).toISOString().slice(0,19)!==event.created_at.slice(0,19)||Date.parse(event.created_at)>Date.now()+300000||!object(event.data))return response(400);
  const data=event.data,tags=data.tags;
  if(!object(tags)||tags.environment!=="production"||!uuid(tags.helix_message_id)||!["confirmation","welcome"].includes(String(tags.helix_purpose))||tags.helix_contract!=="production_welcome_delivery_v1"
    ||!uuid(data.email_id)||typeof data.from!=="string"||!data.from||data.from.length>320||/[\r\n\x00]/.test(data.from)
    ||!Array.isArray(data.to)||data.to.length!==1||typeof data.to[0]!=="string"||!data.to[0]||data.to[0].length>254||data.to[0]!==data.to[0].trim().toLowerCase())return response(400);
  try {
    const result=await deps.record({eventId:id,messageId:tags.helix_message_id,providerId:data.email_id,eventType:event.type,occurredAt:new Date(event.created_at).toISOString(),
      sender:data.from,recipient:data.to[0],purpose:tags.helix_purpose as "confirmation"|"welcome",contractVersion:tags.helix_contract,environment:"production"});
    return result==="recorded"?response(200,true):response(result==="paused"?503:400);
  }catch{return response(503);}
}
