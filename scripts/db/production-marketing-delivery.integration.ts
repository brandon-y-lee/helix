import { productionMarketingTestTarget } from "../../tests/helpers/production-marketing-target";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("@/lib/release/deployment-authorization", () => ({
  productionDeploymentAuthorized: async (env: Record<string, string | undefined>) => env.VERCEL_DEPLOYMENT_ID === "dpl_SyntheticEmailBuild",
}));
import { dispatchProductionMarketing } from "../../lib/production-marketing/worker";
import { productionMarketingProvider } from "../../lib/production-marketing/delivery-provider";
import { createProductionMarketingDeliveryStorage } from "../../lib/production-marketing/delivery-storage";
import { retainedMarketingSignup } from "./retained-marketing-signup";
import { confirmationWorkerQualification } from "../../lib/production-marketing/delivery-config";
import { handleProductionMarketingRequest, handleProductionMarketingUnsubscribe } from "../../lib/production-marketing/requests";
import { productionMarketingTemplateHash } from "../../lib/production-marketing/templates";
import { sealProductionMarketingCapabilities } from "../../lib/production-marketing/capabilities";
const container=process.env.HELIX_SYNTHETIC_MARKETING_DELIVERY_CONTAINER??"";
if(!/^helix-production-marketing-(540|541|542)-[0-9]+-[0-9]+$/.test(container)||process.env.DOCKER_HOST||process.env.DOCKER_CONTEXT)throw new Error("Owned local database required.");
const docker=(args:string[],input?:string)=>execFileSync("docker",args,{encoding:"utf8",input,stdio:["pipe","pipe","pipe"]});
if(!JSON.parse(docker(["context","inspect"]))[0].Endpoints.docker.Host.startsWith("unix://")||docker(["inspect","-f",'{{index .Config.Labels "helix.task"}}',container]).trim()!==`production-marketing-${container.split("-")[3]}-synthetic`)throw new Error("Owned local database required.");
function sql(input:string){try{return docker(["exec","-i",container,"psql","-X","-U","postgres","-d","postgres","-v","ON_ERROR_STOP=1","-Atq"],input).trim();}catch{throw new Error("Synthetic database operation failed.");}}
const literal=(v:unknown)=>v===null?"NULL":typeof v==="boolean"?String(v):typeof v==="number"?String(v):`'${(typeof v==="string"?v:JSON.stringify(v)).replaceAll("'","''")}'`;
const origin="https://www.helixskin.us",topic="11111111-1111-4111-8111-111111111111";
const contract={version:"production_welcome_delivery_v1",from:"news@helixskin.us",replyTo:"support@helixskin.us",topicId:topic,postalAddress:"Synthetic test only",templateHash:productionMarketingTemplateHash};
const env={...productionMarketingTestTarget,
  HELIX_PRODUCTION_MARKETING_ENABLED:"true",HELIX_PRODUCTION_MARKETING_ABUSE_KEY:"a".repeat(64),HELIX_PRODUCTION_MARKETING_CAPABILITY_KEY:"c".repeat(64),HELIX_PRODUCTION_MARKETING_CAPABILITY_KEY_ID:"synthetic-v1",
  HELIX_PRODUCTION_MARKETING_EVENTS_ENABLED:"true",HELIX_PRODUCTION_MARKETING_WEBHOOK_SECRET:"whsec_"+Buffer.from("local-only-confirmation-webhook").toString("base64"),
  HELIX_PRODUCTION_MARKETING_WORKER_TOKEN:"w".repeat(48),HELIX_PRODUCTION_MARKETING_DISPATCH_ENABLED:"true",HELIX_PRODUCTION_MARKETING_PROVIDER_KEY:"synthetic-send-only",
  HELIX_PRODUCTION_MARKETING_PREFERENCE_KEY:"synthetic-separate-read",HELIX_PRODUCTION_MARKETING_DELIVERY_CONTRACT:JSON.stringify(contract)};
const permitted=new Set(["production_marketing_enrollment_ready","request_qualified_production_marketing_subscription","confirm_production_marketing_subscription","withdraw_production_marketing_subscription",
  "cleanup_production_marketing_delivery","claim_production_marketing_message","prepare_production_marketing_message","retry_production_marketing_message","finish_production_marketing_message","defer_production_marketing_message"]);
