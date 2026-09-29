import { describe, expect, it, vi } from "vitest";
import { handleMarketingRequest } from "@/lib/marketing/requests";

const template = { id: "93a3ecbc-2a25-48a7-8fe9-5a7bd40f2e34", sha256: "a".repeat(64) };
const contract = { version: "welcome_v1", siteOrigin: "https://helixskin.vercel.app", from: "Helix <onboarding@resend.dev>",
  replyTo: "support@example.test", postalAddress: "Synthetic business mailing address", topicId: "61296d74-fad4-4c74-83d3-6a3e17ab9f74",
  templates: { marketing_confirmation: template, welcome_initial: template, welcome_education: template } };
const env = { HELIX_EMAIL_ENVIRONMENT: "sandbox", HELIX_EMAIL_MODE: "restricted", HELIX_MARKETING_ENABLED: "true",
  HELIX_EMAIL_OWNER_RECIPIENT: "owner@example.test", HELIX_EMAIL_ALLOW_SIMULATORS: "true",
  HELIX_EMAIL_MARKETING_CONTRACT: JSON.stringify(contract) };
function setup() {
  const storage = { request: vi.fn().mockResolvedValue({ status: "accepted" }),
    confirm: vi.fn().mockResolvedValue({ status: "confirmed" }), withdraw: vi.fn().mockResolvedValue({ status: "accepted" }) };
  return { storage, env: { ...env } };
}
function request(body: unknown, origin = "https://helixskin.vercel.app") {
  return new Request("https://helixskin.vercel.app/api/marketing/subscription", { method: "POST",
    headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

describe("marketing subscription request boundary", () => {
  it("requires explicit consent before persisting a confirmation request", async () => {
    const deps = setup();
    expect((await handleMarketingRequest(request({ email: "owner@example.test", consent: false }), "subscription", deps)).status).toBe(400);
    expect(deps.storage.request).not.toHaveBeenCalled();
    const response = await handleMarketingRequest(request({ email: " Owner@example.test ", consent: true }), "subscription", deps);
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ ok: true });
    expect(deps.storage.request).toHaveBeenCalledWith(expect.objectContaining({ email: "owner@example.test", consent: true,
      source: "email_preferences", wordingVersion: "2026-09-29-welcome-v1", templateContract: contract,
      confirmationToken: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/) }));
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });
});

it("keeps unpermitted recipient and allowed request responses indistinguishable without rerouting", async () => {
  const deps = setup();
  const blocked = await handleMarketingRequest(request({ email: "customer@example.test", consent: true }), "subscription", deps);
  expect(blocked.status).toBe(202);
  expect(await blocked.json()).toEqual({ ok: true });
  expect(deps.storage.request).not.toHaveBeenCalled();
});
it("requires same-origin POST and bounded JSON before touching private consent", async () => {
  const deps = setup();
  expect((await handleMarketingRequest(request({ email: "owner@example.test", consent: true }, "https://other.example"), "subscription", deps)).status).toBe(403);
  expect((await handleMarketingRequest(new Request("https://helixskin.vercel.app/api/marketing/confirm"), "confirm", deps)).status).toBe(405);
  expect((await handleMarketingRequest(request({ email: "x".repeat(2048), consent: true }), "subscription", deps)).status).toBe(413);
  expect(deps.storage.request).not.toHaveBeenCalled();
  expect(deps.storage.confirm).not.toHaveBeenCalled();
});
it("keeps confirmation and withdrawal available when new marketing requests are disabled", async () => {
  const deps = setup(); deps.env.HELIX_MARKETING_ENABLED = "false";
  const token = "T".repeat(43);
  expect((await handleMarketingRequest(request({ email: "owner@example.test", consent: true }), "subscription", deps)).status).toBe(503);
  expect((await handleMarketingRequest(request({ token }), "confirm", deps)).status).toBe(200);
  expect(deps.storage.confirm).toHaveBeenCalledWith(token, expect.stringMatching(/^[A-Za-z0-9_-]{43}$/));
  expect((await handleMarketingRequest(request({ token, scope: "all" }), "preferences", deps)).status).toBe(200);
  expect(deps.storage.withdraw).toHaveBeenCalledWith(token, "all");
});
it("never exposes storage errors, tokens, or internal subscription identifiers", async () => {
  const deps = setup();
  deps.storage.request.mockRejectedValue(new Error("owner@example.test PRIVATE_TOKEN"));
  const response = await handleMarketingRequest(request({ email: "owner@example.test", consent: true }), "subscription", deps);
  expect(response.status).toBe(503);
  expect(await response.text()).toBe('{"ok":false}');
  deps.storage.confirm.mockResolvedValue({ status: "invalid" });
  expect((await handleMarketingRequest(request({ token: "x".repeat(43) }), "confirm", deps)).status).toBe(400);
});
it.each([
  { ...contract, siteOrigin: "https://helixskin.vercel.app/arbitrary" },
  { ...contract, from: "Helix\r\nBcc: leak@example.test <onboarding@resend.dev>" },
  { ...contract, postalAddress: "" },
  { ...contract, templates: { ...contract.templates, welcome_initial: { ...template, sha256: "unapproved" } } },
])("rejects unreviewable or incomplete template generation configuration", async (invalid) => {
  const deps = setup(); deps.env.HELIX_EMAIL_MARKETING_CONTRACT = JSON.stringify(invalid);
  expect((await handleMarketingRequest(request({ email: "owner@example.test", consent: true }), "subscription", deps)).status).toBe(503);
  expect(deps.storage.request).not.toHaveBeenCalled();
});

it("accepts one-click unsubscribe only with the scoped capability and the exact provider POST", async () => {
  const { handleMarketingUnsubscribe } = await import("@/lib/marketing/requests");
  const deps = setup(), token = "U".repeat(43);
  const post = (body: string, suffix = token) => new Request(`https://helixskin.vercel.app/api/marketing/unsubscribe?token=${suffix}`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  expect((await handleMarketingUnsubscribe(post("List-Unsubscribe=One-Click"), deps.storage)).status).toBe(200);
  expect(deps.storage.withdraw).toHaveBeenCalledWith(token, "all");
  deps.storage.withdraw.mockClear();
  expect((await handleMarketingUnsubscribe(post("subscribe=true"), deps.storage)).status).toBe(400);
  expect((await handleMarketingUnsubscribe(post("List-Unsubscribe=One-Click", "invalid"), deps.storage)).status).toBe(400);
  expect((await handleMarketingUnsubscribe(new Request(`https://helixskin.vercel.app/api/marketing/unsubscribe?token=${token}`), deps.storage)).status).toBe(405);
  expect(deps.storage.withdraw).not.toHaveBeenCalled();
});
