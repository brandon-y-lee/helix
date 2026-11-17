import "server-only";
import { createHash } from "node:crypto";
import {
  assertCanonicalRequest,
  assertStoredContract,
  productionConfig,
  ProductionSupportError,
  PRODUCTION_ORIGIN,
  UUID,
  type ProductionEnvironment,
  type ProductionConfig,
} from "./config";
import { boundedText, object, strictKeys, response, failure } from "./request";
import { photoPath } from "./media";
export type PhotoRequestDependencies = {
  env: ProductionEnvironment;
  fullMediaImplemented(): boolean;
  contract(c: ProductionConfig): Promise<unknown>;
  rpc(
    c: ProductionConfig,
    name: string,
    input: Record<string, unknown>,
  ): Promise<unknown>;
  sign(
    c: ProductionConfig,
    path: string,
    deadline: string,
    ceiling: string,
  ): Promise<string>;
};
export async function handleProductionPhotos(
  request: Request,
  d: PhotoRequestDependencies,
) {
  try {
    const config = productionConfig(d.env);
    assertCanonicalRequest(request);
    if (
      request.method !== "POST" ||
      request.headers.get("origin") !== PRODUCTION_ORIGIN
    )
      throw new ProductionSupportError(403, "same_origin_required");
    if (
      !d.fullMediaImplemented() ||
      !config.fullMediaQualified ||
      !config.isolationQualified ||
      !config.operationsQualified
    )
      throw new ProductionSupportError();
    const contract = await d.contract(config);
    assertStoredContract(contract, config);
    if (
      !contract.fullMediaQualified ||
      !contract.isolationQualified ||
      !contract.operationsQualified
    )
      throw new ProductionSupportError();
    if (
      !/^application\/json(?:\s*;\s*charset=(?:utf-8|"utf-8"))?$/i.test(
        request.headers.get("content-type") ?? "",
      )
    )
      throw new ProductionSupportError(400, "invalid_input");
    let data: unknown;
    try {
      data = JSON.parse(await boundedText(request, 2048));
    } catch {
      throw new ProductionSupportError(400, "invalid_input");
    }
    if (!object(data)) throw new ProductionSupportError(400, "invalid_input");
    strictKeys(data, [
      "action",
      "submissionId",
      "uploadCapability",
      ...(data.action === "status" ? [] : ["uploadId"]),
    ]);
    if (
      typeof data.submissionId !== "string" ||
      !UUID.test(data.submissionId) ||
      typeof data.uploadCapability !== "string" ||
      !/^[a-f0-9]{64}$/.test(data.uploadCapability)
    )
      throw new ProductionSupportError(400, "invalid_input");
    const input = {
      projectRef: config.projectRef,
      contractId: config.contractId,
      submissionId: data.submissionId.toLowerCase(),
      capabilityHash: createHash("sha256")
        .update(data.uploadCapability)
        .digest("hex"),
    };
    if (data.action === "status") {
      const value = await d.rpc(config, "read_support_prod_photos", input);
      if (
        !object(value) ||
        value.submissionId !== input.submissionId ||
        !Array.isArray(value.photos) ||
        value.photos.length > 5
      )
        throw new ProductionSupportError();
      const ids = new Set<string>();
      const photos = value.photos.map((p) => {
        if (
          !object(p) ||
          typeof p.uploadId !== "string" ||
          !UUID.test(p.uploadId) ||
          ids.has(p.uploadId) ||
          ![
            "pending_upload",
            "processing",
            "ready",
            "rejected",
            "needs_review",
          ].includes(String(p.status))
        )
          throw new ProductionSupportError();
        ids.add(p.uploadId);
        return { uploadId: p.uploadId, status: p.status };
      });
      return response({ ok: true, photos });
    }
    if (
      typeof data.uploadId !== "string" ||
      !UUID.test(data.uploadId) ||
      !["admit", "complete"].includes(String(data.action))
    )
      throw new ProductionSupportError(400, "invalid_input");
    const args = { ...input, uploadId: data.uploadId.toLowerCase() };
    if (data.action === "complete") {
      if ((await d.rpc(config, "complete_support_prod_photo", args)) !== true)
        throw new ProductionSupportError();
      return response({ ok: true, status: "processing" });
    }
    const reserved = await d.rpc(config, "reserve_support_prod_photo", args);
    if (
      !object(reserved) ||
      reserved.uploadId !== args.uploadId ||
      typeof reserved.photoId !== "string" ||
      !UUID.test(reserved.photoId) ||
      typeof reserved.mintDeadlineAt !== "string" ||
      typeof reserved.tokenExpiresCeilingAt !== "string"
    )
      throw new ProductionSupportError();
    if (
      typeof reserved.rawPath !== "string" ||
      !reserved.rawPath.endsWith(`/${args.uploadId}`) ||
      reserved.cleanPath !==
        `${reserved.rawPath.replace(/^raw\//, "clean/")}.webp` ||
      !Number.isSafeInteger(reserved.byteSize) ||
      Number(reserved.byteSize) < 1 ||
      Number(reserved.byteSize) > 10485760 ||
      !["image/jpeg", "image/png", "image/webp"].includes(
        String(reserved.contentType),
      )
    )
      throw new ProductionSupportError();
    const uploadUrl = await d.sign(
      config,
      photoPath(reserved.rawPath, "raw"),
      reserved.mintDeadlineAt,
      reserved.tokenExpiresCeilingAt,
    );
    return response({ ok: true, uploadId: args.uploadId, uploadUrl });
  } catch (error) {
    return failure(error);
  }
}
