import "server-only";
import { randomUUID, timingSafeEqual } from "node:crypto";
import {
  assertCanonicalRequest,
  assertStoredContract,
  productionConfig,
  ProductionSupportError,
  type ProductionConfig,
} from "./config";
import { handleProductionIntake } from "./intake";
import { sendFrozenRequest } from "./provider";
import { boundedText, failure, object, response } from "./request";
import { handleProductionSent } from "./sent";
import { productionRpc } from "./storage";
import { dispatchProductionOutbox } from "./worker";

// T1 declares photos; T2/T3 have not implemented or qualified full private media.
// Deliberately not an environment flag: no deployed test/text-only bypass exists.
import { handleProductionPhotos } from "./photo-request";
import { createProductionPhotoStorage } from "./photo-storage";
import { processProductionPhoto } from "./photo-worker";
const FULL_MEDIA_IMPLEMENTED = false;
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
async function authorizeWorker(request: Request): Promise<ProductionConfig> {
  if (request.method !== "POST")
    throw new ProductionSupportError(405, "method_not_allowed");
  const secret = process.env.HELIX_PRODUCTION_SUPPORT_WORKER_SECRET;
  const authorization = request.headers.get("authorization") ?? "";
  if (!secret || !/^[A-Za-z0-9_-]{32,256}$/.test(secret))
    throw new ProductionSupportError();
  const expected = Buffer.from(`Bearer ${secret}`),
    actual = Buffer.from(authorization);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    throw new ProductionSupportError(401, "unauthorized");
  const config = productionConfig(process.env);
  assertCanonicalRequest(request);
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
