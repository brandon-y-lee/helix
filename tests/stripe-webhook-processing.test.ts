import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";

const boundary = vi.hoisted(() => ({ from: vi.fn(), reconcile: vi.fn(), refund: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({ from: boundary.from }) }));
vi.mock("@/lib/orders/server", () => ({ reconcileCheckoutSessionOutcome: boundary.reconcile }));
vi.mock("@/lib/orders/refunds", () => ({ reconcileFullStripeRefund: boundary.refund }));
import { processStripeWebhookEvent } from "@/lib/stripe/webhook";

const event = { id: "evt_test_retries", type: "checkout.session.completed", livemode: false,
  api_version: "2026-06-24.dahlia", request: null,
  data: { object: { id: "cs_test_checkout" } } } as Stripe.Event;

function storage(input: { processed?: boolean; conflict?: boolean; finishError?: boolean } = {}) {
  const writes: Record<string, unknown>[] = [];
  let mode = "read";
  const response = () => ({ data: mode === "read" ? { processed_at: input.processed ? "done" : null } : null,
    error: mode === "insert" && input.conflict ? { code: "23505" }
      : mode === "finish" && input.finishError ? { message: "private storage details" } : null });
  const query = {
    select: () => query, eq: () => query, is: () => query,
    insert: (value: Record<string, unknown>) => { mode = "insert"; writes.push(value); return query; },
    update: (value: Record<string, unknown>) => { mode = "processed_at" in value ? "finish" : "failure"; writes.push(value); return query; },
    maybeSingle: async () => response(),
    then: (resolve: (value: ReturnType<typeof response>) => unknown) => Promise.resolve(response()).then(resolve),
  };
  boundary.from.mockImplementation(() => { mode = "read"; return query; });
  return { writes, query };
}

beforeEach(() => {
  vi.resetAllMocks();
  boundary.reconcile.mockResolvedValue({ status: "completed", order: null });
});

describe("synchronous webhook completion", () => {
  it("deduplicates completed events without repeating effects", async () => {
    storage({ processed: true });
    expect(await processStripeWebhookEvent(event)).toEqual({ action: "duplicate", type: event.type });
    expect(boundary.reconcile).not.toHaveBeenCalled();
  });

  it("reconciles unfinished records instead of acknowledging a stale processing claim", async () => {
    const { writes } = storage();
    expect(await processStripeWebhookEvent(event)).toEqual({ action: "processed", type: event.type });
    expect(boundary.reconcile).toHaveBeenCalledWith("cs_test_checkout");
    expect(writes).toEqual([{ processed_at: expect.any(String), processing_error: null }]);
  });

  it.each(["pending", "exception"])("keeps %s outcomes retryable", async (status) => {
    const { writes } = storage();
    boundary.reconcile.mockResolvedValue({ status, order: null });
    await expect(processStripeWebhookEvent(event)).rejects.toThrow("not complete");
    expect(writes).toEqual([{ processing_error: "payment_reconciliation_failed" }]);
  });

  it("waits for local effects before recording completion", async () => {
    const { writes } = storage();
    let complete!: () => void;
    boundary.reconcile.mockImplementation(() => new Promise((resolve) => { complete = () => resolve({ status: "completed" }); }));
    const handling = processStripeWebhookEvent(event);
    await vi.waitFor(() => expect(boundary.reconcile).toHaveBeenCalledOnce());
    expect(writes).toEqual([]);
    complete();
    await handling;
    expect(writes[0]).toHaveProperty("processed_at");
  });

  it("does not acknowledge a failed completion write", async () => {
    const { writes } = storage({ finishError: true });
    await expect(processStripeWebhookEvent(event)).rejects.toThrow("Failed to mark webhook processed");
    expect(writes.at(-1)).toEqual({ processing_error: "payment_reconciliation_failed" });
  });

  it("retries settlement even when a concurrent delivery inserted the event", async () => {
    const { query, writes } = storage({ conflict: true });
    query.maybeSingle = async () => ({ data: null, error: null });
    await processStripeWebhookEvent(event);
    expect(boundary.reconcile).toHaveBeenCalledOnce();
    expect(writes[0]).toMatchObject({ payload: { object_id: "cs_test_checkout" } });
  });

  it("leaves full refund failures retryable", async () => {
    const { writes } = storage();
    boundary.refund.mockRejectedValue(new Error("private provider data"));
    await expect(processStripeWebhookEvent({ ...event, type: "charge.refunded",
      data: { object: { id: "ch_test" } } } as Stripe.Event)).rejects.toThrow();
    expect(writes).toEqual([{ processing_error: "payment_reconciliation_failed" }]);
  });

  it("rejects live events and schema drift before local effects", async () => {
    storage();
    await expect(processStripeWebhookEvent({ ...event, livemode: true })).rejects.toThrow();
    await expect(processStripeWebhookEvent({ ...event, api_version: "2020-01-01" } as Stripe.Event)).rejects.toThrow();
    expect(boundary.from).not.toHaveBeenCalled();
  });
});
