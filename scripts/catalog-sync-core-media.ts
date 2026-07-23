import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { config } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import WebSocket from "ws";

config({ path: resolve(process.cwd(), ".env.local"), quiet: true });

const PROJECT_REF = "erasogmsqpgiirovubjh";
const BUCKET = "mei-pelle-catalog";
const CACHE_CONTROL = "31536000";
const BACKUP_DIR = "/private/tmp/mei-pelle-catalog-backups";

export const CORE_MEDIA_ROLES = [
  "card_default",
  "detail",
  "cart",
  "search",
] as const;

const ROLE_SORT_FALLBACK: Record<(typeof CORE_MEDIA_ROLES)[number], number> = {
  card_default: 0,
  detail: 4,
  cart: 5,
  search: 6,
};

export type CoreMediaAsset = {
  slug: string;
  localPath: string;
  alt: string;
};

export const CORE_MEDIA_ASSETS: readonly CoreMediaAsset[] = [
  {
    slug: "cleanse-01-calming-gel-cleanser",
    localPath: "public/media/home/cleanse-core-card.webp",
    alt: "CLEANSE calming gel cleanser",
  },
  {
    slug: "treat-03-pdrn-5-ampoule",
    localPath: "public/media/home/treat-core-card.webp",
    alt: "TREAT PDRN ampoule",
  },
  {
    slug: "seal-05-green-collagen-cream",
    localPath: "public/media/home/seal-core-card.webp",
    alt: "SEAL green collagen cream",
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
  media_kind: string;
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

type InspectedAsset = CoreMediaAsset & {
  absolutePath: string;
  filename: string;
  sha256: string;
  width: number;
  height: number;
  storagePath: string;
  publicUrl: string;
  bytes: Buffer;
};

type PlannedRow = {
  product_id: string;
  media_type: "image";
  media_kind: "image";
  url: string;
  alt: string;
  width: number;
  height: number;
  role: (typeof CORE_MEDIA_ROLES)[number];
  sort_order: number;
  palette_id: null;
  placeholder_palette: Record<string, never>;
  original_source_url: null;
  source_filename: string;
};

export type CoreMediaSyncReport = {
  ok: boolean;
  dryRun: boolean;
  projectRef: string;
  bucket: string;
  backupPath: string | null;
  assets: Array<{
    slug: string;
    localPath: string;
    sha256: string;
    width: number;
    height: number;
    storagePath: string;
    publicUrl: string;
  }>;
  plannedRows: Array<{
    slug: string;
    role: string;
    sortOrder: number;
    before: ReturnType<typeof summarizeMediaRow> | null;
    after: ReturnType<typeof summarizePlannedRow>;
  }>;
  objectsUploaded: number;
  objectsVerified: number;
  rowsUpserted: number;
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
      `[core-media-sync] Refusing to run against Supabase project "${hostRef}". ` +
        `Expected "${PROJECT_REF}".`,
    );
  }
}

export function readWebpDimensions(buffer: Buffer): {
  width: number;
  height: number;
} {
  if (
    buffer.toString("ascii", 0, 4) !== "RIFF" ||
    buffer.toString("ascii", 8, 12) !== "WEBP"
  ) {
    throw new Error("Not a RIFF WEBP file.");
  }

  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const chunk = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const data = offset + 8;

    if (chunk === "VP8X") {
      if (size < 10) throw new Error("Invalid VP8X WEBP chunk.");
      const width = 1 + buffer.readUIntLE(data + 4, 3);
      const height = 1 + buffer.readUIntLE(data + 7, 3);
      return { width, height };
    }

    if (chunk === "VP8 ") {
      if (size < 10) throw new Error("Invalid VP8 WEBP chunk.");
      const width = buffer.readUInt16LE(data + 6) & 0x3fff;
      const height = buffer.readUInt16LE(data + 8) & 0x3fff;
      return { width, height };
    }

    if (chunk === "VP8L") {
      if (size < 5 || buffer[data] !== 0x2f) {
        throw new Error("Invalid VP8L WEBP chunk.");
      }
      const b1 = buffer[data + 1];
      const b2 = buffer[data + 2];
      const b3 = buffer[data + 3];
      const b4 = buffer[data + 4];
      const width = 1 + (((b2 & 0x3f) << 8) | b1);
      const height = 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6));
      return { width, height };
    }

    offset = data + size + (size % 2);
  }

  throw new Error("No WEBP dimension chunk found.");
}

