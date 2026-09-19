// @vitest-environment node
import Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/webhooks/stripe/route";

const boundary = vi.hoisted(() => ({ rpc: vi.fn(), fetch: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ rpc: boundary.rpc }) }));

const webhookSecret = "whsec_synthetic_transport_test";
const itemId = "00000000-0000-4000-8000-000000000001";
function event(change: Record<string, unknown> = {}) {
  return {
    id: "evt_transport123", object: "event", type: "checkout.session.completed",
    api_version: "2026-06-24.dahlia", created: 1_789_747_200, livemode: false,
    data: { object: { id: "cs_test_transport123", object: "checkout.session", livemode: false, payment_intent: "pi_payment123", customer_email: "private@example.com" } },
    ...change,
  };
}
function signedRequest(payload = JSON.stringify(event()), change: RequestInit = {}): Request {
  return new Request("https://helixskin.vercel.app/api/webhooks/stripe", {
    method: "POST", body: payload,
    headers: { "stripe-signature": Stripe.webhooks.generateTestHeaderString({ payload, secret: webhookSecret }) },
    ...change,
  });
}
function expectPrivate(response: Response) {
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CHECKOUT_ENABLED", "false");
  vi.stubEnv("CHECKOUT_MODE", "sandbox");
  vi.stubEnv("STRIPE_ACCOUNT_ID", "acct_1Tm9WRFEzyaKzdmq");
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_synthetic_transport");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", webhookSecret);
  vi.stubEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://erasogmsqpgiirovubjh.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "synthetic-service-key");
  vi.stubGlobal("fetch", boundary.fetch);
  boundary.fetch.mockRejectedValue(new Error("Webhook receipt must not fetch provider objects."));
  boundary.rpc.mockResolvedValue({ data: { status: "received", itemId }, error: null });
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("durable signed payment webhook intake", () => {
  it("accepts a receipt with creation disabled without running provider reconciliation", async () => {
    const response = await POST(signedRequest());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expectPrivate(response);
    expect(boundary.rpc.mock.calls.map(([name]) => name)).toEqual(["receive_payment_event"]);
    expect(JSON.stringify(boundary.rpc.mock.calls)).not.toContain("private@example.com");
    expect(boundary.fetch).not.toHaveBeenCalled();
  });

  it("does not acknowledge while the durable receipt transaction is unresolved", async () => {
    let commit!: (result: unknown) => void;
    boundary.rpc.mockImplementation(() => new Promise((resolve) => { commit = resolve; }));
    let responded = false;
    const pending = POST(signedRequest()).then((response) => { responded = true; return response; });
    await vi.waitFor(() => expect(commit).toBeTypeOf("function"));
    expect(responded).toBe(false);
    commit({ data: { status: "received", itemId }, error: null });
    const response = await pending;
    expect(response.status).toBe(200);
    expect(boundary.fetch).not.toHaveBeenCalled();
  });

  it("acknowledges an existing durable receipt without disclosing its processing state", async () => {
    boundary.rpc.mockResolvedValue({ data: { status: "duplicate", itemId }, error: null });
    const response = await POST(signedRequest());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expectPrivate(response);
  });

  it.each([
    { data: null, error: { message: "private database detail" } },
    { data: null, error: null },
    { data: { status: "unknown", itemId }, error: null },
  ])("returns a retryable redacted failure when no receipt is proven", async (result) => {
    boundary.rpc.mockResolvedValue(result);
    const response = await POST(signedRequest());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private");
    expectPrivate(response);
  });

  it("does not acknowledge an event ID whose durable identity conflicts", async () => {
    boundary.rpc.mockResolvedValue({ data: { status: "conflict", itemId }, error: null });
    const response = await POST(signedRequest());
    expect(response.status).toBe(409);
    expectPrivate(response);
  });

  it("verifies exact raw bytes including formatting and non-ASCII text", async () => {
    const payload = `${JSON.stringify({ ...event(), harmless: "Crème ☀" }, null, 2)}\n`;
    const response = await POST(signedRequest(payload));
    expect(response.status).toBe(200);
    const altered = await POST(signedRequest(payload, { body: `${payload} ` }));
    expect(altered.status).toBe(400);
  });

  it.each([null, "invalid", `t=1,v1=${"a".repeat(64)}`])("rejects invalid or expired signatures before storage", async (signature) => {
    const headers = new Headers();
    if (signature) headers.set("stripe-signature", signature);
    const response = await POST(signedRequest(undefined, { headers }));
    expect(response.status).toBe(400);
    expectPrivate(response);
    expect(boundary.rpc).not.toHaveBeenCalled();
  });

  it.each([
    [{ livemode: true }, 403], [{ account: "acct_foreign" }, 403], [{ context: "acct_foreign" }, 403],
    [{ api_version: "2025-01-01" }, 400], [{ type: "invoice.paid" }, 400],
    [{ data: { object: { id: "cs_live_wrong", object: "checkout.session", livemode: true } } }, 403],
  ] as const)("rejects incompatible signed payment data before storage", async (change, status) => {
    const response = await POST(signedRequest(JSON.stringify(event(change))));
    expect(response.status).toBe(status);
    expectPrivate(response);
    expect(boundary.rpc).not.toHaveBeenCalled();
  });

  it("fails closed with a redacted service error for live or missing provider configuration", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_must_never_be_used");
    const response = await POST(signedRequest());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("sk_live");
    expectPrivate(response);
    expect(boundary.rpc).not.toHaveBeenCalled();
  });

  it.each([undefined, "1"])("enforces the actual 1 MiB stream with Content-Length %s", async (contentLength) => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(1024 * 1024));
        controller.enqueue(new Uint8Array(1));
      }, cancel() { cancelled = true; },
    });
    const headers = new Headers({ "stripe-signature": "synthetic" });
    if (contentLength) headers.set("content-length", contentLength);
    const request = new Request("https://helixskin.vercel.app/api/webhooks/stripe", {
      method: "POST", headers, body: stream, duplex: "half",
    } as RequestInit);
    const response = await POST(request);
    expect(response.status).toBe(413);
    expect(cancelled).toBe(true);
    expectPrivate(response);
    expect(boundary.rpc).not.toHaveBeenCalled();
  });

  it("accepts a signed body exactly at 1 MiB", async () => {
    const body = JSON.stringify(event());
    const payload = body + " ".repeat(1024 * 1024 - Buffer.byteLength(body));
    expect((await POST(signedRequest(payload))).status).toBe(200);
  });
});
