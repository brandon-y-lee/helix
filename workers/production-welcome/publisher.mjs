import { timingSafeEqual } from "node:crypto";
import { submitReservedEvent, validProviderKey } from "./resend.mjs";

const storefrontProject = "prj_N9nyPL9SixJHOROIovS8PDQ9aKny";
const storefrontRepo = "1280166759";
const status = (code, value) =>
  Response.json({ status: value }, { status: code, headers: { "cache-control": "private, no-store" } });

export function authorized(request, token) {
  if (typeof token !== "string" || !/^[!-~]{32,256}$/.test(token)) return false;
  const incoming = request.headers.get("authorization");
  if (!incoming || incoming.length !== token.length + 7) return false;
  const got = Buffer.from(incoming);
  const expected = Buffer.from("Bearer " + token);
  return got.length === expected.length && timingSafeEqual(got, expected);
}

export async function emptyWake(request) {
  const length = request.headers.get("content-length");
  if (length !== null && length !== "0") return false;
  if (!request.body) return true;
  const reader = request.body.getReader();
  let timer;
  try {
    const deadline = new Promise((resolve) => {
      timer = setTimeout(() => resolve(false), 1000);
    });
    const empty = async () => {
      for (let reads = 0; reads < 2; reads++) {
        const { done, value } = await reader.read();
        if (done) return true;
        if (value.byteLength !== 0) return false;
      }
      return false;
    };
    return await Promise.race([empty(), deadline]);
  } finally {
    clearTimeout(timer);
    void reader.cancel().catch(() => {});
  }
}

export function publisherTarget(request, env, path) {
  const origin = env.HELIX_NATIVE_WELCOME_ORIGIN;
  const projectId = env.VERCEL_PROJECT_ID;
  const deploymentId = env.VERCEL_DEPLOYMENT_ID;
  const gitSha = env.VERCEL_GIT_COMMIT_SHA;
  if (
    env.VERCEL !== "1" ||
    env.VERCEL_ENV !== "production" ||
    (env.VERCEL_TARGET_ENV !== undefined && env.VERCEL_TARGET_ENV !== "production") ||
    env.VERCEL_GIT_PROVIDER !== "github" ||
    env.VERCEL_GIT_COMMIT_REF !== "main" ||
    !/^[1-9][0-9]{0,19}$/.test(env.VERCEL_GIT_REPO_ID) ||
    env.VERCEL_GIT_REPO_ID === storefrontRepo ||
    env.VERCEL_GIT_REPO_ID !== env.HELIX_NATIVE_WELCOME_GIT_REPO_ID ||
    !/^prj_[A-Za-z0-9]{1,96}$/.test(projectId) ||
    projectId === storefrontProject ||
    projectId !== env.HELIX_NATIVE_WELCOME_PROJECT_ID ||
    !/^dpl_[A-Za-z0-9]{1,96}$/.test(deploymentId) ||
    !/^[0-9a-f]{40}$/.test(gitSha)
  )
    return null;
  const url = new URL(request.url);
  if (
    url.protocol !== "https:" ||
    url.origin !== origin ||
    request.url !== origin + path ||
    origin !== "https://" + env.VERCEL_PROJECT_PRODUCTION_URL ||
    !env.VERCEL_URL ||
    env.VERCEL_PROJECT_PRODUCTION_URL === env.VERCEL_URL
  )
    return null;
  return { projectId, deploymentId, gitSha };
}

function qualifiedBinding(request, env) {
  const target = publisherTarget(request, env, "/api/wake");
  const contractHash = env.HELIX_NATIVE_WELCOME_CONTRACT_SHA256;
  if (!target || env.HELIX_NATIVE_WELCOME_ENABLED !== "true" ||
    !/^[0-9a-f]{64}$/.test(contractHash) || !validProviderKey(env.HELIX_NATIVE_WELCOME_RESEND_KEY) ||
    !env.HELIX_NATIVE_WELCOME_DB_PASSWORD || new Set([
      env.HELIX_NATIVE_WELCOME_WAKE_TOKEN, env.HELIX_NATIVE_WELCOME_RESEND_KEY, env.HELIX_NATIVE_WELCOME_DB_PASSWORD,
    ]).size !== 3) return null;
  return { ...target, contractHash };
}

export async function handleWake(request, env, { withDatabase, fetchImpl = fetch }) {
  if (request.method !== "POST") return status(405, "unavailable");
  if (!authorized(request, env.HELIX_NATIVE_WELCOME_WAKE_TOKEN)) return status(401, "unavailable");
  try {
    const binding = qualifiedBinding(request, env);
    if (!binding) return status(503, "unavailable");
    if (!(await emptyWake(request))) return status(400, "unavailable");
    return await withDatabase(env, async (database) => {
      // A lost DB commit response supplies no recipient to this process. A later
      // wake cannot reacquire an irrevocably reserved attempt.
      const reservation = await database.reserve(binding);
      if (!reservation) return status(200, "idle");
      const outcome = await submitReservedEvent(reservation, env.HELIX_NATIVE_WELCOME_RESEND_KEY, fetchImpl);
      try {
        const finished = await database.finish(
          { intentId: reservation.intentId, attemptId: reservation.attemptId },
          outcome,
        );
        if (finished === true && outcome === "submitted") return status(200, "submitted");
      } catch {
        // The DB may already have stored the outcome. Never replay the event.
      }
      return status(503, "held");
    });
  } catch {
    return status(503, "unavailable");
  }
}