function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export function storagePathFor(slug: string, checksum: string): string {
  return `products/${slug}/primary/${checksum}.webp`;
}

function publicUrlFor(projectUrl: string, storagePath: string): string {
  const origin = new URL(projectUrl).origin;
  return `${origin}/storage/v1/object/public/${BUCKET}/${storagePath}`;
}

export async function inspectAsset(
  asset: CoreMediaAsset,
): Promise<InspectedAsset> {
  const absolutePath = resolve(process.cwd(), asset.localPath);
  const bytes = await readFile(absolutePath);
  const dimensions = readWebpDimensions(bytes);
  const checksum = sha256(bytes);
  const storagePath = storagePathFor(asset.slug, checksum);
  return {
    ...asset,
    absolutePath,
    filename: basename(asset.localPath),
    sha256: checksum,
    width: dimensions.width,
    height: dimensions.height,
    storagePath,
    publicUrl: publicUrlFor(requiredEnv("NEXT_PUBLIC_SUPABASE_URL"), storagePath),
    bytes,
  };
}

async function readProducts(
  supabase: SupabaseClient,
): Promise<Map<string, ProductRow>> {
  const { data, error } = await supabase
    .from("products")
    .select("id, slug, display_name")
    .in(
      "slug",
      CORE_MEDIA_ASSETS.map((asset) => asset.slug),
    );

  if (error) throw new Error(`[core-media-sync] Failed to read products: ${error.message}`);

  const rows = new Map<string, ProductRow>();
  for (const row of (data ?? []) as ProductRow[]) rows.set(row.slug, row);

  for (const asset of CORE_MEDIA_ASSETS) {
    if (!rows.has(asset.slug)) {
      throw new Error(`[core-media-sync] Product not found for slug "${asset.slug}".`);
    }
  }

  return rows;
}

async function readMediaRows(
  supabase: SupabaseClient,
  productIds: string[],
): Promise<MediaRow[]> {
  const { data, error } = await supabase
    .from("product_media")
    .select(
      "id, product_id, media_type, media_kind, url, alt, width, height, role, sort_order, palette_id, placeholder_palette, original_source_url, source_filename, updated_at",
    )
    .in("product_id", productIds)
    .order("product_id", { ascending: true })
    .order("sort_order", { ascending: true });

  if (error) throw new Error(`[core-media-sync] Failed to read media rows: ${error.message}`);
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
        `[core-media-sync] Failed to read Storage listing for ${prefix}: ${error.message}`,
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

  for (const slug of slugs) {
    await listPrefix(`products/${slug}`);
  }

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
    throw new Error(`[core-media-sync] Failed to inspect Storage path ${path}: ${error.message}`);
  }

  return (data ?? []).some((item) => item.name === basename(path));
}

async function verifyPublicUrl(url: string): Promise<void> {
  let response = await fetch(url, { method: "HEAD" });
  if (!response.ok) response = await fetch(url, { method: "GET" });
  if (!response.ok) {
    throw new Error(
      `[core-media-sync] Public URL failed verification: ${url} returned ${response.status}.`,
    );
  }
}

function plannedRowsForAsset(
  product: ProductRow,
  asset: InspectedAsset,
  existingRows: MediaRow[],
): PlannedRow[] {
  return CORE_MEDIA_ROLES.map((role) => {
    const existing = existingRows.find(
      (row) => row.product_id === product.id && row.role === role,
    );
    return {
      product_id: product.id,
      media_type: "image",
      media_kind: "image",
      url: asset.publicUrl,
      alt: asset.alt,
      width: asset.width,
      height: asset.height,
      role,
      sort_order: existing?.sort_order ?? ROLE_SORT_FALLBACK[role],
      palette_id: null,
      placeholder_palette: {},
      original_source_url: null,
      source_filename: asset.filename,
    };
  });
}

function summarizeMediaRow(row: MediaRow) {
  return {
    id: row.id,
    role: row.role,
    sortOrder: row.sort_order,
    mediaKind: row.media_kind,
    url: row.url,
    alt: row.alt,
    width: row.width,
    height: row.height,
    paletteId: row.palette_id,
    sourceFilename: row.source_filename,
  };
}

