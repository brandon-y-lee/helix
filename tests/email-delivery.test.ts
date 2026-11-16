import { expect, it, vi } from "vitest";
import { dispatchEmailIntents, type EmailDeliveryDependencies } from "@/lib/email/delivery";
import type { EmailIntent } from "@/lib/email/types";

const intent: EmailIntent = {
  id: "f83164ef-c327-44ae-bbb4-bbd25d254abc", environment: "sandbox", purpose: "order_confirmation",
  recipient: "delivered@resend.dev", receipt: {
    orderNumber: "HX-DEMO-1", currency: "USD", items: [{ name: "Cleanser", quantity: 1, unitPriceCents: 2500, lineSubtotalCents: 2500 }],
    merchandiseSubtotalCents: 2500, discountCents: 0, shippingCents: 500, taxCents: 0, totalCents: 3000,
    shippingName: "Demo Customer", shippingAddress: { line1: "123 Synthetic St", city: "Los Angeles", state: "CA", postal_code: "90001", country: "US" },
  }, requestPayload: null, idempotencyKey: "sandbox/order_confirmation/f83164ef-c327-44ae-bbb4-bbd25d254abc",
  firstAttemptAt: null, attemptCount: 0, leaseToken: "95667ec4-3f31-450b-85e2-ec6817b6e558",
};
const env = {
  HELIX_EMAIL_ENVIRONMENT: "sandbox", HELIX_EMAIL_MODE: "restricted", HELIX_EMAIL_DISPATCH_ENABLED: "true",
  HELIX_EMAIL_SITE_ORIGIN: "https://helixskin.vercel.app", HELIX_EMAIL_ORDER_FROM: "Helix <onboarding@resend.dev>",
  HELIX_EMAIL_REPLY_TO: "support@helix-test.resend.app", HELIX_EMAIL_OWNER_RECIPIENT: "owner@example.test",
  HELIX_EMAIL_ALLOW_SIMULATORS: "true", RESEND_API_KEY: "re_synthetic_test",
};
function setup(overrides: Partial<EmailIntent> = {}) {
  const row = { ...intent, ...overrides } as EmailIntent;
  const storage = {
    claim: vi.fn().mockResolvedValue([row]),
    prepare: vi.fn().mockImplementation(async (_id, _lease, payload) => ({ ...row, requestPayload: row.requestPayload ?? payload, firstAttemptAt: row.firstAttemptAt ?? new Date().toISOString() })),
    finish: vi.fn().mockResolvedValue(true),
  };
  const send = vi.fn().mockResolvedValue({ kind: "accepted", id: "email-provider-1" });
  const dependencies: EmailDeliveryDependencies = { storage, send, env };
  return { dependencies, storage, send };
}

it("dispatches a frozen demo receipt to its allowed recipient with one stable key", async () => {
  const { dependencies, storage, send } = setup();
  expect(await dispatchEmailIntents(dependencies)).toEqual({ claimed: 1, accepted: 1, deferred: 0, blocked: 0 });
  expect(storage.prepare).toHaveBeenCalledOnce();
  expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: ["delivered@resend.dev"], subject: expect.stringContaining("DEMO") }), intent.idempotencyKey, "re_synthetic_test");
  expect(storage.finish).toHaveBeenCalledWith(intent.id, intent.leaseToken, { kind: "accepted", id: "email-provider-1" });
});

it("never reroutes an unapproved customer's private receipt to the owner", async () => {
  const { dependencies, send, storage } = setup({ recipient: "customer@example.test" });
  expect(await dispatchEmailIntents(dependencies)).toMatchObject({ blocked: 1, accepted: 0 });
  expect(send).not.toHaveBeenCalled();
  expect(storage.prepare).not.toHaveBeenCalled();
  expect(storage.finish).toHaveBeenCalledWith(intent.id, intent.leaseToken, { kind: "blocked", code: "recipient_not_allowed" });
});

it("reuses the identical frozen request after a lost send response despite template and domain changes", async () => {
  const first = setup();
  first.send.mockRejectedValueOnce(new Error("lost provider response with private address"));
  expect(await dispatchEmailIntents(first.dependencies)).toMatchObject({ deferred: 1 });
  const frozen = first.storage.prepare.mock.calls[0][2];
  expect(first.storage.finish).toHaveBeenCalledWith(intent.id, intent.leaseToken, { kind: "uncertain", code: "provider_connection_uncertain" });
  const retry = setup({ requestPayload: frozen, firstAttemptAt: new Date().toISOString(), attemptCount: 1 });
  retry.dependencies.env = { ...env, HELIX_EMAIL_SITE_ORIGIN: "https://new-domain.example", HELIX_EMAIL_ORDER_FROM: "Helix <orders@new-domain.example>" };
  await dispatchEmailIntents(retry.dependencies);
  expect(retry.send).toHaveBeenCalledWith(frozen, intent.idempotencyKey, "re_synthetic_test");
  expect(retry.send.mock.calls[0][0]).toEqual(first.send.mock.calls[0][0]);
});

