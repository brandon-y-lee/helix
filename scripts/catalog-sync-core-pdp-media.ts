import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { config } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { readWebpDimensions } from "./catalog-sync-core-media";

config({ path: resolve(process.cwd(), ".env.local"), quiet: true });

const PROJECT_REF = "erasogmsqpgiirovubjh";
const BUCKET = "mei-pelle-catalog";
const CACHE_CONTROL = "31536000";
const BACKUP_DIR = "/private/tmp/mei-pelle-catalog-backups";
const DEFAULT_ASSET_DIR = "/private/tmp/mei-pelle-media-prep";
const MAX_VIDEO_BYTES = 16 * 1024 * 1024;

export const CORE_PDP_MEDIA_ROLES = [
  "gallery",
  "routine_video",
  "routine_video_poster",
  "profile_editorial",
  "ingredients_texture",
  "core_routine_texture",
  "core_routine_editorial",
] as const;

type CorePdpMediaRole = (typeof CORE_PDP_MEDIA_ROLES)[number];
type CorePdpMediaType = "image" | "video";

export type CorePdpMediaAsset = {
  slug: string;
  filename: string;
  role: CorePdpMediaRole;
  mediaType: CorePdpMediaType;
  contentType: "image/webp" | "video/mp4";
  alt: string;
  width: number | null;
  height: number | null;
  sortOrder: number;
  durationSeconds: number | null;
  optionalSource?: boolean;
};

