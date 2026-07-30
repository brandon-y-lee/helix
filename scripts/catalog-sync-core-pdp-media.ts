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
  "routine_video",
  "routine_video_poster",
  "profile_editorial",
  "ingredients_texture",
  "core_routine_texture",
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
  width: number;
  height: number;
  sortOrder: number;
  durationSeconds: number | null;
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
] as const;

type ProductRow = {
  id: string;
  slug: string;
  display_name: string | null;
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

type InspectedAsset = CorePdpMediaAsset & {
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
  objectsUploaded: number;
  objectsPlanned: number;
  objectsVerified: number;
  rowsSubmitted: number;
  rowsPlanned: number;
  rowsUnchanged: number;
  rowsVerified: number;
};

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
  if (role === "profile_editorial") return "profile";
  if (role === "ingredients_texture") return "ingredients-texture";
  if (role === "core_routine_texture") return "core-routine-texture";
  return "routine";
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
  const absolutePath = resolve(assetDirectory, asset.filename);
  let bytes: Buffer;
  try {
    bytes = await readFile(absolutePath);
  } catch (error) {
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
      dimensions.width !== asset.width ||
      dimensions.height !== asset.height
    ) {
      throw new Error(
        `[core-pdp-media-sync] ${asset.filename} is ${dimensions.width}x${dimensions.height}; ` +
          `expected ${asset.width}x${asset.height}.`,
      );
    }
  }

  const checksum = sha256(bytes);
  const storagePath = storagePathForCorePdpAsset(asset, checksum);
  return {
    ...asset,
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

async function readProducts(
  supabase: SupabaseClient,
): Promise<Map<string, ProductRow>> {
  const slugs = [...new Set(CORE_PDP_MEDIA_ASSETS.map((asset) => asset.slug))];
  const { data, error } = await supabase
    .from("products")
    .select("id, slug, display_name")
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
    if (existing.length > 1) {
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
      sort_order: existing[0]?.sort_order ?? asset.sortOrder,
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
    if (
      row.url !== planned.url ||
      row.media_type !== planned.media_type ||
      row.width !== planned.width ||
      row.height !== planned.height ||
      row.alt !== planned.alt
    ) {
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

export async function runCorePdpMediaSync({
  apply = false,
  assetDirectory = DEFAULT_ASSET_DIR,
}: {
  apply?: boolean;
  assetDirectory?: string;
} = {}): Promise<CorePdpMediaSyncReport> {
  verifyProjectRef();
  const supabase = createSupabaseAdminClient();
  const assets = await Promise.all(
    CORE_PDP_MEDIA_ASSETS.map((asset) =>
      inspectCorePdpAsset(asset, assetDirectory),
    ),
  );
  const products = await readProducts(supabase);
  const productIds = [...products.values()].map((product) => product.id);
  const beforeRows = await readMediaRows(supabase, productIds);
  const plannedRows = plannedRowsForAssets(
    assets,
    products,
    beforeRows,
  );
  const slugs = [...new Set(CORE_PDP_MEDIA_ASSETS.map((asset) => asset.slug))];
  const storageListing = await readStorageListing(supabase, slugs);
  const storageNames = new Set(storageListing.map((object) => object.name));
  const assetsToUpload = assets.filter(
    (asset) => !storageNames.has(asset.storagePath),
  );
  const rowsToSubmit = plannedRows.filter((planned) => {
    const existing = beforeRows.find(
      (row) =>
        row.product_id === planned.product_id && row.role === planned.role,
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
    objectsUploaded: 0,
    objectsPlanned: assetsToUpload.length,
    objectsVerified: 0,
    rowsSubmitted: 0,
    rowsPlanned: rowsToSubmit.length,
    rowsUnchanged: plannedRows.length - rowsToSubmit.length,
    rowsVerified: 0,
  };

  if (!apply) return report;

  if (assetsToUpload.length > 0 || rowsToSubmit.length > 0) {
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
    const { error } = await supabase.from("product_media").upsert(rowsToSubmit, {
      onConflict: "product_id,role,sort_order",
    });
    if (error) {
      throw new Error(
        `[core-pdp-media-sync] Failed to upsert media rows: ${error.message}`,
      );
    }
    report.rowsSubmitted = rowsToSubmit.length;
  }

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
  return { apply: apply && !dryRun, assetDirectory };
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
