import { afterEach, expect, it, vi } from "vitest";
import { createProductionMarketingStorage } from "@/lib/production-marketing/storage";

const env = { VERCEL: "1", VERCEL_ENV: "production", VERCEL_PROJECT_ID: "prj_test", VERCEL_DEPLOYMENT_ID: "dpl_test",
  VERCEL_PROJECT_PRODUCTION_URL: "www.helixskin.us", HELIX_PRODUCTION_MARKETING_SITE_ORIGIN: "https://www.helixskin.us",
  HELIX_PRODUCTION_MARKETING_VERCEL_PROJECT_ID: "prj_test", HELIX_PRODUCTION_MARKETING_DEPLOYMENT_ID: "dpl_test",
  HELIX_PRODUCTION_MARKETING_SUPABASE_URL: "https://erasogmsqpgiirovubjh.supabase.co", HELIX_PRODUCTION_MARKETING_SERVICE_KEY: "synthetic-dedicated-key" };
afterEach(() => vi.unstubAllGlobals());
it("uses only dedicated production RPC transport with hashed inputs and never retries an unknown write", async () => {
  const network = vi.fn().mockResolvedValue(new Response("true", { headers: { "content-type": "application/json" } }));
  vi.stubGlobal("fetch", network);
  const storage = createProductionMarketingStorage(env);
  expect(await storage.confirm("a".repeat(64))).toBe(true);
  expect(String(network.mock.calls[0][0])).toBe("https://erasogmsqpgiirovubjh.supabase.co/rest/v1/rpc/confirm_production_marketing_subscription");
  expect(JSON.parse(network.mock.calls[0][1].body)).toEqual({ p_token_hash: "a".repeat(64) });
  network.mockReset().mockRejectedValue(new Error("secret visitor@example.invalid"));
  await expect(storage.withdraw("b".repeat(64))).rejects.toThrow("Production marketing is unavailable.");
  expect(network).toHaveBeenCalledTimes(1);
});
it("never falls back to generic credentials or touches network on a wrong environment", async () => {
  const network = vi.fn(); vi.stubGlobal("fetch", network);
  const storage = createProductionMarketingStorage({ ...env, HELIX_PRODUCTION_MARKETING_SERVICE_KEY: undefined, SUPABASE_SERVICE_ROLE_KEY: "generic" });
  await expect(storage.confirm("a".repeat(64))).rejects.toThrow("Production marketing is unavailable.");
  expect(network).not.toHaveBeenCalled();
});

it("treats malformed or oversized durable responses as unknown without leaking or automatic retry", async () => {
  for (const body of ['{"token":"PRIVATE_CAPABILITY","email":"visitor@example.invalid"}', 'x'.repeat(129)]) {
    const network = vi.fn().mockResolvedValue(new Response(body, { headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", network);
    await expect(createProductionMarketingStorage(env).withdraw("a".repeat(64))).rejects.toThrow("Production marketing is unavailable.");
    expect(network).toHaveBeenCalledTimes(1);
  }
});

it("composes the public production route with dedicated hashed and encrypted seven-argument RPC admission", async () => {
  const { POST } = await import("@/app/api/marketing/production/subscription/route");
  for (const [key,value] of Object.entries({...env,HELIX_PRODUCTION_MARKETING_ENABLED:"true",HELIX_PRODUCTION_MARKETING_CAPABILITY_KEY:"c".repeat(64),
    HELIX_PRODUCTION_MARKETING_CAPABILITY_KEY_ID:"synthetic-v1",HELIX_PRODUCTION_MARKETING_ABUSE_KEY:"b".repeat(64)})) vi.stubEnv(key,value);
  const network = vi.fn().mockResolvedValue(new Response("true",{headers:{"content-type":"application/json"}}));
  vi.stubGlobal("fetch",network);
  try {
    const result = await POST(new Request("https://www.helixskin.us/api/marketing/production/subscription", {method:"POST",headers:{origin:"https://www.helixskin.us","content-type":"application/json","x-vercel-forwarded-for":"192.0.2.1"},body:JSON.stringify({email:"synthetic@example.invalid",consent:true})}));
    expect([result.status,await result.text()]).toEqual([202,'{"ok":true}']);
    const [url,request] = network.mock.calls[0];
    expect(url).toBe("https://erasogmsqpgiirovubjh.supabase.co/rest/v1/rpc/request_production_marketing_subscription");
    const body=JSON.parse(request.body);
    expect(Object.keys(body).sort()).toEqual(["p_confirmation_hash","p_delivery_payload","p_email","p_explicit_consent","p_preference_hash","p_requester_hash","p_wording_version"]);
    expect(body).toEqual(expect.objectContaining({p_email:"synthetic@example.invalid",p_explicit_consent:true,p_wording_version:"production_welcome_v1",p_confirmation_hash:expect.stringMatching(/^[a-f0-9]{64}$/),p_delivery_payload:expect.objectContaining({version:1,keyId:"synthetic-v1"})}));
  } finally { vi.unstubAllEnvs(); }
});