export const CORE_PDP_MEDIA_ASSETS: readonly CorePdpMediaAsset[] = [
  {
    slug: "cleanse-01-calming-gel-cleanser",
    filename: "cleanse-pdp-routine-source.mp4",
    role: "routine_video",
    mediaType: "video",
    contentType: "video/mp4",
    alt: "CLEANSE routine application video.",
    width: 720,
    height: 1280,
    sortOrder: 20,
    durationSeconds: 41.934,
  },
  {
    slug: "cleanse-01-calming-gel-cleanser",
    filename: "cleanse-pdp-routine-poster.webp",
    role: "routine_video_poster",
    mediaType: "image",
    contentType: "image/webp",
    alt: "CLEANSE routine video poster showing skincare application.",
    width: 720,
    height: 1280,
    sortOrder: 21,
    durationSeconds: null,
  },
  {
    slug: "cleanse-01-calming-gel-cleanser",
    filename: "cleanse-pdp-profile-01.webp",
    role: "profile_editorial",
    mediaType: "image",
    contentType: "image/webp",
    alt: "CLEANSE bottle with black pump on a warm neutral backdrop.",
    width: 1122,
    height: 1402,
    sortOrder: 22,
    durationSeconds: null,
  },
  {
    slug: "cleanse-01-calming-gel-cleanser",
    filename: "cleanse-pdp-ingredients-texture-01.webp",
    role: "ingredients_texture",
    mediaType: "image",
    contentType: "image/webp",
    alt: "Clear CLEANSE gel formula texture with fine bubbles on a pale background.",
    width: 1254,
    height: 1254,
    sortOrder: 23,
    durationSeconds: null,
  },
  {
    slug: "cleanse-01-calming-gel-cleanser",
    filename: "cleanse-pdp-core-routine-texture-01.webp",
    role: "core_routine_texture",
    mediaType: "image",
    contentType: "image/webp",
    alt: "Clear CLEANSE gel droplet with fine bubbles.",
    width: 1024,
    height: 1024,
    sortOrder: 24,
    durationSeconds: null,
  },
  {
    slug: "cleanse-01-calming-gel-cleanser",
    filename: "cleanse-pdp-core-routine-editorial-01.webp",
    role: "core_routine_editorial",
    mediaType: "image",
    contentType: "image/webp",
    alt: "CLEANSE supporting routine editorial image.",
    width: null,
    height: null,
    sortOrder: 1,
    durationSeconds: null,
    optionalSource: true,
  },
  {
    slug: "cleanse-01-calming-gel-cleanser",
    filename: "cleanse-pdp-gallery-02.webp",
    role: "gallery",
    mediaType: "image",
    contentType: "image/webp",
    alt: "Close portrait for CLEANSE with damp dark hair.",
    width: 1440,
    height: 1800,
    sortOrder: 2,
    durationSeconds: null,
  },
  {
    slug: "treat-03-pdrn-5-ampoule",
    filename: "treat-pdp-routine-source.mp4",
    role: "routine_video",
    mediaType: "video",
    contentType: "video/mp4",
    alt: "TREAT routine application video.",
    width: 720,
    height: 1280,
    sortOrder: 20,
    durationSeconds: 35.034,
  },
  {
    slug: "treat-03-pdrn-5-ampoule",
    filename: "treat-pdp-routine-poster.webp",
    role: "routine_video_poster",
    mediaType: "image",
    contentType: "image/webp",
    alt: "TREAT routine video poster showing skincare application.",
    width: 720,
    height: 1280,
    sortOrder: 21,
    durationSeconds: null,
  },
  {
    slug: "treat-03-pdrn-5-ampoule",
    filename: "treat-pdp-profile-01.webp",
    role: "profile_editorial",
    mediaType: "image",
    contentType: "image/webp",
    alt: "TREAT bottle with wood-grain cap on a warm neutral backdrop.",
    width: 1122,
    height: 1402,
    sortOrder: 22,
    durationSeconds: null,
  },
  {
    slug: "treat-03-pdrn-5-ampoule",
    filename: "treat-pdp-ingredients-texture-01.webp",
    role: "ingredients_texture",
    mediaType: "image",
    contentType: "image/webp",
    alt: "Golden TREAT serum formula texture with suspended air bubbles.",
    width: 1254,
    height: 1254,
    sortOrder: 23,
    durationSeconds: null,
  },
  {
    slug: "treat-03-pdrn-5-ampoule",
    filename: "treat-pdp-core-routine-texture-01.webp",
    role: "core_routine_texture",
    mediaType: "image",
    contentType: "image/webp",
    alt: "Golden TREAT serum droplet on a warm tonal field.",
    width: 1024,
    height: 1024,
    sortOrder: 24,
    durationSeconds: null,
  },
  {
    slug: "treat-03-pdrn-5-ampoule",
    filename: "treat-pdp-core-routine-editorial-01.webp",
    role: "core_routine_editorial",
    mediaType: "image",
    contentType: "image/webp",
    alt: "TREAT supporting routine editorial image.",
    width: null,
    height: null,
    sortOrder: 1,
    durationSeconds: null,
    optionalSource: true,
  },
  {
    slug: "treat-03-pdrn-5-ampoule",
    filename: "treat-pdp-gallery-02.webp",
    role: "gallery",
    mediaType: "image",
    contentType: "image/webp",
    alt: "Portrait for TREAT with blond-streaked hair on pale blue.",
    width: 1440,
    height: 1920,
    sortOrder: 2,
    durationSeconds: null,
  },
  {
    slug: "seal-05-green-collagen-cream",
    filename: "seal-pdp-routine-source.mp4",
    role: "routine_video",
    mediaType: "video",
    contentType: "video/mp4",
    alt: "SEAL routine application video.",
    width: 720,
    height: 1280,
    sortOrder: 20,
    durationSeconds: 35.934,
  },
  {
    slug: "seal-05-green-collagen-cream",
    filename: "seal-pdp-routine-poster.webp",
    role: "routine_video_poster",
    mediaType: "image",
    contentType: "image/webp",
    alt: "SEAL routine video poster showing skincare application.",
    width: 720,
    height: 1280,
    sortOrder: 21,
    durationSeconds: null,
  },
  {
    slug: "seal-05-green-collagen-cream",
    filename: "seal-pdp-profile-01.webp",
    role: "profile_editorial",
    mediaType: "image",
    contentType: "image/webp",
    alt: "SEAL cream jar with wood-grain lid on a warm neutral backdrop.",
    width: 1086,
    height: 1448,
    sortOrder: 22,
    durationSeconds: null,
  },
  {
    slug: "seal-05-green-collagen-cream",
    filename: "seal-pdp-ingredients-texture-01.webp",
    role: "ingredients_texture",
    mediaType: "image",
    contentType: "image/webp",
    alt: "White SEAL cream formula stretching into a soft peak.",
    width: 1201,
    height: 1310,
    sortOrder: 23,
    durationSeconds: null,
  },
  {
    slug: "seal-05-green-collagen-cream",
    filename: "seal-pdp-core-routine-texture-01.webp",
    role: "core_routine_texture",
    mediaType: "image",
    contentType: "image/webp",
    alt: "White SEAL cream swatch with a soft glossy finish.",
    width: 600,
    height: 600,
    sortOrder: 24,
    durationSeconds: null,
  },
  {
    slug: "seal-05-green-collagen-cream",
    filename: "seal-pdp-core-routine-editorial-01.webp",
    role: "core_routine_editorial",
    mediaType: "image",
    contentType: "image/webp",
    alt: "SEAL supporting routine editorial image.",
    width: null,
    height: null,
    sortOrder: 1,
    durationSeconds: null,
    optionalSource: true,
  },
  {
    slug: "seal-05-green-collagen-cream",
    filename: "seal-pdp-gallery-02.webp",
    role: "gallery",
    mediaType: "image",
    contentType: "image/webp",
    alt: "Portrait for SEAL with slicked-back dark hair.",
    width: 1122,
    height: 1402,
    sortOrder: 2,
    durationSeconds: null,
  },
] as const;

