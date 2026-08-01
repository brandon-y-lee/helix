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
const SYNC_LABEL = "outcome-media-sync";

export const CLEANSE_SLUG = "cleanse-01-calming-gel-cleanser";
export const TREAT_SLUG = "treat-03-pdrn-5-ampoule";
export const OUTCOME_MEDIA_ROLE = "pdp_outcome";

export type OutcomeProductPrefix = "cleanse" | "treat";
export type OutcomeSortOrder = 1 | 2 | 3;

type OutcomeProductDefinition = {
  prefix: OutcomeProductPrefix;
  slug: typeof CLEANSE_SLUG | typeof TREAT_SLUG;
  displayName: "CLEANSE" | "TREAT";
  routineStepNumber: 1 | 2;
};

export const OUTCOME_PRODUCTS: readonly OutcomeProductDefinition[] = [
  {
    prefix: "cleanse",
    slug: CLEANSE_SLUG,
    displayName: "CLEANSE",
    routineStepNumber: 1,
  },
  {
    prefix: "treat",
    slug: TREAT_SLUG,
    displayName: "TREAT",
    routineStepNumber: 2,
  },
] as const;

export type OutcomeMediaAsset = OutcomeProductDefinition & {
  filename: string;
  sortOrder: OutcomeSortOrder;
  alt: string;
  width: number;
  height: number;
};

export function canonicalOutcomeFilename(
  prefix: OutcomeProductPrefix,
  sortOrder: OutcomeSortOrder,
): string {
  return `${prefix}-pdp-outcomes-${String(sortOrder).padStart(2, "0")}.webp`;
}

export const OUTCOME_MEDIA_ASSETS: readonly OutcomeMediaAsset[] = [
  {
    ...OUTCOME_PRODUCTS[0],
    filename: canonicalOutcomeFilename("cleanse", 1),
    sortOrder: 1,
    alt: "CLEANSE outcome visual 1",
    width: 1201,
    height: 1310,
  },
  {
    ...OUTCOME_PRODUCTS[0],
    filename: canonicalOutcomeFilename("cleanse", 2),
    sortOrder: 2,
    alt: "CLEANSE outcome visual 2",
    width: 1254,
    height: 1254,
  },
  {
    ...OUTCOME_PRODUCTS[0],
    filename: canonicalOutcomeFilename("cleanse", 3),
    sortOrder: 3,
    alt: "CLEANSE outcome visual 3",
    width: 1122,
    height: 1402,
  },
  {
    ...OUTCOME_PRODUCTS[1],
    filename: canonicalOutcomeFilename("treat", 1),
    sortOrder: 1,
    alt: "TREAT outcome visual 1",
    width: 1122,
    height: 1402,
  },
  {
    ...OUTCOME_PRODUCTS[1],
    filename: canonicalOutcomeFilename("treat", 2),
    sortOrder: 2,
    alt: "TREAT outcome visual 2",
    width: 1254,
    height: 1254,
  },
  {
    ...OUTCOME_PRODUCTS[1],
    filename: canonicalOutcomeFilename("treat", 3),
    sortOrder: 3,
    alt: "TREAT outcome visual 3",
    width: 1200,
    height: 1311,
  },
] as const;

export type ProductRow = {
  id: string;
  slug: string;
  display_name: string | null;
  routine_group: string | null;
  routine_step_number: number | null;
};