const sends:{body:string;key:string}[]=[];let rpcCalls=0,faultAfterRpc="",sendUncertain=false,nativeAllowed=true;
const transport=vi.fn(async(input:string|URL|Request,init?:RequestInit):Promise<Response>=>{
  const url=String(input),headers=init?.headers as Record<string,string>;
  if(url.startsWith(`${env.HELIX_PRODUCTION_MARKETING_SUPABASE_URL}/rest/v1/rpc/`)){
    const name=url.split("/").at(-1)!;
    if(!permitted.has(name)||init?.method!=="POST"||headers.apikey!==env.SUPABASE_SERVICE_ROLE_KEY||headers.Authorization!==undefined)throw new Error("Synthetic RPC contract mismatch.");
    rpcCalls++;
    const args=JSON.parse(String(init.body)) as Record<string,unknown>;
    if(Object.keys(args).some(k=>!/^p_[a-z_]+$/.test(k)))throw new Error("Synthetic RPC argument mismatch.");
    const raw=sql(`SET ROLE service_role;SELECT to_jsonb(public.${name}(${Object.entries(args).map(([k,v])=>`${k}=>${literal(v)}`).join(",")}));`);
    if(faultAfterRpc===name){faultAfterRpc="";throw new Error("Synthetic unknown durable result.");}
    return Response.json(raw?JSON.parse(raw):null);
  }
  if(url==="https://api.resend.com/emails"){
    if(init?.method!=="POST"||headers.Authorization!==`Bearer ${env.HELIX_PRODUCTION_MARKETING_PROVIDER_KEY}`)throw new Error("Synthetic send contract mismatch.");
    sends.push({body:String(init.body),key:headers["Idempotency-Key"]});
    return sendUncertain?new Response("",{status:500}):Response.json({id:randomUUID()});
  }
  if(url.startsWith("https://api.resend.com/contacts/")){
    if(headers.Authorization!==`Bearer ${env.HELIX_PRODUCTION_MARKETING_PREFERENCE_KEY}`||(init?.method??"GET")!=="GET")throw new Error("Synthetic preference contract mismatch.");
    if(url.includes("/topics?"))return Response.json({data:[{id:topic,subscription:nativeAllowed?"opt_in":"opt_out"}],has_more:false});
    return Response.json({id:"55555555-5555-4555-8555-555555555555",email:decodeURIComponent(url.split("/").at(-1)!),unsubscribed:false});
  }
  throw new Error("External network is forbidden in this proof.");
});
const storage=createProductionMarketingDeliveryStorage(env),requests=retainedMarketingSignup(env, sql);
const workerRequest=()=>new Request(`${origin}/api/internal/marketing/production/dispatch`,{method:"POST",headers:{authorization:`Bearer ${env.HELIX_PRODUCTION_MARKETING_WORKER_TOKEN}`}});
const worker=()=>dispatchProductionMarketing(workerRequest(),{env,storage,provider:productionMarketingProvider});
const human=(action:string,body:unknown)=>new Request(`${origin}/api/marketing/production/${action}`,{method:"POST",headers:{origin,"content-type":"application/json","x-vercel-forwarded-for":"192.0.2.1"},body:JSON.stringify(body)});
async function enroll(label:string){expect((await handleProductionMarketingRequest(human("subscription",{email:`${label}@example.invalid`,consent:true}),"subscription",{env,storage:requests})).status).toBe(202);}
const message=(label:string,purpose="confirmation")=>JSON.parse(sql(`SELECT jsonb_build_object('id',m.id,'state',m.state,'body',m.body_text,'hash',m.body_hash,'providerId',m.provider_id,'reconciliation',m.reconciliation_required)
  FROM private.production_marketing_messages m JOIN private.production_marketing_subscribers s ON s.id=m.subscriber_id WHERE s.normalized_email=${literal(label+"@example.invalid")} AND m.purpose=${literal(purpose)};`)) as {id:string;state:string;body:string|null;hash:string|null;providerId:string|null;reconciliation:boolean};