type ProductRow = {
  id: string;
  slug: string;
  display_name: string | null;
  routine_group: string;
};

type MediaRow = {
  id: string;
  product_id: string;
  media_type: string;
  url: string | null;
  alt: string;
  width: number | null;
  height: number | null;
  role: string;
  sort_order: number;
  palette_id: string | null;
  placeholder_palette: Record<string, unknown>;
  original_source_url: string | null;
  source_filename: string | null;
  updated_at: string;
};

type StorageObjectRow = {
  bucket_id: string;
  name: string;
  metadata: Record<string, unknown> | null;
  created_at: string | null;
  updated_at: string | null;
};

type InspectedAsset = Omit<CorePdpMediaAsset, "width" | "height"> & {
  width: number;
  height: number;
  absolutePath: string;
  sha256: string;
  storagePath: string;
  publicUrl: string;
  bytes: Buffer;
};

type PlannedRow = {
  product_id: string;
  media_type: CorePdpMediaType;
  url: string;
  alt: string;
  width: number;
  height: number;
  role: CorePdpMediaRole;
  sort_order: number;
  palette_id: null;
  placeholder_palette: Record<string, never>;
  original_source_url: null;
  source_filename: string;
};

export type CorePdpMediaSyncReport = {
  ok: boolean;
  dryRun: boolean;
  projectRef: string;
  bucket: string;
  assetDirectory: string;
  backupPath: string | null;
  assets: Array<{
    slug: string;
    role: CorePdpMediaRole;
    filename: string;
    sha256: string;
    bytes: number;
    width: number;
    height: number;
    durationSeconds: number | null;
    storagePath: string;
    publicUrl: string;
  }>;
  missingInputs: string[];
  retainedCanonicalInputs: string[];
  objectsUploaded: number;
  objectsPlanned: number;
  objectsVerified: number;
  rowsSubmitted: number;
  rowsPlanned: number;
  rowsUnchanged: number;
  rowsVerified: number;
  galleryPlaceholdersPlanned: number;
  galleryPlaceholdersArchived: number;
};

export class MissingCorePdpMediaSourceError extends Error {
  constructor(path: string) {
    super(
      `[core-pdp-media-sync] Cannot read required source "${path}": file not found`,
    );
    this.name = "MissingCorePdpMediaSourceError";
  }
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function createSupabaseAdminClient(): SupabaseClient {
  return createClient(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      realtime: {
        transport: WebSocket as unknown as typeof globalThis.WebSocket,
      },
    },
  );
}

function verifyProjectRef() {
  const url = new URL(requiredEnv("NEXT_PUBLIC_SUPABASE_URL"));
  const hostRef = url.hostname.split(".")[0];
  if (hostRef !== PROJECT_REF) {
    throw new Error(
      `[core-pdp-media-sync] Refusing Supabase project "${hostRef}"; expected "${PROJECT_REF}".`,
    );
  }
}

function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function assertMp4(buffer: Buffer, filename: string) {
  if (
    buffer.length < 12 ||
    buffer.toString("ascii", 4, 8) !== "ftyp"
  ) {
    throw new Error(`[core-pdp-media-sync] ${filename} is not an MP4 file.`);
  }
  if (buffer.length > MAX_VIDEO_BYTES) {
    throw new Error(
      `[core-pdp-media-sync] ${filename} exceeds the 16 MiB catalog media limit.`,
    );
  }
}

function storageDirectory(role: CorePdpMediaRole): string {
  if (role === "gallery") return "gallery";
  if (role === "profile_editorial") return "profile";
  if (role === "ingredients_texture") return "ingredients-texture";
  if (role === "core_routine_texture") return "core-routine-texture";
  if (role === "core_routine_editorial") return "core-routine-editorial";
  return "routine";
}

const CORE_PRODUCT_PREFIXES: Record<string, string> = {
  "cleanse-01-calming-gel-cleanser": "cleanse",
  "treat-03-pdrn-5-ampoule": "treat",
  "seal-05-green-collagen-cream": "seal",
};