it("does not send an uncertain request near the end of the provider idempotency window", async () => {
  const old = setup({ firstAttemptAt: new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString(), attemptCount: 1 });
  await dispatchEmailIntents(old.dependencies);
  expect(old.send).not.toHaveBeenCalled();
  expect(old.storage.finish).toHaveBeenCalledWith(intent.id, intent.leaseToken, { kind: "uncertain", code: "reconciliation_required" });
});

it("does not send after the claim was fenced by another worker or an early delivery callback", async () => {
  const { dependencies, storage, send } = setup();
  storage.prepare.mockResolvedValue(null);
  expect(await dispatchEmailIntents(dependencies)).toMatchObject({ deferred: 1, accepted: 0 });
  expect(send).not.toHaveBeenCalled();
});

it("pauses dispatch without requiring or touching provider credentials", async () => {
  const { dependencies, storage, send } = setup();
  dependencies.env = { ...env, HELIX_EMAIL_DISPATCH_ENABLED: "false", RESEND_API_KEY: "" };
  expect(await dispatchEmailIntents(dependencies)).toMatchObject({ claimed: 0 });
  expect(storage.claim).not.toHaveBeenCalled();
  expect(send).not.toHaveBeenCalled();
});
it.each(["Helix <onboarding@resend.dev", "onboarding@resend.dev>"])("blocks only the affected intent for malformed sender identity %s", async (from) => {
  const { dependencies, storage, send } = setup();
  dependencies.env = { ...env, HELIX_EMAIL_ORDER_FROM: from };
  expect(await dispatchEmailIntents(dependencies)).toMatchObject({ claimed: 1, blocked: 1 });
  expect(storage.finish).toHaveBeenCalledWith(intent.id, intent.leaseToken, { kind: "blocked", code: "invalid_email_identity" });
  expect(send).not.toHaveBeenCalled();
});

it("delivers a simulated tracking event through the same stable private message path", async () => {
  const { dependencies, storage, send } = setup({ purpose: "order_tracking", receipt: {
    orderNumber: "HX-DEMO-1", shipmentNumber: 2, status: "dispatched", occurredAt: "2026-09-28T12:00:00Z",
    items: [{ name: "Cleanser", variantLabel: "100 ml", quantity: 1 }],
  } });
  expect(await dispatchEmailIntents(dependencies)).toMatchObject({ accepted: 1 });
  expect(send.mock.calls[0][0].subject).toMatch(/DEMO.*HX-DEMO-1/);
  expect(send.mock.calls[0][0].text).toContain("All carrier events are simulated.");
  expect(send.mock.calls[0][0].text).not.toContain("123 Synthetic St");
  storage.prepare.mockResolvedValue(null);
  send.mockClear();
  expect(await dispatchEmailIntents(dependencies)).toMatchObject({ accepted: 0, deferred: 1 });
  expect(send).not.toHaveBeenCalled();
});

it("does not require a current sender to retry an already frozen request", async () => {
  const initial = setup();
  await dispatchEmailIntents(initial.dependencies);
  const frozen = initial.send.mock.calls[0][0];
  const retry = setup({ requestPayload: frozen, firstAttemptAt: new Date().toISOString(), attemptCount: 1 });
  retry.dependencies.env = { ...env, HELIX_EMAIL_ORDER_FROM: "" };
  await dispatchEmailIntents(retry.dependencies);
  expect(retry.send).toHaveBeenCalledWith(frozen, intent.idempotencyKey, "re_synthetic_test");
});

it("keeps a support conversation's frozen receiving domain and RFC headers across a domain switch", async () => {
  const replyTo = `reply-${"a".repeat(48)}@previous.example`;
  const reply: Partial<EmailIntent> = { purpose: "support_reply", receipt: {
    renderVersion: "support-text-v2", inquiryId: "76041b97-2f83-4f66-89b4-2fdb7d754889",
    messageId: "c6b256dd-f1cd-414c-a14e-64741656e0ca", inquiryRevision: 3, draftVersion: 1,
    subject: "Your product question", body: "Thank you for the additional detail.",
    html: '<div style="white-space: pre-wrap">Thank you for the additional detail.</div>', attachments: [],
    replyTo, headers: { "In-Reply-To": "<customer-message@example.test>", References: "<customer-message@example.test>" },
  } };
  const first = setup(reply);
  const supportEnv = { ...env, HELIX_EMAIL_SUPPORT_FROM: "Helix <onboarding@resend.dev>", HELIX_EMAIL_REPLY_TO: "support@new.example" };
  first.dependencies.env = supportEnv;
  first.send.mockRejectedValueOnce(new Error("lost response"));
  expect(await dispatchEmailIntents(first.dependencies)).toMatchObject({ deferred: 1 });
  const frozen = first.storage.prepare.mock.calls[0][2];
  expect(frozen).toMatchObject({ reply_to: replyTo, headers: reply.receipt && "headers" in reply.receipt ? reply.receipt.headers : undefined });
  expect(frozen).not.toHaveProperty("attachments");
  const retry = setup({ ...reply, requestPayload: frozen, firstAttemptAt: new Date().toISOString(), attemptCount: 1 });
  retry.dependencies.env = { ...supportEnv, HELIX_EMAIL_SUPPORT_FROM: "", HELIX_EMAIL_REPLY_TO: "support@another.example" };
  expect(await dispatchEmailIntents(retry.dependencies)).toMatchObject({ accepted: 1 });
  expect(retry.send).toHaveBeenCalledWith(frozen, intent.idempotencyKey, "re_synthetic_test");
});

