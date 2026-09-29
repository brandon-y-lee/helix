import { describe, expect, it, vi } from "vitest";
import { dispatchEmailIntents, type EmailDeliveryDependencies } from "@/lib/email/delivery";
import type { EmailIntent } from "@/lib/email/types";

const reply: EmailIntent = {
  id: "f83164ef-c327-44ae-bbb4-bbd25d254abc", environment: "sandbox", purpose: "support_reply",
  recipient: "delivered@resend.dev", receipt: {
    renderVersion: "support-text-v1", inquiryId: "5728e722-cc81-43be-b446-0695c7dc3aef",
    messageId: "870de323-e64a-456a-9a27-3b39d48dd659", inquiryRevision: 2, draftVersion: 1,
    subject: "Your routine question", body: "Human-approved response.",
    html: '<div style="white-space: pre-wrap">Human-approved response.</div>', attachments: [],
  }, requestPayload: null, idempotencyKey: "sandbox/support_reply/870de323-e64a-456a-9a27-3b39d48dd659",
  firstAttemptAt: null, attemptCount: 0, leaseToken: "95667ec4-3f31-450b-85e2-ec6817b6e558",
};
const env = {
  HELIX_EMAIL_ENVIRONMENT: "sandbox", HELIX_EMAIL_MODE: "restricted", HELIX_EMAIL_DISPATCH_ENABLED: "true",
  HELIX_EMAIL_SITE_ORIGIN: "https://helixskin.vercel.app", HELIX_EMAIL_SUPPORT_FROM: "Helix <onboarding@resend.dev>",
  HELIX_EMAIL_REPLY_TO: "support@helix-test.resend.app", HELIX_EMAIL_OWNER_RECIPIENT: "owner@example.test",
  HELIX_EMAIL_ALLOW_SIMULATORS: "true", RESEND_API_KEY: "re_synthetic_test",
};
function setup(intent = reply) {
  const storage = {
    claim: vi.fn().mockResolvedValue([intent]),
    prepare: vi.fn().mockImplementation(async (_id, _lease, payload) => ({ ...intent,
      requestPayload: intent.requestPayload ?? payload, firstAttemptAt: intent.firstAttemptAt ?? new Date().toISOString() })),
    finish: vi.fn().mockResolvedValue(true),
  };
  const send = vi.fn().mockResolvedValue({ kind: "accepted", id: "synthetic-email" });
  return { storage, send, dependencies: { storage, send, env } satisfies EmailDeliveryDependencies };
}

describe("support through shared delivery", () => {
  it("sends exact approved content using Support identity without an unrelated Order sender", async () => {
    const { dependencies, send } = setup();
    expect(await dispatchEmailIntents(dependencies)).toMatchObject({ accepted: 1 });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ from: env.HELIX_EMAIL_SUPPORT_FROM,
      to: [reply.recipient], subject: reply.receipt.subject, text: reply.receipt.body, html: reply.receipt.html }),
    reply.idempotencyKey, env.RESEND_API_KEY);
  });

  it("does not call Resend when the authoritative approval check rejects a stale draft", async () => {
    const { dependencies, storage, send } = setup();
    storage.prepare.mockResolvedValue(null);
    expect(await dispatchEmailIntents(dependencies)).toMatchObject({ deferred: 1, accepted: 0 });
    expect(send).not.toHaveBeenCalled();
  });

  it("blocks an unapproved recipient without redirecting support content to the owner", async () => {
    const { dependencies, storage, send } = setup({ ...reply, recipient: "customer@example.test" });
    expect(await dispatchEmailIntents(dependencies)).toMatchObject({ blocked: 1, accepted: 0 });
    expect(storage.prepare).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("uses only the generic acknowledgement after public intake", async () => {
    const body = "We received your support inquiry. A member of Helix will review it. This acknowledgement does not confirm that a reply has been sent.";
    const { dependencies, send } = setup({ ...reply, purpose: "support_acknowledgement", receipt: {
      renderVersion: "support-ack-v1", inquiryId: "5728e722-cc81-43be-b446-0695c7dc3aef",
      subject: "Helix received your inquiry", body, html: `<div style="white-space: pre-wrap">${body}</div>`, attachments: [],
    } });
    expect(await dispatchEmailIntents(dependencies)).toMatchObject({ accepted: 1 });
    expect(send.mock.calls[0][0]).toMatchObject({ subject: "Helix received your inquiry", text: body });
  });
});
