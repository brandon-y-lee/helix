// @vitest-environment node
import { createHash, createHmac } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { receiveProductionEmail } from "@/lib/production-email-gateway/gateway";
import { productionEmailDelegates } from "@/lib/production-email-gateway/runtime";
import { parseLegacySnapshot, recipientSetHash, type LegacySnapshot } from "@/lib/production-email-gateway/legacy";
const origin="https://www.helixskin.us", id="11111111-1111-4111-8111-111111111111", provider="22222222-2222-4222-8222-222222222222";
const secret=`whsec_${Buffer.from("synthetic-gateway-signing-secret").toString("base64")}`;
const old=`whsec_${Buffer.from("synthetic-retired-signing-secret").toString("base64")}`;
const env={VERCEL:"1",VERCEL_ENV:"production",VERCEL_PROJECT_ID:"p",VERCEL_DEPLOYMENT_ID:"d",VERCEL_PROJECT_PRODUCTION_URL:"helixskin.us",
 HELIX_PRODUCTION_EMAIL_GATEWAY_ENABLED:"true",HELIX_PRODUCTION_EMAIL_GATEWAY_ORIGIN:origin,HELIX_PRODUCTION_EMAIL_GATEWAY_PROJECT_ID:"p",
 HELIX_PRODUCTION_EMAIL_GATEWAY_DEPLOYMENT_ID:"d",HELIX_PRODUCTION_EMAIL_GATEWAY_WEBHOOK_SECRET:secret,RESEND_WEBHOOK_SECRET:old};
const types=["email.sent","email.delivered","email.delivery_delayed","email.failed","email.bounced","email.complained","email.suppressed"];
const supportTags={helix_support_contract:id,helix_support_outbox:id,helix_support_delivery:"a".repeat(64)};
const welcomeTags={environment:"production",helix_message_id:id,helix_purpose:"welcome",helix_contract:"production_welcome_delivery_v1"};
const event=(tags:Record<string,unknown>={},type="email.sent")=>({type,created_at:new Date().toISOString(),data:{email_id:provider,
 from:"Helix Website <contact@helixskin.us>",to:["support@helixskin.us"],subject:`Helix Website inquiry ${id}`,message_id:"<synthetic@example.invalid>",tags}});
function signed(value:unknown=event(),key=secret,extra="",url=origin+"/api/webhooks/resend-production") {
 const raw=JSON.stringify(value),timestamp=String(Math.floor(Date.now()/1000)),eventId="msg_synthetic";
 const signature=createHmac("sha256",Buffer.from(key.slice(6),"base64")).update(`${eventId}.${timestamp}.${raw}`).digest("base64");
 return new Request(url,{method:"POST",body:raw+extra,headers:{"svix-id":eventId,"svix-timestamp":timestamp,"svix-signature":`v1,${signature}`}});
}
const digest=(s:string)=>createHash("sha256").update(s).digest("hex");
function snapshot():LegacySnapshot {return parseLegacySnapshot({version:1,targetRef:"erasogmsqpgiirovubjh",snapshotId:id,complete:true,
 outgoing:[{kind:"message",messageId:id,providerId:provider,purpose:"support_ack",senderHash:digest(event().data.from),recipientHash:digest("support@helixskin.us")}],
 aliases:[{addressHash:digest("reply+synthetic@example.invalid"),inquiryId:id}],inbound:[]});}
