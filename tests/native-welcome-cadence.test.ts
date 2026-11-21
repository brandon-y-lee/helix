// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { POST as maintain } from "@/app/api/internal/marketing/production/maintenance/route";
import { runCadence } from "../workers/production-welcome/cadence.mjs";

const publisher = "https://welcome-publisher.vercel.app";
const canonical = "https://www.helixskin.us";
const alertSink = "https://operator.example.invalid/alert";
const rawToken = "raw-synthetic-token-".repeat(3);
const env = {
  VERCEL: "1", VERCEL_ENV: "production", VERCEL_PROJECT_PRODUCTION_URL: "welcome-publisher.vercel.app",
  VERCEL_URL: "immutable-publisher.vercel.app", VERCEL_PROJECT_ID: "prj_Publisher", VERCEL_DEPLOYMENT_ID: "dpl_Second1",
  VERCEL_GIT_PROVIDER: "github", VERCEL_GIT_COMMIT_REF: "main", VERCEL_GIT_COMMIT_SHA: "a".repeat(40),
  VERCEL_GIT_REPO_ID: "123456", HELIX_NATIVE_WELCOME_GIT_REPO_ID: "123456",
  HELIX_NATIVE_WELCOME_PROJECT_ID: "prj_Publisher", HELIX_NATIVE_WELCOME_ORIGIN: publisher,
  HELIX_NATIVE_WELCOME_ENABLED: "true", HELIX_NATIVE_WELCOME_CADENCE_ENABLED: "true",
  CRON_SECRET: "scheduled-synthetic-token-".repeat(2), HELIX_SCHEDULED_CONFIRMATION_WORKER_TOKEN: rawToken,
  HELIX_NATIVE_WELCOME_WAKE_TOKEN: "native-wake-token-".repeat(3), HELIX_NATIVE_WELCOME_ALERT_URL: alertSink,
};
vi.mock("@/lib/release/deployment-authorization", () => ({
  productionDeploymentAuthorized: async () => true,
}));
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

function fixture(uncertainAttempts: number) {
  const sequence: string[] = [];
  const notices: object[] = [];
  const wake = vi.fn(async () => { sequence.push("native"); return Response.json({ status: "idle" }); });
  for (const [key, value] of Object.entries({
    VERCEL: "1", VERCEL_ENV: "production", VERCEL_PROJECT_ID: "prj_Storefront", VERCEL_DEPLOYMENT_ID: "dpl_Site1",
    VERCEL_PROJECT_PRODUCTION_URL: "helixskin.us", HELIX_PRODUCTION_MARKETING_VERCEL_PROJECT_ID: "prj_Storefront",
    HELIX_PRODUCTION_MARKETING_SITE_ORIGIN: canonical, HELIX_PRODUCTION_MARKETING_WORKER_TOKEN: rawToken,
    HELIX_PRODUCTION_MARKETING_SUPABASE_URL: "https://erasogmsqpgiirovubjh.supabase.co",
    HELIX_PRODUCTION_MARKETING_SERVICE_KEY: "synthetic-marketing-db", HELIX_PRODUCTION_MARKETING_DISPATCH_ENABLED: "true",
  })) vi.stubEnv(key, value);
  const fetchImpl: typeof fetch = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
    const req = new Request(input, options);
    const url = req.url;
    if (url === canonical + "/api/internal/marketing/production/maintenance") return maintain(req);
    if (url === canonical + "/api/internal/marketing/production/dispatch") {
      expect(req.headers.get("authorization")).toBe("Bearer " + rawToken);
      sequence.push("confirmation");
      return Response.json({ status: "idle" });
    }
    if (url === alertSink) {
      expect(req.headers.has("authorization")).toBe(false);
      notices.push(await req.json());
      return new Response(null, { status: 204 });
    }
    throw new Error("Unexpected external request");
  });
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const name = new URL(url).pathname.split("/").at(-1);
    sequence.push(String(name));
    if (name === "cleanup_production_marketing_delivery") return Response.json(0);
    if (name === "production_marketing_native_alerts") return Response.json({ uncertainAttempts, unresolvedHolds: 0 });
    throw new Error("Unrecognized database operation");
  }));
  function tick(settings = env, secret = env.CRON_SECRET) {
    return runCadence(new Request(publisher + "/api/cadence", { method: "POST", headers: { authorization: "Bearer " + secret } }),
      settings, { fetchImpl, wake });
  }
  return { tick, sequence, notices, fetchImpl, wake };
}

it("runs bounded cleanup, confirmation and native wake on one qualified empty schedule tick", async () => {
  const f = fixture(0);
  expect((await f.tick()).status).toBe(200);
  expect(f.sequence).toEqual(["cleanup_production_marketing_delivery", "production_marketing_native_alerts", "confirmation", "native"]);
  expect(f.notices).toEqual([]);
});

it("delivers an aggregate operator alert for a stale reservation without retrying the welcome", async () => {
  const f = fixture(1);
  expect(await (await f.tick()).json()).toEqual({ status: "alerted" });
  expect(f.sequence).toEqual(["cleanup_production_marketing_delivery", "production_marketing_native_alerts"]);
  expect(f.notices).toEqual([{ reason: "welcome_requires_review", project: env.VERCEL_PROJECT_ID,
    deployment: env.VERCEL_DEPLOYMENT_ID, uncertainAttempts: 1, unresolvedHolds: 0 }]);
});

it("stays cold without activation and rejects untrusted scheduler calls before any I/O", async () => {
  const f = fixture(0);
  expect((await f.tick(env, "different")).status).toBe(401);
  expect((await f.tick({ ...env, VERCEL_ENV: "preview" })).status).toBe(403);
  expect(await (await f.tick({ ...env, HELIX_NATIVE_WELCOME_CADENCE_ENABLED: "false" })).json()).toEqual({ status: "paused" });
  expect(f.fetchImpl).not.toHaveBeenCalled();
});