export function assertCorePdpAssetFilename(asset: CorePdpMediaAsset): void {
  const expected =
    asset.role === "gallery"
      ? `${CORE_PRODUCT_PREFIXES[asset.slug]}-pdp-gallery-02.webp`
      : asset.role === "core_routine_editorial"
        ? `${CORE_PRODUCT_PREFIXES[asset.slug]}-pdp-core-routine-editorial-01.webp`
        : null;
  if (expected && asset.filename !== expected) {
    throw new Error(
      `[core-pdp-media-sync] Invalid ${asset.role} basename "${asset.filename}" for ${asset.slug}; expected "${expected}".`,
    );
  }
}

export function storagePathForCorePdpAsset(
  asset: CorePdpMediaAsset,
  checksum: string,
): string {
  const extension = asset.mediaType === "video" ? "mp4" : "webp";
  return `products/${asset.slug}/${storageDirectory(asset.role)}/${checksum}.${extension}`;
}

function publicUrlFor(projectUrl: string, storagePath: string): string {
  const origin = new URL(projectUrl).origin;
  return `${origin}/storage/v1/object/public/${BUCKET}/${storagePath}`;
}

export async function inspectCorePdpAsset(
  asset: CorePdpMediaAsset,
  assetDirectory = DEFAULT_ASSET_DIR,
): Promise<InspectedAsset> {
  assertCorePdpAssetFilename(asset);
  const absolutePath = resolve(assetDirectory, asset.filename);
  let width = asset.width;
  let height = asset.height;
  let bytes: Buffer;
  try {
    bytes = await readFile(absolutePath);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      throw new MissingCorePdpMediaSourceError(absolutePath);
    }
    const detail = error instanceof Error ? error.message : "unknown read error";
    throw new Error(
      `[core-pdp-media-sync] Cannot read required source "${absolutePath}": ${detail}`,
    );
  }

  if (asset.mediaType === "video") {
    assertMp4(bytes, asset.filename);
  } else {
    const dimensions = readWebpDimensions(bytes);
    if (
      (asset.width !== null && dimensions.width !== asset.width) ||
      (asset.height !== null && dimensions.height !== asset.height)
    ) {
      throw new Error(
        `[core-pdp-media-sync] ${asset.filename} is ${dimensions.width}x${dimensions.height}; ` +
          `expected ${asset.width ?? "measured"}x${asset.height ?? "measured"}.`,
      );
    }
    width = dimensions.width;
    height = dimensions.height;
  }

  if (!width || !height || width <= 0 || height <= 0) {
    throw new Error(
      `[core-pdp-media-sync] ${asset.filename} is missing positive intrinsic dimensions.`,
    );
  }

  const checksum = sha256(bytes);
  const storagePath = storagePathForCorePdpAsset(asset, checksum);
  return {
    ...asset,
    width,
    height,
    absolutePath,
    sha256: checksum,
    storagePath,
    publicUrl: publicUrlFor(
      requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
      storagePath,
    ),
    bytes,
  };
}

export async function inspectConfiguredCorePdpAssets(
  assetDirectory = DEFAULT_ASSET_DIR,
  configuredAssets: readonly CorePdpMediaAsset[] = CORE_PDP_MEDIA_ASSETS,
  satisfiedInputs: ReadonlySet<string> = new Set(),
): Promise<{
  assets: InspectedAsset[];
  missingInputs: string[];
  retainedCanonicalInputs: string[];
}> {
  const assets: InspectedAsset[] = [];
  const missingInputs: string[] = [];
  const retainedCanonicalInputs: string[] = [];
  for (const asset of configuredAssets) {
    try {
      assets.push(await inspectCorePdpAsset(asset, assetDirectory));
    } catch (error) {
      if (error instanceof MissingCorePdpMediaSourceError) {
        if (satisfiedInputs.has(`${asset.slug}:${asset.role}`)) {
          retainedCanonicalInputs.push(asset.filename);
          continue;
        }
        if (asset.optionalSource) {
          missingInputs.push(asset.filename);
          continue;
        }
      }
      throw error;
    }
  }
  return { assets, missingInputs, retainedCanonicalInputs };
}