export type ExistingOutcomeRow = {
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
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

export type InspectedOutcomeAsset = OutcomeMediaAsset & {
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
  sort_order: OutcomeSortOrder;
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

export type OutcomeRowMutationPlan = {
  unchanged: Array<{ id: string; row: PlannedOutcomeRow }>;
  updates: Array<{ id: string; row: PlannedOutcomeRow }>;
  archives: Array<{ id: string; row: ExistingOutcomeRow }>;
  inserts: PlannedOutcomeRow[];
};

export type OutcomeMediaSyncReport = {
  ok: boolean;
  dryRun: boolean;
  projectRef: string;
  bucket: string;
  products: ProductRow[];
  assetDirectory: string;
  backupPath: string | null;
  assets: Array<{
    prefix: OutcomeProductPrefix;
    filename: string;
    sortOrder: OutcomeSortOrder;
    sha256: string;
    bytes: number;
    width: number;
    height: number;
    storagePath: string;
    publicUrl: string;
  }>;
  objectsPlanned: number;
  objectActions: Array<{
    action: "upload" | "verify-existing";
    prefix: OutcomeProductPrefix;
    sortOrder: OutcomeSortOrder;
    storagePath: string;
  }>;
  objectsUploaded: number;
  objectsVerified: number;
  rowsPlanned: number;
  rowActions: Array<{
    action: "unchanged" | "update" | "archive" | "insert";
    id: string | null;
    productId: string;
    sortOrder: number;
    sourceFilename: string | null;
    url: string | null;
  }>;
  rowsInserted: number;
  rowsUpdated: number;
  rowsArchived: number;
  rowsUnchanged: number;
  rowsVerified: number;
  duplicateRowsFound: number;
  cleansePreserved: boolean | null;
  finalRows: Array<{
    id: string;
    productId: string;
    sortOrder: number;
    url: string | null;
    sourceFilename: string | null;
  }>;
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
      `[${SYNC_LABEL}] Refusing Supabase project "${hostRef}"; expected "${PROJECT_REF}".`,
    );
  }
}

