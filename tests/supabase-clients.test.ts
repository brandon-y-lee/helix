// @vitest-environment node

import { spawnSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Operations must never load local credentials into a constructor test.
vi.mock("dotenv", () => ({ config: vi.fn() }));

const projectUrl = "https://erasogmsqpgiirovubjh.supabase.co";

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", projectUrl);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "synthetic-public-key");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "synthetic-service-key");
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Unexpected network request during client construction.");
    }),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Supabase clients on the supported Node runtime", () => {
  it("constructs Catalog, admin and operations clients with native WebSocket and no connection", async () => {
    const { getSupabaseClient } = await import("@/lib/supabase");
    const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
    const { createOpsClient } = await import("@/scripts/db/supabase-ops");

    for (const client of [
      getSupabaseClient(),
      createSupabaseAdminClient(),
      createOpsClient(),
    ]) {
      expect(client.realtime.transport).toBe(globalThis.WebSocket);
      expect(client.getChannels()).toEqual([]);
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps Catalog reads on the public credential and admin reads on the service credential", async () => {
    const credentials: Array<string | null> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (_input, init) => {
        credentials.push(new Headers(init?.headers).get("apikey"));
        return Response.json([]);
      }),
    );
    const { getSupabaseClient } = await import("@/lib/supabase");
    const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
    const catalog = getSupabaseClient();
    const admin = createSupabaseAdminClient();

    expect(getSupabaseClient()).toBe(catalog);
    expect(createSupabaseAdminClient()).toBe(admin);
    expect(await catalog.from("products").select("id")).toMatchObject({
      error: null,
    });
    expect(await admin.from("products").select("id")).toMatchObject({
      error: null,
    });
    expect(credentials).toEqual(["synthetic-public-key", "synthetic-service-key"]);
  });

  it("fails before a request when Catalog configuration is missing", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    const { getSupabaseClient, SupabaseConfigError } = await import(
      "@/lib/supabase"
    );

    expect(getSupabaseClient).toThrow(SupabaseConfigError);
    expect(getSupabaseClient).toThrow(
      "NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not substitute the public credential for a missing admin credential", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");

    expect(createSupabaseAdminClient).toThrow(
      "Missing required Supabase env var: SUPABASE_SERVICE_ROLE_KEY",
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("refuses operations against a different project before a request", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://another-project.supabase.co");
    const { createOpsClient } = await import("@/scripts/db/supabase-ops");

    expect(createOpsClient).toThrow("Refusing database operation.");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("retains the admin client's bounded abort without a PostgREST retry", async () => {
    vi.useFakeTimers();
    const request = vi.fn<typeof fetch>(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        }),
    );
    vi.stubGlobal("fetch", request);
    const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
    const pending = createSupabaseAdminClient()
      .from("products")
      .select("id")
      .then((result) => result);

    await vi.advanceTimersByTimeAsync(4_500);
    const result = await pending;

    expect(result.error).toMatchObject({
      message: "AbortError: Supabase request timed out after 4500ms.",
    });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("applies a payment deadline to a cached admin client's stalled response body", async () => {
    vi.useFakeTimers();
    let body: ReadableStreamDefaultController<Uint8Array> | undefined;
    const request = vi.fn<typeof fetch>(async (_input, init) => new Response(new ReadableStream({
      start(controller) {
        body = controller;
        init?.signal?.addEventListener("abort", () => controller.error(init.signal?.reason), { once: true });
      },
    })));
    vi.stubGlobal("fetch", request);
    const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
    const { withPaymentDeadline, isPaymentDeadlineError } = await import("@/lib/payments/deadline");
    const admin = createSupabaseAdminClient();
    let stopped = false;
    const pending = withPaymentDeadline({ deadlineAtMs: Date.now() + 100, now: Date.now }, async () =>
      await admin.from("orders").select("id"),
    ).catch((error: unknown) => { stopped = isPaymentDeadlineError(error); });

    await vi.advanceTimersByTimeAsync(100);
    const stoppedAtDeadline = stopped;
    if (!stopped) body?.error(new DOMException("Stop synthetic response", "AbortError"));
    await pending;

    expect(stoppedAtDeadline).toBe(true);
    expect(request).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not let internal database network retries continue beyond a payment deadline", async () => {
    vi.useFakeTimers();
    const request = vi.fn<typeof fetch>((_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
    }));
    vi.stubGlobal("fetch", request);
    const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
    const { withPaymentDeadline, isPaymentDeadlineError } = await import("@/lib/payments/deadline");
    let stopped = false;
    const pending = withPaymentDeadline({ deadlineAtMs: Date.now() + 100, now: Date.now }, async () =>
      await createSupabaseAdminClient().from("orders").select("id"),
    ).catch((error: unknown) => { stopped = isPaymentDeadlineError(error); });

    await vi.advanceTimersByTimeAsync(100);
    const stoppedAtDeadline = stopped;
    await vi.runAllTimersAsync();
    await pending;

    expect(stoppedAtDeadline).toBe(true);
    expect(request).toHaveBeenCalledOnce();
  });

  it("returns a scoped database outage without sleeping on an SDK Retry-After header", async () => {
    vi.useFakeTimers();
    const request = vi.fn<typeof fetch>(async () => new Response("temporary outage", {
      status: 520, headers: { "retry-after": "3600" },
    }));
    vi.stubGlobal("fetch", request);
    const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
    const { withPaymentDeadline } = await import("@/lib/payments/deadline");
    let completed = false;
    let result: { error: unknown } | undefined;
    const pending = withPaymentDeadline({ deadlineAtMs: Date.now() + 100, now: Date.now }, async () =>
      await createSupabaseAdminClient().from("orders").select("id"),
    ).then((value) => { completed = true; result = value; }, () => undefined);

    await vi.advanceTimersByTimeAsync(100);
    const completedWithinBudget = completed;
    await vi.runAllTimersAsync();
    await pending;

    expect(completedWithinBudget).toBe(true);
    expect(result?.error).toBeTruthy();
    expect(request).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("starts the bootstrap client and rejects a missing user selector before provider access", () => {
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", "scripts/admin-bootstrap.ts"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        timeout: 10_000,
        env: {
          NODE_ENV: "test",
          PATH: process.env.PATH,
          DOTENV_CONFIG_PATH: "/dev/null",
          NEXT_PUBLIC_SUPABASE_URL: projectUrl,
          SUPABASE_SERVICE_ROLE_KEY: "synthetic-bootstrap-key",
          HELIX_ADMIN_ROLE: "catalog_editor",
        },
      },
    );

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain(
      "Set exactly one of HELIX_ADMIN_USER_ID or HELIX_ADMIN_EMAIL.",
    );
    expect(result.stderr).not.toContain("synthetic-bootstrap-key");
  });
});
