import { productionMarketingTestTarget } from "./helpers/production-marketing-target";
import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/release/deployment-authorization", () => ({
  productionDeploymentAuthorized: async (env: Record<string, string | undefined>) => env.VERCEL_DEPLOYMENT_ID === "dpl_SyntheticEmailBuild",
}));
import { receiveProductionMarketingEvent } from "@/lib/production-marketing/events";
import { handleProductionMarketingStatus } from "@/lib/production-marketing/operator-status";
const origin="https://www.helixskin.us",signing=Buffer.from("synthetic-p3-signing-secret-only").toString("base64");
const env={...productionMarketingTestTarget,HELIX_PRODUCTION_MARKETING_EVENTS_ENABLED:"true",
  HELIX_PRODUCTION_MARKETING_WEBHOOK_SECRET:`whsec_${signing}`,HELIX_PRODUCTION_MARKETING_STATUS_ENABLED:"true"};
const event=()=>({type:"email.complained",created_at:new Date().toISOString(),data:{email_id:"11111111-1111-4111-8111-111111111111",from:"news@helixskin.us",to:["visitor@example.invalid"],
  tags:{environment:"production",helix_message_id:"22222222-2222-4222-8222-222222222222",helix_purpose:"welcome",helix_contract:"production_welcome_delivery_v1"}}});
