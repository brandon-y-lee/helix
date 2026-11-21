// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { createHash, createHmac } from "node:crypto";
import { HELIX_VERCEL_PROJECT_ID, supabaseOriginForTarget } from "@/lib/supabase/project-safety";
import { productionDeploymentAuthorized } from "@/lib/release/deployment-authorization";
import { POST as receive } from "@/app/api/webhooks/resend-production/route";
import { POST as enroll } from "@/app/api/marketing/production/subscription/route";

const key = "sb_publishable_syntheticKeyForLocalTests";
const env = {
  VERCEL: "1", VERCEL_ENV: "production", VERCEL_TARGET_ENV: "production",
  VERCEL_PROJECT_ID: HELIX_VERCEL_PROJECT_ID, VERCEL_GIT_COMMIT_REF: "main",
  VERCEL_GIT_COMMIT_SHA: "b".repeat(40), VERCEL_DEPLOYMENT_ID: "dpl_SyntheticCandidate",
  NEXT_PUBLIC_SUPABASE_URL: supabaseOriginForTarget("production"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: key,
  HELIX_PRODUCTION_SUPABASE_ANON_KEY_SHA256: createHash("sha256").update(key).digest("hex"),
};

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("accepts a new Production build and its rollback build without a per-deployment registration", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  expect(await productionDeploymentAuthorized(env)).toBe(true);
  expect(await productionDeploymentAuthorized({
    ...env, VERCEL_DEPLOYMENT_ID: "dpl_SyntheticRollback", VERCEL_GIT_COMMIT_SHA: "c".repeat(40),
  })).toBe(true);
  expect(fetch).not.toHaveBeenCalled();
});

it("requires the Helix Production main build, the parent database and its matching public credential", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  for (const change of [
    { VERCEL_GIT_COMMIT_REF: "dev" }, { VERCEL_PROJECT_ID: "prj_Other" }, { VERCEL_ENV: "preview" },
    { VERCEL_TARGET_ENV: "preview" }, { VERCEL_GIT_COMMIT_SHA: "" }, { VERCEL_DEPLOYMENT_ID: "" },
    { NEXT_PUBLIC_SUPABASE_URL: supabaseOriginForTarget("development") }, { NEXT_PUBLIC_SUPABASE_ANON_KEY: "" },
    { HELIX_PRODUCTION_SUPABASE_ANON_KEY_SHA256: "" },
    { NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_secret_synthetic", HELIX_PRODUCTION_SUPABASE_ANON_KEY_SHA256: createHash("sha256").update("sb_secret_synthetic").digest("hex") },
  ]) expect(await productionDeploymentAuthorized({ ...env, ...change })).toBe(false);
  expect(fetch).not.toHaveBeenCalled();
});

it("refuses enrollment from an immutable Production URL even if all marketing configuration is enabled", async () => {
  const origin = "https://www.helixskin.us";
  for (const [name, value] of Object.entries({
    ...env, VERCEL_PROJECT_PRODUCTION_URL: "www.helixskin.us", HELIX_PRODUCTION_MARKETING_VERCEL_PROJECT_ID: env.VERCEL_PROJECT_ID,
    HELIX_PRODUCTION_MARKETING_SITE_ORIGIN: origin, HELIX_PRODUCTION_MARKETING_SUPABASE_URL: env.NEXT_PUBLIC_SUPABASE_URL,
    HELIX_PRODUCTION_MARKETING_SERVICE_KEY: "synthetic", HELIX_PRODUCTION_MARKETING_ENABLED: "true",
    HELIX_PRODUCTION_MARKETING_ABUSE_KEY: "a".repeat(32), HELIX_PRODUCTION_MARKETING_CAPABILITY_KEY: "a".repeat(64),
    HELIX_PRODUCTION_MARKETING_CAPABILITY_KEY_ID: "synthetic",
  })) vi.stubEnv(name, value);
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const stage = "https://helix-stage.vercel.app";
  const result = await enroll(new Request(stage + "/api/marketing/production/subscription", {
    method: "POST", headers: { origin: stage, "content-type": "application/json", "x-vercel-forwarded-for": "192.0.2.1" },
    body: JSON.stringify({ email: "visitor@example.invalid", consent: true }),
  }));
  expect(result.status).toBe(403);
  expect(fetch).not.toHaveBeenCalled();
});

it("acknowledges a signed gateway event only on the canonical Production site", async () => {
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
  const callback = (key: Buffer, destination = origin) => new Request(destination + "/api/webhooks/resend-production", {
    method: "POST", body, headers: {"svix-id": id, "svix-timestamp": timestamp, "svix-signature": `v1,${sign(key)}`},
  });
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  expect((await receive(callback(Buffer.from("wrong-signature")))).status).toBe(400);
  expect((await receive(callback(signingKey, "https://helix-stage.vercel.app"))).status).toBe(403);
  expect((await receive(callback(signingKey))).status).toBe(200);
  vi.stubEnv("VERCEL_GIT_COMMIT_REF", "dev");
  expect((await receive(callback(signingKey))).status).toBe(503);
  expect(fetch).not.toHaveBeenCalled();
});
