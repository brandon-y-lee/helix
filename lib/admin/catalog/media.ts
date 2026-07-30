import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { CatalogAdminError } from "@/lib/admin/catalog/errors";
import type { EditableProductMedia } from "@/lib/admin/catalog/types";

export const CATALOG_MEDIA_BUCKET = "mei-pelle-catalog";
export const CATALOG_MEDIA_MAX_BYTES = 16 * 1024 * 1024;

const MIME_CONFIG = {
  "image/jpeg": { extension: "jpg", mediaType: "image" },
  "image/png": { extension: "png", mediaType: "image" },
  "image/webp": { extension: "webp", mediaType: "image" },
  "video/mp4": { extension: "mp4", mediaType: "video" },
} as const;

const MEDIA_ROLES = new Set([
  "card",
  "hero",
  "gallery",
  "detail",
  "campaign",
  "card_default",
  "card_hover",
  "cart",
  "search",
  "routine_video",
  "routine_video_poster",
  "profile_editorial",
  "ingredients_texture",
  "core_routine_texture",
  "pdp_outcome",
  "pdp_application",
]);

type SupportedMimeType = keyof typeof MIME_CONFIG;

function isSupportedMimeType(value: string): value is SupportedMimeType {
  return value in MIME_CONFIG;
}

function isJpeg(bytes: Buffer): boolean {
  return (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  );
}

function isPng(bytes: Buffer): boolean {
  return (
    bytes.length >= 24 &&
    bytes.subarray(0, 8).equals(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    ) &&
    bytes.toString("ascii", 12, 16) === "IHDR"
  );
}

function isWebp(bytes: Buffer): boolean {
  return (
    bytes.length >= 16 &&
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  );
}

function isMp4(bytes: Buffer): boolean {
  return bytes.length >= 12 && bytes.toString("ascii", 4, 8) === "ftyp";
}

function assertFileSignature(bytes: Buffer, mimeType: SupportedMimeType): void {
  const valid =
    (mimeType === "image/jpeg" && isJpeg(bytes)) ||
    (mimeType === "image/png" && isPng(bytes)) ||
    (mimeType === "image/webp" && isWebp(bytes)) ||
    (mimeType === "video/mp4" && isMp4(bytes));
  if (!valid) {
    throw new CatalogAdminError(
      "invalid_media_format",
      "The uploaded bytes do not match the declared media type.",
      422,
    );
  }
}

function jpegDimensions(bytes: Buffer): {
  width: number;
  height: number;
} | null {
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1];
    const length = bytes.readUInt16BE(offset + 2);
    if (length < 2 || offset + 2 + length > bytes.length) return null;
    if (
      [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(
        marker,
      )
    ) {
      return {
        height: bytes.readUInt16BE(offset + 5),
        width: bytes.readUInt16BE(offset + 7),
      };
    }
    offset += 2 + length;
  }
  return null;
}

function webpDimensions(bytes: Buffer): {
  width: number;
  height: number;
} | null {
  const kind = bytes.toString("ascii", 12, 16);
  if (kind === "VP8X" && bytes.length >= 30) {
    return {
      width: 1 + bytes.readUIntLE(24, 3),
      height: 1 + bytes.readUIntLE(27, 3),
    };
  }
  if (kind === "VP8 " && bytes.length >= 30) {
    return {
      width: bytes.readUInt16LE(26) & 0x3fff,
      height: bytes.readUInt16LE(28) & 0x3fff,
    };
  }
  if (kind === "VP8L" && bytes.length >= 25) {
    const bits = bytes.readUInt32LE(21);
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1,
    };
  }
  return null;
}