function checksum(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function parseOutcomeFilename(filename: string): {
  prefix: OutcomeProductPrefix;
  sortOrder: OutcomeSortOrder;
} {
  const match = /^(cleanse|treat)-pdp-outcomes-(\d{2})\.webp$/.exec(filename);
  if (!match) {
    throw new Error(
      `[${SYNC_LABEL}] Invalid outcome basename "${filename}"; expected <product>-pdp-outcomes-<01|02|03>.webp.`,
    );
  }
  const sortOrder = Number(match[2]);
  if (sortOrder !== 1 && sortOrder !== 2 && sortOrder !== 3) {
    throw new Error(
      `[${SYNC_LABEL}] Invalid outcome order "${match[2]}" in "${filename}"; expected 01, 02, or 03.`,
    );
  }
  return {
    prefix: match[1] as OutcomeProductPrefix,
    sortOrder,
  };
}

export function assertOutcomeAssetManifest(
  assets: readonly OutcomeMediaAsset[],
): void {
  const expected = new Set(
    OUTCOME_PRODUCTS.flatMap((product) =>
      ([1, 2, 3] as const).map(
        (sortOrder) => `${product.prefix}:${sortOrder}`,
      ),
    ),
  );
  const seen = new Set<string>();

  for (const asset of assets) {
    const parsed = parseOutcomeFilename(asset.filename);
    const key = `${parsed.prefix}:${parsed.sortOrder}`;
    if (seen.has(key)) {
      throw new Error(`[${SYNC_LABEL}] Duplicate outcome input for ${key}.`);
    }
    seen.add(key);

    const product = OUTCOME_PRODUCTS.find(
      (candidate) => candidate.prefix === parsed.prefix,
    );
    if (
      !product ||
      asset.prefix !== product.prefix ||
      asset.slug !== product.slug ||
      asset.displayName !== product.displayName ||
      asset.routineStepNumber !== product.routineStepNumber ||
      asset.sortOrder !== parsed.sortOrder
    ) {
      throw new Error(
        `[${SYNC_LABEL}] ${asset.filename} does not match its canonical product and numeric order.`,
      );
    }
    if (asset.width <= 0 || asset.height <= 0) {
      throw new Error(
        `[${SYNC_LABEL}] ${asset.filename} requires positive intrinsic dimensions.`,
      );
    }
  }

  const missing = [...expected].filter((key) => !seen.has(key));
  const unexpected = [...seen].filter((key) => !expected.has(key));
  if (missing.length > 0 || unexpected.length > 0) {
    throw new Error(
      `[${SYNC_LABEL}] Outcome manifest mismatch; missing [${missing.join(", ")}], unexpected [${unexpected.join(", ")}].`,
    );
  }
}

export function storagePathForOutcomeAsset(
  asset: Pick<OutcomeMediaAsset, "slug">,
  sha256: string,
): string {
  return `products/${asset.slug}/outcomes/${sha256}.webp`;
}

function publicUrlFor(storagePath: string): string {
  const origin = new URL(requiredEnv("NEXT_PUBLIC_SUPABASE_URL")).origin;
  return `${origin}/storage/v1/object/public/${BUCKET}/${storagePath}`;
}

export async function inspectOutcomeAsset(
  asset: OutcomeMediaAsset,
  assetDirectory = DEFAULT_ASSET_DIR,
): Promise<InspectedOutcomeAsset> {
  const parsed = parseOutcomeFilename(asset.filename);
  if (parsed.prefix !== asset.prefix || parsed.sortOrder !== asset.sortOrder) {
    throw new Error(
      `[${SYNC_LABEL}] ${asset.filename} does not match ${asset.prefix} order ${asset.sortOrder}.`,
    );
  }

  const absolutePath = resolve(assetDirectory, asset.filename);
  let bytes: Buffer;
  try {
    bytes = await readFile(absolutePath);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown read error";
    throw new Error(
      `[${SYNC_LABEL}] Cannot read required source "${absolutePath}": ${detail}`,
    );
  }
  if (bytes.length === 0) {
    throw new Error(`[${SYNC_LABEL}] ${asset.filename} is empty.`);
  }

  let dimensions: { width: number; height: number };
  try {
    dimensions = readWebpDimensions(bytes);
  } catch {
    throw new Error(
      `[${SYNC_LABEL}] ${asset.filename} must contain a true WebP payload.`,
    );
  }
  if (dimensions.width !== asset.width || dimensions.height !== asset.height) {
    throw new Error(
      `[${SYNC_LABEL}] ${asset.filename} is ${dimensions.width}x${dimensions.height}; expected ${asset.width}x${asset.height}.`,
    );
  }

  const sha256 = checksum(bytes);
  const storagePath = storagePathForOutcomeAsset(asset, sha256);
  return {
    ...asset,
    absolutePath,
    sha256,
    storagePath,
    publicUrl: publicUrlFor(storagePath),
    bytes,
  };
}

async function readCanonicalProducts(
  supabase: SupabaseClient,
): Promise<ProductRow[]> {
  const { data, error } = await supabase
    .from("products")
    .select("id, slug, display_name, routine_group, routine_step_number")
    .in(
      "slug",
      OUTCOME_PRODUCTS.map((product) => product.slug),
    );
  if (error) {
    throw new Error(
      `[${SYNC_LABEL}] Failed to resolve outcome products: ${error.message}`,
    );
  }

  const products = (data ?? []) as ProductRow[];
  for (const definition of OUTCOME_PRODUCTS) {
    const matches = products.filter((row) => row.slug === definition.slug);
    if (matches.length !== 1) {
      throw new Error(
        `[${SYNC_LABEL}] Expected one product for "${definition.slug}"; found ${matches.length}.`,
      );
    }
    const product = matches[0];
    if (
      product.display_name?.toUpperCase() !== definition.displayName ||
      product.routine_group !== "core" ||
      product.routine_step_number !== definition.routineStepNumber
    ) {
      throw new Error(
        `[${SYNC_LABEL}] "${definition.slug}" is not the canonical Core ${definition.displayName} product.`,
      );
    }
  }
  return products.sort(
    (a, b) =>
      (a.routine_step_number ?? Number.MAX_SAFE_INTEGER) -
      (b.routine_step_number ?? Number.MAX_SAFE_INTEGER),
  );
}

async function readOutcomeRows(
  supabase: SupabaseClient,
  productIds: readonly string[],
): Promise<ExistingOutcomeRow[]> {
  const { data, error } = await supabase
    .from("product_media")
    .select(
      "id, product_id, variant_id, media_type, url, alt, width, height, role, sort_order, palette_id, placeholder_palette, original_source_url, source_filename, created_at, updated_at, archived_at",
    )
    .in("product_id", [...productIds])
    .eq("role", OUTCOME_MEDIA_ROLE)
    .is("archived_at", null)
    .order("product_id", { ascending: true })
    .order("sort_order", { ascending: true });
  if (error) {
    throw new Error(
      `[${SYNC_LABEL}] Failed to read active outcome rows: ${error.message}`,
    );
  }
  return (data ?? []) as ExistingOutcomeRow[];
}

function assertExistingRowsAreSafe(
  rows: readonly ExistingOutcomeRow[],
  productIds: ReadonlySet<string>,
): number {
  const seen = new Set<string>();
  let duplicates = 0;
  for (const row of rows) {
    if (!productIds.has(row.product_id)) {
      throw new Error(`[${SYNC_LABEL}] Encountered an unrelated product row.`);
    }
    if (![1, 2, 3].includes(row.sort_order)) {
      throw new Error(
        `[${SYNC_LABEL}] Unexpected outcome sort order ${row.sort_order}; reconcile it explicitly before syncing.`,
      );
    }
    if (row.variant_id !== null) {
      throw new Error(
        `[${SYNC_LABEL}] Outcome order ${row.sort_order} is variant-specific; reconcile it explicitly before syncing.`,
      );
    }
    const key = `${row.product_id}:${row.sort_order}`;
    if (seen.has(key)) duplicates += 1;
    seen.add(key);
  }
  if (duplicates > 0) {
    throw new Error(
      `[${SYNC_LABEL}] Found ${duplicates} duplicate active outcome position(s); reconcile duplicates before syncing.`,
    );
  }
  return duplicates;
}

export function planOutcomeRows(
  productIdsBySlug: ReadonlyMap<string, string>,
  assets: readonly InspectedOutcomeAsset[],
): PlannedOutcomeRow[] {
  return assets
    .slice()
    .sort(
      (a, b) =>
        a.routineStepNumber - b.routineStepNumber ||
        a.sortOrder - b.sortOrder,
    )
    .map((asset) => {
      const productId = productIdsBySlug.get(asset.slug);
      if (!productId) {
        throw new Error(`[${SYNC_LABEL}] Missing product ID for ${asset.slug}.`);
      }
      return {
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
      };
    });
}

function normalizedPalette(value: Record<string, unknown> | null | undefined) {
  return JSON.stringify(value ?? {});
}

export function rowMatchesPlan(
  row: ExistingOutcomeRow,
  planned: PlannedOutcomeRow,
): boolean {
  return (
    rowMatchesPlanExceptSourceFilename(row, planned) &&
    row.source_filename === planned.source_filename
  );
}

function rowMatchesPlanExceptSourceFilename(
  row: ExistingOutcomeRow,
  planned: PlannedOutcomeRow,
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
    normalizedPalette(row.placeholder_palette) ===
      normalizedPalette(planned.placeholder_palette) &&
    row.original_source_url === null
  );
}

