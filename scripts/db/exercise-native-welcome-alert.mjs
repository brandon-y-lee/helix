import assert from "node:assert/strict";
import { runCadence } from "../../workers/production-welcome/cadence.mjs";

/** Called after a genuine reservation was committed and then left without a finish. */
export async function exerciseNativeWelcomeAlert(readAlerts, cleanup) {
  const origin = "https://isolated-publisher.vercel.app";
  const env = {
    VERCEL: "1", VERCEL_ENV: "production", VERCEL_PROJECT_PRODUCTION_URL: "isolated-publisher.vercel.app",
    VERCEL_URL: "immutable-test.vercel.app", VERCEL_PROJECT_ID: "prj_Publisher", VERCEL_DEPLOYMENT_ID: "dpl_Publisher",
    VERCEL_GIT_COMMIT_REF: "main", VERCEL_GIT_PROVIDER: "github", VERCEL_GIT_REPO_ID: "123456",
    VERCEL_GIT_COMMIT_SHA: "e".repeat(40), HELIX_NATIVE_WELCOME_GIT_REPO_ID: "123456",
    HELIX_NATIVE_WELCOME_PROJECT_ID: "prj_Publisher", HELIX_NATIVE_WELCOME_ORIGIN: origin,
    HELIX_NATIVE_WELCOME_CADENCE_ENABLED: "true", HELIX_NATIVE_WELCOME_ENABLED: "true",
    CRON_SECRET: "local-cadence-".repeat(4), HELIX_SCHEDULED_CONFIRMATION_WORKER_TOKEN: "local-confirmation-".repeat(3),
    HELIX_NATIVE_WELCOME_WAKE_TOKEN: "local-welcome-".repeat(4), HELIX_NATIVE_WELCOME_ALERT_URL: "https://operator.example.invalid/alert",
  };
  const destination = [];
  let cleanupCount = 0;
  const response = await runCadence(new Request(origin + "/api/cadence", {
    method: "POST", headers: { authorization: "Bearer " + env.CRON_SECRET },
  }), env, {
    wake: () => { throw new Error("A persisted uncertain welcome must not wake a publisher"); },
    fetchImpl: async (url, options) => {
      if (url === "https://www.helixskin.us/api/internal/marketing/production/maintenance") {
        await cleanup();
        cleanupCount++;
        return Response.json({ ...await readAlerts(), dispatchEnabled: true });
      }
      assert.equal(url, env.HELIX_NATIVE_WELCOME_ALERT_URL);
      assert.equal(options.headers.authorization, undefined);
      destination.push(JSON.parse(options.body));
      return new Response(null, { status: 204 });
    },
  });
  assert.equal(cleanupCount, 1);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { status: "alerted" });
  assert.deepEqual(destination, [{
    reason: "welcome_requires_review", project: env.VERCEL_PROJECT_ID, deployment: env.VERCEL_DEPLOYMENT_ID,
    uncertainAttempts: 1, unresolvedHolds: 0,
  }]);
}