beforeEach(()=>{sends.length=0;rpcCalls=0;faultAfterRpc="";sendUncertain=false;nativeAllowed=true;vi.stubGlobal("fetch",transport);sql(`UPDATE private.production_marketing_controls SET enrollment_enabled=true,dispatch_enabled=true,daily_limit=100,monthly_limit=1000,delivery_contract_text=${literal(JSON.stringify(contract))}; UPDATE private.production_marketing_controls SET confirmation_worker_binding_hash=${literal(confirmationWorkerQualification(env).p_worker_binding_hash)};`);});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
function seedAgedRequest(label:string) {
  const now=Date.now();
  vi.useFakeTimers({toFake:["Date"]});vi.setSystemTime(now-86_400_000+30_000);
  const sealed=sealProductionMarketingCapabilities(`${label}@example.invalid`,env);
  vi.useRealTimers();
  const subscriber=randomUUID(),id=randomUUID(),e=sealed.deliveryPayload;
  // Owned historical fixture: the real issuance API correctly rejects a caller's backdated request.
  // All persisted fields and the authenticated envelope represent the same valid prior issuance.
  sql(`BEGIN;INSERT INTO private.production_marketing_subscribers(id,normalized_email,state) VALUES(${literal(subscriber)},${literal(label+"@example.invalid")},'pending');
    INSERT INTO private.production_marketing_generations(subscriber_id,generation,request_revision,wording_version,requested_at,expires_at,confirmation_hash,preference_hash)
      VALUES(${literal(subscriber)},1,1,'production_welcome_v1',${literal(e.issuedAt)},${literal(e.expiresAt)},${literal(sealed.confirmationHash)},${literal(sealed.preferenceHash)});
    INSERT INTO private.production_marketing_evidence(subscriber_id,generation,revision,event) VALUES(${literal(subscriber)},1,1,'requested');
    INSERT INTO private.production_marketing_confirmation_intents(id,subscriber_id,generation,request_revision,request_id,delivery_payload,expires_at,created_at)
      VALUES(${literal(id)},${literal(subscriber)},1,1,${literal(e.requestId)},${literal(JSON.stringify(e))}::jsonb,${literal(e.expiresAt)},${literal(e.issuedAt)});COMMIT;`);
  return {id,expiresAt:e.expiresAt,issuedAt:e.issuedAt};
}

it("runs real production consent, worker/storage/provider adapters, explicit confirmation and independent paused withdrawal through PostgreSQL",async()=>{
  expect((await dispatchProductionMarketing(new Request(`${origin}/api/internal/marketing/production/dispatch`,{method:"POST"}),{env,storage,provider:productionMarketingProvider})).status).toBe(401);
  expect(rpcCalls).toBe(0);expect(sends.length).toBe(0);
  await enroll("real-journey");
  expect(await (await worker()).json()).toEqual({status:"accepted"});expect(sends.length).toBe(1);
  const first=message("real-journey");expect(first.state).toBe("accepted");expect(first.body===sends[0].body).toBe(true);
  expect(sql(`SELECT m.payload_expires_at=g.expires_at FROM private.production_marketing_messages m JOIN private.production_marketing_generations g USING(subscriber_id,generation) WHERE m.id=${literal(first.id)};`)).toBe("t");
  expect(sql(`SELECT delivery_payload IS NULL FROM private.production_marketing_confirmation_intents WHERE id=${literal(first.id)};`)).toBe("t");
  const confirmation=/\/confirm#token=([A-Za-z0-9_-]{43})/.exec(JSON.parse(sends[0].body).text)![1];
  for(const method of ["GET","HEAD"])expect((await handleProductionMarketingRequest(new Request(`${origin}/api/marketing/production/confirm`,{method}),"confirm",{env,storage:requests})).status).toBe(405);
  expect((await handleProductionMarketingRequest(human("confirm",{token:confirmation}),"confirm",{env,storage:requests})).status).toBe(200);
  expect((await handleProductionMarketingRequest(human("confirm",{token:confirmation}),"confirm",{env,storage:requests})).status).toBe(200);
  nativeAllowed=false;
  expect(await (await worker()).json()).toEqual({status:"deferred"});expect(sends.length).toBe(1);
  const welcome=message("real-journey","welcome");expect(welcome.state).toBe("held");expect(welcome.body===null).toBe(true);
  expect(sql(`SELECT count(*) FROM private.production_marketing_quota_reservations WHERE message_id=${literal(welcome.id)};`)).toBe("0");
  nativeAllowed=true;sql(`UPDATE private.production_marketing_messages SET next_attempt_at=clock_timestamp()-interval '1 second' WHERE id=${literal(welcome.id)};`);
  expect(await (await worker()).json()).toEqual({status:"accepted"});expect(sends.length).toBe(2);
  const body=JSON.parse(sends[1].body),token=/token=([A-Za-z0-9_-]{43})/.exec(body.headers["List-Unsubscribe"])![1];
  expect(token===confirmation).toBe(false);
  sql("UPDATE private.production_marketing_controls SET enrollment_enabled=false,dispatch_enabled=false;");
  const unsub=new Request(`${origin}/api/marketing/production/unsubscribe?token=${token}`,{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:"List-Unsubscribe=One-Click"});
  expect((await handleProductionMarketingUnsubscribe(unsub,{env:{...env,HELIX_PRODUCTION_MARKETING_ENABLED:"false"},storage:requests})).status).toBe(200);
  expect(sql("SELECT state FROM private.production_marketing_subscribers WHERE normalized_email='real-journey@example.invalid';")).toBe("withdrawn");
},30000);

