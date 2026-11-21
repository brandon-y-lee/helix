// @vitest-environment node
import { syntheticMainContext } from "./helpers/supabase-target";
import { createHash } from "node:crypto";
import { expect, it, vi } from "vitest";
import sharp from "sharp";
import { processProductionPhoto } from "@/lib/support/production/photo-worker";
import { productionConfig } from "@/lib/support/production/config";
const id = "00000000-0000-4000-8000-000000000001";
const config = productionConfig({
  ...syntheticMainContext, VERCEL: "1",
  VERCEL_ENV: "production",
  HELIX_PRODUCTION_SUPPORT_ORIGIN: "https://www.helixskin.us",
  HELIX_PRODUCTION_SUPPORT_PROJECT_REF: "erasogmsqpgiirovubjh",
  HELIX_PRODUCTION_SUPPORT_PROJECT_URL:
    "https://erasogmsqpgiirovubjh.supabase.co",
  HELIX_PRODUCTION_SUPPORT_CONTRACT_ID: id,
  HELIX_PRODUCTION_SUPPORT_SERVICE_ROLE_KEY:
    "synthetic-service-credential-32-characters",
  HELIX_PRODUCTION_SUPPORT_ABUSE_SECRET: "synthetic-abuse-secret-32-characters",
  HELIX_PRODUCTION_SUPPORT_WORKER_ENABLED: "true",
  HELIX_PRODUCTION_SUPPORT_FULL_MEDIA_QUALIFIED: "true",
  HELIX_PRODUCTION_SUPPORT_ISOLATION_QUALIFIED: "true",
  HELIX_PRODUCTION_SUPPORT_OPERATIONS_QUALIFIED: "true",
});
it("records original hash before actual isolated decode, preserves original and writes one clean object", async () => {
  const bytes = await sharp({
    create: { width: 8, height: 8, channels: 3, background: "red" },
  })
    .png()
    .toBuffer();
  const storage = {
    readRaw: vi.fn().mockResolvedValue(bytes),
    readClean: vi.fn(),
    writeClean: vi.fn().mockResolvedValue(undefined),
  };
  const rpc = vi.fn(async (_c: unknown, name: string) =>
    name === "claim_support_prod_photo"
      ? {
          photoId: id,
          inquiryId: id,
          uploadId: id,
          leaseId: id,
          leaseUntil: new Date(Date.now() + 120000).toISOString(),
          rawPath: `raw/${id}/${id}`,
          cleanPath: `clean/${id}/${id}.webp`,
          declaredBytes: bytes.length,
          contentType: "image/png",
        }
      : true,
  );
  const result = await processProductionPhoto(config, {
    contract: async () => ({
      ...config,
      photoBucket: "support-production-private",
    }),
    rpc,
    storage: () => storage,
    now: Date.now,
    leaseId: () => id,
  });
  expect(result.processed).toBe(1);
  expect(storage.writeClean).toHaveBeenCalledTimes(1);
  expect(rpc.mock.calls[1]).toEqual([
    config,
    "record_support_prod_photo_raw",
    expect.objectContaining({
      rawBytes: bytes.length,
      rawHash: createHash("sha256").update(bytes).digest("hex"),
      contentType: "image/png",
    }),
  ]);
  expect(rpc.mock.invocationCallOrder[1]).toBeLessThan(
    storage.writeClean.mock.invocationCallOrder[0],
  );
  expect(rpc.mock.calls.at(-1)?.[1]).toBe("finish_support_prod_photo");
});
it("raw manifest rejection cannot decode or write, and disabled workers do no storage work", async () => {
  const bytes = Buffer.from("not-image");
  const storage = {
    readRaw: vi.fn().mockResolvedValue(bytes),
    readClean: vi.fn(),
    writeClean: vi.fn(),
  };
  const decode = vi.fn();
  const rpc = vi.fn(async (_c: unknown, n: string) =>
    n === "claim_support_prod_photo"
      ? {
          photoId: id,
          inquiryId: id,
          uploadId: id,
          leaseId: id,
          leaseUntil: new Date(Date.now() + 120000).toISOString(),
          rawPath: `raw/${id}/${id}`,
          cleanPath: `clean/${id}/${id}.webp`,
          declaredBytes: bytes.length,
          contentType: "image/png",
        }
      : false,
  );
  const d = {
    contract: async () => ({ ...config }),
    rpc,
    storage: () => storage,
    decode,
    now: Date.now,
    leaseId: () => id,
  };
  await processProductionPhoto(config, d);
  expect(decode).not.toHaveBeenCalled();
  expect(storage.writeClean).not.toHaveBeenCalled();
  rpc.mockClear();
  await processProductionPhoto({ ...config, workerEnabled: false }, d);
  expect(rpc).not.toHaveBeenCalled();
});
