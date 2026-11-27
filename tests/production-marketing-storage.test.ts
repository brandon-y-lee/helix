import { afterEach, expect, it, vi } from "vitest";
import { directMarketingDeliveryContract } from "@/lib/production-marketing/delivery-config";
import { productionMarketingTestTarget } from "./helpers/production-marketing-target";
import { createProductionMarketingStorage, productionSignupQualification } from "@/tests/helpers/retired-production-marketing/storage";

const env = productionMarketingTestTarget;
afterEach(() => vi.unstubAllGlobals());
it("uses only dedicated production RPC transport with hashed inputs and never retries an unknown write", async () => {
  const network = vi.fn().mockResolvedValue(new Response("true", { headers: { "content-type": "application/json" } }));
  vi.stubGlobal("fetch", network);
  const storage = createProductionMarketingStorage(env);
  expect(await storage.confirm("a".repeat(64))).toBe(true);
  expect(String(network.mock.calls[0][0])).toBe("https://erasogmsqpgiirovubjh.supabase.co/rest/v1/rpc/confirm_production_marketing_subscription");
  expect(network.mock.calls[0][1].headers.apikey === env.SUPABASE_SERVICE_ROLE_KEY).toBe(true);
  expect(network.mock.calls[0][1].headers.Authorization).toBeUndefined();
  expect(JSON.parse(network.mock.calls[0][1].body)).toEqual({ p_token_hash: "a".repeat(64) });
  network.mockReset().mockRejectedValue(new Error("secret visitor@example.invalid"));
  await expect(storage.withdraw("b".repeat(64))).rejects.toThrow("Production marketing is unavailable.");
  expect(network).toHaveBeenCalledTimes(1);
});
it("verifies the production service credential and fixed target before an RPC", async () => {
  const network = vi.fn(); vi.stubGlobal("fetch", network);
  for (const change of [
    { HELIX_PRODUCTION_SUPABASE_SERVICE_ROLE_KEY_SHA256: "f".repeat(64) },
    { SUPABASE_SERVICE_ROLE_KEY: undefined, HELIX_PRODUCTION_MARKETING_SERVICE_KEY: "retired-slot" },
    { VERCEL_PROJECT_ID: "prj_other" }, { VERCEL_GIT_COMMIT_REF: "dev" },
    { NEXT_PUBLIC_SUPABASE_URL: "https://zyfkunnpnlmgvrojmrbg.supabase.co" },
  ]) {
    const storage = createProductionMarketingStorage({ ...env, ...change });
    await expect(storage.confirm("a".repeat(64))).rejects.toThrow("Production marketing is unavailable.");
  }
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

it("shows verified storefront readiness and binds a new signup to the qualified confirmation contract", async () => {
  const { signupStatus: GET, subscribe: POST } = await import("@/tests/helpers/retired-production-marketing/routes");
  for (const [key,value] of Object.entries({...env,
    VERCEL_URL: "helix-build-verified.vercel.app",
    HELIX_PRODUCTION_MARKETING_ENABLED:"true",HELIX_PRODUCTION_MARKETING_DISPATCH_ENABLED:"true",
    HELIX_PRODUCTION_MARKETING_PROVIDER_KEY:"re_synthetic_confirmation_sender",
    HELIX_PRODUCTION_MARKETING_EVENTS_ENABLED:"true",
    HELIX_PRODUCTION_MARKETING_WEBHOOK_SECRET:"whsec_"+Buffer.from("local-only-confirmation-webhook").toString("base64"),
    HELIX_PRODUCTION_MARKETING_WORKER_TOKEN:"w".repeat(48),CRON_SECRET:"s".repeat(48),
    HELIX_PRODUCTION_MARKETING_CAPABILITY_KEY:"c".repeat(64),
    HELIX_PRODUCTION_MARKETING_CAPABILITY_KEY_ID:"synthetic-v1",HELIX_PRODUCTION_MARKETING_ABUSE_KEY:"b".repeat(64)})) vi.stubEnv(key,value);
  const network = vi.fn();
  vi.stubGlobal("fetch",network);
  try {
    const canonical = "https://www.helixskin.us/api/marketing/production/subscription";
    const elsewhere = await GET(new Request("https://helixskin.vercel.app/api/marketing/production/subscription"));
    expect(await elsewhere.json()).toEqual({production:false,enabled:false});
    const held = await GET(new Request("https://helix-build-verified.vercel.app/api/marketing/production/subscription"));
    expect(await held.json()).toEqual({production:true,enabled:false});
    const unrelated = await GET(new Request("https://helix-unrelated.vercel.app/api/marketing/production/subscription"));
    expect(await unrelated.json()).toEqual({production:false,enabled:false});
    expect(network).not.toHaveBeenCalled();
    network.mockResolvedValueOnce(Response.json(false));
    const paused = await GET(new Request(canonical));
    expect(await paused.json()).toEqual({production:true,enabled:false});
    expect(paused.headers.get("Cache-Control")).toContain("no-store");
    const read = "https://erasogmsqpgiirovubjh.supabase.co/rest/v1/rpc/production_marketing_enrollment_ready";
    expect(network.mock.calls[0][0]).toBe(read);
    network.mockResolvedValueOnce(Response.json(true));
    expect(await (await GET(new Request(canonical))).json()).toEqual({production:true,enabled:true});
    network.mockRejectedValueOnce(new Error("private detail"));
    const submit = () => POST(new Request("https://www.helixskin.us/api/marketing/production/subscription", {method:"POST",headers:{origin:"https://www.helixskin.us","content-type":"application/json","x-vercel-forwarded-for":"192.0.2.1"},body:JSON.stringify({email:"synthetic@example.invalid",consent:true})}));
    expect((await submit()).status).toBe(503);
    const admit = "https://erasogmsqpgiirovubjh.supabase.co/rest/v1/rpc/request_qualified_production_marketing_subscription";
    expect(network.mock.calls.map(([url]) => url)).toEqual([read, read, admit]);
    network.mockResolvedValueOnce(Response.json(true));
    const result = await submit();
    expect([result.status,await result.text()]).toEqual([202,'{"ok":true}']);
    expect(network).toHaveBeenCalledTimes(4);
    const [url,request] = network.mock.calls[3];
    expect(url).toBe(admit);
    const body=JSON.parse(request.body);
    expect(Object.keys(body).sort()).toEqual(["p_confirmation_hash","p_contract_hash","p_delivery_payload","p_email","p_explicit_consent","p_preference_hash","p_requester_hash","p_wording_version","p_worker_binding_hash"]);
    expect(body.p_contract_hash).toBe(JSON.parse(network.mock.calls[0][1].body).p_contract_hash);
    const sameBinding = productionSignupQualification({ ...process.env, VERCEL_DEPLOYMENT_ID: "dpl_AnotherReviewedRelease", VERCEL_GIT_COMMIT_SHA: "b".repeat(40) });
    const qualified = JSON.parse(network.mock.calls[0][1].body).p_worker_binding_hash;
    expect(sameBinding.p_worker_binding_hash).toBe(qualified);
    expect(productionSignupQualification({ ...process.env, CRON_SECRET: "t".repeat(48) })).toEqual(sameBinding);
    expect(productionSignupQualification({ ...process.env,
      HELIX_PRODUCTION_MARKETING_ENABLED: "false", HELIX_PRODUCTION_MARKETING_DISPATCH_ENABLED: "false",
      HELIX_PRODUCTION_MARKETING_EVENTS_ENABLED: "false" })).toEqual(sameBinding);
    expect(qualified).toMatch(/^[a-f0-9]{64}$/);
    expect(body.p_worker_binding_hash).toBe(qualified);
    network.mockImplementation((url: string, options: RequestInit) => {
      const binding = JSON.parse(String(options.body)).p_worker_binding_hash;
      if (url === read) return Promise.resolve(Response.json(binding === qualified));
      return Promise.resolve(binding === qualified ? Response.json(true) : new Response(null, { status: 409 }));
    });
    for (const [name, replacement] of [
      ["HELIX_PRODUCTION_MARKETING_WORKER_TOKEN", "x".repeat(48)],
      ["HELIX_PRODUCTION_MARKETING_PROVIDER_KEY", "re_different_unqualified_sender"],
      ["HELIX_PRODUCTION_MARKETING_WEBHOOK_SECRET", "whsec_" + Buffer.from("replacement-signing-key").toString("base64")],
      ["HELIX_PRODUCTION_MARKETING_CAPABILITY_KEY", "9".repeat(64)],
      ["HELIX_PRODUCTION_MARKETING_EVENTS_ENABLED", "false"],
      ["CRON_SECRET", ""],
      ["CRON_SECRET", "w".repeat(48)],
      ["HELIX_PRODUCTION_MARKETING_DELIVERY_CONTRACT", JSON.stringify({ ...directMarketingDeliveryContract, from: "news@helixskin.us" })],
      ["HELIX_PRODUCTION_MARKETING_DELIVERY_CONTRACT", JSON.stringify({ ...directMarketingDeliveryContract, topicId: "11111111-1111-4111-8111-111111111111" })],
    ]) {
      const original = process.env[name];
      vi.stubEnv(name, replacement);
      expect(await (await GET(new Request(canonical))).json()).toEqual({production:true, enabled:false});
      expect((await submit()).status).toBe(503);
      vi.stubEnv(name, original);
    }
    expect(body).toEqual(expect.objectContaining({p_email:"synthetic@example.invalid",p_explicit_consent:true,p_wording_version:"production_welcome_v1",p_confirmation_hash:expect.stringMatching(/^[a-f0-9]{64}$/),p_delivery_payload:expect.objectContaining({version:1,keyId:"synthetic-v1"})}));
  } finally { vi.unstubAllEnvs(); }
});