export function assertCleanseMutationsAreProvenanceOnly(
  existingRows: readonly ExistingOutcomeRow[],
  mutations: OutcomeRowMutationPlan,
  cleanseProductId: string,
): void {
  const unchanged = mutations.unchanged.filter(
    (mutation) => mutation.row.product_id === cleanseProductId,
  );
  const updates = mutations.updates.filter(
    (mutation) => mutation.row.product_id === cleanseProductId,
  );
  const archives = mutations.archives.filter(
    (mutation) => mutation.row.product_id === cleanseProductId,
  );
  const inserts = mutations.inserts.filter(
    (row) => row.product_id === cleanseProductId,
  );
  if (
    unchanged.length + updates.length !== 3 ||
    archives.length > 0 ||
    inserts.length > 0
  ) {
    throw new Error(
      `[${SYNC_LABEL}] CLEANSE outcome rows may only receive provenance filename updates.`,
    );
  }
  for (const mutation of updates) {
    const existing = existingRows.find((row) => row.id === mutation.id);
    if (!existing || !rowMatchesPlanExceptSourceFilename(existing, mutation.row)) {
      throw new Error(
        `[${SYNC_LABEL}] CLEANSE outcome row ${mutation.id} differs beyond source_filename.`,
      );
    }
  }
}

