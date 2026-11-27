import { productionMarketingTestTarget } from "./helpers/production-marketing-target";
import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/release/deployment-authorization", () => ({
  productionDeploymentAuthorized: async (env: Record<string, string | undefined>) => env.VERCEL_DEPLOYMENT_ID === "dpl_SyntheticEmailBuild",
}));
import { handleProductionMarketingRequest, handleProductionMarketingUnsubscribe } from "@/tests/helpers/retired-production-marketing/requests";
import { productionMarketingEnrollmentEnabled, readProductionMarketingConfiguration } from "@/lib/production-marketing/config";

const origin = "https://www.helixskin.us";
const env = {
  ...productionMarketingTestTarget,
  HELIX_PRODUCTION_MARKETING_ENABLED: "true",
  HELIX_PRODUCTION_MARKETING_CAPABILITY_KEY: "c".repeat(64), HELIX_PRODUCTION_MARKETING_CAPABILITY_KEY_ID: "synthetic-v1",
  HELIX_PRODUCTION_MARKETING_ABUSE_KEY: "b".repeat(64),
};
function setup() {
  return { env: { ...env }, storage: { request: vi.fn().mockResolvedValue(true), confirm: vi.fn().mockResolvedValue(true), withdraw: vi.fn().mockResolvedValue(true) } };
}
function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request(`${origin}/api/marketing/production/subscription`, { method: "POST", headers: {
    origin, "content-type": "application/json", "x-vercel-forwarded-for": "192.0.2.1", ...headers }, body: JSON.stringify(body) });
}

describe("dedicated production marketing consent boundary", () => {
  it("accepts either approved Vercel production alias while keeping requests on the canonical www origin", async () => {
    const deps = setup();
    deps.env.VERCEL_PROJECT_PRODUCTION_URL = "helixskin.us";
    expect(readProductionMarketingConfiguration(deps.env).siteOrigin).toBe(origin);
    expect(await productionMarketingEnrollmentEnabled(deps.env)).toBe(true);
    expect((await handleProductionMarketingRequest(post({ email: "visitor@example.invalid", consent: true }), "subscription", deps)).status).toBe(202);
    expect(deps.storage.request).toHaveBeenCalledTimes(1);
    expect((await handleProductionMarketingRequest(post({ email: "visitor@example.invalid", consent: true }, { origin: "https://helixskin.us" }), "subscription", deps)).status).toBe(403);
    expect(deps.storage.request).toHaveBeenCalledTimes(1);
    expect(await productionMarketingEnrollmentEnabled({ ...deps.env, HELIX_PRODUCTION_MARKETING_SITE_ORIGIN: "https://helixskin.us" })).toBe(false);
  });
  it("stays off by default and rejects wrong deployment, project, origin and unverified credentials", async () => {
    expect(await productionMarketingEnrollmentEnabled({})).toBe(false);
    for (const changes of [{ HELIX_PRODUCTION_MARKETING_ENABLED: "false" }, { VERCEL_ENV: "preview" }, { HELIX_PRODUCTION_MARKETING_CAPABILITY_KEY: "not-a-key" }, { HELIX_PRODUCTION_MARKETING_CAPABILITY_KEY_ID: "../unsafe" },
      { HELIX_PRODUCTION_MARKETING_SITE_ORIGIN: "https://other.invalid", VERCEL_PROJECT_PRODUCTION_URL: "other.invalid" }, { VERCEL_PROJECT_ID: "other" }, { VERCEL_DEPLOYMENT_ID: "other" }, { VERCEL_PROJECT_PRODUCTION_URL: "other.invalid" },
      { VERCEL_PROJECT_PRODUCTION_URL: "helixskin.vercel.app" }, { VERCEL_PROJECT_PRODUCTION_URL: "helixskin.us.other.invalid" },
      { HELIX_PRODUCTION_MARKETING_SUPABASE_URL: "https://other.supabase.co" }, { SUPABASE_SERVICE_ROLE_KEY: "sb_secret_synthetic_unverified" }]) {
      const deps = setup(); Object.assign(deps.env, changes);
      expect(await productionMarketingEnrollmentEnabled(deps.env)).toBe(false);
      expect((await handleProductionMarketingRequest(post({ email: "visitor@example.invalid", consent: true }), "subscription", deps)).status).toBe(503);
      expect(deps.storage.request).not.toHaveBeenCalled();
    }
    expect(readProductionMarketingConfiguration(env).siteOrigin).toBe(origin);
  });
});

