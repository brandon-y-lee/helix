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
  const row = { ...intent, ...overrides };
  const storage = {
    claim: vi.fn().mockResolvedValue([row]),
    prepare: vi.fn().mockImplementation(async (_id, _lease, payload) => ({ ...row, requestPayload: row.requestPayload ?? payload, firstAttemptAt: row.firstAttemptAt ?? new Date().toISOString() })),
    finish: vi.fn().mockResolvedValue(true),
  };
  const send = vi.fn().mockResolvedValue({ kind: "accepted", id: "email-provider-1" });
  const dependencies = { storage, send, env } satisfies EmailDeliveryDependencies;
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
it.each(["Helix <onboarding@resend.dev", "onboarding@resend.dev>"])("fails closed on malformed sender identity %s", async (from) => {
  const { dependencies, storage, send } = setup();
  dependencies.env = { ...env, HELIX_EMAIL_ORDER_FROM: from };
  await expect(dispatchEmailIntents(dependencies)).rejects.toThrow("configuration");
  expect(storage.claim).not.toHaveBeenCalled();
  expect(send).not.toHaveBeenCalled();
});
