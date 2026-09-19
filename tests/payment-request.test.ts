// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertEmptyPaymentRequest,
  assertPaymentRequestOrigin,
  authenticatePaymentWorker,
  paymentResponseHeaders,
  readPaymentJsonObject,
  readPaymentRequestBytes,
} from "@/lib/payments/request";

afterEach(() => vi.unstubAllEnvs());

const WORKER_SECRET = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

function workerRequest(authorization?: string): Request {
  return new Request("https://helixskin.vercel.app/api/internal/payments/reconcile", {
    method: "POST", headers: authorization ? { authorization } : {}, body: "{}",
  });
}

function streamedRequest(chunks: Uint8Array[], contentLength?: string): Request {
  return new Request("https://helixskin.vercel.app/api/internal/payments/reconcile", {
    method: "POST",
    headers: contentLength === undefined ? {} : { "content-length": contentLength },
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(chunk);
        controller.close();
      },
    }),
    duplex: "half",
  } as RequestInit);
}

describe("payment request bytes", () => {
  it.each([-1, NaN, Infinity, 1.5])("rejects an invalid server byte limit %s", async (limit) => {
    await expect(readPaymentRequestBytes(streamedRequest([]), limit))
      .rejects.toMatchObject({ status: 503 });
  });

  it("preserves exact bytes across chunks at the limit without trusting Content-Length", async () => {
    const request = streamedRequest([
      new Uint8Array([0, 255, 32]),
      new Uint8Array([13, 10]),
    ], "999999");

    const bytes = await readPaymentRequestBytes(request, 5);

    expect(Buffer.isBuffer(bytes)).toBe(true);
    expect([...bytes]).toEqual([0, 255, 32, 13, 10]);
  });

  it("rejects actual oversized bytes and awaits cancellation before returning", async () => {
    let finishCancellation!: () => void;
    let cancelled!: () => void;
    const cancellationStarted = new Promise<void>((resolve) => { cancelled = resolve; });
    const cancellation = new Promise<void>((resolve) => { finishCancellation = resolve; });
    const request = new Request("https://helixskin.vercel.app/payments", {
      method: "POST",
      headers: { "content-length": "1" },
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2]));
          controller.enqueue(new Uint8Array([3, 4]));
        },
        cancel() {
          cancelled();
          return cancellation;
        },
      }),
      duplex: "half",
    } as RequestInit);
    let settled = false;
    const outcome = readPaymentRequestBytes(request, 3).catch((error: unknown) => {
      settled = true;
      return error;
    });

    await Promise.race([
      cancellationStarted,
      outcome.then(() => { throw new Error("Reader returned without cancelling the stream."); }),
    ]);
    expect(settled).toBe(false);
    finishCancellation();

    expect(await outcome).toMatchObject({
      name: "PaymentRequestError",
      status: 413,
      message: "Payment request is too large.",
    });
    expect(request.body?.locked).toBe(false);
  });

  it.each(["locked", "read failure", "cancel failure"])(
    "redacts a %s while preserving oversized status",
    async (failure) => {
      const request = new Request("https://helixskin.vercel.app/payments", {
        method: "POST",
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            if (failure === "read failure") controller.error(new Error("secret provider details"));
            else controller.enqueue(new Uint8Array([1, 2, 3]));
          },
          cancel() { return Promise.reject(new Error("secret cancellation details")); },
        }),
        duplex: "half",
      } as RequestInit);
      const priorReader = failure === "locked" ? request.body!.getReader() : null;

      try {
        await expect(readPaymentRequestBytes(request, 2)).rejects.toMatchObject({
          name: "PaymentRequestError",
          status: failure === "cancel failure" ? 413 : 400,
          message: failure === "cancel failure"
            ? "Payment request is too large."
            : "Invalid payment request.",
        });
      } finally {
        priorReader?.releaseLock();
      }
    },
  );
});