async function readProducts(
  supabase: SupabaseClient,
  configuredAssets: readonly CorePdpMediaAsset[],
): Promise<Map<string, ProductRow>> {
  const slugs = [...new Set(configuredAssets.map((asset) => asset.slug))];
  const { data, error } = await supabase
    .from("products")
    .select("id, slug, display_name, routine_group")
    .in("slug", slugs);

  if (error) {
    throw new Error(
      `[core-pdp-media-sync] Failed to read products: ${error.message}`,
    );
  }

  const products = new Map<string, ProductRow>();
  for (const row of (data ?? []) as ProductRow[]) products.set(row.slug, row);
  for (const slug of slugs) {
    if (!products.has(slug)) {
      throw new Error(
        `[core-pdp-media-sync] Product not found for slug "${slug}".`,
      );
    }
  }
  for (const asset of configuredAssets) {
    if (
      (asset.role === "core_routine_editorial" || asset.role === "gallery") &&
      products.get(asset.slug)?.routine_group !== "core"
    ) {
      throw new Error(
        `[core-pdp-media-sync] ${asset.slug} is not eligible for Core ${asset.role} media.`,
      );
    }
  }
  return products;
}

async function readMediaRows(
  supabase: SupabaseClient,
  productIds: string[],
): Promise<MediaRow[]> {
  const { data, error } = await supabase
    .from("product_media")
    .select(
      "id, product_id, media_type, url, alt, width, height, role, sort_order, palette_id, placeholder_palette, original_source_url, source_filename, updated_at",
    )
    .in("product_id", productIds)
    .is("archived_at", null)
    .order("product_id", { ascending: true })
    .order("sort_order", { ascending: true });

  if (error) {
    throw new Error(
      `[core-pdp-media-sync] Failed to read media rows: ${error.message}`,
    );
  }
  return (data ?? []) as MediaRow[];
}

