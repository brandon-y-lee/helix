// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { GET as intakeGet, POST as intakePost } from "@/app/api/support/production/intake/route";
import { POST as worker } from "@/app/api/internal/support-production-dispatch/route";
import { POST as sent } from "@/app/api/webhooks/support-production-sent/route";
import { productionConfig } from "@/lib/support/production/config";
import { productionRpc } from "@/lib/support/production/storage";
const id = "00000000-0000-4000-8000-000000000001";
const env = { VERCEL: "1", VERCEL_ENV: "production", HELIX_PRODUCTION_SUPPORT_ORIGIN: "https://www.helixskin.us",
  HELIX_PRODUCTION_SUPPORT_PROJECT_REF: "abcdefghijklmnopqrst", HELIX_PRODUCTION_SUPPORT_PROJECT_URL: "https://abcdefghijklmnopqrst.supabase.co",
  HELIX_PRODUCTION_SUPPORT_CONTRACT_ID: id, HELIX_PRODUCTION_SUPPORT_SERVICE_ROLE_KEY: "synthetic-dedicated-service-credential-32-chars",
  HELIX_PRODUCTION_SUPPORT_ABUSE_SECRET: "synthetic-abuse-secret-32-characters-only",
  HELIX_PRODUCTION_SUPPORT_WORKER_SECRET: "synthetic-worker-secret-32-characters-only",
  HELIX_PRODUCTION_SUPPORT_RESEND_SENDING_KEY: "re_synthetic_dedicated_domain_sending_key",
  HELIX_PRODUCTION_SUPPORT_ADMISSION_ENABLED: "true", HELIX_PRODUCTION_SUPPORT_WORKER_ENABLED: "true",
  HELIX_PRODUCTION_SUPPORT_FULL_MEDIA_QUALIFIED: "true", HELIX_PRODUCTION_SUPPORT_ISOLATION_QUALIFIED: "true", HELIX_PRODUCTION_SUPPORT_OPERATIONS_QUALIFIED: "true" };
function setup() { for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value); }
function workerRequest(token = env.HELIX_PRODUCTION_SUPPORT_WORKER_SECRET, host = "https://www.helixskin.us") {
  return new Request(`${host}/api/internal/support-production-dispatch`, { method: "POST", headers: { authorization: `Bearer ${token}` } });
}
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); });

