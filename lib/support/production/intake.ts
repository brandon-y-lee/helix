import "server-only";
import { createHash, createHmac } from "node:crypto";
import { isIP } from "node:net";
import { contactInquiryTypes } from "@/content/support/contact";
import { productionConfig, admissionConfigured, assertCanonicalRequest, assertStoredContract, PRODUCTION_ORIGIN,
  ProductionSupportError, UUID, type ProductionEnvironment, type ProductionConfig } from "./config";
import { boundedText, email, failure, object, response, strictKeys, text } from "./request";

export type PhotoDeclaration = { uploadId: string; contentType: string; byteSize: number };
export type Submission = { projectRef: string; contractId: string; submissionId: string; payloadHash: string; capabilityHash: string;
  sourceHash: string; emailHash: string; name: string; email: string; inquiryType: string; subject: string; body: string; photos: PhotoDeclaration[] };
export type SavedReceipt = { inquiryId: string; submissionId: string; status: "saved"; outboxId: string; photoStatus: "declared"; reservedBytes: number };
export type IntakeDependencies = { env: ProductionEnvironment;
  /** Only a domain seam for synthetic tests. Deployed routes always use the source readiness constant. */
  fullMediaImplemented(): boolean; contract(config: ProductionConfig): Promise<unknown>;
  submit(input: Submission, config: ProductionConfig): Promise<unknown> };
function uuid(value: unknown): string {
  if (typeof value !== "string" || !UUID.test(value)) throw new ProductionSupportError(400, "invalid_input");
  return value.toLowerCase();
}
function parseSubmission(value: unknown) {
  if (!object(value)) throw new ProductionSupportError(400, "invalid_input");
  strictKeys(value, ["submissionId", "name", "email", "inquiryType", "subject", "body", "photos", "uploadCapability"]);
  const inquiryType = text(value.inquiryType, 32);
  if (!contactInquiryTypes.some((type) => type.value === inquiryType)) throw new ProductionSupportError(400, "invalid_input");
  if (!Array.isArray(value.photos) || value.photos.length > 5 || typeof value.uploadCapability !== "string"
    || !/^[a-f0-9]{64}$/.test(value.uploadCapability)) throw new ProductionSupportError(400, "invalid_input");
  const ids = new Set<string>(); let total = 0;
  const photos = value.photos.map((photo): PhotoDeclaration => {
    if (!object(photo)) throw new ProductionSupportError(400, "invalid_input");
    strictKeys(photo, ["uploadId", "contentType", "byteSize"]);
    const uploadId = uuid(photo.uploadId);
    if (ids.has(uploadId) || typeof photo.contentType !== "string" || !["image/jpeg", "image/png", "image/webp"].includes(photo.contentType)
      || typeof photo.byteSize !== "number" || !Number.isSafeInteger(photo.byteSize) || photo.byteSize < 1 || photo.byteSize > 10 * 1024 * 1024) {
      throw new ProductionSupportError(400, "invalid_input");
    }
    ids.add(uploadId); total += photo.byteSize;
    return { uploadId, contentType: photo.contentType, byteSize: photo.byteSize };
  });
  if (total > 20 * 1024 * 1024) throw new ProductionSupportError(400, "invalid_input");
  return { submissionId: uuid(value.submissionId), name: text(value.name, 100), email: email(value.email), inquiryType,
    subject: text(value.subject, 200), body: text(value.body, 10_000, true), photos,
    capabilityHash: createHash("sha256").update(value.uploadCapability).digest("hex") };
}
export async function handleProductionIntake(request: Request, dependencies: IntakeDependencies): Promise<Response> {
  try {
    if (!["GET", "POST"].includes(request.method)) throw new ProductionSupportError(405, "method_not_allowed");
    const config = productionConfig(dependencies.env);
    assertCanonicalRequest(request);
    if (request.method === "POST" && request.headers.get("origin") !== PRODUCTION_ORIGIN) throw new ProductionSupportError(403, "same_origin_required");
    if (!admissionConfigured(config) || !dependencies.fullMediaImplemented()) throw new ProductionSupportError();
    const contract = await dependencies.contract(config);
    assertStoredContract(contract, config);
    if (contract.admissionEnabled !== true || contract.fullMediaQualified !== true || contract.isolationQualified !== true || contract.operationsQualified !== true) throw new ProductionSupportError();
    if (typeof contract.photoWorkerLimit !== "number" || !Number.isInteger(contract.photoWorkerLimit)
      || contract.photoWorkerLimit < 1 || contract.photoWorkerLimit > 16) throw new ProductionSupportError();
    const bucket = dependencies.env.HELIX_PRODUCTION_SUPPORT_PHOTO_BUCKET;
    if (!bucket || bucket !== contract.photoBucket || !/^[a-z0-9][a-z0-9_-]{2,62}$/.test(bucket)
      || ["helix-support-photos", "helix-catalog"].includes(bucket)) throw new ProductionSupportError();
    if (request.method === "GET") return response({ available: true, photosAvailable: true,
      uploadBinding: { origin: config.projectUrl, bucket } });
    if (!/^application\/json(?:\s*;\s*charset=(?:utf-8|"utf-8"))?$/i.test(request.headers.get("content-type") ?? "")) throw new ProductionSupportError(400, "invalid_input");
    const raw = await boundedText(request, 48 * 1024);
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { throw new ProductionSupportError(400, "invalid_input"); }
    const input = parseSubmission(parsed);
    // Vercel overwrites this header on its production edge. Never accept x-forwarded-for,
    // CF headers, or a caller-provided source field as a fallback.
    const address = request.headers.get("x-vercel-forwarded-for");
    if (!address || !isIP(address)) throw new ProductionSupportError();
    const digest = (kind: string, value: string) => createHmac("sha256", config.abuseSecret).update(`helix-production-support:${kind}:v1\0${value}`).digest("hex");
    const saved = await dependencies.submit({ ...input, projectRef: config.projectRef, contractId: config.contractId,
      payloadHash: createHash("sha256").update(JSON.stringify(input)).digest("hex"),
      sourceHash: digest("source", address), emailHash: digest("email", input.email) }, config);
    if (!object(saved) || !UUID.test(String(saved.inquiryId)) || saved.submissionId !== input.submissionId
      || saved.status !== "saved" || saved.photoStatus !== "declared") throw new ProductionSupportError();
    return response({ ok: true, receipt: { inquiryId: saved.inquiryId, submissionId: saved.submissionId, status: "saved", photoStatus: "declared" } });
  } catch (error) {
    if (request.method === "GET") return response({ available: false, photosAvailable: false });
    return failure(error);
  }
}