async function readStorageListing(
  supabase: SupabaseClient,
  slugs: string[],
): Promise<StorageObjectRow[]> {
  const rows: StorageObjectRow[] = [];

  async function listPrefix(prefix: string): Promise<void> {
    const { data, error } = await supabase.storage.from(BUCKET).list(prefix, {
      limit: 1000,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) {
      throw new Error(
        `[core-pdp-media-sync] Failed to list ${prefix}: ${error.message}`,
      );
    }

    for (const item of data ?? []) {
      const name = `${prefix}/${item.name}`;
      if (!item.id) {
        await listPrefix(name);
        continue;
      }
      rows.push({
        bucket_id: BUCKET,
        name,
        metadata: (item.metadata as Record<string, unknown> | null) ?? null,
        created_at: item.created_at ?? null,
        updated_at: item.updated_at ?? null,
      });
    }
  }

  for (const slug of slugs) await listPrefix(`products/${slug}`);
  return rows;
}

async function storageObjectExists(
  supabase: SupabaseClient,
  path: string,
): Promise<boolean> {
  const { data, error } = await supabase.storage.from(BUCKET).list(dirname(path), {
    limit: 100,
    search: basename(path),
  });
  if (error) {
    throw new Error(
      `[core-pdp-media-sync] Failed to inspect ${path}: ${error.message}`,
    );
  }
  return (data ?? []).some((item) => item.name === basename(path));
}

async function verifyPublicAsset(asset: InspectedAsset): Promise<void> {
  const response = await fetch(asset.publicUrl, { method: "GET" });
  if (!response.ok) {
    throw new Error(
      `[core-pdp-media-sync] ${asset.publicUrl} returned ${response.status}.`,
    );
  }

  const contentType = response.headers.get("content-type")?.split(";")[0];
  if (contentType && contentType !== asset.contentType) {
    throw new Error(
      `[core-pdp-media-sync] ${asset.publicUrl} served ${contentType}; expected ${asset.contentType}.`,
    );
  }

  const remoteBytes = Buffer.from(await response.arrayBuffer());
  if (sha256(remoteBytes) !== asset.sha256) {
    throw new Error(
      `[core-pdp-media-sync] Checksum mismatch for ${asset.storagePath}.`,
    );
  }
}

export type GalleryPlanMediaRow = Pick<
  MediaRow,
  | "id"
  | "product_id"
  | "media_type"
  | "url"
  | "width"
  | "height"
  | "role"
  | "sort_order"
  | "palette_id"
  | "placeholder_palette"
  | "original_source_url"
  | "source_filename"
>;

function isPaletteGalleryPlaceholder(row: GalleryPlanMediaRow): boolean {
  return (
    row.role === "gallery" &&
    row.media_type === "image" &&
    row.url === null &&
    row.width === null &&
    row.height === null &&
    Boolean(row.palette_id) &&
    Object.keys(row.placeholder_palette ?? {}).length > 0 &&
    row.original_source_url === null &&
    row.source_filename === null
  );
}

export function galleryPlaceholderArchiveIds(
  existingRows: readonly GalleryPlanMediaRow[],
  productId: string,
  sortOrder: number,
  publicUrl: string,
): string[] {
  const productRows = existingRows.filter(
    (row) => row.product_id === productId,
  );
  const duplicateAsset = productRows.find(
    (row) =>
      row.url === publicUrl &&
      !(row.role === "gallery" && row.sort_order === sortOrder),
  );
  if (duplicateAsset) {
    throw new Error(
      `[core-pdp-media-sync] Gallery asset already belongs to ${duplicateAsset.role}:${duplicateAsset.sort_order} (${productId}).`,
    );
  }

  const galleryRows = productRows.filter((row) => row.role === "gallery");
  const target = galleryRows.find((row) => row.sort_order === sortOrder);
  if (
    target &&
    target.url !== publicUrl &&
    !isPaletteGalleryPlaceholder(target)
  ) {
    throw new Error(
      `[core-pdp-media-sync] Refusing to replace non-placeholder gallery media at order ${sortOrder} (${productId}).`,
    );
  }

  const obsoleteRows = galleryRows.filter((row) => row.id !== target?.id);
  const conflicting = obsoleteRows.find(
    (row) => !isPaletteGalleryPlaceholder(row),
  );
  if (conflicting) {
    throw new Error(
      `[core-pdp-media-sync] ${productId} has intentional gallery media at order ${conflicting.sort_order}; reconcile before sync.`,
    );
  }
  return obsoleteRows.map((row) => row.id);
}

function plannedRowsForAssets(
  assets: InspectedAsset[],
  products: Map<string, ProductRow>,
  existingRows: MediaRow[],
): PlannedRow[] {
  return assets.map((asset) => {
    const product = products.get(asset.slug);
    if (!product) {
      throw new Error(`[core-pdp-media-sync] Missing product ${asset.slug}.`);
    }

    const existing = existingRows.filter(
      (row) => row.product_id === product.id && row.role === asset.role,
    );
    if (asset.role !== "gallery" && existing.length > 1) {
      throw new Error(
        `[core-pdp-media-sync] ${asset.slug} has ${existing.length} ${asset.role} rows; reconcile duplicates first.`,
      );
    }

    return {
      product_id: product.id,
      media_type: asset.mediaType,
      url: asset.publicUrl,
      alt: asset.alt,
      width: asset.width,
      height: asset.height,
      role: asset.role,
      sort_order:
        asset.role === "gallery"
          ? asset.sortOrder
          : asset.role === "core_routine_editorial"
          ? 1
          : existing[0]?.sort_order ?? asset.sortOrder,
      palette_id: null,
      placeholder_palette: {},
      original_source_url: null,
      source_filename: asset.filename,
    };
  });
}

async function writeBackup(
  mediaRows: MediaRow[],
  storageObjects: StorageObjectRow[],
): Promise<string> {
  await mkdir(BACKUP_DIR, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = `${BACKUP_DIR}/core-pdp-media-sync-backup-${timestamp}.json`;
  await writeFile(
    backupPath,
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        projectRef: PROJECT_REF,
        productMedia: mediaRows,
        storageObjects,
      },
      null,
      2,
    ),
  );
  return backupPath;
}

async function uploadAsset(
  supabase: SupabaseClient,
  asset: InspectedAsset,
): Promise<"uploaded" | "already-exists"> {
  const exists = await storageObjectExists(supabase, asset.storagePath);
  if (!exists) {
    const { error } = await supabase.storage.from(BUCKET).upload(
      asset.storagePath,
      asset.bytes,
      {
        cacheControl: CACHE_CONTROL,
        contentType: asset.contentType,
        upsert: false,
      },
    );
    if (error && !/already exists/i.test(error.message)) {
      throw new Error(
        `[core-pdp-media-sync] Failed to upload ${asset.storagePath}: ${error.message}`,
      );
    }
  }

  if (!(await storageObjectExists(supabase, asset.storagePath))) {
    throw new Error(
      `[core-pdp-media-sync] Upload verification failed for ${asset.storagePath}.`,
    );
  }
  await verifyPublicAsset(asset);
  return exists ? "already-exists" : "uploaded";
}