it("ships no public text-only route availability or bypass despite true operator flags", async () => {
  setup(); const network = vi.fn(); vi.stubGlobal("fetch", network);
  expect(await (await intakeGet(new Request("https://www.helixskin.us/api/support/production/intake"))).json()).toEqual({ available: false, photosAvailable: false });
  expect((await intakePost(new Request("https://www.helixskin.us/api/support/production/intake", { method: "POST", headers: { origin: "https://www.helixskin.us" } }))).status).toBe(503);
  expect(network).not.toHaveBeenCalled();
});
it("requires bounded internal bearer authentication and production URL/context before any claim", async () => {
  setup(); const network = vi.fn(); vi.stubGlobal("fetch", network);
  expect((await worker(workerRequest("wrong"))).status).toBe(401);
  expect((await worker(workerRequest(undefined, "https://preview.vercel.app"))).status).toBe(403);
  vi.stubEnv("VERCEL_ENV", "preview"); expect((await worker(workerRequest())).status).toBe(503);
  expect(network).not.toHaveBeenCalled();
});
it("cannot inherit generic provider credentials and does not drain disabled work", async () => {
  setup(); const network = vi.fn(); vi.stubGlobal("fetch", network);
  vi.stubEnv("HELIX_PRODUCTION_SUPPORT_RESEND_SENDING_KEY", ""); vi.stubEnv("RESEND_API_KEY", "re_generic_key_must_not_work");
  expect((await worker(workerRequest())).status).toBe(503);
  vi.stubEnv("HELIX_PRODUCTION_SUPPORT_WORKER_ENABLED", "false");
  expect(await (await worker(workerRequest())).json()).toEqual({ ok: true, claimed: 0, accepted: 0, unconfirmed: 0 });
  expect(network).not.toHaveBeenCalled();
});
it("checks stored identity before claim/send and rejects nonboolean qualification data", async () => {
  setup();
  for (const changed of [{ contractId: id.replace(/1$/, "2") }, { operationsQualified: "false" }]) {
    const network = vi.fn().mockResolvedValue(new Response(JSON.stringify({ projectRef: env.HELIX_PRODUCTION_SUPPORT_PROJECT_REF, contractId: id,
      admissionEnabled: true, workerEnabled: true, fullMediaQualified: true, isolationQualified: true, operationsQualified: true, ...changed })));
    vi.stubGlobal("fetch", network);
    expect((await worker(workerRequest())).status).toBe(503);
    expect(network).toHaveBeenCalledTimes(1);
    expect(network.mock.calls[0][0]).toBe(`${env.HELIX_PRODUCTION_SUPPORT_PROJECT_URL}/rest/v1/rpc/read_support_prod_contract`);
  }
});
it("permits no body or a bounded empty JSON cadence payload without accepting arbitrary worker options", async () => {
  setup();
  for (const body of [undefined, "{}", " { }\n"]) {
    const network = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ projectRef: env.HELIX_PRODUCTION_SUPPORT_PROJECT_REF, contractId: id,
        admissionEnabled: false, workerEnabled: true, fullMediaQualified: true, isolationQualified: true, operationsQualified: true })))
      .mockResolvedValueOnce(new Response("null"));
    vi.stubGlobal("fetch", network);
    const request = new Request("https://www.helixskin.us/api/internal/support-production-dispatch", { method: "POST", body,
      headers: { authorization: `Bearer ${env.HELIX_PRODUCTION_SUPPORT_WORKER_SECRET}`, "content-type": "application/json" } });
    expect(await (await worker(request)).json()).toEqual({ ok: true, claimed: 0, accepted: 0, unconfirmed: 0 });
    expect(network).toHaveBeenCalledTimes(2);
    expect(network.mock.calls[1][0]).toContain("/rest/v1/rpc/claim_support_prod_outbox");
  }
});
it("rejects nonempty, malformed or oversized cadence payloads before external work", async () => {
  setup(); const network = vi.fn(); vi.stubGlobal("fetch", network);
  for (const body of ["{\"limit\":2}", "[]", "null", "{broken}"]) {
    const request = new Request("https://www.helixskin.us/api/internal/support-production-dispatch", { method: "POST", body,
      headers: { authorization: `Bearer ${env.HELIX_PRODUCTION_SUPPORT_WORKER_SECRET}`, "content-type": "application/json" } });
    expect((await worker(request)).status).toBe(400);
  }
  const oversized = new Request("https://www.helixskin.us/api/internal/support-production-dispatch", { method: "POST", body: "{}" + " ".repeat(256),
    headers: { authorization: `Bearer ${env.HELIX_PRODUCTION_SUPPORT_WORKER_SECRET}`, "content-type": "application/json" } });
  expect((await worker(oversized)).status).toBe(413);
  expect(network).not.toHaveBeenCalled();
});
it("bounds a stalled cadence body without claiming work or installing a scheduler", async () => {
  setup(); vi.useFakeTimers(); const network = vi.fn(); vi.stubGlobal("fetch", network);
  const stalled = new Request("https://www.helixskin.us/api/internal/support-production-dispatch", { method: "POST", duplex: "half",
    headers: { authorization: `Bearer ${env.HELIX_PRODUCTION_SUPPORT_WORKER_SECRET}`, "content-type": "application/json" },
    body: new ReadableStream({ start() {} }) } as RequestInit);
  const pending = worker(stalled);
  await vi.advanceTimersByTimeAsync(1_001);
  expect((await pending).status).toBe(408);
  expect(network).not.toHaveBeenCalled();
});
it("does not use generic webhook secrets or invoke storage on unsigned receiving payloads", async () => {
  setup(); const network = vi.fn(); vi.stubGlobal("fetch", network);
  vi.stubEnv("HELIX_PRODUCTION_SUPPORT_SENT_WEBHOOK_SECRET", ""); vi.stubEnv("RESEND_WEBHOOK_SECRET", "whsec_generic");
  expect((await sent(new Request("https://www.helixskin.us/api/webhooks/support-production-sent", { method: "POST", body: "{}" }))).status).toBe(503);
  expect(network).not.toHaveBeenCalled();
});
it("uses only the dedicated project REST RPC and narrow p_input contract; bounds deadlines", async () => {
  const config = productionConfig(env);
  const network = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: "saved" })));
  const input = { projectRef: config.projectRef, contractId: config.contractId, submissionId: id };
  await productionRpc(config, "submit_support_prod_inquiry", input, network);
  expect(network).toHaveBeenCalledWith(`${config.projectUrl}/rest/v1/rpc/submit_support_prod_inquiry`, expect.objectContaining({ method: "POST",
    body: JSON.stringify({ p_input: input }), headers: { authorization: `Bearer ${config.serviceKey}`, apikey: config.serviceKey, "content-type": "application/json" } }));
  network.mockClear(); await expect(productionRpc(config, "arbitrary_rpc", {}, network)).rejects.toThrow("support_unavailable");
  expect(network).not.toHaveBeenCalled();
  vi.useFakeTimers();
  const pending = productionRpc(config, "read_support_prod_contract", undefined, vi.fn(() => new Promise<Response>(() => undefined)));
  const proof = expect(pending).rejects.toThrow("support_unavailable");
  await vi.advanceTimersByTimeAsync(5_001); await proof;
});
it("maps only fixed SQL domain failures without returning PII/provider diagnostics", async () => {
  for (const [message, status] of [["support_submission_conflict", 409], ["support_rate_limited", 429], ["private visitor@example.invalid", 503]] as const) {
    await expect(productionRpc(productionConfig(env), "submit_support_prod_inquiry", {}, vi.fn().mockResolvedValue(new Response(JSON.stringify({ message }), { status: 400 }))))
      .rejects.toMatchObject({ status });
  }
});

