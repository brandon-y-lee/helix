import "server-only";
import { randomUUID, timingSafeEqual } from "node:crypto";
import {
  assertCanonicalRequest,
  assertStoredContract,
  PRODUCTION_ORIGIN,
  productionConfig,
  ProductionSupportError,
  type ProductionConfig,
} from "./config";
import { productionDeploymentAuthorized } from "@/lib/release/deployment-authorization";
import { handleProductionIntake } from "./intake";
import { sendFrozenRequest } from "./provider";
import { boundedText, failure, object, response } from "./request";
import { handleProductionSent } from "./sent";
import { productionRpc } from "./storage";
import { dispatchProductionOutbox } from "./worker";

// The full source path is implemented. This is NOT operational qualification:
// production context, dedicated identity/bucket and every applicable stored/env gate
// still fail closed by default. No deployed local/test bypass exists.
import { handleProductionPhotos } from "./photo-request";
import { createProductionPhotoStorage } from "./photo-storage";
import { processProductionPhoto } from "./photo-worker";
const FULL_MEDIA_IMPLEMENTED = true;
const workerPaths = new Set([
  "/api/internal/support-production-dispatch",
  "/api/internal/support-production-photos",
]);
const identity = (config: ProductionConfig) => ({
  projectRef: config.projectRef,
  contractId: config.contractId,
});
const contract = (config: ProductionConfig) =>
  productionRpc(config, "read_support_prod_contract");

