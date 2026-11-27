import { productionMarketingTestTarget } from "./helpers/production-marketing-target";
import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/release/deployment-authorization", () => ({
  productionDeploymentAuthorized: async (env: Record<string, string | undefined>) => env.VERCEL_DEPLOYMENT_ID === "dpl_SyntheticEmailBuild",
}));
import { randomUUID } from "node:crypto";
import { dispatchProductionMarketing, type ProductionMarketingWorkerDependencies } from "@/tests/helpers/retired-production-marketing/worker";
import { productionMarketingTemplateHash } from "@/lib/production-marketing/templates";
import { directMarketingDeliveryContract, productionMarketingContractFingerprint } from "@/lib/production-marketing/delivery-config";
import { createProductionMarketingDeliveryStorage } from "@/lib/production-marketing/delivery-storage";
import { sealProductionMarketingCapabilities } from "@/lib/production-marketing/capabilities";

const origin = "https://www.helixskin.us";
const contract = () => ({ version: "production_welcome_delivery_v1", from: "news@helixskin.us", replyTo: "support@helixskin.us",
  topicId: "11111111-1111-4111-8111-111111111111", postalAddress: "Synthetic test address, not approved for delivery", templateHash: productionMarketingTemplateHash });
function fixture() {
  const env = { ...productionMarketingTestTarget,
    HELIX_PRODUCTION_MARKETING_CAPABILITY_KEY: "c".repeat(64), HELIX_PRODUCTION_MARKETING_CAPABILITY_KEY_ID: "test-v1",
    HELIX_PRODUCTION_MARKETING_DISPATCH_ENABLED: "true", HELIX_PRODUCTION_MARKETING_WORKER_TOKEN: "w".repeat(48),
    HELIX_PRODUCTION_MARKETING_PROVIDER_KEY: "synthetic-production-send", HELIX_PRODUCTION_MARKETING_PREFERENCE_KEY: "synthetic-separate-preference-read",
    HELIX_PRODUCTION_MARKETING_DELIVERY_CONTRACT: JSON.stringify(contract()) };
  const sealed = sealProductionMarketingCapabilities("visitor@example.invalid", env);
  const intent = { id: randomUUID(), subscriberId: randomUUID(), email: "visitor@example.invalid", purpose: "confirmation" as "confirmation" | "welcome",
    generation: 1, revision: 1, requestId: sealed.deliveryPayload.requestId, issuedAt: sealed.deliveryPayload.issuedAt, expiresAt: sealed.deliveryPayload.expiresAt,
    confirmationHash: sealed.confirmationHash, preferenceHash: sealed.preferenceHash, envelope: sealed.deliveryPayload, prepared: null };
  const storage = { cleanup: vi.fn().mockResolvedValue(0), claim: vi.fn().mockResolvedValue(intent),
    prepare: vi.fn().mockImplementation(async (_id, _lease, body: string) => ({ body, idempotencyKey: `production-marketing/${intent.id}`,
      firstPreparedAt: new Date().toISOString(), admittedAt: new Date().toISOString(), payloadExpiresAt: intent.expiresAt, leaseUntil: new Date(Date.now()+60_000).toISOString() })),
    admitRetry: vi.fn(), finish: vi.fn().mockResolvedValue(true), defer: vi.fn().mockResolvedValue(true) };
  const provider = { permission: vi.fn().mockResolvedValue(true), send: vi.fn().mockResolvedValue({ kind: "accepted", id: randomUUID() }) };
  const deps: ProductionMarketingWorkerDependencies = { env, storage, provider };
  const request = (token: string | null = env.HELIX_PRODUCTION_MARKETING_WORKER_TOKEN) => new Request(`${origin}/api/internal/marketing/production/dispatch`, { method: "POST", headers: token ? { authorization: `Bearer ${token}` } : {} });
  return { env, intent, storage, provider, deps, request };
}

