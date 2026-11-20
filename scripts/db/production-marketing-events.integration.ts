import { execFileSync } from "node:child_process";
import { createHmac,randomUUID } from "node:crypto";
import { afterEach,expect,it,vi } from "vitest";
vi.mock("@/lib/release/deployment-authorization", () => ({
  productionDeploymentAuthorized: async (env: Record<string, string | undefined>) => env.VERCEL_DEPLOYMENT_ID === "dpl_SyntheticEmailBuild",
}));
import { receiveProductionMarketingEvent } from "../../lib/production-marketing/events";
import { createProductionMarketingEventStorage } from "../../lib/production-marketing/event-storage";
import { handleProductionMarketingStatus } from "../../lib/production-marketing/operator-status";
const container=process.env.HELIX_SYNTHETIC_MARKETING_EVENTS_CONTAINER??"";
if(!/^helix-production-marketing-(541|542)-[0-9]+-[0-9]+$/.test(container)||process.env.DOCKER_HOST||process.env.DOCKER_CONTEXT)throw new Error("Owned local database required.");
const docker=(args:string[],input?:string)=>execFileSync("docker",args,{encoding:"utf8",input,stdio:["pipe","pipe","pipe"]});
if(!JSON.parse(docker(["context","inspect"]))[0].Endpoints.docker.Host.startsWith("unix://")||docker(["inspect","-f",'{{index .Config.Labels "helix.task"}}',container]).trim()!==`production-marketing-${container.split("-")[3]}-synthetic`)throw new Error("Owned local database required.");
const sql=(input:string)=>docker(["exec","-i",container,"psql","-X","-U","postgres","-d","postgres","-v","ON_ERROR_STOP=1","-Atq"],input).trim();
const literal=(v:unknown)=>v===null?"NULL":`'${String(v).replaceAll("'","''")}'`;
const origin="https://www.helixskin.us",signing=Buffer.from("synthetic-events-pg-signature-only").toString("base64");
const env={VERCEL:"1",VERCEL_ENV:"production",VERCEL_PROJECT_ID:"p",VERCEL_DEPLOYMENT_ID:"dpl_SyntheticEmailBuild",VERCEL_PROJECT_PRODUCTION_URL:"helixskin.us",
 HELIX_PRODUCTION_MARKETING_SITE_ORIGIN:origin,HELIX_PRODUCTION_MARKETING_VERCEL_PROJECT_ID:"p",HELIX_PRODUCTION_MARKETING_SUPABASE_URL:"https://erasogmsqpgiirovubjh.supabase.co",HELIX_PRODUCTION_MARKETING_SERVICE_KEY:"synthetic-event-db-only",
 HELIX_PRODUCTION_MARKETING_WEBHOOK_SECRET:`whsec_${signing}`,HELIX_PRODUCTION_MARKETING_EVENTS_ENABLED:"true",HELIX_PRODUCTION_MARKETING_STATUS_ENABLED:"true",NEXT_PUBLIC_SUPABASE_URL:"https://erasogmsqpgiirovubjh.supabase.co"};
