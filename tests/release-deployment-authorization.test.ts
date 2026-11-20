// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { createHash, createHmac } from "node:crypto";
import { HELIX_VERCEL_PROJECT_ID, supabaseOriginForTarget } from "@/lib/supabase/project-safety";
import { productionDeploymentAuthorized } from "@/lib/release/deployment-authorization";
import { POST as receive } from "@/app/api/webhooks/resend-production/route";
import { POST as enroll } from "@/app/api/marketing/production/subscription/route";

const key = "sb_secret_syntheticKeyForLocalTests";
const env = {
  VERCEL: "1", VERCEL_ENV: "production", VERCEL_TARGET_ENV: "production",
  VERCEL_PROJECT_ID: HELIX_VERCEL_PROJECT_ID, VERCEL_GIT_COMMIT_REF: "main",
  VERCEL_GIT_COMMIT_SHA: "b".repeat(40), VERCEL_DEPLOYMENT_ID: "dpl_SyntheticCandidate",
  NEXT_PUBLIC_SUPABASE_URL: supabaseOriginForTarget("production"),
  HELIX_RELEASE_AUTHORIZATION_READ_KEY: key,
  HELIX_RELEASE_AUTHORIZATION_READ_KEY_SHA256: createHash("sha256").update(key).digest("hex"),
};

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("queries the parent registry with the actual deployment tuple on every authorization", async () => {
  const fetch = vi.fn().mockResolvedValueOnce(Response.json(true)).mockResolvedValueOnce(Response.json(false));
  vi.stubGlobal("fetch", fetch);
  expect(await productionDeploymentAuthorized(env)).toBe(true);
  expect(await productionDeploymentAuthorized(env)).toBe(false);
  expect(fetch).toHaveBeenCalledWith(env.NEXT_PUBLIC_SUPABASE_URL + "/rest/v1/rpc/read_helix_release_authorization", expect.objectContaining({
    method: "POST", redirect: "error", cache: "no-store",
    body: JSON.stringify({p_project_id: env.VERCEL_PROJECT_ID, p_deployment_id: env.VERCEL_DEPLOYMENT_ID, p_git_sha: env.VERCEL_GIT_COMMIT_SHA}),
  }));
});

it("rejects mismatched targets or credentials before network access and fails closed on uncertain authorization", async () => {
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  for (const change of [
    { VERCEL_GIT_COMMIT_REF: "dev" }, { VERCEL_PROJECT_ID: "prj_Other" }, { VERCEL_ENV: "preview" },
    { VERCEL_GIT_COMMIT_SHA: "" }, { VERCEL_DEPLOYMENT_ID: "" }, { NEXT_PUBLIC_SUPABASE_URL: supabaseOriginForTarget("development") },
    { HELIX_RELEASE_AUTHORIZATION_READ_KEY_SHA256: "" },
  ]) expect(await productionDeploymentAuthorized({ ...env, ...change })).toBe(false);
  expect(fetch).not.toHaveBeenCalled();
  for (const invalid of [Response.json("true"), Response.json([true]), new Response(null, {status: 403})]) {
    fetch.mockResolvedValueOnce(invalid);
    expect(await productionDeploymentAuthorized(env)).toBe(false);
  }
  fetch.mockRejectedValueOnce(new Error("private"));
  expect(await productionDeploymentAuthorized(env)).toBe(false);
});

it("does not enroll from a deployment that copies an old feature ID pin", async () => {
  const origin = "https://www.helixskin.us";
  for (const [name, value] of Object.entries({
    ...env, VERCEL_PROJECT_PRODUCTION_URL:"www.helixskin.us", HELIX_PRODUCTION_MARKETING_VERCEL_PROJECT_ID: env.VERCEL_PROJECT_ID,
    HELIX_PRODUCTION_MARKETING_DEPLOYMENT_ID: env.VERCEL_DEPLOYMENT_ID, HELIX_PRODUCTION_MARKETING_SITE_ORIGIN: origin,
    HELIX_PRODUCTION_MARKETING_SUPABASE_URL: env.NEXT_PUBLIC_SUPABASE_URL, HELIX_PRODUCTION_MARKETING_SERVICE_KEY:"synthetic",
    HELIX_PRODUCTION_MARKETING_ENABLED:"true", HELIX_PRODUCTION_MARKETING_ABUSE_KEY:"a".repeat(32),
    HELIX_PRODUCTION_MARKETING_CAPABILITY_KEY:"a".repeat(64), HELIX_PRODUCTION_MARKETING_CAPABILITY_KEY_ID:"synthetic",
  })) vi.stubEnv(name,value);
  const fetch = vi.fn().mockResolvedValueOnce(Response.json(false)); vi.stubGlobal("fetch",fetch);
  const result = await enroll(new Request(origin+"/api/marketing/production/subscription", {
    method:"POST", headers:{origin, "content-type":"application/json", "x-vercel-forwarded-for":"192.0.2.1"},
    body:JSON.stringify({email:"visitor@example.invalid",consent:true}),
  }));
  expect(result.status).toBe(503);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][0]).toMatch(/\/read_helix_release_authorization$/);
});

it("checks the gateway signature before the registry and acknowledges an unrelated signed event only for an authorized deployment", async () => {
  const origin = "https://www.helixskin.us";
  const signingKey = Buffer.from("synthetic-current-gateway-signing-key");
  for (const [name, value] of Object.entries({
    ...env,
    HELIX_PRODUCTION_EMAIL_GATEWAY_ENABLED: "true",
    HELIX_PRODUCTION_EMAIL_GATEWAY_PROJECT_ID: env.VERCEL_PROJECT_ID,
    HELIX_PRODUCTION_EMAIL_GATEWAY_ORIGIN: origin,
    HELIX_PRODUCTION_EMAIL_GATEWAY_WEBHOOK_SECRET: `whsec_${signingKey.toString("base64")}`,
  })) vi.stubEnv(name, value);
  const body = JSON.stringify({type: "domain.verified", created_at: new Date().toISOString(), data: {}});
  const id = "evt_synthetic_unclaimed", timestamp = String(Math.floor(Date.now() / 1000));
  const sign = (key: Buffer) => createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64");
  const callback = (key: Buffer) => new Request(origin + "/api/webhooks/resend-production", {
    method: "POST", body, headers: {"svix-id": id, "svix-timestamp": timestamp, "svix-signature": `v1,${sign(key)}`},
  });
  const fetch = vi.fn().mockResolvedValueOnce(Response.json(false)).mockResolvedValueOnce(Response.json(true));
  vi.stubGlobal("fetch", fetch);
  expect((await receive(callback(Buffer.from("wrong-signature")))).status).toBe(400);
  expect(fetch).not.toHaveBeenCalled();
  expect((await receive(callback(signingKey))).status).toBe(503);
  expect((await receive(callback(signingKey))).status).toBe(200);
  expect(fetch.mock.calls.map(([url]) => url)).toEqual(Array(2).fill(
    env.NEXT_PUBLIC_SUPABASE_URL + "/rest/v1/rpc/read_helix_release_authorization",
  ));
});