export function planOutcomeRowMutations(
  existingRows: readonly ExistingOutcomeRow[],
  plannedRows: readonly PlannedOutcomeRow[],
): OutcomeRowMutationPlan {
  const plan: OutcomeRowMutationPlan = {
    unchanged: [],
    updates: [],
    archives: [],
    inserts: [],
  };
  const plannedKeys = new Set(
    plannedRows.map((row) => `${row.product_id}:${row.sort_order}`),
  );
  const unexpected = existingRows.find(
    (row) => !plannedKeys.has(`${row.product_id}:${row.sort_order}`),
  );
  if (unexpected) {
    throw new Error(
      `[${SYNC_LABEL}] Refusing to mutate unexpected outcome order ${unexpected.sort_order} for ${unexpected.product_id}.`,
    );
  }

  for (const planned of plannedRows) {
    const matches = existingRows.filter(
      (row) =>
        row.product_id === planned.product_id &&
        row.sort_order === planned.sort_order,
    );
    if (matches.length > 1) {
      throw new Error(
        `[${SYNC_LABEL}] Duplicate active outcome order ${planned.sort_order} for ${planned.product_id}.`,
      );
    }
    const existing = matches[0];
    if (!existing) {
      plan.inserts.push(planned);
    } else if (rowMatchesPlan(existing, planned)) {
      plan.unchanged.push({ id: existing.id, row: planned });
    } else if (existing.url !== planned.url) {
      plan.archives.push({ id: existing.id, row: existing });
      plan.inserts.push(planned);
    } else {
      plan.updates.push({ id: existing.id, row: planned });
    }
  }
  return plan;
}

async function listOutcomeObjects(
  supabase: SupabaseClient,
): Promise<StorageObject[]> {
  const objects: StorageObject[] = [];
  for (const product of OUTCOME_PRODUCTS) {
    const prefix = `products/${product.slug}/outcomes`;
    const { data, error } = await supabase.storage.from(BUCKET).list(prefix, {
      limit: 1000,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) {
      throw new Error(
        `[${SYNC_LABEL}] Failed to list ${prefix}: ${error.message}`,
      );
    }
    objects.push(
      ...(data ?? [])
        .filter((item) => Boolean(item.id))
        .map((item) => ({
          name: `${prefix}/${item.name}`,
          metadata: (item.metadata as Record<string, unknown> | null) ?? null,
          created_at: item.created_at ?? null,
          updated_at: item.updated_at ?? null,
        })),
    );
  }
  return objects;
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
      `[${SYNC_LABEL}] Failed to inspect ${storagePath}: ${error.message}`,
    );
  }
  return (data ?? []).some((item) => item.name === basename(storagePath));
}

async function verifyPublicAsset(asset: InspectedOutcomeAsset): Promise<void> {
  const response = await fetch(asset.publicUrl, {
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(
      `[${SYNC_LABEL}] ${asset.storagePath} returned ${response.status}.`,
    );
  }
  const contentType = response.headers.get("content-type")?.split(";")[0];
  if (contentType !== "image/webp") {
    throw new Error(
      `[${SYNC_LABEL}] ${asset.storagePath} served ${contentType ?? "no content type"}; expected image/webp.`,
    );
  }
  const remoteBytes = Buffer.from(await response.arrayBuffer());
  if (checksum(remoteBytes) !== asset.sha256) {
    throw new Error(
      `[${SYNC_LABEL}] Checksum mismatch for ${asset.storagePath}.`,
    );
  }
}

async function uploadAsset(
  supabase: SupabaseClient,
  asset: InspectedOutcomeAsset,
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
        `[${SYNC_LABEL}] Failed to upload ${asset.storagePath}: ${error.message}`,
      );
    }
  }
  if (!(await objectExists(supabase, asset.storagePath))) {
    throw new Error(
      `[${SYNC_LABEL}] Upload verification failed for ${asset.storagePath}.`,
    );
  }
  await verifyPublicAsset(asset);
  return exists ? "already-exists" : "uploaded";
}

async function writeBackup(
  products: ProductRow[],
  rows: ExistingOutcomeRow[],
  objects: StorageObject[],
): Promise<string> {
  await mkdir(BACKUP_DIR, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const path = `${BACKUP_DIR}/outcome-media-sync-${timestamp}.json`;
  await writeFile(
    path,
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        projectRef: PROJECT_REF,
        products,
        productMedia: rows,
        storageObjects: objects,
      },
      null,
      2,
    ),
  );
  return path;
}

function comparablePreservedRow(row: ExistingOutcomeRow) {
  return {
    id: row.id,
    product_id: row.product_id,
    variant_id: row.variant_id,
    media_type: row.media_type,
    url: row.url,
    alt: row.alt,
    width: row.width,
    height: row.height,
    role: row.role,
    sort_order: row.sort_order,
    palette_id: row.palette_id,
    placeholder_palette: row.placeholder_palette,
    original_source_url: row.original_source_url,
    created_at: row.created_at,
    archived_at: row.archived_at,
  };
}