const storage=createProductionMarketingEventStorage(env);let privateCalls=0;
const transport=vi.fn(async(input:string|URL|Request,init?:RequestInit)=>{
 const url=String(input),name=url.split("/").at(-1)!,headers=init?.headers as Record<string,string>;
 if(!url.startsWith(`${env.HELIX_PRODUCTION_MARKETING_SUPABASE_URL}/rest/v1/rpc/`)||!["record_production_marketing_event","read_production_marketing_status"].includes(name)||init?.method!=="POST"||headers.apikey!==env.HELIX_PRODUCTION_MARKETING_SERVICE_KEY||headers.Authorization!==`Bearer ${env.HELIX_PRODUCTION_MARKETING_SERVICE_KEY}`)throw new Error("External network forbidden.");
 const args=JSON.parse(String(init.body)) as Record<string,unknown>;if(Object.keys(args).some(k=>!/^p_[a-z_]+$/.test(k)))throw new Error("RPC argument mismatch.");privateCalls++;
 const raw=sql(`SET ROLE service_role;SELECT to_jsonb(public.${name}(${Object.entries(args).map(([k,v])=>`${k}=>${literal(v)}`).join(",")}));`);
 return Response.json(raw?JSON.parse(raw):null);
});
function signed(id:string,provider:string,type="email.delivered",eventId=`msg_${randomUUID()}`,alter=false){
 const recipient=sql(`SELECT recipient FROM private.production_marketing_messages WHERE id=${literal(id)};`),body=JSON.stringify({type,created_at:new Date().toISOString(),data:{email_id:provider,from:"news@helixskin.us",to:[recipient],tags:{environment:"production",helix_message_id:id,helix_purpose:"welcome",helix_contract:"production_welcome_delivery_v1"}}});
 const timestamp=String(Math.floor(Date.now()/1000)),signature=createHmac("sha256",Buffer.from(signing,"base64")).update(`${eventId}.${timestamp}.${body}`).digest("base64");
 return new Request(`${origin}/api/webhooks/marketing-production`,{method:"POST",body:body+(alter?" ":""),headers:{"svix-id":eventId,"svix-timestamp":timestamp,"svix-signature":`v1,${signature}`}});
}
afterEach(()=>vi.unstubAllGlobals());
it("uses real SDK signatures and the actual bounded database adapter, with duplicate/conflict and paused suppression outcomes",async()=>{
 vi.stubGlobal("fetch",transport);const lease=randomUUID(),id=sql(`SELECT public.test_event_prepared('adapter-events',${literal(lease)});`),provider=randomUUID();
 const before=privateCalls;expect((await receiveProductionMarketingEvent(signed(id,provider,"email.delivered",undefined,true),{env,record:storage.record})).status).toBe(400);expect(privateCalls).toBe(before);
 const request=signed(id,provider);expect((await receiveProductionMarketingEvent(request.clone(),{env,record:storage.record})).status).toBe(200);expect((await receiveProductionMarketingEvent(request,{env,record:storage.record})).status).toBe(200);
 expect(sql(`SELECT count(*) FROM private.production_marketing_events WHERE message_id=${literal(id)};`)).toBe("1");
 sql("UPDATE private.production_marketing_controls SET dispatch_enabled=false,enrollment_enabled=false;");
 expect((await receiveProductionMarketingEvent(signed(id,randomUUID(),"email.complained"),{env,record:storage.record})).status).toBe(200);
 expect(sql(`SELECT provider_id=${literal(provider)} AND reconciliation_required AND delivery_status='suppressed' FROM private.production_marketing_messages WHERE id=${literal(id)};`)).toBe("t");
 sql("UPDATE private.production_marketing_controls SET dispatch_enabled=true,enrollment_enabled=true;");
});
it("authorizes counts with actual canonical membership and keeps delivery separate from acceptance",async()=>{
 vi.stubGlobal("fetch",transport);const read=storage.status,request=new Request(`${origin}/api/internal/marketing/production/status`);
 for(const id of ["22222222-2222-4222-8222-222222222222","33333333-3333-4333-8333-333333333333"]){expect((await handleProductionMarketingStatus(request,{env,getUser:async()=>({id,user_metadata:{role:"admin"}}),read})).status).toBe(403);}
 const response=await handleProductionMarketingStatus(request,{env,getUser:async()=>({id:"11111111-1111-4111-8111-111111111111"}),read});expect(response.status).toBe(200);
 const data=await response.json();expect(Object.keys(data).length).toBe(11);expect(Object.values(data).every(n=>Number.isSafeInteger(n)&&Number(n)>=0)).toBe(true);expect(data.suppressedMessages).toBeGreaterThan(0);expect(data.uncertainMessages).toBeGreaterThan(0);expect(response.headers.get("Cache-Control")).toBe("private, no-store");
});
it("keeps the stored receiver and visibility switches independent and never treats unknown persistence as success",async()=>{
 vi.stubGlobal("fetch",transport);const id=sql(`SELECT public.test_event_prepared('adapter-off',${literal(randomUUID())});`);
 sql("UPDATE private.production_marketing_controls SET events_enabled=false;");expect((await receiveProductionMarketingEvent(signed(id,randomUUID()),{env,record:storage.record})).status).toBe(503);
 sql("UPDATE private.production_marketing_controls SET events_enabled=true,status_enabled=false;");expect(await storage.status("11111111-1111-4111-8111-111111111111")).toBeNull();
 sql("UPDATE private.production_marketing_controls SET status_enabled=true;");
 vi.stubGlobal("fetch",async()=>{throw new Error("unknown PRIVATE persistence");});const response=await receiveProductionMarketingEvent(signed(id,randomUUID()),{env,record:storage.record});expect(response.status).toBe(503);expect(await response.text()).toBe('{"ok":false}');
});
