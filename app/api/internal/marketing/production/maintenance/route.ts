import { ADMIN_CAPABILITIES, checkAdminCapability } from "@/lib/admin/capabilities";
import { timingSafeEqual } from "node:crypto";
import { POST as dispatch } from "@/app/api/internal/marketing/production/dispatch/route";
import { readBoundedBody } from "@/lib/email/provider";
import { productionDeploymentAuthorized } from "@/lib/release/deployment-authorization";
import { productionMarketingScheduleSecret, productionMarketingWorkerAuthorized, productionMarketingWorkerToken } from "@/lib/production-marketing/delivery-config";
import { createProductionMarketingDeliveryStorage } from "@/lib/production-marketing/delivery-storage";
import { productionSignupQualification } from "@/lib/production-marketing/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const canonical = "https://www.helixskin.us";
const path = "/api/internal/marketing/production/maintenance";
const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", Vary: "Cookie, Authorization" };
const reply = (status: number, data: object) => Response.json(data, { status, headers });
const unavailable = (status: number) => reply(status, { status: "unavailable" });

function target(request: Request) {
  const platformHost = process.env.VERCEL_URL;
  return request.url === canonical + path || request.url === "https://helixskin.us" + path ||
    (!!platformHost && /^[a-z0-9-]+\.vercel\.app$/.test(platformHost) && request.url === "https://" + platformHost + path);
}

function identity() {
  return { projectId: process.env.VERCEL_PROJECT_ID, deploymentId: process.env.VERCEL_DEPLOYMENT_ID, sourceSha: process.env.VERCEL_GIT_COMMIT_SHA };
}

// HEAD allows a platform-hosted scheduled request to compare against the artifact serving
// the canonical domain, even while delivery is paused or a provider key is being rotated.
export async function HEAD(request: Request) {
  if (!productionMarketingWorkerAuthorized(request, process.env)) return new Response(null, { status: 401, headers });
  if (!target(request) || !await productionDeploymentAuthorized(process.env)) return new Response(null, { status: 403, headers });
  return new Response(null, { headers: { ...headers, "X-Helix-Deployment": identity().deploymentId! } });
}

export async function GET(request: Request) {
  if (!target(request) || !await productionDeploymentAuthorized(process.env)) return unavailable(403);
  try {
    const decision = await checkAdminCapability(ADMIN_CAPABILITIES.access);
    if (decision.status === "unauthenticated") return unavailable(401);
    if (decision.status === "unavailable") return unavailable(503);
    if (decision.status !== "allowed" || decision.access.role !== "admin") return unavailable(403);
    return reply(200, { ...identity(), ...productionSignupQualification(process.env) });
  } catch {
    return unavailable(503);
  }
}

export async function POST(request: Request) {
  const env = process.env;
  const cron = productionMarketingScheduleSecret(env), worker = productionMarketingWorkerToken(env);
  const supplied = Buffer.from(request.headers.get("authorization") ?? "");
  if (!cron || !worker) return unavailable(401);
  const expected = Buffer.from("Bearer " + cron);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return unavailable(401);
  if (!target(request) || !await productionDeploymentAuthorized(env)) return unavailable(403);
  try { await readBoundedBody(request, 0); } catch { return unavailable(400); }
  try {
    if (request.url !== canonical + path) {
      const serving = await fetch(canonical + path, {
        method: "HEAD", headers: { Authorization: "Bearer " + worker }, redirect: "error", cache: "no-store",
        signal: AbortSignal.timeout(3000),
      });
      if (!serving.ok || serving.headers.get("x-helix-deployment") !== env.VERCEL_DEPLOYMENT_ID) return unavailable(409);
    }
    if (env.HELIX_PRODUCTION_MARKETING_DISPATCH_ENABLED !== "true") {
      await createProductionMarketingDeliveryStorage(env).cleanup();
      return reply(200, { status: "paused" });
    }
    return await dispatch(new Request(canonical + "/api/internal/marketing/production/dispatch", {
      method: "POST", headers: { Authorization: "Bearer " + worker },
    }));
  } catch { return unavailable(503); }
}
