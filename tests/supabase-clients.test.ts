// @vitest-environment node

import { syntheticSupabaseKey } from "./helpers/supabase-target";
import { spawnSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Operations must never load local credentials into a constructor test.
vi.mock("dotenv", () => ({ config: vi.fn() }));

const projectUrl = "https://zyfkunnpnlmgvrojmrbg.supabase.co";
const productionUrl = "https://erasogmsqpgiirovubjh.supabase.co";

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", projectUrl);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", syntheticSupabaseKey("development", "anon"));
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", syntheticSupabaseKey("development", "service_role"));
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
  it("writes and reads the child through ordinary clients while a parent control stays untouched", async () => {
    const records = new Map([[new URL(projectUrl).host, ["dev-control"]], [new URL(productionUrl).host, ["parent-control"]]]);
    const contacted: string[] = [];
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async (input, init) => {
      const host = new URL(String(input)).host;
      contacted.push(host);
      const targetRows = records.get(host);
      if (!targetRows) throw new Error("Unexpected test target");
      if (init?.method === "POST") {
        targetRows.push(JSON.parse(String(init.body)).id);
        return new Response(null, { status: 201 });
      }
      return Response.json(targetRows.map((id) => ({ id })));
    }));
    const { getSupabaseClient } = await import("@/lib/supabase");
    const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
    expect((await createSupabaseAdminClient().from("synthetic_probe").insert({ id: "child-write" })).error).toBeNull();
    expect((await getSupabaseClient().from("synthetic_probe").select("id")).data)
      .toEqual([{ id: "dev-control" }, { id: "child-write" }]);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", productionUrl);
    expect(createSupabaseAdminClient).toThrow(/target/);
    expect(contacted).toEqual([new URL(projectUrl).host, new URL(projectUrl).host]);
    expect(records.get(new URL(productionUrl).host)).toEqual(["parent-control"]);
  });

  it("refuses the production URL in development even after a client has been cached", async () => {
    const { getSupabaseClient } = await import("@/lib/supabase");
    const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
    getSupabaseClient();
    createSupabaseAdminClient();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", productionUrl);
    expect(getSupabaseClient).toThrow(/target/i);
    expect(createSupabaseAdminClient).toThrow(/target/i);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("requires the production parent for a main deployment in the approved Vercel project", async () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("VERCEL_PROJECT_ID", "prj_N9nyPL9SixJHOROIovS8PDQ9aKny");
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "main");
    vi.stubEnv("NEXT_PUBLIC_HELIX_SUPABASE_TARGET", "production");
    const { getSupabaseClient } = await import("@/lib/supabase");
    expect(getSupabaseClient).toThrow(/target/i);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", productionUrl);
    expect(getSupabaseClient).toThrow(/credential/i);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", syntheticSupabaseKey("production", "anon"));
    expect(getSupabaseClient).not.toThrow();
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "dev");
    expect(getSupabaseClient).toThrow(/target/i);
    expect(fetch).not.toHaveBeenCalled();
  });
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
    expect(credentials).toEqual([syntheticSupabaseKey("development", "anon"), syntheticSupabaseKey("development", "service_role")]);
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
          SUPABASE_SERVICE_ROLE_KEY: syntheticSupabaseKey("development", "service_role"),
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
    expect(result.stderr).not.toContain(syntheticSupabaseKey("development", "service_role"));
  });
});