export function assertCleanseRowsPreserved(
  beforeRows: readonly ExistingOutcomeRow[],
  afterRows: readonly ExistingOutcomeRow[],
  cleanseProductId: string,
): true {
  const before = beforeRows
    .filter((row) => row.product_id === cleanseProductId)
    .sort((a, b) => a.sort_order - b.sort_order);
  const after = afterRows
    .filter((row) => row.product_id === cleanseProductId)
    .sort((a, b) => a.sort_order - b.sort_order);
  if (
    before.length !== 3 ||
    after.length !== 3 ||
    JSON.stringify(before.map(comparablePreservedRow)) !==
      JSON.stringify(after.map(comparablePreservedRow))
  ) {
    throw new Error(
      `[${SYNC_LABEL}] CLEANSE row identities, URLs, or immutable presentation fields changed.`,
    );
  }
  return true;
}

function verifyRows(
  rows: readonly ExistingOutcomeRow[],
  plannedRows: readonly PlannedOutcomeRow[],
): number {
  if (rows.length !== plannedRows.length) {
    throw new Error(
      `[${SYNC_LABEL}] Expected exactly ${plannedRows.length} active outcome rows; found ${rows.length}.`,
    );
  }
  for (const planned of plannedRows) {
    const matches = rows.filter(
      (row) =>
        row.product_id === planned.product_id &&
        row.sort_order === planned.sort_order,
    );
    if (matches.length !== 1 || !rowMatchesPlan(matches[0], planned)) {
      throw new Error(
        `[${SYNC_LABEL}] Verification failed for ${planned.product_id} outcome order ${planned.sort_order}.`,
      );
    }
  }
  return plannedRows.length;
}

async function applyRowMutations(
  supabase: SupabaseClient,
  mutations: OutcomeRowMutationPlan,
): Promise<{ inserted: number; updated: number; archived: number }> {
  let inserted = 0;
  let updated = 0;
  let archived = 0;

  for (const mutation of mutations.updates) {
    const { data, error } = await supabase
      .from("product_media")
      .update(mutation.row)
      .eq("id", mutation.id)
      .is("archived_at", null)
      .select("id");
    if (error || data?.length !== 1) {
      throw new Error(
        `[${SYNC_LABEL}] Failed to update outcome row ${mutation.id}: ${error?.message ?? "row not found"}`,
      );
    }
    updated += 1;
  }

  for (const mutation of mutations.archives) {
    const { data, error } = await supabase
      .from("product_media")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", mutation.id)
      .is("archived_at", null)
      .select("id");
    if (error || data?.length !== 1) {
      throw new Error(
        `[${SYNC_LABEL}] Failed to archive outcome row ${mutation.id}: ${error?.message ?? "row not found"}`,
      );
    }
    archived += 1;
  }

  for (const row of mutations.inserts) {
    const { error } = await supabase.from("product_media").insert(row);
    if (error) {
      throw new Error(
        `[${SYNC_LABEL}] Failed to insert ${row.product_id} outcome order ${row.sort_order}: ${error.message}`,
      );
    }
    inserted += 1;
  }

  return { inserted, updated, archived };
}