afterEach(()=>vi.unstubAllGlobals());
function noNetwork(){const fetch=vi.fn(()=>{throw new Error("Unexpected network");});vi.stubGlobal("fetch",fetch);return fetch;}
it("fails closed before delegates/body/I/O for disabled, incomplete or unpinned production configuration",async()=>{
 const fetch=noNetwork(),support=vi.fn();
 for(const delta of [{HELIX_PRODUCTION_EMAIL_GATEWAY_ENABLED:"false"},{VERCEL_ENV:"preview"},{VERCEL_TARGET_ENV:"preview"},{VERCEL_PROJECT_ID:"other"},
 {VERCEL_DEPLOYMENT_ID:"other"},{HELIX_PRODUCTION_EMAIL_GATEWAY_WEBHOOK_SECRET:old},{HELIX_PRODUCTION_EMAIL_GATEWAY_WEBHOOK_SECRET:"whsec_bad"},
 {HELIX_PRODUCTION_EMAIL_GATEWAY_ORIGIN:"https://helixskin.us"}]){
  expect((await receiveProductionEmail(signed(event(supportTags)),{env:{...env,...delta},support})).status).toBe(503);
 }
 expect((await receiveProductionEmail(signed(event(),secret,"","https://preview.example.invalid/api/webhooks/resend-production"),{env,support})).status).toBe(403);
 expect(support).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();
 expect((await receiveProductionEmail(new Request(origin,{method:"GET"}),{env,support})).status).toBe(405);
});
it("verifies the dedicated fresh raw signature, accepting dual signatures but rejecting old-only, tampered, stale, malformed and oversized input",async()=>{
 noNetwork();const deps={env};
 expect((await receiveProductionEmail(signed(event(),old),deps)).status).toBe(400);
 expect((await receiveProductionEmail(signed(event(),secret," "),deps)).status).toBe(400);
 const dual=signed(),older=signed(event(),old);dual.headers.set("svix-signature",older.headers.get("svix-signature")+" "+dual.headers.get("svix-signature"));
 expect((await receiveProductionEmail(dual,deps)).status).toBe(200);
 const stale=signed();stale.headers.set("svix-timestamp","1");expect((await receiveProductionEmail(stale,deps)).status).toBe(400);
 expect((await receiveProductionEmail(signed({...event(),padding:"x".repeat(128*1024)}),deps)).status).toBe(413);
 for(const tags of [[],null])expect((await receiveProductionEmail(signed({...event(),data:{...event().data,tags}}),deps)).status).toBe(400);
 expect((await receiveProductionEmail(signed({...event(),created_at:"2026-02-30T00:00:00Z"}),deps)).status).toBe(400);
});
it("cancels a stalled body at its deadline without delegate or network access",async()=>{
 noNetwork();vi.useFakeTimers();let cancelled=false;
 try{const headers=signed().headers,body=new ReadableStream({cancel(){cancelled=true;}});
 const request=new Request(origin+"/api/webhooks/resend-production",{method:"POST",headers,body,duplex:"half"} as RequestInit);
 const pending=receiveProductionEmail(request,{env});await vi.advanceTimersByTimeAsync(3001);expect((await pending).status).toBe(400);expect(cancelled).toBe(true);
 }finally{vi.useRealTimers();}
});
it("routes only support sent; all other seven support event types remain retryable without other delegates",async()=>{
 const fetch=noNetwork(),support=vi.fn(async(request:Request)=>{expect(await request.text()).toBe(JSON.stringify(event(supportTags)));return Response.json({ok:true});});
 // Freeze creation time so the raw comparison is exact.
 vi.useFakeTimers();vi.setSystemTime(new Date("2026-11-19T12:00:00Z"));
 try{for(const type of [...types,"email.received"]){const response=await receiveProductionEmail(signed(event(supportTags,type)),{env,support});expect(response.status).toBe(type==="email.sent"?200:503);}
 expect(support).toHaveBeenCalledOnce();expect(fetch).not.toHaveBeenCalled();}finally{vi.useRealTimers();}
});
it("rejects conflicting/malformed ownership and holds unknown reserved namespaces instead of acknowledging",async()=>{
 const fetch=noNetwork(),support=vi.fn(),welcome=vi.fn();
 for(const tags of [{...supportTags,...welcomeTags},{...supportTags,helix_environment:"sandbox",helix_message_id:id},{helix_support_outbox:id},
 {...welcomeTags,helix_purpose:"campaign"},{...welcomeTags,helix_contract:"unreviewed"}]){
 expect((await receiveProductionEmail(signed(event(tags)),{env,support,welcome})).status).toBe(400);}
 expect((await receiveProductionEmail(signed(event({helix_message_id:id})),{env,support,welcome})).status).toBe(503);
 expect((await receiveProductionEmail(signed(event(welcomeTags,"email.received")),{env,support,welcome})).status).toBe(503);
 expect(support).not.toHaveBeenCalled();expect(welcome).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();
});
it("preserves all seven welcome callbacks and duplicate/out-of-order handoff; unrelated Auth does no I/O",async()=>{
 const fetch=noNetwork(),welcome=vi.fn(async()=>Response.json({ok:true}));
 for(const type of [...types].reverse().concat("email.sent"))expect((await receiveProductionEmail(signed(event(welcomeTags,type)),{env,welcome})).status).toBe(200);
 expect(welcome).toHaveBeenCalledTimes(8);
 expect((await receiveProductionEmail(signed(event()),{env})).status).toBe(200);
 expect((await receiveProductionEmail(signed(event({},"unrelated.future_event")),{env})).status).toBe(200);expect(fetch).not.toHaveBeenCalled();
 const failed=await receiveProductionEmail(signed(event(supportTags)),{env,support:async()=>{throw new Error("PRIVATE raw payload must not leak");}});expect(failed.status).toBe(503);expect(await failed.text()).toBe('{"ok":false}');
});
it("matches exact frozen legacy identities and envelope, retained tombstones and durable receipt outcomes only",async()=>{
 noNetwork();const manifest=snapshot(),receipt=vi.fn(async()=>"recorded" as const),legacy={snapshot:manifest,receipt};
 const value=event({helix_environment:"sandbox",helix_message_id:id});
 for(const type of types)expect((await receiveProductionEmail(signed({...value,type}),{env,legacy})).status).toBe(200);
 for(const outcome of ["duplicate","conflict","unmatched","paused"]){receipt.mockResolvedValue(outcome as "recorded");expect((await receiveProductionEmail(signed(value),{env,legacy})).status).toBe(outcome==="duplicate"?200:503);}
 const before=receipt.mock.calls.length;
 for(const data of [{...value.data,email_id:id},{...value.data,from:"other@example.invalid"},{...value.data,to:["other@example.invalid"]},{...value.data,cc:["other@example.invalid"]}])expect((await receiveProductionEmail(signed({...value,data}),{env,legacy})).status).toBe(503);
 expect(receipt.mock.calls.length).toBe(before);
 const tombstone={...manifest,outgoing:[{kind:"tombstone",messageId:id,providerId:provider,purpose:"support_ack"}]};receipt.mockResolvedValue("recorded");
 expect((await receiveProductionEmail(signed(value),{env,legacy:{snapshot:parseLegacySnapshot(tombstone),receipt}})).status).toBe(200);
 expect(receipt).toHaveBeenLastCalledWith(expect.not.objectContaining({sender:expect.anything()}));
 expect(receipt).toHaveBeenLastCalledWith(expect.not.objectContaining({recipient:expect.anything()}));
 expect((await receiveProductionEmail(signed(value),{env,legacy:{snapshot:parseLegacySnapshot({...manifest,outgoing:[{kind:"blocked",messageId:id,providerId:null,purpose:"support_ack"}]}),receipt}})).status).toBe(503);
 expect(()=>parseLegacySnapshot({...manifest,outgoing:[...manifest.outgoing,...manifest.outgoing]})).toThrow();
 expect(()=>parseLegacySnapshot({...manifest,targetRef:"zyfkunnpnlmgvrojmrbg"})).toThrow();
});
it("requires full inbound ownership proof and a durable queue ID, excluding native Inbox without fetching content",async()=>{
 const fetch=noNetwork(),manifest=snapshot(),queue=vi.fn(async()=>({status:"queued",id})),legacy={snapshot:manifest,queue};
 const received={...event({},"email.received"),data:{...event().data,from:"owned@example.invalid",to:["support@helixskin.us"]}};
 expect((await receiveProductionEmail(signed(received),{env})).status).toBe(503);
 expect((await receiveProductionEmail(signed(received),{env,legacy})).status).toBe(200);expect(queue).not.toHaveBeenCalled();
 const alias={...received,data:{...received.data,cc:["Reply+Synthetic@example.invalid"]}};
 expect((await receiveProductionEmail(signed(alias),{env,legacy})).status).toBe(200);expect(queue).toHaveBeenCalledOnce();
 expect(queue).toHaveBeenLastCalledWith(expect.objectContaining({recipients:["support@helixskin.us","reply+synthetic@example.invalid"],inquiryId:id}));
 for(const result of [{status:"duplicate",id},{status:"duplicate",id:null},{status:"ignored"},{status:"rate_limited"},{status:"held"}]){
 queue.mockResolvedValue(result as {status:string;id:string});expect((await receiveProductionEmail(signed(alias),{env,legacy})).status).toBe(result.id?200:503);}
 expect((await receiveProductionEmail(signed({...alias,data:{...alias.data,bcc:["unknown@example.invalid"]}}),{env,legacy})).status).toBe(503);
 expect((await receiveProductionEmail(signed({...received,data:{...received.data,cc:null}}),{env,legacy})).status).toBe(503);
 const exact={...manifest,inbound:[{eventId:"msg_synthetic",providerId:provider,senderHash:digest("owned@example.invalid"),recipientSetHash:recipientSetHash(["support@helixskin.us"])}]};queue.mockResolvedValue({status:"queued",id});
 expect((await receiveProductionEmail(signed(received),{env,legacy:{snapshot:parseLegacySnapshot(exact),queue}})).status).toBe(200);
 expect((await receiveProductionEmail(signed({...received,data:{...received.data,from:"other@example.invalid"}}),{env,legacy:{snapshot:parseLegacySnapshot(exact),queue}})).status).toBe(503);
 expect(fetch).not.toHaveBeenCalled();
});
it("runs real support/welcome delegates with unchanged signatures, keeping existing gates and unknown ownership retryable",async()=>{
 const full={...env,HELIX_PRODUCTION_SUPPORT_ORIGIN:origin,HELIX_PRODUCTION_SUPPORT_PROJECT_REF:"erasogmsqpgiirovubjh",HELIX_PRODUCTION_SUPPORT_PROJECT_URL:"https://erasogmsqpgiirovubjh.supabase.co",
 HELIX_PRODUCTION_SUPPORT_CONTRACT_ID:id,HELIX_PRODUCTION_SUPPORT_SERVICE_ROLE_KEY:"synthetic-only-service-key-32-characters",HELIX_PRODUCTION_SUPPORT_ABUSE_SECRET:"synthetic-only-abuse-secret-32-characters",
 HELIX_PRODUCTION_MARKETING_SITE_ORIGIN:origin,HELIX_PRODUCTION_MARKETING_VERCEL_PROJECT_ID:"p",HELIX_PRODUCTION_MARKETING_DEPLOYMENT_ID:"d",
 HELIX_PRODUCTION_MARKETING_SUPABASE_URL:"https://erasogmsqpgiirovubjh.supabase.co",HELIX_PRODUCTION_MARKETING_SERVICE_KEY:"synthetic-only-welcome-key",HELIX_PRODUCTION_MARKETING_EVENTS_ENABLED:"true"};
 let supportResult="matched",welcomeResult="recorded";
 const fetch=vi.fn(async(input:unknown,init?:RequestInit)=>{const url=String(input);expect(url.startsWith("https://erasogmsqpgiirovubjh.supabase.co/rest/v1/rpc/")).toBe(true);
 expect(init?.redirect).toBe("error");
 if(url.endsWith("/read_support_prod_contract"))return Response.json({projectRef:full.HELIX_PRODUCTION_SUPPORT_PROJECT_REF,contractId:id,admissionEnabled:false,workerEnabled:false,fullMediaQualified:false,isolationQualified:false,operationsQualified:false});
 if(url.endsWith("/record_support_prod_sent"))return Response.json(supportResult);
 if(url.endsWith("/record_production_marketing_event"))return Response.json(welcomeResult);
 throw new Error("Unexpected endpoint");});vi.stubGlobal("fetch",fetch);
 expect((await receiveProductionEmail(signed(event(supportTags)),{env:full,...productionEmailDelegates(full)})).status).toBe(200);
 for(supportResult of ["duplicate","unmatched","conflict"])expect((await receiveProductionEmail(signed(event(supportTags)),{env:full,...productionEmailDelegates(full)})).status).toBe(supportResult==="duplicate"?200:503);
 for(welcomeResult of ["recorded","rejected","paused"])expect((await receiveProductionEmail(signed(event(welcomeTags)),{env:full,...productionEmailDelegates(full)})).status).toBe(welcomeResult==="recorded"?200:503);
 const unconfigured={...full,HELIX_PRODUCTION_SUPPORT_CONTRACT_ID:provider};
 expect((await receiveProductionEmail(signed(event(supportTags)),{env:unconfigured,...productionEmailDelegates(unconfigured)})).status).toBe(400);
 const before=fetch.mock.calls.length,paused={...full,HELIX_PRODUCTION_MARKETING_EVENTS_ENABLED:"false"};
 expect((await receiveProductionEmail(signed(event(welcomeTags)),{env:paused,...productionEmailDelegates(paused)})).status).toBe(503);expect(fetch.mock.calls.length).toBe(before);
 expect((await receiveProductionEmail(signed(event({helix_environment:"sandbox",helix_message_id:id})),{env:full,...productionEmailDelegates(full)})).status).toBe(503);expect(fetch.mock.calls.length).toBe(before);
});
