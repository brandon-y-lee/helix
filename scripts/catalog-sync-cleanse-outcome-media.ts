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
const DEFAULT_ASSET_DIR = "/private/tmp/mei-pelle-outcome-media";

export const CLEANSE_SLUG = "cleanse-01-calming-gel-cleanser";
export const OUTCOME_MEDIA_ROLE = "pdp_outcome";

export type OutcomeMediaAsset = {
  filename: string;
  sortOrder: 1 | 2 | 3;
  alt: string;
  width: number;
  height: number;
};

export const OUTCOME_MEDIA_ASSETS: readonly OutcomeMediaAsset[] = [
  {
    filename: "outcome-01.webp",
    sortOrder: 1,
    alt: "CLEANSE outcome visual 1",
    width: 1201,
    height: 1310,
  },
  {
    filename: "outcome-02.webp",
    sortOrder: 2,
    alt: "CLEANSE outcome visual 2",
    width: 1254,
    height: 1254,
  },
  {
    filename: "outcome-03.webp",
    sortOrder: 3,
    alt: "CLEANSE outcome visual 3",
    width: 1122,
    height: 1402,
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

type InspectedAsset = OutcomeMediaAsset & {
  absolutePath: string;
  sha256: string;
  storagePath: string;
  publicUrl: string;
  bytes: Buffer;
};

export type PlannedOutcomeRow = {
  product_id: string;
  variant_id: null;
  media_type: "image";
  url: string;
  alt: string;
  width: number;
  height: number;
  role: typeof OUTCOME_MEDIA_ROLE;
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

export type CleanseOutcomeMediaSyncReport = {
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
  duplicateRowsFound: number;
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
      `[cleanse-outcome-media-sync] Refusing Supabase project "${hostRef}"; expected "${PROJECT_REF}".`,
    );
  }
}

function checksum(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function storagePathForOutcomeAsset(sha256: string): string {
  return `products/${CLEANSE_SLUG}/outcomes/${sha256}.webp`;
}

function publicUrlFor(storagePath: string): string {
  const origin = new URL(requiredEnv("NEXT_PUBLIC_SUPABASE_URL")).origin;
  return `${origin}/storage/v1/object/public/${BUCKET}/${storagePath}`;
}

export async function inspectOutcomeAsset(
  asset: OutcomeMediaAsset,
  assetDirectory = DEFAULT_ASSET_DIR,
): Promise<InspectedAsset> {
  const absolutePath = resolve(assetDirectory, asset.filename);
  let bytes: Buffer;
  try {
    bytes = await readFile(absolutePath);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown read error";
    throw new Error(
      `[cleanse-outcome-media-sync] Cannot read required source "${absolutePath}": ${detail}`,
    );
  }

  const dimensions = readWebpDimensions(bytes);
  if (dimensions.width !== asset.width || dimensions.height !== asset.height) {
    throw new Error(
      `[cleanse-outcome-media-sync] ${asset.filename} is ${dimensions.width}x${dimensions.height}; expected ${asset.width}x${asset.height}.`,
    );
  }

  const sha256 = checksum(bytes);
  const storagePath = storagePathForOutcomeAsset(sha256);
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
      `[cleanse-outcome-media-sync] Failed to resolve CLEANSE: ${error.message}`,
    );
  }

  const products = (data ?? []) as ProductRow[];
  if (products.length !== 1) {
    throw new Error(
      `[cleanse-outcome-media-sync] Expected one product for "${CLEANSE_SLUG}"; found ${products.length}.`,
    );
  }

  const product = products[0];
  if (
    product.display_name?.toUpperCase() !== "CLEANSE" ||
    product.routine_group !== "core" ||
    product.routine_step_number !== 1
  ) {
    throw new Error(
      `[cleanse-outcome-media-sync] "${CLEANSE_SLUG}" is not the canonical Core CLEANSE product.`,
    );
  }
  return product;
}

async function readOutcomeRows(
  supabase: SupabaseClient,
  productId: string,
): Promise<MediaRow[]> {
  const { data, error } = await supabase
    .from("product_media")
    .select(
      "id, product_id, variant_id, media_type, url, alt, width, height, role, sort_order, palette_id, placeholder_palette, original_source_url, source_filename, updated_at",
    )
    .eq("product_id", productId)
    .eq("role", OUTCOME_MEDIA_ROLE)
    .order("sort_order", { ascending: true });

  if (error) {
    throw new Error(
      `[cleanse-outcome-media-sync] Failed to read outcome rows: ${error.message}`,
    );
  }
  return (data ?? []) as MediaRow[];
}

function assertExistingRowsAreSafe(rows: readonly MediaRow[]): number {
  const validOrders = new Set(OUTCOME_MEDIA_ASSETS.map((asset) => asset.sortOrder));
  const seen = new Set<number>();
  let duplicates = 0;

  for (const row of rows) {
    if (!validOrders.has(row.sort_order as 1 | 2 | 3)) {
      throw new Error(
        `[cleanse-outcome-media-sync] Unexpected CLEANSE outcome sort order ${row.sort_order}; reconcile it explicitly before syncing.`,
      );
    }
    if (row.variant_id !== null) {
      throw new Error(
        `[cleanse-outcome-media-sync] Outcome order ${row.sort_order} is variant-specific; reconcile it explicitly before syncing.`,
      );
    }
    if (seen.has(row.sort_order)) duplicates += 1;
    seen.add(row.sort_order);
  }

  if (duplicates > 0) {
    throw new Error(
      `[cleanse-outcome-media-sync] Found ${duplicates} duplicate CLEANSE outcome position(s); reconcile duplicates before syncing.`,
    );
  }
  return duplicates;
}