it("requires explicit welcome-only same-origin bounded POST, hashes capabilities and never exposes issuance outcomes", async () => {
  const deps = setup();
  for (const body of [{ email: "visitor@example.invalid" }, { email: "visitor@example.invalid", consent: false },
    { email: "visitor@example.invalid", consent: true, scope: "lifecycle" }, { email: "bad", consent: true }]) {
    expect((await handleProductionMarketingRequest(post(body), "subscription", deps)).status).toBe(400);
  }
  expect((await handleProductionMarketingRequest(post({ email: "visitor@example.invalid", consent: true }, { origin: "https://other.invalid" }), "subscription", deps)).status).toBe(403);
  expect((await handleProductionMarketingRequest(new Request(`${origin}/api/marketing/production/confirm`), "confirm", deps)).status).toBe(405);
  expect((await handleProductionMarketingRequest(post({ email: "x".repeat(2049), consent: true }), "subscription", deps)).status).toBe(413);
  expect(deps.storage.request).not.toHaveBeenCalled();
  const responses = [];
  for (const issued of [true, false]) {
    deps.storage.request.mockResolvedValue(issued);
    const response = await handleProductionMarketingRequest(post({ email: " Visitor@Example.invalid ", consent: true }), "subscription", deps);
    responses.push([response.status, await response.text()]);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
  }
  expect(responses).toEqual([[202, '{"ok":true}'], [202, '{"ok":true}']]);
  expect(deps.storage.request).toHaveBeenCalledWith(expect.objectContaining({ email: "visitor@example.invalid", explicitConsent: true,
    wordingVersion: "production_welcome_v1", confirmationHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    preferenceHash: expect.stringMatching(/^[a-f0-9]{64}$/), requesterHash: expect.stringMatching(/^[a-f0-9]{64}$/) }));
});

it("never confirms on scanner GET and allows hashed capability withdrawal with enrollment paused", async () => {
  const deps = setup(), token = "T".repeat(43);
  deps.env.HELIX_PRODUCTION_MARKETING_ENABLED = "false";
  expect((await handleProductionMarketingRequest(post({ token }), "confirm", deps)).status).toBe(503);
  expect(deps.storage.confirm).not.toHaveBeenCalled();
  expect((await handleProductionMarketingRequest(post({ token }), "preferences", deps)).status).toBe(200);
  expect(deps.storage.withdraw).toHaveBeenCalledWith(expect.stringMatching(/^[a-f0-9]{64}$/));
  expect(deps.storage.withdraw).not.toHaveBeenCalledWith(token);
  deps.env.HELIX_PRODUCTION_MARKETING_ENABLED = "true";
  expect((await handleProductionMarketingRequest(post({ token }), "confirm", deps)).status).toBe(200);
  expect(deps.storage.confirm).toHaveBeenCalledWith(expect.stringMatching(/^[a-f0-9]{64}$/));
  deps.storage.confirm.mockResolvedValue(false);
  expect((await handleProductionMarketingRequest(post({ token }), "confirm", deps)).status).toBe(400);
  deps.storage.withdraw.mockResolvedValue(false);
  expect((await handleProductionMarketingRequest(post({ token }), "preferences", deps)).status).toBe(200);
  deps.storage.withdraw.mockRejectedValue(new Error("PRIVATE visitor@example.invalid token"));
  expect(await (await handleProductionMarketingRequest(post({ token }), "preferences", deps)).text()).toBe('{"ok":false}');
});
it("keeps origin-free one-click withdrawal POST-only, bounded and exact while paused", async () => {
  const deps = setup(), token = "U".repeat(43);
  deps.env.HELIX_PRODUCTION_MARKETING_ENABLED = "false";
  const url = `${origin}/api/marketing/production/unsubscribe?token=${token}`;
  const oneClick = (body: string) => new Request(url, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body });
  expect((await handleProductionMarketingUnsubscribe(new Request(url), deps)).status).toBe(405);
  expect((await handleProductionMarketingUnsubscribe(oneClick("List-Unsubscribe=One-Click&scope=all"), deps)).status).toBe(400);
  expect((await handleProductionMarketingUnsubscribe(oneClick("x".repeat(257)), deps)).status).toBe(413);
  expect(deps.storage.withdraw).not.toHaveBeenCalled();
  expect((await handleProductionMarketingUnsubscribe(oneClick("List-Unsubscribe=One-Click"), deps)).status).toBe(200);
  expect(deps.storage.withdraw).toHaveBeenCalledWith(expect.stringMatching(/^[a-f0-9]{64}$/));
});

