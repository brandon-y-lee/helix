import { authorized, emptyWake, publisherTarget } from "./publisher.mjs";

const site = "https://www.helixskin.us/api/internal/marketing/production/";
const reply = (status, value) => Response.json({ status: value }, { status, headers: { "cache-control": "no-store" } });
const count = value => Number.isSafeInteger(value) && value >= 0;

async function counts(response) {
  if (!response.ok || !response.body) throw new Error();
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > 512) throw new Error();
      chunks.push(value);
    }
    const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (Object.keys(data).length !== 3 || !count(data.uncertainAttempts) || !count(data.unresolvedHolds) ||
        typeof data.dispatchEnabled !== "boolean") throw new Error();
    return data;
  } finally {
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

// Vercel Schedules calls this empty POST in the isolated publisher project.
// The three possible destinations are independent of everything received from the caller.
export async function runCadence(request, env, { fetchImpl = fetch, wake }) {
  if (request.method !== "POST") return reply(405, "unavailable");
  if (!authorized(request, env.CRON_SECRET)) return reply(401, "unavailable");
  if (!publisherTarget(request, env, "/api/cadence")) return reply(403, "unavailable");
  if (!await emptyWake(request)) return reply(400, "unavailable");
  if (env.HELIX_NATIVE_WELCOME_CADENCE_ENABLED !== "true") return reply(200, "paused");

  const token = env.HELIX_SCHEDULED_CONFIRMATION_WORKER_TOKEN;
  const distinct = [token, env.CRON_SECRET, env.HELIX_NATIVE_WELCOME_WAKE_TOKEN, env.HELIX_NATIVE_WELCOME_DB_PASSWORD,
    env.HELIX_NATIVE_WELCOME_RESEND_KEY].filter(Boolean);
  if (!token || !/^[!-~]{32,256}$/.test(token) || distinct.length !== new Set(distinct).size) return reply(503, "unavailable");
  try {
    const alertUrl = new URL(env.HELIX_NATIVE_WELCOME_ALERT_URL);
    if (alertUrl.protocol !== "https:" || alertUrl.username || alertUrl.password || alertUrl.hash) return reply(503, "unavailable");
    const post = path => fetchImpl(site + path, { method: "POST", cache: "no-store", redirect: "error",
      headers: { authorization: "Bearer " + token }, signal: AbortSignal.timeout(12000) });
    let reason = "maintenance_unavailable", uncertainAttempts = 0, unresolvedHolds = 0;
    try {
      const state = await counts(await post("maintenance"));
      ({ uncertainAttempts, unresolvedHolds } = state);
      reason = "welcome_requires_review";
      if (!uncertainAttempts && !unresolvedHolds) {
        if (state.dispatchEnabled) {
          const response = await post("dispatch");
          void response.body?.cancel().catch(() => {});
          if (!response.ok) throw new Error();
        }
        if (env.HELIX_NATIVE_WELCOME_ENABLED === "true") {
          const response = await wake(new Request(env.HELIX_NATIVE_WELCOME_ORIGIN + "/api/wake", {
            method: "POST", headers: { authorization: "Bearer " + env.HELIX_NATIVE_WELCOME_WAKE_TOKEN },
          }));
          if (!response.ok) throw new Error();
        }
        return reply(200, "checked");
      }
    } catch { reason = "maintenance_unavailable"; }
    // Operator-configured recipient. Never forward tokens, customer identities, errors or raw provider responses.
    const alert = await fetchImpl(alertUrl.href, { method: "POST", redirect: "error", cache: "no-store",
      headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(5000),
      body: JSON.stringify({ reason, project: env.VERCEL_PROJECT_ID, deployment: env.VERCEL_DEPLOYMENT_ID, uncertainAttempts, unresolvedHolds }) });
    void alert.body?.cancel().catch(() => {});
    return reply(503, alert.ok ? "alerted" : "alert_failed");
  } catch { return reply(503, "unavailable"); }
}