export function planOutcomeRows(
  productId: string,
  assets: readonly InspectedAsset[],
): PlannedOutcomeRow[] {
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
      role: OUTCOME_MEDIA_ROLE,
      sort_order: asset.sortOrder,
      palette_id: null,
      placeholder_palette: {},
      original_source_url: null,
      source_filename: asset.filename,
    }));
}

function rowMatchesPlan(row: MediaRow, planned: PlannedOutcomeRow): boolean {
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

async function listOutcomeObjects(
  supabase: SupabaseClient,
): Promise<StorageObject[]> {
  const prefix = `products/${CLEANSE_SLUG}/outcomes`;
  const { data, error } = await supabase.storage.from(BUCKET).list(prefix, {
    limit: 1000,
    sortBy: { column: "name", order: "asc" },
  });
  if (error) {
    throw new Error(
      `[cleanse-outcome-media-sync] Failed to list ${prefix}: ${error.message}`,
    );
  }
  return (data ?? []).filter((item) => Boolean(item.id)).map((item) => ({
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
      `[cleanse-outcome-media-sync] Failed to inspect ${storagePath}: ${error.message}`,
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
      `[cleanse-outcome-media-sync] ${asset.storagePath} returned ${response.status}.`,
    );
  }
  const remoteBytes = Buffer.from(await response.arrayBuffer());
  if (checksum(remoteBytes) !== asset.sha256) {
    throw new Error(
      `[cleanse-outcome-media-sync] Checksum mismatch for ${asset.storagePath}.`,
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
        contentType: "image/webp",
        upsert: false,
      },
    );
    if (error && !/already exists/i.test(error.message)) {
      throw new Error(
        `[cleanse-outcome-media-sync] Failed to upload ${asset.storagePath}: ${error.message}`,
      );
    }
  }

  if (!(await objectExists(supabase, asset.storagePath))) {
    throw new Error(
      `[cleanse-outcome-media-sync] Upload verification failed for ${asset.storagePath}.`,
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
  const path = `${BACKUP_DIR}/cleanse-outcome-media-sync-${timestamp}.json`;
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
  plannedRows: readonly PlannedOutcomeRow[],
): number {
  if (rows.length !== plannedRows.length) {
    throw new Error(
      `[cleanse-outcome-media-sync] Expected exactly ${plannedRows.length} CLEANSE outcome rows; found ${rows.length}.`,
    );
  }
  for (const planned of plannedRows) {
    const matches = rows.filter(
      (row) => row.sort_order === planned.sort_order,
    );
    if (matches.length !== 1 || !rowMatchesPlan(matches[0], planned)) {
      throw new Error(
        `[cleanse-outcome-media-sync] Verification failed for outcome order ${planned.sort_order}.`,
      );
    }
  }
  return plannedRows.length;
}

export async function runCleanseOutcomeMediaSync({
  apply = false,
  assetDirectory = DEFAULT_ASSET_DIR,
}: {
  apply?: boolean;
  assetDirectory?: string;
} = {}): Promise<CleanseOutcomeMediaSyncReport> {
  verifyProjectRef();
  const supabase = createSupabaseAdminClient();
  const assets = await Promise.all(
    OUTCOME_MEDIA_ASSETS.map((asset) =>
      inspectOutcomeAsset(asset, assetDirectory),
    ),
  );
  if (new Set(assets.map((asset) => asset.sha256)).size !== assets.length) {
    throw new Error(
      "[cleanse-outcome-media-sync] Outcome source files must have unique content.",
    );
  }

  const product = await readCanonicalProduct(supabase);
  const beforeRows = await readOutcomeRows(supabase, product.id);
  const duplicateRowsFound = assertExistingRowsAreSafe(beforeRows);
  const plannedRows = planOutcomeRows(product.id, assets);
  const storageObjects = await listOutcomeObjects(supabase);
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

  const report: CleanseOutcomeMediaSyncReport = {
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
    duplicateRowsFound,
  };

  if (!apply) return report;

  if (assetsToUpload.length > 0 || rowsToSubmit.length > 0) {
    report.backupPath = await writeBackup(
      product,
      beforeRows,
      storageObjects,
    );
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
        `[cleanse-outcome-media-sync] Failed to upsert outcome rows: ${error.message}`,
      );
    }
    report.rowsSubmitted = rowsToSubmit.length;
  }

  const afterRows = await readOutcomeRows(supabase, product.id);
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
  runCleanseOutcomeMediaSync(parseArgs(process.argv.slice(2)))
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
                : "Unknown CLEANSE outcome media sync error",
          },
          null,
          2,
        ),
      );
      process.exitCode = 1;
    });
}
