import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/checkout/status/route";
import { CheckoutAdmissionError } from "@/lib/checkout/admission";

const boundary = vi.hoisted(() => ({
  from: vi.fn(), rpc: vi.fn(), cookies: vi.fn(), retrieveSession: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ from: boundary.from, rpc: boundary.rpc }),
}));
vi.mock("next/headers", () => ({ cookies: boundary.cookies, headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("stripe", () => ({
  default: class {
    checkout = { sessions: { retrieve: boundary.retrieveSession } };
  },
}));

const origin = "https://helixskin.vercel.app";
const sessionId = "cs_test_privateReceipt123";
const order = {
  id: "00000000-0000-4000-8000-000000000042", order_number: "HX-42", status: "pending_payment",
  user_id: null, customer_email: "private@example.com", stripe_checkout_session_id: sessionId,
  shipping_address: {}, shipping_name: null, reward_points_earned: 0, reward_points_redeemed: 0,
  merchandise_subtotal_cents: 2500, discount_cents: 0, shipping_cents: 500, tax_cents: 0, total_cents: 3000,
};

function query(data: unknown, error: { message: string } | null = null) {
  const result = { data, error };
  const chain = {
    select: vi.fn(() => chain), eq: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => result), order: vi.fn(async () => result),
  };
  return chain;
}

function request(query = `session_id=${sessionId}`, init: RequestInit = {}): Request {
  return new Request(`${origin}/api/checkout/status?${query}`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: "{}",
    ...init,
  });
}

function expectPrivate(response: Response): void {
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
}

beforeEach(() => {
  vi.stubEnv("CHECKOUT_ORIGIN", origin);
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_status_boundary");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_status_boundary");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://erasogmsqpgiirovubjh.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "synthetic-test-service-key");
  vi.clearAllMocks();
  boundary.cookies.mockResolvedValue({ get: () => ({ value: Buffer.alloc(32, 1).toString("base64url") }), getAll: () => [] });
  boundary.from.mockImplementation((table) => query(table === "orders" ? order : [
    { product_name: "Private product", variant_label: "30 mL", quantity: 1, line_subtotal_cents: 2500 },
  ]));
  boundary.rpc.mockImplementation(async (name) => {
    if (name === "authorize_checkout_receipt") return { data: true, error: null };
    if (name === "claim_checkout_refresh") return {
      data: { allowed: false, token: null, cached: null, retry_after_seconds: 5 }, error: null,
    };
    if (name === "read_checkout_payment_exception") return { data: null, error: null };
    throw new Error(`Unexpected database call: ${name}`);
  });
  boundary.retrieveSession.mockRejectedValue(new Error("Unexpected provider access"));
});

afterEach(() => vi.unstubAllEnvs());

describe("private checkout status route", () => {
  it("returns only the authorized payment state and retry delay", async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "pending", retryAfterSeconds: 5 });
    expectPrivate(response);
  });

  it.each(["", "session_id=", "session_id=pi_wrong", "session_id=cs_test_one&session_id=cs_test_two", "session_id=cs_test_bad%20value", `session_id=cs_${"a".repeat(201)}`])(
    "treats invalid Session query %s as unavailable without reconciliation",
    async (query) => {
      const response = await POST(request(query));

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ status: "unavailable" });
      expectPrivate(response);
      expect(boundary.from).not.toHaveBeenCalled();
      expect(boundary.rpc).not.toHaveBeenCalled();
      expect(boundary.retrieveSession).not.toHaveBeenCalled();
    },
  );

  it.each(["unknown", "unowned", "expired"])("does not distinguish %s receipts", async (reason) => {
    if (reason === "unknown") boundary.from.mockImplementation(() => query(null));
    else boundary.rpc.mockResolvedValue({ data: false, error: null });

    const response = await POST(request());

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ status: "unavailable" });
    expectPrivate(response);
    expect(boundary.retrieveSession).not.toHaveBeenCalled();
    expect(boundary.rpc.mock.calls.some(([name]) => name === "claim_checkout_refresh")).toBe(false);
  });

  it("redacts a storage failure instead of returning private details", async () => {
    boundary.from.mockImplementation(() => query(null, { message: "private order payload" }));

    const response = await POST(request());

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "unavailable" });
    expectPrivate(response);
  });

  it("preserves a bounded retry delay on temporary failures", async () => {
    boundary.cookies.mockRejectedValue(new CheckoutAdmissionError(429, 100));

    const response = await POST(request());

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "unavailable" });
    expect(response.headers.get("retry-after")).toBe("60");
    expectPrivate(response);
  });

  it.each([
    ["cross-site request", "https://attacker.example", "application/json", "{}", 403],
    ["missing Origin", "", "application/json", "{}", 403],
    ["opaque Origin", "null", "application/json", "{}", 403],
    ["wrong content type", origin, "text/plain", "{}", 400],
    ["malformed input", origin, "application/json", "{", 400],
    ["supplied order", origin, "application/json", '{"orderId":"private-order"}', 400],
    ["oversized input", origin, "application/json", `${" ".repeat(4095)}{}`, 413],
  ])("rejects %s before receipt access", async (_label, requestOrigin, contentType, body, status) => {
    const headers = new Headers({ "content-type": contentType });
    if (requestOrigin) headers.set("origin", requestOrigin);

    const response = await POST(request(undefined, { headers, body }));

    expect(response.status).toBe(status);
    expectPrivate(response);
    expect(boundary.from).not.toHaveBeenCalled();
    expect(boundary.rpc).not.toHaveBeenCalled();
    expect(boundary.retrieveSession).not.toHaveBeenCalled();
  });
});