describe("payment request JSON", () => {
  it.each([null, "text/plain", "application/jsonp", "application/problem+json", "application/json; charset=latin1", "application/json; custom=value"])(
    "rejects unsupported content type %s",
    async (contentType) => {
      const request = new Request("https://helixskin.vercel.app/payments", {
        method: "POST",
        headers: contentType === null ? {} : { "content-type": contentType },
        body: new TextEncoder().encode("{}"),
      });

      await expect(readPaymentJsonObject(request, 1024)).rejects.toMatchObject({ status: 400 });
      expect(request.bodyUsed).toBe(false);
    },
  );

  it.each(["application/json", "Application/JSON", 'application/json; charset="UTF-8"'])(
    "accepts supported content type %s",
    async (contentType) => {
      const request = new Request("https://helixskin.vercel.app/payments", {
        method: "POST", headers: { "content-type": contentType }, body: "{}",
      });

      await expect(readPaymentJsonObject(request, 2)).resolves.toEqual({});
    },
  );

  it("reads a UTF-8 JSON object within the byte limit", async () => {
    const request = new Request("https://helixskin.vercel.app/payments", {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: '{"reason":"café","version":2}',
    });

    await expect(readPaymentJsonObject(request, 32)).resolves.toEqual({ reason: "café", version: 2 });
  });

  it.each(["{", "null", "[]", "42", "true", '"private request details"', ""])(
    "rejects invalid JSON object input %s with a safe error",
    async (body) => {
      const request = new Request("https://helixskin.vercel.app/payments", {
        method: "POST", headers: { "content-type": "application/json" }, body,
      });

      await expect(readPaymentJsonObject(request, 1024)).rejects.toMatchObject({
        name: "PaymentRequestError", status: 400, message: "Invalid payment request.",
      });
    },
  );

  it("rejects invalid UTF-8 rather than replacing its bytes", async () => {
    const request = new Request("https://helixskin.vercel.app/payments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: new Uint8Array([123, 34, 97, 34, 58, 34, 195, 40, 34, 125]),
    });

    await expect(readPaymentJsonObject(request, 1024)).rejects.toMatchObject({
      name: "PaymentRequestError", status: 400, message: "Invalid payment request.",
    });
  });
});

describe("payment worker input", () => {
  it("rejects one byte over the default limit even for an empty object", async () => {
    const request = new Request("https://helixskin.vercel.app/payments", {
      method: "POST", headers: { "content-type": "application/json" },
      body: `${" ".repeat(1023)}{}`,
    });
    await expect(assertEmptyPaymentRequest(request)).rejects.toMatchObject({ status: 413 });
  });

  it("accepts an empty JSON object at the default 1 KiB bound", async () => {
    const request = new Request("https://helixskin.vercel.app/payments", {
      method: "POST", headers: { "content-type": "application/json" },
      body: `${" ".repeat(1022)}{}`,
    });

    await expect(assertEmptyPaymentRequest(request)).resolves.toBeUndefined();
  });

  it.each(['{"account":"other"}', '{"destination":"https://attacker.example"}', '{"__proto__":{}}'])(
    "rejects request-supplied options %s",
    async (body) => {
      const request = new Request("https://helixskin.vercel.app/payments", {
        method: "POST", headers: { "content-type": "application/json" }, body,
      });

      await expect(assertEmptyPaymentRequest(request)).rejects.toMatchObject({ status: 400 });
    },
  );
});