describe("production marketing worker boundary", () => {
  it("authenticates its independent caller before cleanup, claims, quota or provider work", async () => {
    const f=fixture();
    for (const token of [null, "wrong"]) expect((await dispatchProductionMarketing(f.request(token), f.deps)).status).toBe(401);
    expect(f.storage.cleanup).not.toHaveBeenCalled(); expect(f.storage.claim).not.toHaveBeenCalled(); expect(f.provider.send).not.toHaveBeenCalled();
  });
  it("stays off by default and rejects deployment, template and shared-credential drift before claims", async () => {
    for (const delta of [{ HELIX_PRODUCTION_MARKETING_DISPATCH_ENABLED: "" }, { VERCEL_ENV: "preview" }, { VERCEL_PROJECT_PRODUCTION_URL: "helixskin.vercel.app" },
      { HELIX_PRODUCTION_MARKETING_DELIVERY_CONTRACT: JSON.stringify({ ...contract(), templateHash: "0".repeat(64) }) },
      { HELIX_PRODUCTION_MARKETING_DELIVERY_CONTRACT: JSON.stringify({ ...contract(), from: "news@helixskin.us\n" }) }, { HELIX_PRODUCTION_MARKETING_PROVIDER_KEY: productionMarketingTestTarget.SUPABASE_SERVICE_ROLE_KEY }]) {
      const f=fixture(); Object.assign(f.env,delta);
      expect((await dispatchProductionMarketing(f.request(),f.deps)).status).toBe(503);
      expect(f.storage.cleanup).not.toHaveBeenCalled(); expect(f.storage.claim).not.toHaveBeenCalled(); expect(f.provider.send).not.toHaveBeenCalled();
    }
  });
  it("authenticates the entire held binding, freezes exact confirmation content and returns acceptance separately from delivery", async () => {
    const f=fixture(), response=await dispatchProductionMarketing(f.request(),f.deps);
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ status: "accepted" });
    expect(f.storage.cleanup).toHaveBeenCalledBefore(f.storage.claim);
    const body=JSON.parse(f.provider.send.mock.calls[0][0]);
    expect(body.to).toEqual([f.intent.email]); expect(body.from).toBe(contract().from);
    expect(body.html).toContain(`${origin}/marketing/production/confirm#token=`);
    expect(body.text).toContain("ignore this email");
    expect(body.tags).toContainEqual({name:"helix_message_id",value:f.intent.id});
    expect(f.storage.prepare.mock.calls[0][4]).toBe(productionMarketingContractFingerprint(JSON.stringify(contract())));
    expect(f.provider.permission).not.toHaveBeenCalled();
  });
  it("never prepares or sends a tampered or rebound held capability", async () => {
    for (const change of ["recipient","hash","ciphertext"]) {
      const f=fixture();
      if(change==="recipient") f.intent.email="other@example.invalid";
      if(change==="hash") f.intent.confirmationHash="0".repeat(64);
      if(change==="ciphertext") f.intent.envelope.ciphertext=(f.intent.envelope.ciphertext[0]==="A"?"B":"A")+f.intent.envelope.ciphertext.slice(1);
      expect((await dispatchProductionMarketing(f.request(),f.deps)).status).toBe(503);
      expect(f.storage.prepare).not.toHaveBeenCalled(); expect(f.provider.send).not.toHaveBeenCalled();
    }
  });
  it("resolves only explicitly retained capability key IDs and rejects a changed expiry binding",async()=>{
    const f=fixture();Object.assign(f.env,{HELIX_PRODUCTION_MARKETING_CAPABILITY_KEY:"d".repeat(64),HELIX_PRODUCTION_MARKETING_CAPABILITY_KEY_ID:"new-key"});
    expect((await dispatchProductionMarketing(f.request(),f.deps)).status).toBe(503);expect(f.provider.send).not.toHaveBeenCalled();
    Object.assign(f.env,{HELIX_PRODUCTION_MARKETING_CAPABILITY_KEYS:JSON.stringify({"test-v1":"c".repeat(64)})});
    expect(await (await dispatchProductionMarketing(f.request(),f.deps)).json()).toEqual({status:"accepted"});
    const g=fixture();g.intent.expiresAt=new Date(Date.now()-1).toISOString();g.intent.envelope.expiresAt=g.intent.expiresAt;
    expect((await dispatchProductionMarketing(g.request(),g.deps)).status).toBe(503);expect(g.storage.prepare).not.toHaveBeenCalled();expect(g.provider.send).not.toHaveBeenCalled();
  });
  it("defers welcome on native denial, unknown preference or missing separately qualified read capability", async () => {
    for(const mode of ["deny","error","missing"]) {
      const f=fixture(); f.intent.purpose="welcome";
      if(mode==="deny") f.provider.permission.mockResolvedValue(false);
      if(mode==="error") f.provider.permission.mockRejectedValue(new Error("private address and payload"));
      if(mode==="missing") f.env.HELIX_PRODUCTION_MARKETING_PREFERENCE_KEY="";
      expect(await (await dispatchProductionMarketing(f.request(),f.deps)).json()).toEqual({status:"deferred"});
      expect(f.storage.prepare).not.toHaveBeenCalled(); expect(f.provider.send).not.toHaveBeenCalled();
    }
  });
  it("freezes a separate welcome withdrawal capability and RFC8058 production headers", async () => {
    const f=fixture();f.intent.purpose="welcome";
    expect(await (await dispatchProductionMarketing(f.request(),f.deps)).json()).toEqual({status:"accepted"});
    const body=JSON.parse(f.storage.prepare.mock.calls[0][2]), hash=f.storage.prepare.mock.calls[0][3];
    expect(hash).toMatch(/^[a-f0-9]{64}$/); expect(hash).not.toBe(f.intent.preferenceHash);
    expect(body.headers["List-Unsubscribe"]).toMatch(/^<https:\/\/www\.helixskin\.us\/api\/marketing\/production\/unsubscribe\?token=[A-Za-z0-9_-]{43}>$/);
    expect(body.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(body.text).not.toMatch(/discount|review request|cart reminder/i);
  });
  it("sends a new direct welcome with its Topic and first-party withdrawal without reading Contact history", async () => {
    const f = fixture();
    f.intent.purpose = "welcome";
    Object.assign(f.intent, { direct: true });
    const direct = directMarketingDeliveryContract;
    f.env.HELIX_PRODUCTION_MARKETING_DELIVERY_CONTRACT = JSON.stringify(direct);
    f.env.HELIX_PRODUCTION_MARKETING_PREFERENCE_KEY = "";
    expect(await (await dispatchProductionMarketing(f.request(), f.deps)).json()).toEqual({ status: "accepted" });
    expect(f.provider.permission).not.toHaveBeenCalled();
    const body = JSON.parse(f.storage.prepare.mock.calls[0][2]);
    expect(body.topic_id).toBe(direct.topicId);
    expect([body.from, body.reply_to]).toEqual([direct.from, direct.replyTo]);
    expect(body.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(body.text.includes("https://www.helixskin.us/marketing/production/preferences#token=")).toBe(true);
  });
  it("blocks direct claims during an intake outage and refuses an unmarked direct RPC response", async () => {
    const f = fixture();
    const env = { ...f.env, CRON_SECRET: "k".repeat(48), HELIX_PRODUCTION_MARKETING_ABUSE_KEY: "a".repeat(48),
      HELIX_PRODUCTION_MARKETING_PROVIDER_KEY: "re_synthetic_send_only",
      HELIX_PRODUCTION_MARKETING_DELIVERY_CONTRACT: JSON.stringify(directMarketingDeliveryContract),
      HELIX_PRODUCTION_MARKETING_EVENTS_ENABLED: "false",
      HELIX_PRODUCTION_MARKETING_WEBHOOK_SECRET: "whsec_" + Buffer.alloc(32, 7).toString("base64") };
    const db = createProductionMarketingDeliveryStorage(env);
    const network = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json(f.intent));
    try {
      await expect(db.claim(randomUUID())).rejects.toThrow("Production marketing is unavailable.");
      expect(network).not.toHaveBeenCalled();
      env.HELIX_PRODUCTION_MARKETING_EVENTS_ENABLED = "true";
      await expect(db.claim(randomUUID())).rejects.toThrow("Production marketing is unavailable.");
      expect(String(network.mock.calls[0][0])).toBe(env.NEXT_PUBLIC_SUPABASE_URL + "/rest/v1/rpc/claim_direct_production_marketing_message");
    } finally { network.mockRestore(); }
  });
  it("does not send after an unknown prepare result or create another payload to recover an uncertain write", async () => {
    const f=fixture();f.storage.prepare.mockRejectedValue(new Error("unknown write PRIVATE"));
    expect((await dispatchProductionMarketing(f.request(),f.deps)).status).toBe(503);
    expect(f.storage.prepare).toHaveBeenCalledTimes(1);expect(f.storage.defer).not.toHaveBeenCalled();expect(f.provider.send).not.toHaveBeenCalled();
  });
  it("requires fresh durable retry admission and uses the exact stored bytes and key", async () => {
    const f=fixture();f.intent.purpose="welcome";
    const prepared={body:'{"frozen":"synthetic"}',idempotencyKey:`production-marketing/${f.intent.id}`,firstPreparedAt:new Date().toISOString(),admittedAt:new Date().toISOString(),payloadExpiresAt:f.intent.expiresAt,leaseUntil:new Date(Date.now()+60000).toISOString()};
    Object.assign(f.intent,{prepared});f.storage.admitRetry.mockResolvedValue(prepared);
    await dispatchProductionMarketing(f.request(),f.deps);
    expect(f.storage.prepare).not.toHaveBeenCalled();expect(f.provider.send).toHaveBeenCalledWith(prepared.body,prepared.idempotencyKey,prepared.payloadExpiresAt,f.env);
    f.provider.send.mockClear();f.storage.admitRetry.mockResolvedValue(null);
    expect(await (await dispatchProductionMarketing(f.request(),f.deps)).json()).toEqual({status:"deferred"});expect(f.provider.send).not.toHaveBeenCalled();
  });
  it("holds a worker paused across a UTC allocation boundary before provider handoff",async()=>{
    const f=fixture();const prepare=f.storage.prepare.getMockImplementation()!;
    f.storage.prepare.mockImplementation(async(...args:Parameters<typeof prepare>)=>({...await prepare(...args),admittedAt:new Date(Date.now()-86400000).toISOString()}));
    expect(await (await dispatchProductionMarketing(f.request(),f.deps)).json()).toEqual({status:"deferred"});expect(f.provider.send).not.toHaveBeenCalled();
  });
  it("keeps provider and finish uncertainty generic and never claims delivery or retries in the invocation", async () => {
    const f=fixture();f.provider.send.mockResolvedValue({kind:"uncertain",id:undefined});
    expect(await (await dispatchProductionMarketing(f.request(),f.deps)).json()).toEqual({status:"uncertain"});
    expect(f.provider.send).toHaveBeenCalledTimes(1);
    const g=fixture();g.storage.finish.mockRejectedValue(new Error("PRIVATE visitor@example.invalid"));
    expect(await (await dispatchProductionMarketing(g.request(),g.deps)).text()).toBe('{"status":"unavailable"}');
    expect(g.provider.send).toHaveBeenCalledTimes(1);expect(g.storage.finish).toHaveBeenCalledTimes(1);
  });
});
