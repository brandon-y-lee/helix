import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as createCheckout } from "@/app/api/checkout/sessions/route";
import { POST as cancelCheckout } from "@/app/cart/checkout-cancel/route";
import { CheckoutAdmissionError } from "@/lib/checkout/admission";

const runtime = vi.hoisted(() => ({ cookies: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: runtime.cookies, headers: vi.fn() }));

beforeEach(() => {
  runtime.cookies.mockReset();
  runtime.cookies.mockResolvedValue({ get: () => undefined });
});

afterEach(() => vi.unstubAllEnvs());

describe("checkout browser request boundary", () => {
  it("rejects an unapproved Origin before accepting checkout input", async () => {
    vi.stubEnv("CHECKOUT_ORIGIN", "https://helixskin.vercel.app");
    const response = await createCheckout(
      new Request("https://helixskin.vercel.app/api/checkout/sessions", {
        method: "POST",
        headers: {
          origin: "https://attacker.example",
          "content-type": "application/json",
        },
        body: "{}",
      }),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Checkout request is not allowed." });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it.each([
    ["malformed JSON", "{"],
    ["an array", "[]"],
    ["null", "null"],
    ["an unrecognized reward", '{"rewardTierId":"tier-500"}'],
    ["a numeric reward", '{"rewardTierId":200}'],
    ["a browser price", '{"price":1}'],
  ])("rejects %s instead of starting checkout", async (_label, body) => {
    vi.stubEnv("CHECKOUT_ORIGIN", "https://helixskin.vercel.app");
    const response = await createCheckout(
      new Request("https://helixskin.vercel.app/api/checkout/sessions", {
        method: "POST",
        headers: {
          origin: "https://helixskin.vercel.app",
          "content-type": "application/json",
        },
        body,
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid checkout request." });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("enforces the actual streamed 4 KiB limit despite a false Content-Length", async () => {
    vi.stubEnv("CHECKOUT_ORIGIN", "https://helixskin.vercel.app");
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(" ".repeat(4095)));
        controller.enqueue(encoder.encode("{}"));
        controller.close();
      },
    });
    const request = new Request("https://helixskin.vercel.app/api/checkout/sessions", {
      method: "POST",
      headers: {
        origin: "https://helixskin.vercel.app",
        "content-type": "application/json",
        "content-length": "2",
      },
      body,
      duplex: "half",
    } as RequestInit);

    const response = await createCheckout(request);

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: "Checkout request is too large." });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});

describe.each([
  ["checkout", createCheckout],
  ["cancellation", cancelCheckout],
] as const)("%s request format", (_name, post) => {
  it.each([null, "null", "https://helixskin.vercel.app/", "https://helixskin.vercel.app, https://attacker.example"])(
    "rejects a missing or malformed Origin %s even on the trusted request hostname",
    async (origin) => {
      vi.stubEnv("CHECKOUT_ORIGIN", "https://helixskin.vercel.app");
      const headers = new Headers({ "content-type": "application/json" });
      if (origin !== null) headers.set("origin", origin);
      const response = await post(new Request("https://helixskin.vercel.app/checkout", {
        method: "POST",
        headers,
        body: "{}",
      }));

      expect(response.status).toBe(403);
      expect(response.headers.get("cache-control")).toBe("no-store");
    },
  );

  it.each([null, "text/plain", "application/x-www-form-urlencoded", "application/json; charset=iso-8859-1"])(
    "rejects unsupported content type %s",
    async (contentType) => {
      vi.stubEnv("CHECKOUT_ORIGIN", "https://helixskin.vercel.app");
      const headers = new Headers({ origin: "https://helixskin.vercel.app" });
      if (contentType) headers.set("content-type", contentType);
      const response = await post(
        new Request("https://helixskin.vercel.app/checkout", {
          method: "POST",
          headers,
          body: new TextEncoder().encode("{}"),
        }),
      );

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "Invalid checkout request." });
    },
  );
});

describe("cancellation browser request boundary", () => {
  it("communicates the bounded retry delay when admission is busy", async () => {
    vi.stubEnv("CHECKOUT_ORIGIN", "https://helixskin.vercel.app");
    runtime.cookies.mockRejectedValue(new CheckoutAdmissionError(429, 17));
    const response = await cancelCheckout(new Request("https://helixskin.vercel.app/cart/checkout-cancel", {
      method: "POST",
      headers: { origin: "https://helixskin.vercel.app", "content-type": "application/json" },
      body: "{}",
    }));

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("17");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("accepts an empty JSON object at the 4 KiB boundary", async () => {
    vi.stubEnv("CHECKOUT_ORIGIN", "https://helixskin.vercel.app");
    const response = await cancelCheckout(
      new Request("https://helixskin.vercel.app/cart/checkout-cancel", {
        method: "POST",
        headers: {
          origin: "https://helixskin.vercel.app",
          "content-type": "application/json; charset=utf-8",
        },
        body: `${" ".repeat(4094)}{}`,
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "unavailable" });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it.each([
    ["missing Origin", null, "{}", 403],
    ["opaque Origin", "null", "{}", 403],
    ["unapproved Origin", "https://attacker.example", "{}", 403],
    ["malformed Origin", "https://helixskin.vercel.app/", "{}", 403],
    ["a supplied order ID", "https://helixskin.vercel.app", '{"orderId":"other-order"}', 400],
    ["a missing body", "https://helixskin.vercel.app", "", 400],
    ["oversized input", "https://helixskin.vercel.app", `${" ".repeat(4095)}{}`, 413],
  ])("rejects %s", async (_label, origin, body, status) => {
    vi.stubEnv("CHECKOUT_ORIGIN", "https://helixskin.vercel.app");
    const headers = new Headers({ "content-type": "application/json" });
    if (origin !== null) headers.set("origin", origin);
    const response = await cancelCheckout(
      new Request("https://helixskin.vercel.app/cart/checkout-cancel", {
        method: "POST",
        headers,
        body,
      }),
    );

    expect(response.status).toBe(status);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("does not report successful cleanup when the server fails", async () => {
    vi.stubEnv("CHECKOUT_ORIGIN", "https://helixskin.vercel.app");
    runtime.cookies.mockRejectedValue(new Error("private provider details"));
    const response = await cancelCheckout(
      new Request("https://helixskin.vercel.app/cart/checkout-cancel", {
        method: "POST",
        headers: {
          origin: "https://helixskin.vercel.app",
          "content-type": "application/json",
        },
        body: "{}",
      }),
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "Sandbox checkout is temporarily unavailable. Try again in a moment.",
    });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