function signed(value:unknown=event(),options:{timestamp?:string;alter?:boolean;id?:string}={}){
  const body=JSON.stringify(value),id=options.id??"msg_synthetic_p3",timestamp=options.timestamp??String(Math.floor(Date.now()/1000));
  const signature=createHmac("sha256",Buffer.from(signing,"base64")).update(`${id}.${timestamp}.${body}`).digest("base64");
  return new Request(`${origin}/api/webhooks/marketing-production`,{method:"POST",body:body+(options.alter?" ":""),headers:{"svix-id":id,"svix-timestamp":timestamp,"svix-signature":`v1,${signature}`}});
}
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
describe("dedicated signed production marketing receiver",()=>{
  it("verifies raw signatures locally before persisting only normalized prepared-message evidence",async()=>{
    const record=vi.fn().mockResolvedValue("recorded"),network=vi.fn(()=>{throw new Error("external network forbidden");});vi.stubGlobal("fetch",network);
    const input=event(),response=await receiveProductionMarketingEvent(signed(input),{env,record});
    expect(response.status).toBe(200);expect(await response.json()).toEqual({ok:true});expect(network).not.toHaveBeenCalled();
    expect(record).toHaveBeenCalledWith({eventId:"msg_synthetic_p3",messageId:input.data.tags.helix_message_id,providerId:input.data.email_id,eventType:input.type,
      occurredAt:input.created_at,sender:input.data.from,recipient:input.data.to[0],purpose:"welcome",contractVersion:"production_welcome_delivery_v1",environment:"production"});
  });
  it("preserves valid Unicode bytes and rejects malformed UTF-8 before verification/private calls",async()=>{
    const record=vi.fn().mockResolvedValue("recorded"),value={...event(),data:{...event().data,subject:"Unicode café 🎉 replacement \uFFFD"}};
    expect((await receiveProductionMarketingEvent(signed(value),{env,record})).status).toBe(200);record.mockClear();
    const valid=signed(value),raw=Buffer.from(await valid.arrayBuffer()),replacement=raw.indexOf(Buffer.from("\uFFFD"));
    expect(replacement).toBeGreaterThan(0);
    const altered=Buffer.concat([raw.subarray(0,replacement),Buffer.from([0xff]),raw.subarray(replacement+3)]);
    const request=new Request(valid.url,{method:"POST",headers:valid.headers,body:altered});
    expect((await receiveProductionMarketingEvent(request,{env,record})).status).toBe(400);expect(record).not.toHaveBeenCalled();
  });
  it("rejects altered signatures, stale/future signature timestamps and invalid event bindings before private calls",async()=>{
    const record=vi.fn();
    for(const request of [signed(event(),{alter:true}),signed(event(),{timestamp:"1"}),signed(event(),{timestamp:String(Math.floor(Date.now()/1000)+600)}),
      signed({...event(),created_at:"invalid"}),signed({...event(),created_at:"2026-02-31T12:00:00Z"}),signed({...event(),created_at:new Date(Date.now()+600000).toISOString()}),signed({...event(),data:{...event().data,to:["one@example.invalid","two@example.invalid"]}}),
      signed({...event(),data:{...event().data,tags:{...event().data.tags,environment:"sandbox"}}})]){
      expect((await receiveProductionMarketingEvent(request,{env,record})).status).toBe(400);
    }expect(record).not.toHaveBeenCalled();
  });
  it("defaults off and rejects wrong deployment or generic signing-secret reuse without private calls",async()=>{
    const record=vi.fn();
    for(const delta of [{HELIX_PRODUCTION_MARKETING_EVENTS_ENABLED:""},{VERCEL_ENV:"preview"},{RESEND_WEBHOOK_SECRET:env.HELIX_PRODUCTION_MARKETING_WEBHOOK_SECRET}]){
      expect((await receiveProductionMarketingEvent(signed(),{env:{...env,...delta},record})).status).toBe(503);
    }expect(record).not.toHaveBeenCalled();
  });
  it("bounds oversized and slow raw bodies and cancels the owned reader",async()=>{
    const record=vi.fn(),big=signed();big.headers.set("content-length",String(128*1024+1));
    expect((await receiveProductionMarketingEvent(big,{env,record})).status).toBe(413);
    expect((await receiveProductionMarketingEvent(signed({...event(),data:{...event().data,subject:"x".repeat(128*1024)}}),{env,record})).status).toBe(413);
    vi.useFakeTimers();const cancel=vi.fn(),base=signed(),slow=new Request(base.url,{method:"POST",headers:base.headers,body:new ReadableStream({cancel}),duplex:"half"} as RequestInit);
    const pending=receiveProductionMarketingEvent(slow,{env,record});await vi.advanceTimersByTimeAsync(3000);
    expect((await pending).status).toBe(400);expect(cancel).toHaveBeenCalledTimes(1);expect(record).not.toHaveBeenCalled();
  });
  it("never acknowledges unknown storage outcomes as success or exposes raw provider errors",async()=>{
    const record=vi.fn().mockResolvedValue("rejected");expect((await receiveProductionMarketingEvent(signed(),{env,record})).status).toBe(400);
    record.mockResolvedValue("paused");expect((await receiveProductionMarketingEvent(signed(),{env,record})).status).toBe(503);
    record.mockRejectedValue(new Error("PRIVATE visitor@example.invalid token raw payload"));
    const response=await receiveProductionMarketingEvent(signed(),{env,record});expect(response.status).toBe(503);expect(await response.text()).toBe('{"ok":false}');
  });
});
describe("production-bound Operator visibility",()=>{
  const user={id:"33333333-3333-4333-8333-333333333333",user_metadata:{role:"admin"}};
  const counts={pendingSubscribers:0,confirmedSubscribers:1,withdrawnSubscribers:0,suppressedSubscribers:1,queuedMessages:0,preparedMessages:0,acceptedMessages:1,deliveredMessages:0,suppressedMessages:1,failedMessages:0,uncertainMessages:1};
  const request=()=>new Request(`${origin}/api/internal/marketing/production/status`);
  it("binds the SSR production issuer before user verification or private reads",async()=>{
    const getUser=vi.fn(),read=vi.fn();
    expect((await handleProductionMarketingStatus(request(),{env:{...env,NEXT_PUBLIC_SUPABASE_URL:"https://other.supabase.co"},getUser,read})).status).toBe(503);
    expect(getUser).not.toHaveBeenCalled();expect(read).not.toHaveBeenCalled();
  });
  it("requires verified identity and canonical membership rather than user metadata or the worker bearer",async()=>{
    const getUser=vi.fn().mockResolvedValue(null),read=vi.fn().mockResolvedValue(null);
    expect((await handleProductionMarketingStatus(request(),{env,getUser,read})).status).toBe(401);expect(read).not.toHaveBeenCalled();
    getUser.mockResolvedValue(user);expect((await handleProductionMarketingStatus(request(),{env,getUser,read})).status).toBe(403);
    expect(read).toHaveBeenCalledWith(user.id);
  });
  it("returns only finite private counts and generic errors without actor, provider or subscriber data",async()=>{
    const getUser=vi.fn().mockResolvedValue(user),read=vi.fn().mockResolvedValue(counts);
    const response=await handleProductionMarketingStatus(request(),{env,getUser,read});expect(response.status).toBe(200);
    expect(await response.json()).toEqual(counts);expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    read.mockResolvedValue({...counts,email:"PRIVATE@example.invalid"});expect((await handleProductionMarketingStatus(request(),{env,getUser,read})).status).toBe(503);
    read.mockRejectedValue(new Error("PRIVATE token address"));expect(await (await handleProductionMarketingStatus(request(),{env,getUser,read})).text()).toBe('{"ok":false}');
  });
});