it("keeps the new public photo route source-disabled and wires photo worker to dedicated metadata RPCs only", async () => {
  const { POST: photos } = await import("@/app/api/support/production/photos/route");
  const { POST: photoWorker } = await import("@/app/api/internal/support-production-photos/route");
  setup(); vi.stubEnv("HELIX_PRODUCTION_SUPPORT_PHOTO_BUCKET", "support-production-private");
  const network = vi.fn(); vi.stubGlobal("fetch", network);
  expect((await photos(new Request("https://www.helixskin.us/api/support/production/photos", {method:"POST",headers:{origin:"https://www.helixskin.us"}}))).status).toBe(503);
  expect((await photoWorker(workerRequest("wrong"))).status).toBe(401);
  expect(network).not.toHaveBeenCalled();
  network.mockResolvedValueOnce(Response.json({projectRef:env.HELIX_PRODUCTION_SUPPORT_PROJECT_REF,contractId:id,admissionEnabled:false,workerEnabled:true,fullMediaQualified:true,isolationQualified:true,operationsQualified:true,photoBucket:"support-production-private",photoWorkerLimit:1}))
    .mockResolvedValueOnce(Response.json(null)).mockResolvedValueOnce(Response.json(null));
  expect(await (await photoWorker(new Request("https://www.helixskin.us/api/internal/support-production-photos",{method:"POST",headers:{authorization:`Bearer ${env.HELIX_PRODUCTION_SUPPORT_WORKER_SECRET}`}}))).json()).toEqual({ok:true,processed:0,deferred:0,prepared:0});
  expect(network.mock.calls.map(c=>c[0])).toEqual(["read_support_prod_contract","claim_support_prod_photo","prepare_support_prod_media"].map(n=>`${env.HELIX_PRODUCTION_SUPPORT_PROJECT_URL}/rest/v1/rpc/${n}`));
});
