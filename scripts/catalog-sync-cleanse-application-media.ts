import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { config } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { receiverUrl } from "./catalog-reconcile-core-pdp-media";

config({ path: resolve(process.cwd(), ".env.local"), quiet: true });

const PROJECT_REF = "erasogmsqpgiirovubjh";
const BUCKET = "mei-pelle-catalog";
const CACHE_CONTROL = "31536000";
const BACKUP_DIR = "/private/tmp/mei-pelle-catalog-backups";
const DEFAULT_ASSET_DIR = "/private/tmp/mei-pelle-application-media";
const WEBHOOK_HEADER = "x-webhook-secret";

export const CLEANSE_SLUG = "cleanse-01-calming-gel-cleanser";
export const APPLICATION_MEDIA_ROLE = "pdp_application";

export type ApplicationMediaAsset = {
  filename: string;
  sortOrder: 1 | 2 | 3;
  alt: string;
  width: number;
  height: number;
};

export const APPLICATION_MEDIA_ASSETS: readonly ApplicationMediaAsset[] = [
  {
    filename: "cleanse-application-01.png",
    sortOrder: 1,
    alt: "CLEANSE application visual 1",
    width: 1122,
    height: 1402,
  },
  {
    filename: "cleanse-application-02.png",
    sortOrder: 2,
    alt: "CLEANSE application visual 2",
    width: 1122,
    height: 1402,
  },
  {
    filename: "cleanse-application-03.png",
    sortOrder: 3,
    alt: "CLEANSE application visual 3",
    width: 1200,
    height: 1310,
  },
] as const;

type ProductRow = {
  id: string;
  slug: string;
  display_name: string | null;
  routine_group: string | null;
  routine_step_number: number | null;
};

type MediaRow = {
  id: string;
  product_id: string;
  variant_id: string | null;
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

type InspectedAsset = ApplicationMediaAsset & {
  absolutePath: string;
  sha256: string;
  storagePath: string;
  publicUrl: string;
  bytes: Buffer;
};

export type PlannedApplicationRow = {
  product_id: string;
  variant_id: null;
  media_type: "image";
  url: string;
  alt: string;
  width: number;
  height: number;
  role: typeof APPLICATION_MEDIA_ROLE;
  sort_order: number;
  palette_id: null;
  placeholder_palette: Record<string, never>;
  original_source_url: null;
  source_filename: string;
};

type StorageObject = {
  name: string;
  metadata: Record<string, unknown> | null;
  created_at: string | null;
  updated_at: string | null;
};

export type CleanseApplicationMediaSyncReport = {
  ok: boolean;
  dryRun: boolean;
  projectRef: string;
  bucket: string;
  product: ProductRow;
  assetDirectory: string;
  backupPath: string | null;
  assets: Array<{
    filename: string;
    sortOrder: number;
    sha256: string;
    bytes: number;
    width: number;
    height: number;
    storagePath: string;
    publicUrl: string;
  }>;
  objectsPlanned: number;
  objectsUploaded: number;
  objectsVerified: number;
  rowsPlanned: number;
  rowsSubmitted: number;
  rowsUnchanged: number;
  rowsVerified: number;
  cacheRevalidated: boolean;
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
      auth: { autoRefreshToken: false, persistSession: false },
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
      `[cleanse-application-media-sync] Refusing Supabase project "${hostRef}"; expected "${PROJECT_REF}".`,
    );
  }
}

