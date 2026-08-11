import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  handleProductWaitlistRequest,
  productWaitlistAbuseKey,
  type ProductWaitlistRequestAdapters,
} from "@/lib/waitlist/server";

const PRODUCT_ID = "123e4567-e89b-42d3-a456-426614174141";

function request(
  body: unknown,
  options: {
    origin?: string | null;
    contentLength?: string;
    headers?: Record<string, string>;
  } = {},
) {
  const headers = new Headers({ "content-type": "application/json" });
  if (options.origin !== null) {
    headers.set("origin", options.origin ?? "https://mei-pelle.test");
  }
  if (options.contentLength) {
    headers.set("content-length", options.contentLength);
  }
  for (const [name, value] of Object.entries(
    options.headers ?? { "x-forwarded-for": "203.0.113.5" },
  )) {
    headers.set(name, value);
  }
  return new Request("https://mei-pelle.test/api/product-waitlist", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function adapters() {
  const rpc = vi.fn().mockResolvedValue({ data: { ok: true }, error: null });
  const value: ProductWaitlistRequestAdapters = {
    enroll: rpc,
    abuseKey: () => "hashed-client-key",
  };
  return { value, rpc };
}

describe("Product waitlist request boundary", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("keeps one trusted-address bucket when the User-Agent rotates", () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-secret");
    const trustedHeaders = {
      origin: "https://mei-pelle.test",
      "x-vercel-forwarded-for": "203.0.113.5",
    };
    const first = request(
      { productId: PRODUCT_ID, email: "customer@example.com" },
      { headers: { ...trustedHeaders, "user-agent": "rotated-a" } },
    );
    const second = request(
      { productId: PRODUCT_ID, email: "customer@example.com" },
      { headers: { ...trustedHeaders, "user-agent": "rotated-b" } },
    );

    expect(productWaitlistAbuseKey(first)).toBe(
      productWaitlistAbuseKey(second),
    );
  });

  it("fails closed on Vercel when only a caller-controlled forwarding header exists", () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-secret");

    expect(() =>
      productWaitlistAbuseKey(
        request({ productId: PRODUCT_ID, email: "customer@example.com" }),
      ),
    ).toThrow("trusted client address");
  });

  it("normalizes a minimal enrollment and keeps optional consent separate", async () => {
    const { value, rpc } = adapters();
    const response = await handleProductWaitlistRequest(
      request({
        productId: PRODUCT_ID,
        email: "  Customer@Example.COM ",
        marketingConsent: false,
      }),
      value,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({
      ok: true,
      message: "Your Product waitlist enrollment is confirmed.",
    });
    expect(rpc).toHaveBeenCalledWith({
      productId: PRODUCT_ID,
      normalizedEmail: "customer@example.com",
      marketingConsent: false,
      policyVersion: "2026-08-10",
      source: "pdp_waitlist",
      abuseKey: "hashed-client-key",
    });
  });

  it.each([
    ["missing", null],
    ["cross-site", "https://attacker.test"],
  ])("rejects %s Origin before persistence", async (_case, origin) => {
    const { value, rpc } = adapters();
    const response = await handleProductWaitlistRequest(
      request(
        { productId: PRODUCT_ID, email: "customer@example.com" },
        { origin },
      ),
      value,
    );

    expect(response.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["invalid Product identity", { productId: "mineral-guard", email: "customer@example.com" }],
    ["malformed email", { productId: PRODUCT_ID, email: "not-an-email" }],
    ["oversized email", { productId: PRODUCT_ID, email: `${"a".repeat(250)}@example.com` }],
    ["non-boolean consent", { productId: PRODUCT_ID, email: "customer@example.com", marketingConsent: "yes" }],
  ])("rejects %s", async (_case, body) => {
    const { value, rpc } = adapters();
    const response = await handleProductWaitlistRequest(request(body), value);

    expect(response.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects a declared oversized request before reading it", async () => {
    const { value, rpc } = adapters();
    const response = await handleProductWaitlistRequest(
      request(
        { productId: PRODUCT_ID, email: "customer@example.com" },
        { contentLength: "4096" },
      ),
      value,
    );

    expect(response.status).toBe(413);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns the same non-enumerating success for an existing enrollment", async () => {
    const { value, rpc } = adapters();
    rpc.mockResolvedValue({ data: { ok: true, existing: true }, error: null });

    const response = await handleProductWaitlistRequest(
      request({ productId: PRODUCT_ID, email: "customer@example.com" }),
      value,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      message: "Your Product waitlist enrollment is confirmed.",
    });
  });

  it("returns honest rate-limit and recoverable service errors without PII", async () => {
    const { value, rpc } = adapters();
    rpc.mockResolvedValueOnce({
      data: { ok: false, code: "rate_limited" },
      error: null,
    });
    const limited = await handleProductWaitlistRequest(
      request({ productId: PRODUCT_ID, email: "private@example.com" }),
      value,
    );
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("600");

    rpc.mockResolvedValueOnce({
      data: { ok: false, code: "product_unavailable" },
      error: null,
    });
    const unavailable = await handleProductWaitlistRequest(
      request({ productId: PRODUCT_ID, email: "private@example.com" }),
      value,
    );
    expect(unavailable.status).toBe(409);

    rpc.mockResolvedValueOnce({
      data: null,
      error: {
        code: "XX000",
        message: "provider leaked private@example.com",
      },
    });
    const failed = await handleProductWaitlistRequest(
      request({ productId: PRODUCT_ID, email: "private@example.com" }),
      value,
    );
    expect(failed.status).toBe(503);
    expect(JSON.stringify(await failed.json())).not.toContain(
      "private@example.com",
    );
  });
});