export async function deployedIntake(request: Request): Promise<Response> {
  return handleProductionIntake(request, {
    env: process.env,
    fullMediaImplemented: () => FULL_MEDIA_IMPLEMENTED,
    contract,
    submit: (input, config) =>
      productionRpc(config, "submit_support_prod_inquiry", input),
  });
}
export async function deployedSent(request: Request): Promise<Response> {
  return handleProductionSent(request, {
    env: process.env,
    contract,
    record: (input, config) =>
      productionRpc(config, "record_support_prod_sent", input),
  });
}
function workerBearerMatches(request: Request, secret: string | undefined): boolean {
  if (!secret || !/^[!-~]{32,256}$/.test(secret)) return false;
  const expected = Buffer.from(`Bearer ${secret}`),
    actual = Buffer.from(request.headers.get("authorization") ?? "");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function deployedWorkerIdentity(request: Request): Promise<Response> {
  const deploymentId = process.env.VERCEL_DEPLOYMENT_ID;
  const url = new URL(request.url);
  if (!workerBearerMatches(request, process.env.CRON_SECRET)) return new Response(null, { status: 401 });
  if (!workerPaths.has(url.pathname) || url.href !== PRODUCTION_ORIGIN + url.pathname ||
      !deploymentId || !await productionDeploymentAuthorized(process.env)) return new Response(null, { status: 403 });
  return new Response(null, { headers: { "Cache-Control": "private, no-store", "X-Helix-Deployment": deploymentId } });
}

async function authorizeWorker(request: Request): Promise<ProductionConfig> {
  if (request.method !== "POST")
    throw new ProductionSupportError(405, "method_not_allowed");
  const env = process.env;
  const manualSecret = env.HELIX_PRODUCTION_SUPPORT_WORKER_SECRET;
  const scheduled = workerBearerMatches(request, env.CRON_SECRET);
  const manual = !!manualSecret && /^[A-Za-z0-9_-]{32,256}$/.test(manualSecret) &&
    workerBearerMatches(request, manualSecret);
  if (!scheduled && !manual)
    throw new ProductionSupportError(401, "unauthorized");
  const config = productionConfig(env);
  const url = new URL(request.url);
  if (!scheduled) assertCanonicalRequest(request);
  if (scheduled && (!workerPaths.has(url.pathname) ||
      (url.href !== PRODUCTION_ORIGIN + url.pathname &&
        (!env.VERCEL_URL || !/^[a-z0-9-]+\.vercel\.app$/.test(env.VERCEL_URL) ||
          url.href !== `https://${env.VERCEL_URL}${url.pathname}`)) ||
      !await productionDeploymentAuthorized(env))) {
    throw new ProductionSupportError(403, "same_origin_required");
  }
  if (request.body !== null) {
    if (
      !/^application\/json(?:\s*;\s*charset=(?:utf-8|"utf-8"))?$/i.test(
        request.headers.get("content-type") ?? "",
      )
    ) {
      throw new ProductionSupportError(400, "invalid_input");
    }
    const raw = await boundedText(request, 256, 1_000);
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new ProductionSupportError(400, "invalid_input");
    }
    if (!object(body) || Object.keys(body).length !== 0)
      throw new ProductionSupportError(400, "invalid_input");
  }
  if (scheduled && url.origin !== PRODUCTION_ORIGIN) {
    const serving = await fetch(PRODUCTION_ORIGIN + url.pathname, {
      method: "HEAD",
      headers: { Authorization: request.headers.get("authorization")! },
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(3_000),
    });
    if (!serving.ok || serving.headers.get("x-helix-deployment") !== env.VERCEL_DEPLOYMENT_ID) {
      throw new ProductionSupportError(409, "support_unavailable");
    }
  }
  return config;
}
export async function deployedPhotos(request: Request): Promise<Response> {
  return handleProductionPhotos(request, {
    env: process.env,
    fullMediaImplemented: () => FULL_MEDIA_IMPLEMENTED,
    contract,
    rpc: productionRpc,
    sign: async (config, path, deadline, ceiling) => {
      const stored = await contract(config);
      assertStoredContract(stored, config);
      return createProductionPhotoStorage(config, process.env, stored).sign(
        path,
        deadline,
        ceiling,
        AbortSignal.timeout(12_000),
      );
    },
  });
}
export async function deployedPhotoWorker(request: Request): Promise<Response> {
  try {
    const config = await authorizeWorker(request);
    const result = await processProductionPhoto(config, {
      contract,
      rpc: productionRpc,
      storage: (current, stored) =>
        createProductionPhotoStorage(current, process.env, stored),
      now: Date.now,
    });
    return response({ ok: true, ...result });
  } catch (error) {
    return failure(error);
  }
}
export async function deployedWorker(request: Request): Promise<Response> {
  try {
    const config = await authorizeWorker(request);
    if (!config.workerEnabled)
      return response({ ok: true, claimed: 0, accepted: 0, unconfirmed: 0 });
    // Drain existing work independently of admission, but only with the qualified
    // full-media/isolation/operations controls and the dedicated sending-only key.
    if (
      !config.fullMediaQualified ||
      !config.isolationQualified ||
      !config.operationsQualified
    )
      throw new ProductionSupportError();
    const key = process.env.HELIX_PRODUCTION_SUPPORT_RESEND_SENDING_KEY;
    if (!key || !/^re_[A-Za-z0-9_-]{20,256}$/.test(key))
      throw new ProductionSupportError();
    const result = await dispatchProductionOutbox(config, {
      contract,
      claim: (current, leaseId) =>
        productionRpc(current, "claim_support_prod_outbox", {
          ...identity(current),
          leaseId,
          leaseSeconds: 120,
        }),
      start: (current, claim) =>
        productionRpc(current, "start_support_prod_send", {
          ...identity(current),
          ...claim,
        }),
      complete: async (current, claim, outcome) =>
        (await productionRpc(current, "complete_support_prod_send", {
          ...identity(current),
          ...claim,
          ...outcome,
        })) === true,
      reconcile: async (current, claim) =>
        (await productionRpc(current, "reconcile_support_prod_media", {
          ...identity(current),
          ...claim,
        })) === true,
      readClean: async (path, signal) => {
        const stored = await contract(config);
        assertStoredContract(stored, config);
        return createProductionPhotoStorage(
          config,
          process.env,
          stored,
        ).readClean(path, signal);
      },
      send: (frozen) => sendFrozenRequest(frozen, key),
      now: () => Date.now(),
      leaseId: randomUUID,
    });
    return response({ ok: true, ...result });
  } catch (error) {
    return failure(error);
  }
}