function checksum(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function readPngDimensions(bytes: Buffer): {
  width: number;
  height: number;
} {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (
    bytes.length < 24 ||
    !bytes.subarray(0, signature.length).equals(signature) ||
    bytes.toString("ascii", 12, 16) !== "IHDR"
  ) {
    throw new Error("Source is not a valid PNG with an IHDR header.");
  }
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

export function storagePathForApplicationAsset(sha256: string): string {
  return `products/${CLEANSE_SLUG}/application/${sha256}.png`;
}

function publicUrlFor(storagePath: string): string {
  const origin = new URL(requiredEnv("NEXT_PUBLIC_SUPABASE_URL")).origin;
  return `${origin}/storage/v1/object/public/${BUCKET}/${storagePath}`;
}

export async function inspectApplicationAsset(
  asset: ApplicationMediaAsset,
  assetDirectory = DEFAULT_ASSET_DIR,
): Promise<InspectedAsset> {
  const absolutePath = resolve(assetDirectory, asset.filename);
  let bytes: Buffer;
  try {
    bytes = await readFile(absolutePath);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown read error";
    throw new Error(
      `[cleanse-application-media-sync] Cannot read required source "${absolutePath}": ${detail}`,
    );
  }
  if (bytes.length === 0) {
    throw new Error(
      `[cleanse-application-media-sync] ${asset.filename} is empty.`,
    );
  }

  const dimensions = readPngDimensions(bytes);
  if (dimensions.width !== asset.width || dimensions.height !== asset.height) {
    throw new Error(
      `[cleanse-application-media-sync] ${asset.filename} is ${dimensions.width}x${dimensions.height}; expected ${asset.width}x${asset.height}.`,
    );
  }

  const sha256 = checksum(bytes);
  const storagePath = storagePathForApplicationAsset(sha256);
  return {
    ...asset,
    absolutePath,
    sha256,
    storagePath,
    publicUrl: publicUrlFor(storagePath),
    bytes,
  };
}

async function readCanonicalProduct(
  supabase: SupabaseClient,
): Promise<ProductRow> {
  const { data, error } = await supabase
    .from("products")
    .select("id, slug, display_name, routine_group, routine_step_number")
    .eq("slug", CLEANSE_SLUG)
    .limit(2);
  if (error) {
    throw new Error(
      `[cleanse-application-media-sync] Failed to resolve CLEANSE: ${error.message}`,
    );
  }

  const products = (data ?? []) as ProductRow[];
  if (products.length !== 1) {
    throw new Error(
      `[cleanse-application-media-sync] Expected one product for "${CLEANSE_SLUG}"; found ${products.length}.`,
    );
  }
  const product = products[0];
  if (
    product.display_name?.toUpperCase() !== "CLEANSE" ||
    product.routine_group !== "core" ||
    product.routine_step_number !== 1
  ) {
    throw new Error(
      `[cleanse-application-media-sync] "${CLEANSE_SLUG}" is not the canonical Core CLEANSE product.`,
    );
  }
  return product;
}

async function readApplicationRows(
  supabase: SupabaseClient,
  productId: string,
): Promise<MediaRow[]> {
  const { data, error } = await supabase
    .from("product_media")
    .select(
      "id, product_id, variant_id, media_type, url, alt, width, height, role, sort_order, palette_id, placeholder_palette, original_source_url, source_filename, updated_at",
    )
    .eq("product_id", productId)
    .eq("role", APPLICATION_MEDIA_ROLE)
    .order("sort_order", { ascending: true });
  if (error) {
    throw new Error(
      `[cleanse-application-media-sync] Failed to read application rows: ${error.message}`,
    );
  }
  return (data ?? []) as MediaRow[];
}

function assertExistingRowsAreSafe(rows: readonly MediaRow[]) {
  const validOrders = new Set(
    APPLICATION_MEDIA_ASSETS.map((asset) => asset.sortOrder),
  );
  const seen = new Set<number>();
  for (const row of rows) {
    if (!validOrders.has(row.sort_order as 1 | 2 | 3)) {
      throw new Error(
        `[cleanse-application-media-sync] Unexpected CLEANSE application sort order ${row.sort_order}; reconcile it explicitly before syncing.`,
      );
    }
    if (row.variant_id !== null) {
      throw new Error(
        `[cleanse-application-media-sync] Application order ${row.sort_order} is variant-specific; reconcile it explicitly before syncing.`,
      );
    }
    if (seen.has(row.sort_order)) {
      throw new Error(
        `[cleanse-application-media-sync] Duplicate CLEANSE application order ${row.sort_order}; reconcile it explicitly before syncing.`,
      );
    }
    seen.add(row.sort_order);
  }
}

export function planApplicationRows(
  productId: string,
  assets: readonly InspectedAsset[],
): PlannedApplicationRow[] {
  return assets
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((asset) => ({
      product_id: productId,
      variant_id: null,
      media_type: "image",
      url: asset.publicUrl,
      alt: asset.alt,
      width: asset.width,
      height: asset.height,
      role: APPLICATION_MEDIA_ROLE,
      sort_order: asset.sortOrder,
      palette_id: null,
      placeholder_palette: {},
      original_source_url: null,
      source_filename: asset.filename,
    }));
}

function rowMatchesPlan(
  row: MediaRow,
  planned: PlannedApplicationRow,
): boolean {
  return (
    row.product_id === planned.product_id &&
    row.variant_id === null &&
    row.media_type === "image" &&
    row.url === planned.url &&
    row.alt === planned.alt &&
    row.width === planned.width &&
    row.height === planned.height &&
    row.role === planned.role &&
    row.sort_order === planned.sort_order &&
    row.palette_id === null &&
    Object.keys(row.placeholder_palette ?? {}).length === 0 &&
    row.original_source_url === null &&
    row.source_filename === planned.source_filename
  );
}

async function listApplicationObjects(
  supabase: SupabaseClient,
): Promise<StorageObject[]> {
  const prefix = `products/${CLEANSE_SLUG}/application`;
  const { data, error } = await supabase.storage.from(BUCKET).list(prefix, {
    limit: 1000,
    sortBy: { column: "name", order: "asc" },
  });
  if (error) {
    throw new Error(
      `[cleanse-application-media-sync] Failed to list ${prefix}: ${error.message}`,
    );
  }
  return (data ?? [])
    .filter((item) => Boolean(item.id))
    .map((item) => ({
      name: `${prefix}/${item.name}`,
      metadata: (item.metadata as Record<string, unknown> | null) ?? null,
      created_at: item.created_at ?? null,
      updated_at: item.updated_at ?? null,
    }));
}

async function objectExists(
  supabase: SupabaseClient,
  storagePath: string,
): Promise<boolean> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .list(dirname(storagePath), {
      limit: 100,
      search: basename(storagePath),
    });
  if (error) {
    throw new Error(
      `[cleanse-application-media-sync] Failed to inspect ${storagePath}: ${error.message}`,
    );
  }
  return (data ?? []).some((item) => item.name === basename(storagePath));
}

async function verifyPublicAsset(asset: InspectedAsset): Promise<void> {
  const response = await fetch(asset.publicUrl, {
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(
      `[cleanse-application-media-sync] ${asset.storagePath} returned ${response.status}.`,
    );
  }
  const remoteBytes = Buffer.from(await response.arrayBuffer());
  if (checksum(remoteBytes) !== asset.sha256) {
    throw new Error(
      `[cleanse-application-media-sync] Checksum mismatch for ${asset.storagePath}.`,
    );
  }
}

async function uploadAsset(
  supabase: SupabaseClient,
  asset: InspectedAsset,
): Promise<"uploaded" | "already-exists"> {
  const exists = await objectExists(supabase, asset.storagePath);
  if (!exists) {
    const { error } = await supabase.storage.from(BUCKET).upload(
      asset.storagePath,
      asset.bytes,
      {
        cacheControl: CACHE_CONTROL,
        contentType: "image/png",
        upsert: false,
      },
    );
    if (error && !/already exists/i.test(error.message)) {
      throw new Error(
        `[cleanse-application-media-sync] Failed to upload ${asset.storagePath}: ${error.message}`,
      );
    }
  }
  if (!(await objectExists(supabase, asset.storagePath))) {
    throw new Error(
      `[cleanse-application-media-sync] Upload verification failed for ${asset.storagePath}.`,
    );
  }
  await verifyPublicAsset(asset);
  return exists ? "already-exists" : "uploaded";
}

async function writeBackup(
  product: ProductRow,
  rows: MediaRow[],
  objects: StorageObject[],
): Promise<string> {
  await mkdir(BACKUP_DIR, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const path = `${BACKUP_DIR}/cleanse-application-media-sync-${timestamp}.json`;
  await writeFile(
    path,
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        projectRef: PROJECT_REF,
        product,
        productMedia: rows,
        storageObjects: objects,
      },
      null,
      2,
    ),
  );
  return path;
}

function verifyRows(
  rows: readonly MediaRow[],
  plannedRows: readonly PlannedApplicationRow[],
): number {
  if (rows.length !== plannedRows.length) {
    throw new Error(
      `[cleanse-application-media-sync] Expected exactly ${plannedRows.length} CLEANSE application rows; found ${rows.length}.`,
    );
  }
  for (const planned of plannedRows) {
    const matches = rows.filter(
      (row) => row.sort_order === planned.sort_order,
    );
    if (matches.length !== 1 || !rowMatchesPlan(matches[0], planned)) {
      throw new Error(
        `[cleanse-application-media-sync] Verification failed for application order ${planned.sort_order}.`,
      );
    }
  }
  return plannedRows.length;
}

async function revalidateProduct(
  endpoint: string,
  row: MediaRow,
): Promise<void> {
  const response = await fetch(receiverUrl(endpoint), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      [WEBHOOK_HEADER]: requiredEnv("SUPABASE_CATALOG_WEBHOOK_SECRET"),
    },
    body: JSON.stringify({
      schema: "public",
      type: "INSERT",
      table: "product_media",
      record: {
        id: row.id,
        product_id: row.product_id,
        role: row.role,
      },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(
      `[cleanse-application-media-sync] Cache revalidation returned ${response.status}: ${await response.text()}`,
    );
  }
}

export async function runCleanseApplicationMediaSync({
  apply = false,
  assetDirectory = DEFAULT_ASSET_DIR,
  revalidateEndpoint,
}: {
  apply?: boolean;
  assetDirectory?: string;
  revalidateEndpoint?: string;
} = {}): Promise<CleanseApplicationMediaSyncReport> {
  verifyProjectRef();
  const supabase = createSupabaseAdminClient();
  const assets = await Promise.all(
    APPLICATION_MEDIA_ASSETS.map((asset) =>
      inspectApplicationAsset(asset, assetDirectory),
    ),
  );
  if (new Set(assets.map((asset) => asset.sha256)).size !== assets.length) {
    throw new Error(
      "[cleanse-application-media-sync] Application source files must have unique content.",
    );
  }

  const product = await readCanonicalProduct(supabase);
  const beforeRows = await readApplicationRows(supabase, product.id);
  assertExistingRowsAreSafe(beforeRows);
  const plannedRows = planApplicationRows(product.id, assets);
  const storageObjects = await listApplicationObjects(supabase);
  const storageNames = new Set(storageObjects.map((object) => object.name));
  const assetsToUpload = assets.filter(
    (asset) => !storageNames.has(asset.storagePath),
  );
  const rowsToSubmit = plannedRows.filter((planned) => {
    const existing = beforeRows.find(
      (row) => row.sort_order === planned.sort_order,
    );
    return !existing || !rowMatchesPlan(existing, planned);
  });

  const report: CleanseApplicationMediaSyncReport = {
    ok: true,
    dryRun: !apply,
    projectRef: PROJECT_REF,
    bucket: BUCKET,
    product,
    assetDirectory,
    backupPath: null,
    assets: assets.map((asset) => ({
      filename: asset.filename,
      sortOrder: asset.sortOrder,
      sha256: asset.sha256,
      bytes: asset.bytes.length,
      width: asset.width,
      height: asset.height,
      storagePath: asset.storagePath,
      publicUrl: asset.publicUrl,
    })),
    objectsPlanned: assetsToUpload.length,
    objectsUploaded: 0,
    objectsVerified: 0,
    rowsPlanned: rowsToSubmit.length,
    rowsSubmitted: 0,
    rowsUnchanged: plannedRows.length - rowsToSubmit.length,
    rowsVerified: 0,
    cacheRevalidated: false,
  };

  if (!apply) return report;

  if (assetsToUpload.length > 0 || rowsToSubmit.length > 0) {
    report.backupPath = await writeBackup(product, beforeRows, storageObjects);
  }

  for (const asset of assets) {
    if ((await uploadAsset(supabase, asset)) === "uploaded") {
      report.objectsUploaded += 1;
    }
    report.objectsVerified += 1;
  }

  if (rowsToSubmit.length > 0) {
    const { error } = await supabase.from("product_media").upsert(rowsToSubmit, {
      onConflict: "product_id,role,sort_order",
    });
    if (error) {
      throw new Error(
        `[cleanse-application-media-sync] Failed to upsert application rows: ${error.message}`,
      );
    }
    report.rowsSubmitted = rowsToSubmit.length;
  }

  const afterRows = await readApplicationRows(supabase, product.id);
  report.rowsVerified = verifyRows(afterRows, plannedRows);
  if (revalidateEndpoint) {
    await revalidateProduct(revalidateEndpoint, afterRows[0]);
    report.cacheRevalidated = true;
  }
  return report;
}

function parseArgs(argv: string[]) {
  const apply = argv.includes("--apply");
  const dryRun = argv.includes("--dry-run") || !apply;
  const assetDirIndex = argv.indexOf("--asset-dir");
  const endpointIndex = argv.indexOf("--revalidate-endpoint");
  return {
    apply: apply && !dryRun,
    assetDirectory:
      assetDirIndex >= 0 && argv[assetDirIndex + 1]
        ? resolve(argv[assetDirIndex + 1])
        : DEFAULT_ASSET_DIR,
    revalidateEndpoint:
      endpointIndex >= 0 && argv[endpointIndex + 1]
        ? argv[endpointIndex + 1]
        : undefined,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runCleanseApplicationMediaSync(parseArgs(process.argv.slice(2)))
    .then((report) => console.log(JSON.stringify(report, null, 2)))
    .catch((error) => {
      console.error(
        JSON.stringify(
          {
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : "Unknown CLEANSE application media sync error",
          },
          null,
          2,
        ),
      );
      process.exitCode = 1;
    });
}