export function mediaDimensions(
  bytes: Buffer,
  mimeType: SupportedMimeType,
): { width: number; height: number } | null {
  if (mimeType === "image/png") {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (mimeType === "image/jpeg") return jpegDimensions(bytes);
  if (mimeType === "image/webp") return webpDimensions(bytes);
  return null;
}

export async function stageCatalogMedia(input: {
  file: File;
  productId: string;
  role: string;
  sortOrder: number;
  alt: string;
  variantId: string | null;
  actorId: string;
}): Promise<EditableProductMedia> {
  if (!isSupportedMimeType(input.file.type)) {
    throw new CatalogAdminError(
      "unsupported_media_type",
      "Supported uploads are JPEG, PNG, WebP, and MP4.",
      415,
    );
  }
  if (input.file.size < 1 || input.file.size > CATALOG_MEDIA_MAX_BYTES) {
    throw new CatalogAdminError(
      "invalid_media_size",
      `Media must be between 1 byte and ${CATALOG_MEDIA_MAX_BYTES} bytes.`,
      413,
    );
  }
  if (!MEDIA_ROLES.has(input.role)) {
    throw new CatalogAdminError(
      "invalid_media_role",
      "Unsupported product media role.",
      422,
    );
  }
  if (!Number.isSafeInteger(input.sortOrder) || input.sortOrder < 0) {
    throw new CatalogAdminError(
      "invalid_media_order",
      "Media sort order must be a non-negative integer.",
      422,
    );
  }
  if (!input.alt.trim() || input.alt.length > 500) {
    throw new CatalogAdminError(
      "invalid_media_alt",
      "Media alt text is required and must be 500 characters or fewer.",
      422,
    );
  }

  const admin = createSupabaseAdminClient();
  const { data: product, error: productError } = await admin
    .from("products")
    .select("id, slug")
    .eq("id", input.productId)
    .maybeSingle();
  if (productError) {
    throw new CatalogAdminError(
      "catalog_read_failed",
      "The product could not be verified.",
      503,
    );
  }
  if (!product) {
    throw new CatalogAdminError("product_not_found", "Product not found.", 404);
  }

  if (input.variantId) {
    const { data: variant, error: variantError } = await admin
      .from("product_variants")
      .select("id")
      .eq("id", input.variantId)
      .eq("product_id", input.productId)
      .is("archived_at", null)
      .maybeSingle();
    if (variantError || !variant) {
      throw new CatalogAdminError(
        "invalid_media_variant",
        "The selected variant does not belong to this product.",
        422,
      );
    }
  }

  const bytes = Buffer.from(await input.file.arrayBuffer());
  assertFileSignature(bytes, input.file.type);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const config = MIME_CONFIG[input.file.type];
  const path = `products/${product.slug}/drafts/${sha256}.${config.extension}`;
  const dimensions = mediaDimensions(bytes, input.file.type);

  const { error: uploadError } = await admin.storage
    .from(CATALOG_MEDIA_BUCKET)
    .upload(path, bytes, {
      cacheControl: "31536000",
      contentType: input.file.type,
      upsert: false,
    });
  if (
    uploadError &&
    !/already exists|duplicate/i.test(uploadError.message)
  ) {
    throw new CatalogAdminError(
      "media_upload_failed",
      "The media asset could not be staged.",
      502,
    );
  }

  const { data: publicUrl } = admin.storage
    .from(CATALOG_MEDIA_BUCKET)
    .getPublicUrl(path);
  const id = randomUUID();
  const staged: EditableProductMedia = {
    id,
    variant_id: input.variantId,
    media_type: config.mediaType,
    media_kind: config.mediaType,
    url: publicUrl.publicUrl,
    alt: input.alt.trim(),
    width: dimensions?.width ?? null,
    height: dimensions?.height ?? null,
    role: input.role,
    sort_order: input.sortOrder,
    palette_id: null,
    placeholder_palette: {},
    original_source_url: null,
    source_filename: input.file.name || null,
    pendingUpload: {
      bucket: CATALOG_MEDIA_BUCKET,
      path,
      sha256,
      mimeType: input.file.type,
      sizeBytes: bytes.length,
      uploadedBy: input.actorId,
    },
  };

  const { error: auditError } = await admin
    .from("catalog_editor_audit_log")
    .insert({
      action: "media.uploaded",
      actor_id: input.actorId,
      product_id: input.productId,
      metadata: {
        bucket: CATALOG_MEDIA_BUCKET,
        path,
        sha256,
        mimeType: input.file.type,
        sizeBytes: bytes.length,
      },
    });
  if (auditError) {
    throw new CatalogAdminError(
      "media_audit_failed",
      "The staged media asset could not be audited.",
      503,
    );
  }

  return staged;
}
