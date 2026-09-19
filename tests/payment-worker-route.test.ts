// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST, GET, DELETE, HEAD, OPTIONS, PATCH, PUT } from "@/app/api/internal/payments/reconcile/route";

const boundary = vi.hoisted(() => ({ rpc: vi.fn(), fetch: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ rpc: boundary.rpc }) }));
const workerSecret = Buffer.alloc(32, 17).toString("base64url");
const url = "https://helixskin.vercel.app/api/internal/payments/reconcile";
function request(input: { body?: string; token?: string; query?: string; headers?: HeadersInit } = {}) {
  return new Request(url + (input.query ?? ""), {
    method: "POST", body: input.body ?? "{}",
    headers: input.headers ?? { authorization: `Bearer ${input.token ?? workerSecret}`, "content-type": "application/json" },
  });
}
function expectPrivate(response: Response) {
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("PAYMENT_WORKER_SECRET", workerSecret);
  vi.stubEnv("CHECKOUT_ENABLED", "false");
  vi.stubEnv("CHECKOUT_MODE", "sandbox");
  vi.stubEnv("STRIPE_ACCOUNT_ID", "acct_1Tm9WRFEzyaKzdmq");
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_worker_transport");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_worker_transport");
  vi.stubEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://erasogmsqpgiirovubjh.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "synthetic-service-key");
  vi.stubGlobal("fetch", boundary.fetch);
  boundary.fetch.mockRejectedValue(new Error("Provider must not be contacted without a claim."));
  boundary.rpc.mockImplementation(async (name) => {
    if (name === "claim_payment_worker_run") return { data: null, error: null };
    throw new Error("Unexpected database mutation.");
  });
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("fixed authenticated payment worker route", () => {
  it("allows the dedicated scheduler credential while checkout creation is disabled", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, outcome: "busy" });
    expectPrivate(response);
    expect(boundary.rpc.mock.calls.map(([name]) => name)).toEqual(["claim_payment_worker_run"]);
  });

  it("awaits the worker before responding", async () => {
    let release!: (value: unknown) => void;
    boundary.rpc.mockImplementation(() => new Promise((resolve) => { release = resolve; }));
    let responded = false;
    const pending = POST(request()).then((response) => { responded = true; return response; });
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    expect(responded).toBe(false);
    release({ data: null, error: null });
    expect((await pending).status).toBe(200);
  });

  it.each(["", "Bearer wrong", `Basic ${workerSecret}`, `Bearer ${Buffer.alloc(32, 18).toString("base64url")}`])(
    "rejects missing or invalid credentials before privileged work or body parsing", async (authorization) => {
      const response = await POST(request({ body: "not JSON", headers: { authorization, "content-type": "application/json" } }));
      expect(response.status).toBe(401);
      expectPrivate(response);
      expect(boundary.rpc).not.toHaveBeenCalled();
      expect(boundary.fetch).not.toHaveBeenCalled();
    },
  );

  it("fails closed when the dedicated credential is not configured", async () => {
    vi.stubEnv("PAYMENT_WORKER_SECRET", "");
    const response = await POST(request());
    expect(response.status).toBe(503);
    expectPrivate(response);
    expect(boundary.rpc).not.toHaveBeenCalled();
  });

  it.each([
    "", "null", "[]", "1", "{", '{"url":"https://foreign.example"}',
    '{"accountId":"acct_foreign"}', '{"eventId":"evt_override"}',
  ])("rejects nonempty or invalid request schema before privileged work", async (body) => {
    const response = await POST(request({ body }));
    expect(response.status).toBe(400);
    expectPrivate(response);
    expect(boundary.rpc).not.toHaveBeenCalled();
  });

  it("rejects query overrides instead of accepting a configurable invocation", async () => {
    const response = await POST(request({ query: "?account=acct_foreign&url=https://other.example" }));
    expect(response.status).toBe(400);
    expect(boundary.rpc).not.toHaveBeenCalled();
  });

  it("enforces the actual 1 KiB limit on a chunked worker body", async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(1024).fill(32));
        controller.enqueue(new TextEncoder().encode("{}"));
      }, cancel() { cancelled = true; },
    });
    const input = new Request(url, {
      method: "POST", body: stream, duplex: "half",
      headers: { authorization: `Bearer ${workerSecret}`, "content-type": "application/json", "content-length": "2" },
    } as RequestInit);
    const response = await POST(input);
    expect(response.status).toBe(413);
    expect(cancelled).toBe(true);
    expectPrivate(response);
    expect(boundary.rpc).not.toHaveBeenCalled();
  });

  it("accepts a strict empty object exactly at the worker byte limit", async () => {
    expect((await POST(request({ body: `${" ".repeat(1022)}{}` }))).status).toBe(200);
  });

  it("redacts a worker storage failure", async () => {
    boundary.rpc.mockResolvedValue({ data: null, error: { message: `private secret ${workerSecret}` } });
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain(workerSecret);
    expectPrivate(response);
  });

  it.each([GET, DELETE, HEAD, OPTIONS, PATCH, PUT])("only accepts POST invocations", async (method) => {
    const response = await method();
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
    expectPrivate(response);
    expect(boundary.rpc).not.toHaveBeenCalled();
  });
});
