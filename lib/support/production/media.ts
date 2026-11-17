import "server-only";
import { createHash } from "node:crypto";
import {
  HASH,
  ProductionSupportError,
  SUPPORT_FROM,
  SUPPORT_TO,
  UUID,
} from "./config";
import { email, object, strictKeys } from "./request";
import { supportRfcMessageId } from "@/lib/support/threading";
export class MediaIntegrityError extends ProductionSupportError {}
export const MEDIA_REQUEST_LIMIT = 29_000_000;
export type MediaRecipe = {
  version: 1;
  inquiryId: string;
  primaryOutboxId: string;
  parentMessageId: string;
  replyTo: string;
  deliveryToken: string;
  photos: {
    photoId: string;
    uploadId: string;
    ordinal: number;
    path: string;
    hash: string;
    bytes: number;
  }[];
};
export function photoPath(value: unknown, kind: "raw" | "clean"): string {
  const u = "[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}";
  if (
    typeof value !== "string" ||
    !new RegExp(`^${kind}/${u}/${u}${kind === "clean" ? "\\.webp" : ""}$`).test(
      value,
    )
  )
    throw new ProductionSupportError();
  return value;
}
export function assertMediaRecipe(
  value: unknown,
): asserts value is MediaRecipe {
  if (!object(value)) throw new ProductionSupportError();
  strictKeys(value, [
    "version",
    "inquiryId",
    "primaryOutboxId",
    "parentMessageId",
    "replyTo",
    "deliveryToken",
    "photos",
  ]);
  if (
    value.version !== 1 ||
    typeof value.inquiryId !== "string" ||
    !UUID.test(value.inquiryId) ||
    typeof value.primaryOutboxId !== "string" ||
    !UUID.test(value.primaryOutboxId) ||
    !supportRfcMessageId(value.parentMessageId) ||
    typeof value.deliveryToken !== "string" ||
    !HASH.test(value.deliveryToken) ||
    !Array.isArray(value.photos) ||
    value.photos.length < 1 ||
    value.photos.length > 5
  )
    throw new ProductionSupportError();
  if (email(value.replyTo) !== value.replyTo)
    throw new ProductionSupportError();
  const ids = new Set<string>(),
    paths = new Set<string>();
  let ordinal = -1;
  for (const p of value.photos) {
    if (!object(p)) throw new ProductionSupportError();
    strictKeys(p, ["photoId", "uploadId", "ordinal", "path", "hash", "bytes"]);
    if (
      typeof p.uploadId !== "string" ||
      !UUID.test(p.uploadId) ||
      p.path !== `clean/${value.inquiryId}/${p.uploadId}.webp` ||
      typeof p.photoId !== "string" ||
      !UUID.test(p.photoId) ||
      ids.has(p.photoId) ||
      !Number.isInteger(p.ordinal) ||
      Number(p.ordinal) <= ordinal ||
      Number(p.ordinal) > 4 ||
      typeof p.hash !== "string" ||
      !HASH.test(p.hash) ||
      !Number.isInteger(p.bytes) ||
      Number(p.bytes) < 1 ||
      Number(p.bytes) > 4194304
    )
      throw new ProductionSupportError();
    const path = photoPath(p.path, "clean");
    if (paths.has(path)) throw new ProductionSupportError();
    paths.add(path);
    ids.add(p.photoId);
    ordinal = Number(p.ordinal);
  }
}
let mediaAssemblyActive = false;
/** Bound large attachment assembly to one job per Node process. Database leases fence fleet work. */
export async function materializeMedia(
  recipe: unknown,
  outboxId: string,
  contractId: string,
  read: (path: string, signal: AbortSignal) => Promise<Buffer>,
  signal: AbortSignal,
) {
  if (mediaAssemblyActive) throw new ProductionSupportError();
  mediaAssemblyActive = true;
  try {
    return await assembleMedia(recipe, outboxId, contractId, read, signal);
  } finally {
    mediaAssemblyActive = false;
  }
}
/** Version 1 serialization is deliberately explicit. Never serialize an arbitrary stored object. */
async function assembleMedia(
  recipe: unknown,
  outboxId: string,
  contractId: string,
  read: (path: string, signal: AbortSignal) => Promise<Buffer>,
  signal: AbortSignal,
): Promise<{ requestText: string; requestHash: string; requestBytes: number }> {
  assertMediaRecipe(recipe);
  if (!UUID.test(outboxId) || !UUID.test(contractId) || signal.aborted)
    throw new ProductionSupportError();
  const attachments = [];
  for (const photo of recipe.photos) {
    if (signal.aborted) throw new ProductionSupportError();
    let stop: (() => void) | undefined;
    const aborted = new Promise<never>((_, reject) => {
      stop = () => reject(new ProductionSupportError());
      signal.addEventListener("abort", stop, { once: true });
    });
    let bytes: Buffer;
    try {
      bytes = await Promise.race([read(photo.path, signal), aborted]);
    } finally {
      if (stop) signal.removeEventListener("abort", stop);
    }
    if (signal.aborted) throw new ProductionSupportError();
    if (
      bytes.length !== photo.bytes ||
      createHash("sha256").update(bytes).digest("hex") !== photo.hash
    )
      throw new MediaIntegrityError();
    attachments.push({
      filename: `photo-${photo.ordinal + 1}.webp`,
      content: bytes.toString("base64"),
      content_type: "image/webp",
    });
  }
  const requestText = JSON.stringify({
    from: SUPPORT_FROM,
    to: [SUPPORT_TO],
    reply_to: recipe.replyTo,
    subject: `Helix Website inquiry ${recipe.primaryOutboxId}`,
    text: "Unverified visitor attachments. Visitor identity and Reply-To are unverified. Do not disclose Account, Order or private information based on them.",
    headers: {
      "In-Reply-To": recipe.parentMessageId,
      References: recipe.parentMessageId,
    },
    tags: [
      { name: "helix_support_contract", value: contractId },
      { name: "helix_support_outbox", value: outboxId },
      { name: "helix_support_delivery", value: recipe.deliveryToken },
    ],
    attachments,
  });
  const requestBytes = Buffer.byteLength(requestText);
  if (signal.aborted || requestBytes > MEDIA_REQUEST_LIMIT)
    throw new ProductionSupportError();
  return {
    requestText,
    requestBytes,
    requestHash: createHash("sha256").update(requestText).digest("hex"),
  };
}