it("delivers a requested Product notice with its own sender and preserves its first request across retries", async () => {
  const product = {
    purpose: "product_availability" as const,
    receipt: { schemaVersion: 1 as const, enrollmentId: 12, generation: 2, transitionId: 8,
      productId: "cbff59d2-b98d-4da9-9c04-697f98553eac", productName: "Current Serum", productSlug: "current-serum" },
    idempotencyKey: "sandbox/product_availability/enrollment-12-generation-2-transition-8",
  };
  const first = setup(product);
  first.dependencies.env = { ...env, HELIX_EMAIL_ORDER_FROM: "", HELIX_EMAIL_PRODUCT_FROM: "Helix <onboarding@resend.dev>" };
  first.send.mockRejectedValueOnce(new Error("response lost"));
  expect(await dispatchEmailIntents(first.dependencies)).toMatchObject({ deferred: 1 });
  const frozen = first.storage.prepare.mock.calls[0][2];
  expect(frozen).toMatchObject({ from: "Helix <onboarding@resend.dev>", to: ["delivered@resend.dev"],
    subject: "[DEMO] helix — Current Serum is ready for Checkout" });
  expect(frozen.text).toContain("https://helixskin.vercel.app/products/current-serum");
  const retry = setup({ ...product, receipt: { ...product.receipt, productName: "Changed Serum", productSlug: "renamed-serum" },
    requestPayload: frozen, firstAttemptAt: new Date().toISOString(), attemptCount: 1 });
  retry.dependencies.env = { ...env, HELIX_EMAIL_SITE_ORIGIN: "https://changed.example", HELIX_EMAIL_PRODUCT_FROM: "" };
  expect(await dispatchEmailIntents(retry.dependencies)).toMatchObject({ accepted: 1 });
  expect(retry.send).toHaveBeenCalledWith(frozen, product.idempotencyKey, "re_synthetic_test");
});

it("delivers private cancellation links through the restricted shared envelope without a marketing Topic", async () => {
  const recovery = { purpose: "product_waitlist_recovery" as const,
    receipt: { schemaVersion: 1 as const, links: [{ enrollmentId: 12, generation: 2,
      productId: "cbff59d2-b98d-4da9-9c04-697f98553eac", productName: "Current Serum", token: "a".repeat(43), expiresAt: "2030-01-01T00:00:00Z" }] },
    idempotencyKey: "sandbox/product_waitlist_recovery/request-1" };
  const first = setup(recovery);
  first.dependencies.env = { ...env, HELIX_EMAIL_PRODUCT_FROM: "Helix <onboarding@resend.dev>" };
  expect(await dispatchEmailIntents(first.dependencies)).toMatchObject({ accepted: 1 });
  expect(first.send).toHaveBeenCalledWith(expect.objectContaining({ from: "Helix <onboarding@resend.dev>", to: ["delivered@resend.dev"],
    subject: "helix — manage your Product notifications" }), recovery.idempotencyKey, "re_synthetic_test");
  expect(first.send.mock.calls[0][0].text).toContain(`https://helixskin.vercel.app/product-notifications?cancel=${"a".repeat(43)}`);
  expect(first.send.mock.calls[0][0]).not.toHaveProperty("topic_id");
  const restricted = setup({ ...recovery, recipient: "other@example.test" });
  restricted.dependencies.env = first.dependencies.env;
  expect(await dispatchEmailIntents(restricted.dependencies)).toMatchObject({ blocked: 1, accepted: 0 });
  expect(restricted.send).not.toHaveBeenCalled();
  expect(restricted.storage.prepare).not.toHaveBeenCalled();
});

it("does not fall back to the Order sender when a new Product notification has no valid sender", async () => {
  const item = setup({ purpose: "product_availability", receipt: { schemaVersion: 1, enrollmentId: 12, generation: 2, transitionId: 8,
    productId: "cbff59d2-b98d-4da9-9c04-697f98553eac", productName: "Current Serum", productSlug: "current-serum" } });
  expect(await dispatchEmailIntents(item.dependencies)).toMatchObject({ blocked: 1, accepted: 0 });
  expect(item.storage.finish).toHaveBeenCalledWith(intent.id, intent.leaseToken, { kind: "blocked", code: "invalid_email_identity" });
  expect(item.send).not.toHaveBeenCalled();
});
