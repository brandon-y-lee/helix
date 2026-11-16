import { beforeEach, describe, expect, it, vi } from "vitest";
const storage = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({ rpc: storage.rpc }) }));
import { bindCheckoutAttemptSession, CheckoutAttemptStorageError, findUnresolvedCheckoutOrder,
  readPendingCheckoutAttempt, startCheckoutAttemptSend } from "@/lib/checkout/attempts";
const orderId = "11111111-1111-4111-8111-111111111111";
const attemptId = "22222222-2222-4222-8222-222222222222";
const attemptToken = "33333333-3333-4333-8333-333333333333";
const stripeIdempotencyKey = `stripe-session:${orderId}:initial`;
beforeEach(() => { vi.resetAllMocks(); storage.rpc.mockResolvedValue({ data: null, error: null }); });
describe("single-send checkout boundary", () => {
  it("requires a positive durable permission before a provider invocation", async () => {
    const input = { orderId, attemptId, attemptToken, stripeIdempotencyKey };
    for (const data of [null, {}, "true", 1]) {
      storage.rpc.mockResolvedValueOnce({ data, error: null });
      await expect(startCheckoutAttemptSend(input)).rejects.toBeInstanceOf(CheckoutAttemptStorageError);
    }
    storage.rpc.mockResolvedValueOnce({ data: false, error: null });
    await expect(startCheckoutAttemptSend(input)).resolves.toBe(false);
  });
  it("redacts database failures rather than exposing private provider metadata", async () => {
    storage.rpc.mockRejectedValueOnce(new Error("buyer@example.com raw provider response"));
    await expect(findUnresolvedCheckoutOrder({ cartId: orderId })).rejects.toThrow("Checkout verification is temporarily unavailable.");
  });
  it("does not let provider metadata alone manufacture a local contract", async () => {
    await expect(readPendingCheckoutAttempt({ orderId, attemptId })).resolves.toBeNull();
    storage.rpc.mockResolvedValueOnce({ data: { attemptId, orderId, stripeIdempotencyKey, sendStarted: true, legacy: false, contract: {} }, error: null });
    await expect(readPendingCheckoutAttempt({ orderId, attemptId })).rejects.toBeInstanceOf(CheckoutAttemptStorageError);
  });
  it("refuses live or malformed Session references before storage", async () => {
    await expect(bindCheckoutAttemptSession({ orderId, attemptId, stripeIdempotencyKey, sessionId: "cs_live_bad", customerId: null }))
      .rejects.toBeInstanceOf(CheckoutAttemptStorageError);
    expect(storage.rpc).not.toHaveBeenCalled();
  });
  it("preserves a binding conflict instead of claiming success", async () => {
    storage.rpc.mockResolvedValueOnce({ data: false, error: null });
    await expect(bindCheckoutAttemptSession({ orderId, attemptId, stripeIdempotencyKey, sessionId: "cs_test_original", customerId: null })).resolves.toBe(false);
  });
  it("accepts only a private Order identifier from the cart barrier", async () => {
    storage.rpc.mockResolvedValueOnce({ data: { customerEmail: "buyer@example.com" }, error: null });
    await expect(findUnresolvedCheckoutOrder({ cartId: orderId })).rejects.toBeInstanceOf(CheckoutAttemptStorageError);
  });
});