function verifyRows(
  rows: MediaRow[],
  plannedRows: PlannedRow[],
): number {
  for (const planned of plannedRows) {
    if (
      planned.role === "gallery" &&
      rows.filter(
        (row) =>
          row.product_id === planned.product_id && row.role === "gallery",
      ).length !== 1
    ) {
      throw new Error(
        `[core-pdp-media-sync] Expected exactly one active gallery row (${planned.product_id}).`,
      );
    }
    const matches = rows.filter(
      (row) =>
        row.product_id === planned.product_id &&
        row.role === planned.role &&
        row.sort_order === planned.sort_order,
    );
    if (matches.length !== 1) {
      throw new Error(
        `[core-pdp-media-sync] Expected one ${planned.role} row after sync; found ${matches.length}.`,
      );
    }
    const [row] = matches;
    if (!rowMatchesPlan(row, planned)) {
      throw new Error(
        `[core-pdp-media-sync] Verification mismatch for ${planned.role} (${planned.product_id}).`,
      );
    }
  }
  return plannedRows.length;
}

function rowMatchesPlan(row: MediaRow, planned: PlannedRow): boolean {
  return (
    row.product_id === planned.product_id &&
    row.media_type === planned.media_type &&
    row.url === planned.url &&
    row.alt === planned.alt &&
    row.width === planned.width &&
    row.height === planned.height &&
    row.role === planned.role &&
    row.sort_order === planned.sort_order &&
    row.palette_id === planned.palette_id &&
    Object.keys(row.placeholder_palette ?? {}).length === 0 &&
    row.original_source_url === planned.original_source_url &&
    row.source_filename === planned.source_filename
  );
}

async function upsertChangedMediaRows(
  supabase: SupabaseClient,
  plannedRows: PlannedRow[],
  existingRows: MediaRow[],
): Promise<number> {
  for (const planned of plannedRows) {
    const existing = existingRows.find(
      (row) =>
        row.product_id === planned.product_id &&
        row.role === planned.role &&
        row.sort_order === planned.sort_order,
    );
    if (existing) {
      const { data, error } = await supabase
        .from("product_media")
        .update(planned)
        .eq("id", existing.id)
        .is("archived_at", null)
        .select("id")
        .maybeSingle();
      if (error || !data) {
        throw new Error(
          `[core-pdp-media-sync] Failed to update ${planned.role} (${planned.product_id}): ${
            error?.message ?? "active row not found"
          }`,
        );
      }
      continue;
    }

    const { error } = await supabase.from("product_media").insert(planned);
    if (error) {
      throw new Error(
        `[core-pdp-media-sync] Failed to insert ${planned.role} (${planned.product_id}): ${error.message}`,
      );
    }
  }
  return plannedRows.length;
}

async function archiveGalleryPlaceholders(
  supabase: SupabaseClient,
  ids: string[],
): Promise<number> {
  if (ids.length === 0) return 0;
  const { data, error } = await supabase
    .from("product_media")
    .update({ archived_at: new Date().toISOString() })
    .in("id", ids)
    .is("archived_at", null)
    .select("id");
  if (error || data?.length !== ids.length) {
    throw new Error(
      `[core-pdp-media-sync] Failed to archive ${ids.length} obsolete gallery placeholders: ${
        error?.message ?? `updated ${data?.length ?? 0}`
      }`,
    );
  }
  return data.length;
}

