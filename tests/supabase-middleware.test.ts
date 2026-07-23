import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { updateSupabaseSession } from "@/lib/supabase/middleware";

function request(pathname: string, cookie?: string) {
  return new NextRequest(`http://localhost${pathname}`, {
    headers: cookie ? { cookie } : undefined,
  });
}

function authCookie(value = "session-value") {
  return `sb-erasogmsqpgiirovubjh-auth-token=${value}`;
}

function dnsFailure() {
  return Object.assign(new Error("getaddrinfo ENOTFOUND"), {
    code: "ENOTFOUND",
  });
}

describe("Supabase middleware ownership", () => {
  it("does not create an Auth client for an anonymous request", async () => {
    const createClient = vi.fn();

    const response = await updateSupabaseSession(
      request("/account/sign-in"),
      { createClient },
    );

    expect(response.status).toBe(200);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("keeps public account routes available and preserves cookies on outage", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await updateSupabaseSession(
      request(
        "/account/sign-in",
        "sb-erasogmsqpgiirovubjh-auth-token.0=session-value",
      ),
      {
        createClient: (cookies) => ({
          auth: {
            getClaims: async () => {
              cookies.setAll(
                [{
                  name: "sb-erasogmsqpgiirovubjh-auth-token",
                  value: "",
                  options: { maxAge: 0 },
                }],
                { "cache-control": "private, no-store" },
              );
              throw dnsFailure();
            },
          },
        }),
        now: () => 100,
      },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(log).toHaveBeenCalledTimes(1);
    log.mockRestore();
  });

  it("fails a protected route closed without clearing its Auth cookie", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await updateSupabaseSession(
      request("/account", authCookie()),
      {
        createClient: (cookies) => ({
          auth: {
            getClaims: async () => {
              cookies.setAll(
                [{
                  name: "sb-erasogmsqpgiirovubjh-auth-token",
                  value: "",
                  options: { maxAge: 0 },
                }],
                {},
              );
              return { error: dnsFailure() };
            },
          },
        }),
        now: () => 100,
      },
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("x-middleware-rewrite"))
      .toContain("/account/service-unavailable?next=%2Faccount");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("retry-after")).toBe("5");
    expect(log).toHaveBeenCalledTimes(1);
    log.mockRestore();
  });

  it("does not mistake an invalid token for a network outage", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await updateSupabaseSession(
      request("/account/sign-in", authCookie()),
      {
        createClient: (cookies) => ({
          auth: {
            getClaims: async () => {
              cookies.setAll(
                [{
                  name: "sb-erasogmsqpgiirovubjh-auth-token",
                  value: "",
                  options: { maxAge: 0 },
                }],
                { "cache-control": "private, no-store" },
              );
              return {
                error: Object.assign(new Error("Invalid JWT"), {
                  name: "AuthApiError",
                  status: 401,
                }),
              };
            },
          },
        }),
      },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain(
      "sb-erasogmsqpgiirovubjh-auth-token=",
    );
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it("applies refreshed Auth cookies on the successful path", async () => {
    const response = await updateSupabaseSession(
      request("/account", authCookie("old-session")),
      {
        createClient: (cookies) => ({
          auth: {
            getClaims: async () => {
              cookies.setAll(
                [{
                  name: "sb-erasogmsqpgiirovubjh-auth-token",
                  value: "new-session",
                  options: { httpOnly: true, sameSite: "lax" },
                }],
                { "cache-control": "private, no-store" },
              );
              return { error: null };
            },
          },
        }),
      },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("new-session");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
});