export async function runOutcomeMediaSync({
  apply = false,
  assetDirectory = DEFAULT_ASSET_DIR,
}: {
  apply?: boolean;
  assetDirectory?: string;
} = {}): Promise<OutcomeMediaSyncReport> {
  verifyProjectRef();
  assertOutcomeAssetManifest(OUTCOME_MEDIA_ASSETS);
  const assets = await Promise.all(
    OUTCOME_MEDIA_ASSETS.map((asset) =>
      inspectOutcomeAsset(asset, assetDirectory),
    ),
  );
  if (new Set(assets.map((asset) => asset.sha256)).size !== assets.length) {
    throw new Error(
      `[${SYNC_LABEL}] Outcome source files must have unique content.`,
    );
  }

  const supabase = createSupabaseAdminClient();
  const products = await readCanonicalProducts(supabase);
  const productIdsBySlug = new Map(
    products.map((product) => [product.slug, product.id]),
  );
  const productIds = products.map((product) => product.id);
  const beforeRows = await readOutcomeRows(supabase, productIds);
  const duplicateRowsFound = assertExistingRowsAreSafe(
    beforeRows,
    new Set(productIds),
  );
  const plannedRows = planOutcomeRows(productIdsBySlug, assets);
  const mutations = planOutcomeRowMutations(beforeRows, plannedRows);
  const storageObjects = await listOutcomeObjects(supabase);
  const storageNames = new Set(storageObjects.map((object) => object.name));
  const assetsToUpload = assets.filter(
    (asset) => !storageNames.has(asset.storagePath),
  );
  const rowsPlanned =
    mutations.updates.length +
    mutations.archives.length +
    mutations.inserts.length;
  const cleanseProductId = productIdsBySlug.get(CLEANSE_SLUG);
  if (!cleanseProductId) {
    throw new Error(`[${SYNC_LABEL}] CLEANSE product ID is unavailable.`);
  }
  assertCleanseMutationsAreProvenanceOnly(
    beforeRows,
    mutations,
    cleanseProductId,
  );

  const report: OutcomeMediaSyncReport = {
    ok: true,
    dryRun: !apply,
    projectRef: PROJECT_REF,
    bucket: BUCKET,
    products,
    assetDirectory,
    backupPath: null,
    assets: assets.map((asset) => ({
      prefix: asset.prefix,
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
    objectActions: assets.map((asset) => ({
      action: storageNames.has(asset.storagePath)
        ? "verify-existing"
        : "upload",
      prefix: asset.prefix,
      sortOrder: asset.sortOrder,
      storagePath: asset.storagePath,
    })),
    objectsUploaded: 0,
    objectsVerified: 0,
    rowsPlanned,
    rowActions: [
      ...mutations.unchanged.map((mutation) => ({
        action: "unchanged" as const,
        id: mutation.id,
        productId: mutation.row.product_id,
        sortOrder: mutation.row.sort_order,
        sourceFilename: mutation.row.source_filename,
        url: mutation.row.url,
      })),
      ...mutations.updates.map((mutation) => ({
        action: "update" as const,
        id: mutation.id,
        productId: mutation.row.product_id,
        sortOrder: mutation.row.sort_order,
        sourceFilename: mutation.row.source_filename,
        url: mutation.row.url,
      })),
      ...mutations.archives.map((mutation) => ({
        action: "archive" as const,
        id: mutation.id,
        productId: mutation.row.product_id,
        sortOrder: mutation.row.sort_order,
        sourceFilename: mutation.row.source_filename,
        url: mutation.row.url,
      })),
      ...mutations.inserts.map((row) => ({
        action: "insert" as const,
        id: null,
        productId: row.product_id,
        sortOrder: row.sort_order,
        sourceFilename: row.source_filename,
        url: row.url,
      })),
    ],
    rowsInserted: 0,
    rowsUpdated: 0,
    rowsArchived: 0,
    rowsUnchanged: mutations.unchanged.length,
    rowsVerified: 0,
    duplicateRowsFound,
    cleansePreserved: null,
    finalRows: [],
  };

  if (!apply) return report;

  if (assetsToUpload.length > 0 || rowsPlanned > 0) {
    report.backupPath = await writeBackup(
      products,
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

  const rowResults = await applyRowMutations(supabase, mutations);
  report.rowsInserted = rowResults.inserted;
  report.rowsUpdated = rowResults.updated;
  report.rowsArchived = rowResults.archived;

  const afterRows = await readOutcomeRows(supabase, productIds);
  report.rowsVerified = verifyRows(afterRows, plannedRows);
  report.cleansePreserved = assertCleanseRowsPreserved(
    beforeRows,
    afterRows,
    cleanseProductId,
  );
  report.finalRows = afterRows.map((row) => ({
    id: row.id,
    productId: row.product_id,
    sortOrder: row.sort_order,
    url: row.url,
    sourceFilename: row.source_filename,
  }));
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
  runOutcomeMediaSync(parseArgs(process.argv.slice(2)))
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
                : "Unknown outcome media sync error",
          },
          null,
          2,
        ),
      );
      process.exitCode = 1;
    });
}