export async function runCorePdpMediaSync({
  apply = false,
  assetDirectory = DEFAULT_ASSET_DIR,
  roles,
}: {
  apply?: boolean;
  assetDirectory?: string;
  roles?: readonly CorePdpMediaRole[];
} = {}): Promise<CorePdpMediaSyncReport> {
  verifyProjectRef();
  const supabase = createSupabaseAdminClient();
  const configuredAssets = roles?.length
    ? CORE_PDP_MEDIA_ASSETS.filter((asset) => roles.includes(asset.role))
    : CORE_PDP_MEDIA_ASSETS;
  if (configuredAssets.length === 0) {
    throw new Error("[core-pdp-media-sync] No media assets match --roles.");
  }
  const products = await readProducts(supabase, configuredAssets);
  const productIds = [...products.values()].map((product) => product.id);
  const beforeRows = await readMediaRows(supabase, productIds);
  const slugsByProductId = new Map(
    [...products.values()].map((product) => [product.id, product.slug]),
  );
  const satisfiedInputs = new Set(
    beforeRows
      .filter((row) => Boolean(row.url))
      .map(
        (row) => `${slugsByProductId.get(row.product_id) ?? ""}:${row.role}`,
      ),
  );
  const { assets, missingInputs, retainedCanonicalInputs } =
    await inspectConfiguredCorePdpAssets(
      assetDirectory,
      configuredAssets,
      satisfiedInputs,
    );
  const plannedRows = plannedRowsForAssets(
    assets,
    products,
    beforeRows,
  );
  const galleryPlaceholderIds = [
    ...new Set(
      assets
        .filter((asset) => asset.role === "gallery")
        .flatMap((asset) => {
          const product = products.get(asset.slug);
          if (!product) {
            throw new Error(
              `[core-pdp-media-sync] Missing product ${asset.slug}.`,
            );
          }
          return galleryPlaceholderArchiveIds(
            beforeRows,
            product.id,
            asset.sortOrder,
            asset.publicUrl,
          );
        }),
    ),
  ];
  const slugs = [...new Set(configuredAssets.map((asset) => asset.slug))];
  const storageListing = await readStorageListing(supabase, slugs);
  const storageNames = new Set(storageListing.map((object) => object.name));
  const assetsToUpload = assets.filter(
    (asset) => !storageNames.has(asset.storagePath),
  );
  const rowsToSubmit = plannedRows.filter((planned) => {
    const existing = beforeRows.find(
      (row) =>
        row.product_id === planned.product_id &&
        row.role === planned.role &&
        row.sort_order === planned.sort_order,
    );
    return !existing || !rowMatchesPlan(existing, planned);
  });
  const report: CorePdpMediaSyncReport = {
    ok: true,
    dryRun: !apply,
    projectRef: PROJECT_REF,
    bucket: BUCKET,
    assetDirectory,
    backupPath: null,
    assets: assets.map((asset) => ({
      slug: asset.slug,
      role: asset.role,
      filename: asset.filename,
      sha256: asset.sha256,
      bytes: asset.bytes.length,
      width: asset.width,
      height: asset.height,
      durationSeconds: asset.durationSeconds,
      storagePath: asset.storagePath,
      publicUrl: asset.publicUrl,
    })),
    missingInputs,
    retainedCanonicalInputs,
    objectsUploaded: 0,
    objectsPlanned: assetsToUpload.length,
    objectsVerified: 0,
    rowsSubmitted: 0,
    rowsPlanned: rowsToSubmit.length,
    rowsUnchanged: plannedRows.length - rowsToSubmit.length,
    rowsVerified: 0,
    galleryPlaceholdersPlanned: galleryPlaceholderIds.length,
    galleryPlaceholdersArchived: 0,
  };

  if (!apply) return report;

  if (
    assetsToUpload.length > 0 ||
    rowsToSubmit.length > 0 ||
    galleryPlaceholderIds.length > 0
  ) {
    report.backupPath = await writeBackup(beforeRows, storageListing);
  }

  for (const asset of assets) {
    if (assetsToUpload.includes(asset)) {
      const result = await uploadAsset(supabase, asset);
      if (result === "uploaded") report.objectsUploaded += 1;
    } else {
      await verifyPublicAsset(asset);
    }
    report.objectsVerified += 1;
  }

  if (rowsToSubmit.length > 0) {
    report.rowsSubmitted = await upsertChangedMediaRows(
      supabase,
      rowsToSubmit,
      beforeRows,
    );
  }
  report.galleryPlaceholdersArchived = await archiveGalleryPlaceholders(
    supabase,
    galleryPlaceholderIds,
  );

  const afterRows = await readMediaRows(supabase, productIds);
  report.rowsVerified = verifyRows(afterRows, plannedRows);
  return report;
}

function parseArgs(argv: string[]) {
  const apply = argv.includes("--apply");
  const dryRun = argv.includes("--dry-run") || !apply;
  const assetDirIndex = argv.indexOf("--asset-dir");
  const assetDirectory =
    assetDirIndex >= 0 && argv[assetDirIndex + 1]
      ? resolve(argv[assetDirIndex + 1])
      : DEFAULT_ASSET_DIR;
  const rolesIndex = argv.indexOf("--roles");
  const roleValues =
    rolesIndex >= 0 && argv[rolesIndex + 1]
      ? argv[rolesIndex + 1].split(",").filter(Boolean)
      : [];
  const roles = roleValues.map((role) => {
    if (!(CORE_PDP_MEDIA_ROLES as readonly string[]).includes(role)) {
      throw new Error(`[core-pdp-media-sync] Unsupported media role "${role}".`);
    }
    return role as CorePdpMediaRole;
  });
  return { apply: apply && !dryRun, assetDirectory, roles };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runCorePdpMediaSync(parseArgs(process.argv.slice(2)))
    .then((report) => {
      console.log(JSON.stringify(report, null, 2));
    })
    .catch((error) => {
      console.error(
        JSON.stringify(
          {
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : "Unknown Core PDP media sync error",
          },
          null,
          2,
        ),
      );
      process.exitCode = 1;
    });
}
