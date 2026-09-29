import { afterEach, expect, it, vi } from "vitest";
const marketing = vi.hoisted(() => ({ render: vi.fn(), verify: vi.fn() }));
vi.mock("@/lib/marketing/templates", () => ({ renderMarketingMessage: marketing.render }));
vi.mock("@/lib/marketing/service", () => ({ verifyMarketingPreferences: marketing.verify }));
import { dispatchEmailIntents } from "@/lib/email/delivery";
import { MarketingProviderError } from "@/lib/marketing/provider";
import type { EmailIntent } from "@/lib/email/types";
import type { MarketingReceipt } from "@/lib/marketing/contract";

const template = { id: "93a3ecbc-2a25-48a7-8fe9-5a7bd40f2e34", sha256: "a".repeat(64) };
const receipt: MarketingReceipt = { schemaVersion: 1, subscriberId: "513b8721-ce66-4b3e-a44b-1c8881b556dc", generation: 1, revision: 2,
  preferenceToken: "P".repeat(43), templateContract: { version: "welcome_v1", siteOrigin: "https://helixskin.vercel.app",
    from: "Helix <onboarding@resend.dev>", replyTo: "support@example.test", postalAddress: "Synthetic business mailing address",
    topicId: "61296d74-fad4-4c74-83d3-6a3e17ab9f74", templates: { marketing_confirmation: template, welcome_initial: template, welcome_education: template } } };
const welcome: EmailIntent = { id: "f83164ef-c327-44ae-bbb4-bbd25d254abc", environment: "sandbox", purpose: "welcome_initial",
  recipient: "delivered@resend.dev", receipt, requestPayload: null, idempotencyKey: "sandbox/welcome_initial/f83164ef-c327-44ae-bbb4-bbd25d254abc",
  firstAttemptAt: null, attemptCount: 0, leaseToken: "95667ec4-3f31-450b-85e2-ec6817b6e558" };
const message = { from: receipt.templateContract.from, reply_to: receipt.templateContract.replyTo, subject: "Welcome to Helix",
  html: "<p>Reviewed native welcome</p>", text: "Reviewed native welcome", topic_id: receipt.templateContract.topicId,
  headers: { "List-Unsubscribe": "<https://helixskin.vercel.app/api/marketing/unsubscribe?token=" + "P".repeat(43) + ">",
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } };
const env = { HELIX_EMAIL_ENVIRONMENT: "sandbox", HELIX_EMAIL_MODE: "restricted", HELIX_EMAIL_DISPATCH_ENABLED: "true",
  HELIX_EMAIL_SITE_ORIGIN: "https://helixskin.vercel.app", HELIX_EMAIL_REPLY_TO: "support@example.test",
  HELIX_EMAIL_OWNER_RECIPIENT: "owner@example.test", HELIX_EMAIL_ALLOW_SIMULATORS: "true", RESEND_API_KEY: "re_synthetic" };