function summarizePlannedRow(row: PlannedRow) {
  return {
    role: row.role,
    sortOrder: row.sort_order,
    mediaKind: row.media_kind,
    url: row.url,
    alt: row.alt,
    width: row.width,
    height: row.height,
    paletteId: row.palette_id,
    sourceFilename: row.source_filename,
  };
}

async function writeBackup(
  mediaRows: MediaRow[],
  storageObjects: StorageObjectRow[],
): Promise<string> {
  await mkdir(BACKUP_DIR, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = `${BACKUP_DIR}/core-media-sync-backup-${timestamp}.json`;
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

async function uploadAndVerifyAsset(
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
        contentType: "image/webp",
        upsert: false,
      },
    );

    if (error && !/already exists/i.test(error.message)) {
      throw new Error(
        `[core-media-sync] Failed to upload ${asset.storagePath}: ${error.message}`,
      );
    }
  }

  const verifiedExists = await storageObjectExists(supabase, asset.storagePath);
  if (!verifiedExists) {
    throw new Error(`[core-media-sync] Upload verification failed for ${asset.storagePath}.`);
  }
  await verifyPublicUrl(asset.publicUrl);
  return exists ? "already-exists" : "uploaded";
}

export async function runCoreMediaSync({
  apply = false,
}: {
  apply?: boolean;
} = {}): Promise<CoreMediaSyncReport> {
  verifyProjectRef();
  const supabase = createSupabaseAdminClient();
  const assets = await Promise.all(CORE_MEDIA_ASSETS.map(inspectAsset));
  const products = await readProducts(supabase);
  const productIds = [...products.values()].map((product) => product.id);
  const beforeRows = await readMediaRows(supabase, productIds);
  const storageListing = await readStorageListing(
    supabase,
    CORE_MEDIA_ASSETS.map((asset) => asset.slug),
  );
  const plannedRows = assets.flatMap((asset) =>
    plannedRowsForAsset(products.get(asset.slug)!, asset, beforeRows),
  );

  const report: CoreMediaSyncReport = {
    ok: true,
    dryRun: !apply,
    projectRef: PROJECT_REF,
    bucket: BUCKET,
    backupPath: null,
    assets: assets.map((asset) => ({
      slug: asset.slug,
      localPath: asset.localPath,
      sha256: asset.sha256,
      width: asset.width,
      height: asset.height,
      storagePath: asset.storagePath,
      publicUrl: asset.publicUrl,
    })),
    plannedRows: plannedRows.map((row) => {
      const slug = [...products.values()].find((product) => product.id === row.product_id)?.slug;
      const before =
        beforeRows.find(
          (candidate) =>
            candidate.product_id === row.product_id &&
            candidate.role === row.role &&
            candidate.sort_order === row.sort_order,
        ) ?? null;
      return {
        slug: slug ?? row.product_id,
        role: row.role,
        sortOrder: row.sort_order,
        before: before ? summarizeMediaRow(before) : null,
        after: summarizePlannedRow(row),
      };
    }),
    objectsUploaded: 0,
    objectsVerified: 0,
    rowsUpserted: 0,
  };

  if (!apply) return report;

  report.backupPath = await writeBackup(beforeRows, storageListing);

  for (const asset of assets) {
    const result = await uploadAndVerifyAsset(supabase, asset);
    if (result === "uploaded") report.objectsUploaded += 1;
    report.objectsVerified += 1;
  }

  const { error } = await supabase.from("product_media").upsert(plannedRows, {
    onConflict: "product_id,role,sort_order",
  });

  if (error) throw new Error(`[core-media-sync] Failed to upsert media rows: ${error.message}`);
  report.rowsUpserted = plannedRows.length;
  return report;
}

function parseArgs(argv: string[]) {
  const apply = argv.includes("--apply");
  const dryRun = argv.includes("--dry-run") || !apply;
  return { apply: apply && !dryRun };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runCoreMediaSync(parseArgs(process.argv.slice(2)))
    .then((report) => {
      console.log(JSON.stringify(report, null, 2));
    })
    .catch((error) => {
      console.error(
        JSON.stringify(
          {
            ok: false,
            error: error instanceof Error ? error.message : "Unknown core media sync error",
          },
          null,
          2,
        ),
      );
      process.exitCode = 1;
    });
}
