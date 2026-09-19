import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PaymentOperationsView } from "@/lib/admin/payments/types";
import { PaymentOperationsView as OperationsView } from "@/components/admin/payments/PaymentOperationsView";
import { PaymentReplayAction } from "@/components/admin/payments/PaymentReplayAction";

const navigation = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));

const view: PaymentOperationsView = {
  accountId: "acct_sandbox", environment: "sandbox", observedAt: "2026-09-19T02:00:00Z",
  heartbeat: { startedAt: "2026-09-19T01:51:00Z", completedAt: "2026-09-19T01:52:00Z", processedCount: 2, failureCount: 1 },
  counts: { pending: 2, processing: 1, processed: 10, ignored: 0, dead_letter: 1 },
  oldestPendingAt: "2026-09-19T01:40:00Z",
  health: { heartbeatStale: true, heartbeatAgeSeconds: 480, oldestPendingAgeSeconds: 1200, overdue: true, queueDepth: 3 },
  items: [{ id: "11111111-1111-4111-8111-111111111111", eventId: "evt_failed", eventType: "checkout.session.completed",
    objectId: "cs_test_example", state: "dead_letter", attempts: 12, lifetimeAttempts: 12, version: 3,
    receivedAt: "2026-09-19T01:40:00Z", nextAttemptAt: "2026-09-19T01:50:00Z", processedAt: null,
    incidentCode: "attempts_exhausted", replayEligible: false, provenance: "webhook" }],
  incidents: [{ id: "incident_example", itemId: "11111111-1111-4111-8111-111111111111", code: "verification_mismatch", createdAt: "2026-09-19T01:45:00Z", resolvedAt: null }],
  refunds: [
    { refundId: "re_pending", chargeId: "ch_example", paymentIntentId: "pi_example", amountCents: 2500, currency: "usd", status: "pending", observedAt: "2026-09-19T01:59:00Z", succeededPreviously: false },
    { refundId: "re_succeeded", chargeId: "ch_example", paymentIntentId: "pi_example", amountCents: 500, currency: "usd", status: "succeeded", observedAt: "2026-09-19T01:58:00Z", succeededPreviously: false },
  ],
};

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("payment operations presentation", () => {
  it("shows sandbox health and minimal current facts without claiming pending refunds returned money", () => {
    const { container } = render(<OperationsView operations={{ ...view, secret: "raw provider payload", customerEmail: "private@example.com" } as PaymentOperationsView} />);
    expect(screen.getByRole("heading", { name: "Sandbox payments" })).toBeVisible();
    expect(screen.getByText("acct_sandbox")).toBeVisible();
    expect(screen.getByText(/Heartbeat stale/)).toBeVisible();
    expect(screen.getByText(/Pending work is older than 15 minutes/)).toBeVisible();
    expect(screen.getByText("Verification mismatch")).toBeVisible();
    const pending = screen.getByRole("article", { name: "Refund re_pending" });
    expect(within(pending).getByText("USD 25.00")).toBeVisible();
    expect(pending).toHaveTextContent("No returned money verified");
    const succeeded = screen.getByRole("article", { name: "Refund re_succeeded" });
    expect(succeeded).toHaveTextContent("Sandbox return verified");
    expect(container).not.toHaveTextContent("raw provider payload");
    expect(container).not.toHaveTextContent("private@example.com");
    expect(container.querySelectorAll("a")).toHaveLength(0);
  });
});