it("holds an unknown durable preparation and never automatically reclaims it to send",async()=>{
  await enroll("lost-prepare");faultAfterRpc="prepare_production_marketing_message";
  expect((await worker()).status).toBe(503);expect(sends.length).toBe(0);
  const m=message("lost-prepare");expect(m.state).toBe("prepared");expect(m.body!==null).toBe(true);
  sql(`UPDATE private.production_marketing_messages SET lease_until=clock_timestamp()-interval '1 second' WHERE id=${literal(m.id)};`);
  expect(await (await worker()).json()).toEqual({status:"idle"});expect(sends.length).toBe(0);
},20000);

it("retries only durably known uncertainty inside the window with identical bytes, key and deduplicated allocation",async()=>{
  await enroll("known-uncertain");sendUncertain=true;
  expect(await (await worker()).json()).toEqual({status:"uncertain"});
  const m=message("known-uncertain");expect(m.state).toBe("uncertain");
  sql(`UPDATE private.production_marketing_messages SET next_attempt_at=clock_timestamp()-interval '1 second' WHERE id=${literal(m.id)};`);sendUncertain=false;
  expect(await (await worker()).json()).toEqual({status:"accepted"});expect(sends.length).toBe(2);
  expect(sends[0].body===sends[1].body && sends[0].key===sends[1].key).toBe(true);
  expect(sql(`SELECT count(*) FROM private.production_marketing_quota_reservations WHERE message_id=${literal(m.id)};`)).toBe("2");
},20000);

it("preserves the first prepared handoff after withdrawal but prevents a subsequent retry",async()=>{
  await enroll("paused-prepared");
  const wrapped={...storage,prepare:async(...args:Parameters<typeof storage.prepare>)=>{
    const p=await storage.prepare(...args);
    if(p)sql(`SELECT public.withdraw_production_marketing_subscription((SELECT g.preference_hash FROM private.production_marketing_generations g JOIN private.production_marketing_messages m USING(subscriber_id,generation) WHERE m.id=${literal(args[0])}));`);
    return p;
  }};
  sendUncertain=true;
  expect(await (await dispatchProductionMarketing(workerRequest(),{env,storage:wrapped,provider:productionMarketingProvider})).json()).toEqual({status:"uncertain"});expect(sends.length).toBe(1);
  const m=message("paused-prepared");sql(`UPDATE private.production_marketing_messages SET next_attempt_at=clock_timestamp()-interval '1 second' WHERE id=${literal(m.id)};`);
  expect(await (await worker()).json()).toEqual({status:"idle"});expect(sends.length).toBe(1);expect(message("paused-prepared").reconciliation).toBe(true);
},20000);

it("does not resend after acceptance persisted but the finish response was lost",async()=>{
  await enroll("lost-finish");faultAfterRpc="finish_production_marketing_message";
  expect((await worker()).status).toBe(503);expect(sends.length).toBe(1);expect(message("lost-finish").state).toBe("accepted");
  expect(await (await worker()).json()).toEqual({status:"idle"});expect(sends.length).toBe(1);
},20000);

it("prepares a valid authenticated aged request without restarting its original confirmation deadline",async()=>{
  const source=seedAgedRequest("aged-valid");
  expect(await (await worker()).json()).toEqual({status:"accepted"});expect(sends.length).toBe(1);
  expect(sql(`SELECT private.production_marketing_iso(payload_expires_at)=${literal(source.expiresAt)} AND first_prepared_at>${literal(source.issuedAt)}::timestamptz+interval '23 hours' FROM private.production_marketing_messages WHERE id=${literal(source.id)};`)).toBe("t");
  expect(message("aged-valid").state).toBe("accepted");
},20000);

it("blocks provider handoff when an authenticated aged request expires after real durable preparation",async()=>{
  const source=seedAgedRequest("aged-paused");let preparedBeforeExpiry=false;
  const wrapped={...storage,prepare:async(...args:Parameters<typeof storage.prepare>)=>{
    const p=await storage.prepare(...args);
    expect(p!==null).toBe(true);
    if(p){
      expect(p.payloadExpiresAt===source.expiresAt).toBe(true);
      preparedBeforeExpiry=Date.parse(p.payloadExpiresAt)>Date.now();
      expect(Date.parse(p.leaseUntil)>Date.parse(p.payloadExpiresAt)+1).toBe(true);
      vi.useFakeTimers({toFake:["Date"]});vi.setSystemTime(Date.parse(p.payloadExpiresAt)+1);
    }
    return p;
  }};
  expect(await (await dispatchProductionMarketing(workerRequest(),{env,storage:wrapped,provider:productionMarketingProvider})).json()).toEqual({status:"deferred"});
  expect(preparedBeforeExpiry).toBe(true);expect(sends.length).toBe(0);
  expect(message("aged-paused").state).toBe("prepared");
},20000);
