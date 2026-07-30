import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { config } from "dotenv";
import {
  createClient,
  type SupabaseClient,
} from "@supabase/supabase-js";
import WebSocket from "ws";
import {
  meiPellePresentationCatalog,
  presentationMediaForProduct,
} from "../data/catalog/mei-pelle-presentation";
import { PRODUCT_EDITORIAL_FIELDS } from "../lib/catalog/field-ownership";
import { EXPECTED_SUPABASE_PROJECT_REF } from "./catalog/canonical-catalog-manifest";
import {
  executeCatalogProductWritePlans,
  planPresentationProductWrite,
  requireEditorialOverwriteConfirmation,
  type CatalogProductWritePlan,
  type CatalogRow,
  type EditorialOverwriteTarget,
} from "./catalog/catalog-writer-policy";

config({ path: resolve(process.cwd(), ".env.local"), quiet: true });

export type RefreshOptions = {
  apply: boolean;
  overwriteEditorial: boolean;
  confirmedEditorialOverwrite: boolean;
  overwriteMedia: boolean;
};

type ProductRow = CatalogRow & {
  id: string;
  slug: string;
  catalog_status: string;
};

type MediaRow = {
  id: string;
  product_id: string;
  role: string;
  sort_order: number;
};

type PlannedMediaRow = {
  id: string;
  product_id: string;
  media_type: "image";
  url: null;
  alt: string;
  width: null;
  height: null;
  role: string;
  sort_order: number;
  palette_id: string;
  placeholder_palette: Record<string, string>;
  original_source_url: null;
  source_filename: null;
};

type RefreshReport = {
  ok: true;
  dryRun: boolean;
  overwriteEditorial: boolean;
  overwriteMedia: boolean;
  productsMatched: number;
  productsMissing: string[];
  rowsInserted: number;
  productRowsUpdated: number;
  sourceOwnedFieldsUpdated: [];
  editorialFieldsSeeded: Array<{ slug: string; fields: string[] }>;
  editorialFieldsSkipped: Array<{ slug: string; fields: string[] }>;
  editorialFieldsWouldOverwrite: Array<{ slug: string; fields: string[] }>;
  variantsAffected: number;
  mediaAffected: Array<{
    slug: string;
    rowsInserted: number;
    rowsOverwritten: number;
    rowsPreserved: number;
  }>;
  mediaRowsAdded: number;
  mediaRowsArchived: number;
  mediaRowsPreserved: number;
  palettesCreated: number;
  backupPath: string | null;
  errors: string[];
};

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function verifyProjectRef(urlValue: string): void {
  const url = new URL(urlValue);
  const projectRef = url.hostname.split(".")[0];
  if (projectRef !== EXPECTED_SUPABASE_PROJECT_REF) {
    throw new Error(
      `[presentation-refresh] Refusing Supabase project "${projectRef}"; expected "${EXPECTED_SUPABASE_PROJECT_REF}".`,
    );
  }
}

function createSupabaseAdminClient(): SupabaseClient {
  const url = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  verifyProjectRef(url);
  return createClient(url, requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    realtime: {
      transport: WebSocket as unknown as typeof globalThis.WebSocket,
    },
  });
}