describe("operator event replay", () => {
  const itemId = "11111111-1111-4111-8111-111111111111";
  const requestId = "22222222-2222-4222-8222-222222222222";
  const fetchReplay = vi.fn();
  beforeEach(() => {
    navigation.refresh.mockReset();
    fetchReplay.mockReset();
    vi.stubGlobal("fetch", fetchReplay);
    vi.stubGlobal("crypto", { randomUUID: vi.fn(() => requestId) });
  });

  it("requires an eligible inspection, then explicitly applies the same exact reviewed request", async () => {
    fetchReplay.mockResolvedValueOnce(new Response(JSON.stringify({ status: "eligible", itemId, version: 3 })));
    fetchReplay.mockResolvedValueOnce(new Response(JSON.stringify({ status: "applied", itemId, version: 4 })));
    render(<PaymentReplayAction itemId={itemId} version={3} />);
    expect(screen.queryByRole("button", { name: "Queue replay" })).toBeNull();
    expect(screen.getByRole("button", { name: "Inspect replay" })).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox", { name: "Replay reason" }), { target: { value: "Provider outage resolved" } });
    fireEvent.click(screen.getByRole("button", { name: "Inspect replay" }));
    expect(await screen.findByRole("button", { name: "Queue replay" })).toBeEnabled();
    expect(fetchReplay).toHaveBeenCalledTimes(1);
    expect(fetchReplay.mock.calls[0][0]).toBe("/api/admin/payments/replay");
    expect(JSON.parse(fetchReplay.mock.calls[0][1].body)).toEqual({ itemId, expectedVersion: 3, reason: "Provider outage resolved", requestId, dryRun: true });
    fireEvent.click(screen.getByRole("button", { name: "Queue replay" }));
    await waitFor(() => expect(navigation.refresh).toHaveBeenCalledOnce());
    expect(JSON.parse(fetchReplay.mock.calls[1][1].body)).toEqual({ itemId, expectedVersion: 3, reason: "Provider outage resolved", requestId, dryRun: false });
    expect(fetchReplay.mock.calls[1][1]).toMatchObject({ method: "POST", cache: "no-store", credentials: "same-origin", referrerPolicy: "no-referrer" });
    expect(screen.getByRole("status")).toHaveTextContent("Replay queued");
    expect(screen.getByRole("status")).toHaveTextContent("This action does not confirm payment");
    expect(screen.queryByRole("button", { name: "Queue replay" })).toBeNull();
  });

  it("invalidates the inspection and creates a new request when the reason changes", async () => {
    const nextRequestId = "33333333-3333-4333-8333-333333333333";
    vi.mocked(crypto.randomUUID).mockReturnValueOnce(requestId).mockReturnValueOnce(nextRequestId);
    fetchReplay.mockImplementation(async () => new Response(JSON.stringify({ status: "eligible", itemId, version: 3 })));
    render(<PaymentReplayAction itemId={itemId} version={3} />);
    const reason = screen.getByRole("textbox", { name: "Replay reason" });
    fireEvent.change(reason, { target: { value: "Provider outage resolved" } });
    fireEvent.click(screen.getByRole("button", { name: "Inspect replay" }));
    await screen.findByRole("button", { name: "Queue replay" });
    fireEvent.change(reason, { target: { value: "Database availability restored" } });
    expect(screen.queryByRole("button", { name: "Queue replay" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Inspect replay" }));
    await screen.findByRole("button", { name: "Queue replay" });
    expect(JSON.parse(fetchReplay.mock.calls[1][1].body)).toMatchObject({ dryRun: true, reason: "Database availability restored", requestId: nextRequestId });
  });

  it("discards inspected state when a refreshed item version changes", async () => {
    fetchReplay.mockResolvedValue(new Response(JSON.stringify({ status: "eligible", itemId, version: 3 })));
    const { rerender } = render(<PaymentReplayAction itemId={itemId} version={3} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Replay reason" }), { target: { value: "Provider outage resolved" } });
    fireEvent.click(screen.getByRole("button", { name: "Inspect replay" }));
    await screen.findByRole("button", { name: "Queue replay" });
    rerender(<PaymentReplayAction itemId={itemId} version={4} />);
    expect(screen.queryByRole("button", { name: "Queue replay" })).toBeNull();
    expect(screen.getByRole("textbox", { name: "Replay reason" })).toHaveValue("");
    expect(navigation.refresh).not.toHaveBeenCalled();
  });

  it.each([409, 403])("removes apply after a %s conflict or access change without claiming success", async (status) => {
    fetchReplay.mockResolvedValueOnce(new Response(JSON.stringify({ status: "eligible", itemId, version: 3 })));
    fetchReplay.mockResolvedValueOnce(new Response(JSON.stringify({ error: "private failure details" }), { status }));
    render(<PaymentReplayAction itemId={itemId} version={3} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Replay reason" }), { target: { value: "Provider outage resolved" } });
    fireEvent.click(screen.getByRole("button", { name: "Inspect replay" }));
    fireEvent.click(await screen.findByRole("button", { name: "Queue replay" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(status === 409 ? "changed or is no longer eligible" : "Payment access has changed"));
    expect(screen.queryByRole("button", { name: "Queue replay" })).toBeNull();
    expect(screen.getByRole("status")).not.toHaveTextContent("private failure details");
    expect(navigation.refresh).not.toHaveBeenCalled();
  });

  it("does not unlock apply for an inspection result that identifies another event", async () => {
    fetchReplay.mockResolvedValueOnce(new Response(JSON.stringify({ status: "eligible", itemId: "44444444-4444-4444-8444-444444444444", version: 3 })));
    render(<PaymentReplayAction itemId={itemId} version={3} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Replay reason" }), { target: { value: "Provider outage resolved" } });
    fireEvent.click(screen.getByRole("button", { name: "Inspect replay" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Inspection could not be confirmed"));
    expect(screen.queryByRole("button", { name: "Queue replay" })).toBeNull();
  });

  it("preserves an uncertain apply when its acknowledgment does not identify the next version", async () => {
    fetchReplay.mockResolvedValueOnce(new Response(JSON.stringify({ status: "eligible", itemId, version: 3 })));
    fetchReplay.mockResolvedValueOnce(new Response(JSON.stringify({ status: "applied", itemId, version: 3 })));
    render(<PaymentReplayAction itemId={itemId} version={3} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Replay reason" }), { target: { value: "Provider outage resolved" } });
    fireEvent.click(screen.getByRole("button", { name: "Inspect replay" }));
    fireEvent.click(await screen.findByRole("button", { name: "Queue replay" }));
    await screen.findByRole("button", { name: "Retry replay" });
    expect(screen.getByRole("status")).toHaveTextContent("Replay outcome could not be confirmed");
    expect(navigation.refresh).not.toHaveBeenCalled();
  });

  it("aborts an uncertain apply after ten seconds and retries only on request using the same UUID", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    fetchReplay.mockResolvedValueOnce(new Response(JSON.stringify({ status: "eligible", itemId, version: 3 })));
    fetchReplay.mockImplementationOnce((_url, options: RequestInit) => new Promise((_resolve, reject) => {
      signal = options.signal!;
      signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    }));
    fetchReplay.mockResolvedValueOnce(new Response(JSON.stringify({ status: "duplicate", itemId, version: 4 })));
    render(<PaymentReplayAction itemId={itemId} version={3} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Replay reason" }), { target: { value: "Provider outage resolved" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Inspect replay" })));
    fireEvent.click(screen.getByRole("button", { name: "Queue replay" }));
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(signal?.aborted).toBe(true);
    expect(fetchReplay).toHaveBeenCalledTimes(2);
    expect(navigation.refresh).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("Replay outcome could not be confirmed");
    await act(() => vi.advanceTimersByTimeAsync(30_000));
    expect(fetchReplay).toHaveBeenCalledTimes(2);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Retry replay" })));
    expect(fetchReplay.mock.calls[1][1].body).toBe(fetchReplay.mock.calls[2][1].body);
    expect(navigation.refresh).toHaveBeenCalledOnce();
    expect(screen.getByRole("status")).toHaveTextContent("Replay was already queued");
  });
});