function setup(intent = welcome) {
  marketing.render.mockResolvedValue(message); marketing.verify.mockResolvedValue("eligible");
  const storage = { claim: vi.fn().mockResolvedValue([intent]), finish: vi.fn().mockResolvedValue(true),
    prepare: vi.fn().mockImplementation(async (_id, _lease, payload) => ({ ...intent, requestPayload: intent.requestPayload ?? payload,
      firstAttemptAt: intent.firstAttemptAt ?? new Date().toISOString() })) };
  const send = vi.fn().mockResolvedValue({ kind: "accepted", id: "synthetic-email" });
  return { storage, send, dependencies: { storage, send, env } };
}
afterEach(() => vi.clearAllMocks());
it("delivers the approved native welcome with exact unsubscribe headers and no unrelated sender configuration", async () => {
  const { dependencies, storage, send } = setup();
  expect(await dispatchEmailIntents(dependencies)).toEqual({ claimed: 1, accepted: 1, deferred: 0, blocked: 0 });
  expect(storage.claim).toHaveBeenCalledWith(expect.any(String), 1);
  expect(marketing.render).toHaveBeenCalledWith("welcome_initial", receipt, "re_synthetic");
  expect(marketing.verify).toHaveBeenCalledWith({ subscriberId: receipt.subscriberId, generation: 1, revision: 2,
    topicId: receipt.templateContract.topicId }, expect.objectContaining({ env }));
  expect(send).toHaveBeenCalledWith(expect.objectContaining({ ...message, to: [welcome.recipient] }), welcome.idempotencyKey, "re_synthetic");
  expect(marketing.verify.mock.invocationCallOrder[0]).toBeLessThan(storage.prepare.mock.invocationCallOrder[0]);
});
it.each(["blocked", "deferred"])("does not hand off a welcome when current preference verification is %s", async (eligibility) => {
  const { dependencies, storage, send } = setup(); marketing.verify.mockResolvedValue(eligibility);
  expect(await dispatchEmailIntents(dependencies)).toMatchObject({ accepted: 0, [eligibility]: 1 });
  expect(storage.prepare).not.toHaveBeenCalled(); expect(send).not.toHaveBeenCalled();
  expect(storage.finish).toHaveBeenCalledWith(welcome.id, welcome.leaseToken, {
    kind: eligibility === "blocked" ? "blocked" : "retry", code: eligibility === "blocked" ? "marketing_not_eligible" : "marketing_preferences_unavailable",
  });
});
it("rechecks preferences on an uncertain retry while reusing the frozen request after template changes", async () => {
  const first = setup(); first.send.mockRejectedValueOnce(new Error("response lost"));
  await dispatchEmailIntents(first.dependencies);
  const frozen = first.storage.prepare.mock.calls[0][2];
  marketing.render.mockClear(); marketing.verify.mockClear();
  const retry = setup({ ...welcome, requestPayload: frozen, firstAttemptAt: new Date().toISOString(), attemptCount: 1 });
  marketing.render.mockRejectedValue(new MarketingProviderError("provider_contract_invalid"));
  expect(await dispatchEmailIntents(retry.dependencies)).toMatchObject({ accepted: 1 });
  expect(marketing.render).not.toHaveBeenCalled(); expect(marketing.verify).toHaveBeenCalledOnce();
  expect(retry.send).toHaveBeenCalledWith(frozen, welcome.idempotencyKey, "re_synthetic");
});
it.each(["provider_unavailable", "provider_contract_invalid"] as const)("handles native template %s without a handoff", async (code) => {
  const { dependencies, storage, send } = setup(); marketing.render.mockRejectedValue(new MarketingProviderError(code));
  expect(await dispatchEmailIntents(dependencies)).toMatchObject({ accepted: 0, [code === "provider_unavailable" ? "deferred" : "blocked"]: 1 });
  expect(send).not.toHaveBeenCalled(); expect(storage.prepare).not.toHaveBeenCalled();
});
it("keeps address confirmation separate from promotional preferences and caps", async () => {
  const confirmation = { ...welcome, purpose: "marketing_confirmation", receipt: { ...receipt, confirmationToken: "C".repeat(43), preferenceToken: undefined } } as EmailIntent;
  const { dependencies, send } = setup(confirmation);
  marketing.render.mockResolvedValue({ from: message.from, reply_to: message.reply_to, subject: "Confirm your subscription", html: "<p>Confirm</p>", text: "Confirm" });
  expect(await dispatchEmailIntents(dependencies)).toMatchObject({ accepted: 1 });
  expect(marketing.verify).not.toHaveBeenCalled(); expect(send.mock.calls[0][0]).not.toHaveProperty("topic_id");
});
it("does not render or inspect provider preferences for a disallowed recipient", async () => {
  const { dependencies, send } = setup({ ...welcome, recipient: "customer@example.test" });
  expect(await dispatchEmailIntents(dependencies)).toMatchObject({ blocked: 1 });
  expect(send).not.toHaveBeenCalled(); expect(marketing.render).not.toHaveBeenCalled(); expect(marketing.verify).not.toHaveBeenCalled();
});