function deterministicUuid(seed: string): string {
  const bytes = Buffer.from(
    createHash("sha256").update(seed).digest().subarray(0, 16),
  );
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function assertHexPalette(value: Record<string, string>): void {
  const hex = /^#[0-9a-f]{6}$/i;
  const required = ["start", "end", "accent", "surface", "ink", "highlight"];
  for (const key of required) {
    if (!hex.test(value[key] ?? "")) {
      throw new Error(
        `Invalid palette value for "${key}": ${value[key] ?? "<missing>"}`,
      );
    }
  }
}

function presentationEditorialValues(
  product: (typeof meiPellePresentationCatalog)[number],
): CatalogRow {
  return {
    display_name: product.displayName,
    formal_title: product.formalTitle,
    card_tagline: product.cardTagline,
    editorial_description: product.editorialDescription,
    editorial_how_to_use: product.editorialHowToUse,
    formula_notes: product.formulaNotes,
    search_keywords: product.searchKeywords,
    seo_title: `${product.formalTitle} | Mei Pelle`,
    seo_description: product.editorialDescription,
  };
}

async function readActiveProducts(
  supabase: SupabaseClient,
): Promise<ProductRow[]> {
  const { data, error } = await supabase
    .from("products")
    .select(["id", "slug", "catalog_status", ...PRODUCT_EDITORIAL_FIELDS].join(", "))
    .in(
      "slug",
      meiPellePresentationCatalog.map((product) => product.slug),
    )
    .eq("catalog_status", "active");
  if (error) {
    throw new Error(
      `[presentation-refresh] Failed to read products: ${error.message}`,
    );
  }
  return (data ?? []) as unknown as ProductRow[];
}

async function readMediaRows(
  supabase: SupabaseClient,
  productIds: readonly string[],
): Promise<MediaRow[]> {
  if (productIds.length === 0) return [];
  const { data, error } = await supabase
    .from("product_media")
    .select("id, product_id, role, sort_order")
    .in("product_id", [...productIds])
    .order("product_id", { ascending: true })
    .order("sort_order", { ascending: true });
  if (error) {
    throw new Error(
      `[presentation-refresh] Failed to inspect product media: ${error.message}`,
    );
  }
  return (data ?? []) as MediaRow[];
}

function plannedMediaRows(productRows: readonly ProductRow[]): PlannedMediaRow[] {
  const bySlug = new Map(productRows.map((row) => [row.slug, row]));
  return meiPellePresentationCatalog.flatMap((product) => {
    const row = bySlug.get(product.slug);
    if (!row) return [];
    return presentationMediaForProduct(product).map((media) => {
      assertHexPalette(media.palette);
      return {
        id: deterministicUuid(
          `mei-pelle:media:${product.slug}:${media.role}:${media.sortOrder}`,
        ),
        product_id: row.id,
        media_type: "image" as const,
        url: null,
        alt: media.alt,
        width: null,
        height: null,
        role: media.role,
        sort_order: media.sortOrder,
        palette_id: media.paletteId,
        placeholder_palette: media.palette,
        original_source_url: null,
        source_filename: null,
      };
    });
  });
}

function missingMediaRows(
  desired: readonly PlannedMediaRow[],
  existing: readonly MediaRow[],
): PlannedMediaRow[] {
  const existingKeys = new Set(
    existing.map(
      (row) => `${row.product_id}:${row.role}:${row.sort_order}`,
    ),
  );
  return desired.filter(
    (row) =>
      !existingKeys.has(`${row.product_id}:${row.role}:${row.sort_order}`),
  );
}

function mediaReportByProduct({
  productRows,
  desired,
  existing,
  overwriteMedia,
}: {
  productRows: readonly ProductRow[];
  desired: readonly PlannedMediaRow[];
  existing: readonly MediaRow[];
  overwriteMedia: boolean;
}): RefreshReport["mediaAffected"] {
  return productRows.map((product) => {
    const desiredRows = desired.filter(
      (row) => row.product_id === product.id,
    );
    const existingRows = existing.filter(
      (row) => row.product_id === product.id,
    );
    const missingRows = missingMediaRows(desiredRows, existingRows);
    return {
      slug: product.slug,
      rowsInserted: overwriteMedia ? desiredRows.length : missingRows.length,
      rowsOverwritten: overwriteMedia ? existingRows.length : 0,
      rowsPreserved: overwriteMedia ? 0 : existingRows.length,
    };
  });
}

async function backupPresentationData(
  supabase: SupabaseClient,
  productIds: string[],
): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = "/private/tmp/mei-pelle-catalog-backups";
  if (!existsSync(backupDir)) mkdirSync(backupDir, { recursive: true });

  const [products, variants, media, relationships] = await Promise.all([
    supabase
      .from("products")
      .select(
        "id, slug, display_name, formal_title, card_tagline, editorial_description, editorial_how_to_use, product_type, routine_group, routine_step_number, routine_step_name, routine_sort, swatch_from, swatch_to, sort_order, search_keywords, formula_notes, seo_title, seo_description, updated_at",
      )
      .in("id", productIds),
    supabase
      .from("product_variants")
      .select(
        "id, product_id, variant_key, label, price_cents, compare_at_price_cents, available, inventory_status, volume, pack_count, sort_order",
      )
      .in("product_id", productIds),
    supabase
      .from("product_media")
      .select(
        "id, product_id, media_type, url, alt, width, height, role, sort_order, palette_id, placeholder_palette, original_source_url, source_filename, updated_at",
      )
      .in("product_id", productIds),
    supabase
      .from("product_relationships")
      .select("product_id, related_product_id, relationship_type, sort_order")
      .in("product_id", productIds),
  ]);
  for (const [label, result] of [
    ["products", products],
    ["variants", variants],
    ["media", media],
    ["relationships", relationships],
  ] as const) {
    if (result.error) {
      throw new Error(
        `[presentation-refresh] Failed to backup ${label}: ${result.error.message}`,
      );
    }
  }

  const backupPath = `${backupDir}/presentation-backup-${timestamp}.json`;
  writeFileSync(
    backupPath,
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        products: products.data ?? [],
        variants: variants.data ?? [],
        media: media.data ?? [],
        relationships: relationships.data ?? [],
      },
      null,
      2,
    ),
  );
  return backupPath;
}