describe("payment worker authentication", () => {
  it.each([undefined, "", "weak", `${WORKER_SECRET}=`, ` ${WORKER_SECRET}`, "A".repeat(42) + "B", "A".repeat(10000)])(
    "fails closed for absent or malformed server credential case %#",
    (secret) => {
      vi.stubEnv("PAYMENT_WORKER_SECRET", secret);
      expect(() => authenticatePaymentWorker(workerRequest(`Bearer ${WORKER_SECRET}`)))
        .toThrowError(expect.objectContaining({ status: 503, message: "Payment service is temporarily unavailable." }));
    },
  );

  it.each([
    "SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET", "CATALOG_WEBHOOK_SECRET", "SUPABASE_CATALOG_WEBHOOK_SECRET",
    "VERCEL_AUTOMATION_BYPASS_SECRET",
  ])("rejects reuse of configured %s", (key) => {
    vi.stubEnv("PAYMENT_WORKER_SECRET", WORKER_SECRET);
    vi.stubEnv(key, ` ${WORKER_SECRET} `);
    expect(() => authenticatePaymentWorker(workerRequest(`Bearer ${WORKER_SECRET}`)))
      .toThrowError(expect.objectContaining({ status: 503 }));
  });

  it.each([
    `${WORKER_SECRET}=`, `A${WORKER_SECRET}`, `Bearer ${WORKER_SECRET}`,
    `${WORKER_SECRET}, Bearer ${WORKER_SECRET}`, "A".repeat(42) + "B",
    "A".repeat(42) + "/", "A".repeat(10000),
  ])("rejects malformed or noncanonical bearer token case %#", (token) => {
    vi.stubEnv("PAYMENT_WORKER_SECRET", WORKER_SECRET);
    expect(() => authenticatePaymentWorker(workerRequest(`Bearer ${token}`)))
      .toThrowError(expect.objectContaining({ status: 401 }));
  });

  it("accepts the dedicated bearer credential without consuming the body", () => {
    vi.stubEnv("PAYMENT_WORKER_SECRET", WORKER_SECRET);
    const request = workerRequest(`Bearer ${WORKER_SECRET}`);

    expect(() => authenticatePaymentWorker(request)).not.toThrow();
    expect(request.bodyUsed).toBe(false);
  });

  it.each([undefined, "Basic invalid", "Bearer AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAE"])(
    "rejects absent or incorrect authorization %s without consuming the body",
    (authorization) => {
      vi.stubEnv("PAYMENT_WORKER_SECRET", WORKER_SECRET);
      const request = workerRequest(authorization);

      expect(() => authenticatePaymentWorker(request)).toThrowError(expect.objectContaining({
        name: "PaymentRequestError", status: 401, message: "Payment request is not authenticated.",
      }));
      expect(request.bodyUsed).toBe(false);
    },
  );
});

describe("payment browser request protection", () => {
  it("accepts only the configured exact Origin", () => {
    vi.stubEnv("CHECKOUT_ORIGIN", "https://helixskin.vercel.app");
    const request = new Request("https://untrusted-request-host.example/payments", {
      headers: { origin: "https://helixskin.vercel.app" },
    });
    expect(() => assertPaymentRequestOrigin(request)).not.toThrow();
  });

  it.each([null, "null", "https://attacker.example", "https://helixskin.vercel.app/", "https://helixskin.vercel.app:443", "https://helixskin.vercel.app, https://attacker.example"])(
    "rejects absent or inexact Origin %s",
    (origin) => {
      vi.stubEnv("CHECKOUT_ORIGIN", "https://helixskin.vercel.app");
      const request = new Request("https://helixskin.vercel.app/payments", {
        headers: origin === null ? {} : { origin },
      });
      expect(() => assertPaymentRequestOrigin(request))
        .toThrowError(expect.objectContaining({ status: 403 }));
    },
  );

  it("redacts an invalid server Origin configuration", () => {
    vi.stubEnv("CHECKOUT_ORIGIN", "https://private-misconfigured-host.example/path");
    expect(() => assertPaymentRequestOrigin(workerRequest()))
      .toThrowError(expect.objectContaining({ status: 503, message: "Payment service is temporarily unavailable." }));
  });

  it("prevents caching and referrer disclosure on every payment response", () => {
    expect(paymentResponseHeaders()).toEqual({
      "cache-control": "private, no-store", "referrer-policy": "no-referrer",
    });
  });
});