it("fails closed without trusted requester bounds and redacts unknown storage results", async () => {
  const deps = setup();
  expect((await handleProductionMarketingRequest(post({ email: "visitor@example.invalid", consent: true }, { "x-vercel-forwarded-for": "untrusted" }), "subscription", deps)).status).toBe(503);
  deps.env.HELIX_PRODUCTION_MARKETING_ABUSE_KEY = "";
  expect((await handleProductionMarketingRequest(post({ email: "visitor@example.invalid", consent: true }), "subscription", deps)).status).toBe(503);
  expect(deps.storage.request).not.toHaveBeenCalled();
  deps.env.HELIX_PRODUCTION_MARKETING_ABUSE_KEY = env.HELIX_PRODUCTION_MARKETING_ABUSE_KEY;
  deps.storage.request.mockRejectedValue(new Error("visitor@example.invalid PRIVATE_TOKEN"));
  const result = await handleProductionMarketingRequest(post({ email: "visitor@example.invalid", consent: true }), "subscription", deps);
  expect([result.status, await result.text()]).toEqual([503, '{"ok":false}']);
  expect(deps.storage.request).toHaveBeenCalledTimes(1);
});

it("retains only authenticated encrypted delivery capabilities bound to the frozen recipient and 24-hour request", async () => {
  const { createDecipheriv, createHash } = await import("node:crypto");
  const deps = setup();
  Object.assign(deps.env, { HELIX_PRODUCTION_MARKETING_CAPABILITY_KEY: "c".repeat(64), HELIX_PRODUCTION_MARKETING_CAPABILITY_KEY_ID: "synthetic-v1" });
  const response = await handleProductionMarketingRequest(post({ email: "visitor@example.invalid", consent: true }), "subscription", deps);
  expect(response.status).toBe(202);
  const input = deps.storage.request.mock.calls[0][0];
  expect(input.deliveryPayload).toEqual(expect.objectContaining({version:1,keyId:"synthetic-v1",iv:expect.any(String),tag:expect.any(String),ciphertext:expect.any(String)}));
  const {iv,tag,ciphertext,keyId,requestId,issuedAt,expiresAt} = input.deliveryPayload;
  const decipher = createDecipheriv("aes-256-gcm", Buffer.from("c".repeat(64), "hex"), Buffer.from(iv,"base64url"), {authTagLength:16});
  decipher.setAAD(Buffer.from(JSON.stringify(["helix:production-marketing:confirmation",1,keyId,requestId,"visitor@example.invalid","welcome_only","production_welcome_v1",issuedAt,expiresAt])));
  decipher.setAuthTag(Buffer.from(tag,"base64url"));
  const frozen = JSON.parse(Buffer.concat([decipher.update(Buffer.from(ciphertext,"base64url")),decipher.final()]).toString("utf8"));
  expect([frozen.email,frozen.scope,frozen.wordingVersion,frozen.requestId,frozen.issuedAt,frozen.expiresAt]).toEqual(["visitor@example.invalid","welcome_only","production_welcome_v1",requestId,issuedAt,expiresAt]);
  expect(/^[A-Za-z0-9_-]{43}$/.test(frozen.confirmationToken) && /^[A-Za-z0-9_-]{43}$/.test(frozen.preferenceToken)).toBe(true);
  expect(Date.parse(frozen.expiresAt)-Date.parse(frozen.issuedAt)).toBe(86_400_000);
  expect(createHash("sha256").update(frozen.confirmationToken).digest("hex")).toBe(input.confirmationHash);
  expect(createHash("sha256").update(frozen.preferenceToken).digest("hex")).toBe(input.preferenceHash);
  expect(JSON.stringify(input)).not.toContain(frozen.confirmationToken);
  expect(Buffer.from(iv,"base64url").length).toBe(12);
  expect(Buffer.from(tag,"base64url").length).toBe(16);
  const decrypt = (key: string, address: string, encrypted: Buffer) => {
    const value = createDecipheriv("aes-256-gcm",Buffer.from(key,"hex"),Buffer.from(iv,"base64url"),{authTagLength:16});
    value.setAAD(Buffer.from(JSON.stringify(["helix:production-marketing:confirmation",1,keyId,requestId,address,"welcome_only","production_welcome_v1",issuedAt,expiresAt])));
    value.setAuthTag(Buffer.from(tag,"base64url"));
    // No plaintext is parsed or used before authentication completes.
    return Buffer.concat([value.update(encrypted),value.final()]);
  };
  expect(() => decrypt("d".repeat(64),"visitor@example.invalid",Buffer.from(ciphertext,"base64url"))).toThrow();
  expect(() => decrypt("c".repeat(64),"other@example.invalid",Buffer.from(ciphertext,"base64url"))).toThrow();
  const changed = Buffer.from(ciphertext,"base64url"); changed[0] ^= 1;
  expect(() => decrypt("c".repeat(64),"visitor@example.invalid",changed)).toThrow();
  await handleProductionMarketingRequest(post({email:"another@example.invalid",consent:true}),"subscription",deps);
  expect(deps.storage.request.mock.calls[1][0].deliveryPayload.iv === iv).toBe(false);
  expect(await response.text()).toBe('{"ok":true}');
});