function overwriteTargets(
  plans: readonly CatalogProductWritePlan[],
  mediaAffected: RefreshReport["mediaAffected"],
): EditorialOverwriteTarget[] {
  return plans.flatMap((plan) => {
    const mediaRows =
      mediaAffected.find((media) => media.slug === plan.slug)
        ?.rowsOverwritten ?? 0;
    if (plan.editorialFieldsToOverwrite.length === 0 && mediaRows === 0) {
      return [];
    }
    return [{
      slug: plan.slug,
      fields: plan.editorialFieldsToOverwrite,
      mediaRows,
    }];
  });
}

export function parseRefreshArgs(argv: string[]): RefreshOptions {
  const apply = argv.includes("--apply") && !argv.includes("--dry-run");
  const overwriteEditorial = argv.includes("--overwrite-editorial");
  const overwriteMedia = argv.includes("--overwrite-media");
  if (overwriteMedia && !overwriteEditorial) {
    throw new Error(
      "--overwrite-media requires --overwrite-editorial because product media associations are editor-owned.",
    );
  }
  return {
    apply,
    overwriteEditorial,
    confirmedEditorialOverwrite: argv.includes(
      "--confirm-editorial-overwrite",
    ),
    overwriteMedia,
  };
}

export async function runPresentationRefresh(
  options: RefreshOptions,
): Promise<RefreshReport> {
  const supabase = createSupabaseAdminClient();
  const productRows = await readActiveProducts(supabase);
  const bySlug = new Map(productRows.map((row) => [row.slug, row]));
  const productsMissing = meiPellePresentationCatalog
    .map((product) => product.slug)
    .filter((slug) => !bySlug.has(slug));
  const plans = meiPellePresentationCatalog.flatMap((product) => {
    const existing = bySlug.get(product.slug);
    return existing
      ? [planPresentationProductWrite({
          slug: product.slug,
          existing,
          editorial: presentationEditorialValues(product),
          overwriteEditorial: options.overwriteEditorial,
        })]
      : [];
  });
  const existingMedia = await readMediaRows(
    supabase,
    productRows.map((product) => product.id),
  );
  const desiredMedia = plannedMediaRows(productRows);
  const mediaAffected = mediaReportByProduct({
    productRows,
    desired: desiredMedia,
    existing: existingMedia,
    overwriteMedia: options.overwriteMedia,
  });

  await requireEditorialOverwriteConfirmation({
    apply: options.apply,
    overwriteEditorial: options.overwriteEditorial,
    confirmedNonInteractive: options.confirmedEditorialOverwrite,
    targets: overwriteTargets(plans, mediaAffected),
  });

  const report: RefreshReport = {
    ok: true,
    dryRun: !options.apply,
    overwriteEditorial: options.overwriteEditorial,
    overwriteMedia: options.overwriteMedia,
    productsMatched: productRows.length,
    productsMissing,
    rowsInserted: 0,
    productRowsUpdated: plans.filter(
      (plan) => Object.keys(plan.update).length > 0,
    ).length,
    sourceOwnedFieldsUpdated: [],
    editorialFieldsSeeded: plans.map((plan) => ({
      slug: plan.slug,
      fields: plan.editorialFieldsSeeded,
    })),
    editorialFieldsSkipped: plans.map((plan) => ({
      slug: plan.slug,
      fields: plan.editorialFieldsSkipped,
    })),
    editorialFieldsWouldOverwrite: plans.map((plan) => ({
      slug: plan.slug,
      fields: plan.editorialFieldsToOverwrite,
    })),
    variantsAffected: 0,
    mediaAffected,
    mediaRowsAdded: mediaAffected.reduce(
      (total, media) => total + media.rowsInserted,
      0,
    ),
    mediaRowsArchived: mediaAffected.reduce(
      (total, media) => total + media.rowsOverwritten,
      0,
    ),
    mediaRowsPreserved: mediaAffected.reduce(
      (total, media) => total + media.rowsPreserved,
      0,
    ),
    palettesCreated: new Set(desiredMedia.map((row) => row.palette_id)).size,
    backupPath: null,
    errors: [],
  };
  if (!options.apply) return report;

  const hasProductWrites = plans.some(
    (plan) => Object.keys(plan.update).length > 0,
  );
  const hasMediaWrites = mediaAffected.some(
    (media) => media.rowsInserted > 0 || media.rowsOverwritten > 0,
  );
  if (hasProductWrites || hasMediaWrites) {
    report.backupPath = await backupPresentationData(
      supabase,
      productRows.map((product) => product.id),
    );
  }

  await executeCatalogProductWritePlans({
    apply: true,
    plans,
    insert: async () => {
      throw new Error(
        "[presentation-refresh] Product insertion is outside this writer's ownership.",
      );
    },
    update: async (id, row) => {
      const { error } = await supabase
        .from("products")
        .update(row)
        .eq("id", id);
      if (error) {
        throw new Error(
          `[presentation-refresh] Failed to update product ${id}: ${error.message}`,
        );
      }
    },
  });

  if (options.overwriteMedia && existingMedia.length > 0) {
    const { error } = await supabase
      .from("product_media")
      .delete()
      .in("product_id", productRows.map((product) => product.id));
    if (error) {
      throw new Error(
        `[presentation-refresh] Failed to replace product media: ${error.message}`,
      );
    }
  }
  const mediaRowsToInsert = options.overwriteMedia
    ? desiredMedia
    : missingMediaRows(desiredMedia, existingMedia);
  if (mediaRowsToInsert.length > 0) {
    const { error } = await supabase
      .from("product_media")
      .insert(mediaRowsToInsert);
    if (error) {
      throw new Error(
        `[presentation-refresh] Failed to insert placeholder media: ${error.message}`,
      );
    }
  }
  return report;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  Promise.resolve()
    .then(() => parseRefreshArgs(process.argv.slice(2)))
    .then(runPresentationRefresh)
    .then((report) => console.log(JSON.stringify(report, null, 2)))
    .catch((error) => {
      console.error(
        JSON.stringify(
          {
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : "Unknown presentation refresh error",
            errors: [
              error instanceof Error
                ? error.message
                : "Unknown presentation refresh error",
            ],
          },
          null,
          2,
        ),
      );
      process.exitCode = 1;
    });
}
