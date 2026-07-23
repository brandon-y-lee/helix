import { describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import {
  createSupabaseFetch,
  inspectSupabaseNetworkError,
  isSupabaseNetworkError,
  logSupabaseUnavailable,
  SupabaseRequestTimeoutError,
  SupabaseTransportAbortError,
} from "@/lib/supabase/network";

function dnsFailure() {
  const cause = Object.assign(new Error("getaddrinfo ENOTFOUND"), {
    code: "ENOTFOUND",
  });
  return new TypeError("fetch failed", { cause });
}

describe("Supabase network resilience", () => {
  it("classifies transient network failures without confusing auth denials", () => {
    expect(inspectSupabaseNetworkError(dnsFailure())).toEqual({
      errorClass: "TypeError",
      causeCode: "ENOTFOUND",
    });
    expect(
      isSupabaseNetworkError(
        Object.assign(new Error("fetch failed"), {
          name: "AuthRetryableFetchError",
        }),
      ),
    ).toBe(true);
    expect(
      isSupabaseNetworkError(
        Object.assign(new Error("Invalid login credentials"), {
          name: "AuthApiError",
          status: 400,
        }),
      ),
    ).toBe(false);
    expect(
      isSupabaseNetworkError(
        Object.assign(new Error("Unauthorized"), {
          status: 401,
        }),
      ),
    ).toBe(false);
  });

  it("aborts one slow request within the configured timeout", async () => {
    const fetchImplementation = vi.fn<typeof fetch>((_input, init) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(new DOMException("Aborted", "AbortError")),
          { once: true },
        );
      });
    });
    const boundedFetch = createSupabaseFetch({
      fetchImplementation,
      timeoutMs: 30,
    });
    const startedAt = Date.now();

    const error = await boundedFetch("https://example.supabase.co")
      .then(() => null)
      .catch((failure: unknown) => failure);

    expect(error).toBeInstanceOf(SupabaseRequestTimeoutError);
    expect(error).toMatchObject({ name: "AbortError", code: "ETIMEDOUT" });
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
    expect(Date.now() - startedAt).toBeLessThan(500);
  });

  it("normalizes a DNS failure to one abort-class transport attempt", async () => {
    const fetchImplementation = vi.fn<typeof fetch>(async () => {
      throw dnsFailure();
    });
    const boundedFetch = createSupabaseFetch({ fetchImplementation });

    const error = await boundedFetch("https://example.supabase.co")
      .then(() => null)
      .catch((failure: unknown) => failure);

    expect(error).toBeInstanceOf(SupabaseTransportAbortError);
    expect(error).toMatchObject({
      name: "AbortError",
      code: "SUPABASE_NETWORK_UNAVAILABLE",
    });
    expect(inspectSupabaseNetworkError(error)).toEqual({
      errorClass: "AbortError",
      causeCode: "ENOTFOUND",
    });
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
  });

  it("prevents PostgREST from retrying a DNS failure", async () => {
    const fetchImplementation = vi.fn<typeof fetch>(async () => {
      throw dnsFailure();
    });
    const client = createClient(
      "https://example.supabase.co",
      "test-anon-key",
      {
        global: {
          fetch: createSupabaseFetch({ fetchImplementation }),
        },
        auth: {
          autoRefreshToken: false,
          detectSessionInUrl: false,
          persistSession: false,
        },
      },
    );
    const startedAt = Date.now();

    const { error } = await client.from("carts").select("id");

    expect(isSupabaseNetworkError(error)).toBe(true);
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
    expect(Date.now() - startedAt).toBeLessThan(500);
  });

  it("logs one structured, redacted event", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    logSupabaseUnavailable(dnsFailure(), {
      operation: "cart.request",
      route: "/api/cart",
      runtime: "nodejs",
      requestId: "request-1",
      elapsedMs: 42,
    });

    expect(log).toHaveBeenCalledTimes(1);
    const output = log.mock.calls.flat().join(" ");
    expect(output).toContain("[supabase_unavailable]");
    expect(output).toContain('"operation":"cart.request"');
    expect(output).toContain('"route":"/api/cart"');
    expect(output).not.toMatch(/access_token|refresh_token|cookie|apikey/i);
    expect(output).not.toContain("customer@example.com");
    expect(output).not.toContain("cart contents");
    log.mockRestore();
  });
});
