import { createHash } from "node:crypto";
import { extname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { config } from "dotenv";
import {
  createClient,
  type SupabaseClient,
} from "@supabase/supabase-js";
import WebSocket from "ws";
import {
  leadersMeiPelleCatalog,
  type LeadersCatalogProduct,
} from "../data/catalog/leaders-mei-pelle-source";
import { meiPellePresentationCatalog } from "../data/catalog/mei-pelle-presentation";
import {
  PRODUCT_COMMERCE_FIELDS,
  PRODUCT_EDITORIAL_FIELDS,
  PRODUCT_SUPPLIER_FIELDS,
} from "../lib/catalog/field-ownership";
import { EXPECTED_SUPABASE_PROJECT_REF } from "./catalog/canonical-catalog-manifest";
import {
  executeCatalogProductWritePlans,
  planSupplierProductWrite,
  requireEditorialOverwriteConfirmation,
  type CatalogProductWritePlan,
  type CatalogRow,
  type EditorialOverwriteTarget,
} from "./catalog/catalog-writer-policy";

config({ path: resolve(process.cwd(), ".env.local"), quiet: true });

const BUCKET = "mei-pelle-catalog";
const STORAGE_PREFIX = "products";

export type ImportOptions = {
  apply: boolean;
  overwriteEditorial: boolean;
  confirmedEditorialOverwrite: boolean;
  archiveMissing: boolean;
};

type ExistingProductRow = CatalogRow & {
  id: string;
  slug: string;
};

type ImportReport = {
  ok: true;
  dryRun: boolean;
  overwriteEditorial: boolean;
  productsMatched: number;
  rowsInserted: number;
  productRowsUpdated: number;
  sourceOwnedFieldsUpdated: Array<{ slug: string; fields: string[] }>;
  commerceFieldsUpdated: Array<{ slug: string; fields: string[] }>;
  editorialFieldsSeeded: Array<{ slug: string; fields: string[] }>;
  editorialFieldsSkipped: Array<{ slug: string; fields: string[] }>;
  editorialFieldsWouldOverwrite: Array<{ slug: string; fields: string[] }>;
  variantsAffected: Array<{ slug: string; rows: number }>;
  mediaAffected: Array<{
    slug: string;
    rowsInserted: number;
    rowsOverwritten: number;
    rowsSkipped: number;
  }>;
  sourcesAffected: number;
  archiveCandidates: string[];
  productsArchived: number;
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
      `[catalog-import] Refusing Supabase project "${projectRef}"; expected "${EXPECTED_SUPABASE_PROJECT_REF}".`,
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

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function safeFilename(filename: string): string {
  const extension = extname(filename).toLowerCase();
  const base = filename.slice(0, filename.length - extension.length);
  return `${slugify(base) || "image"}${extension || ".jpg"}`;
}

function fallbackContentType(filename: string): string {
  switch (extname(filename).toLowerCase()) {
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    default:
      return "image/jpeg";
  }
}

function sourceProductValues(product: LeadersCatalogProduct): CatalogRow {
  return {
    texture: product.texture,
    key_ingredients: product.keyIngredients,
    ingredients: product.ingredients,
    cautions: product.cautions,
    finish: product.finish,
    volume: product.volume,
    skin_types: product.skinTypes,
    concerns: product.concerns,
    usage_time: product.usageTime,
  };
}

function commerceProductValues(product: LeadersCatalogProduct): CatalogRow {
  return {
    currency: product.currency,
    status: product.status,
  };
}

function editorialProductValues(product: LeadersCatalogProduct): CatalogRow {
  return {
    display_name: product.actionName,
    formal_title: product.title,
    card_tagline: product.subtitle,
    product_type: product.productType,
    editorial_description: product.description,
    editorial_how_to_use: product.howToUse,
    benefits: product.benefits,
    made_for: product.skinTypes.join(", "),
    good_for: product.concerns.slice(0, 3).join(", "),
    badge: product.badge,
    formula_notes: [product.source.formulationVersionNotes],
    search_keywords: product.searchKeywords,
    seo_title: product.seoTitle,
    seo_description: product.seoDescription,
  };
}

function insertProductValues(
  product: LeadersCatalogProduct,
  productId: string,
): CatalogRow {
  const presentation = meiPellePresentationCatalog.find(
    (candidate) => candidate.slug === product.slug,
  );
  if (!presentation) {
    throw new Error(
      `[catalog-import] Missing canonical presentation for ${product.slug}.`,
    );
  }
  const routineGroup =
    presentation.collection === "The Core" ? "core" : "beyond_core";
  const routineStepNumber = presentation.routineNumber
    ? Number(presentation.routineNumber)
    : null;
  const beyondIndex = meiPellePresentationCatalog
    .filter((candidate) => candidate.collection === "Beyond The Core")
    .findIndex((candidate) => candidate.slug === product.slug);
  const createdAt = new Date(
    Date.parse(product.source.sourceInspectedAt) + product.sortOrder * 1000,
  ).toISOString();
  return {
    id: productId,
    slug: product.slug,
    catalog_status: product.catalogStatus,
    sort_order: product.sortOrder,
    routine_group: routineGroup,
    routine_step_number: routineStepNumber,
    routine_step_name: presentation.routineStep,
    routine_sort:
      routineGroup === "core"
        ? (routineStepNumber ?? 0) * 10
        : 100 + (beyondIndex + 1) * 10,
    swatch_from: product.swatchFrom,
    swatch_to: product.swatchTo,
    created_at: createdAt,
    published_at: product.catalogStatus === "active" ? createdAt : null,
    ...sourceProductValues(product),
    ...commerceProductValues(product),
    ...editorialProductValues(product),
  };
}

async function ensureBucket(supabase: SupabaseClient): Promise<void> {
  const { error } = await supabase.storage.updateBucket(BUCKET, {
    public: true,
    fileSizeLimit: "5242880",
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
  });
  if (!error) return;

  const { error: createError } = await supabase.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: "5242880",
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
  });
  if (createError && !/already exists/i.test(createError.message)) {
    throw new Error(
      `[catalog-import] Failed to prepare storage bucket: ${createError.message}`,
    );
  }
}

async function uploadMedia(
  supabase: SupabaseClient,
  product: LeadersCatalogProduct,
  media: LeadersCatalogProduct["media"][number],
) {
  const filename = safeFilename(media.sourceFilename);
  const path = `${STORAGE_PREFIX}/${product.slug}/${String(media.sortOrder).padStart(2, "0")}-${media.role}-${filename}`;
  const response = await fetch(media.sourceUrl);
  if (!response.ok) {
    throw new Error(
      `[catalog-import] Failed to download ${media.sourceUrl}: ${response.status} ${response.statusText}`,
    );
  }

  const contentType =
    response.headers.get("content-type")?.split(";")[0] ??
    fallbackContentType(media.sourceFilename);
  const body = Buffer.from(await response.arrayBuffer());
  const { error } = await supabase.storage.from(BUCKET).upload(path, body, {
    cacheControl: "31536000",
    contentType,
    upsert: true,
  });
  if (error) {
    throw new Error(`[catalog-import] Failed to upload ${path}: ${error.message}`);
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { ...media, publicUrl: data.publicUrl };
}

async function findExistingProduct(
  supabase: SupabaseClient,
  product: LeadersCatalogProduct,
): Promise<ExistingProductRow | null> {
  const fields = [
    "id",
    "slug",
    ...PRODUCT_SUPPLIER_FIELDS,
    ...PRODUCT_COMMERCE_FIELDS,
    ...PRODUCT_EDITORIAL_FIELDS,
  ];
  const { data, error } = await supabase
    .from("products")
    .select(fields.join(", "))
    .in("slug", [product.slug, ...(product.legacySlugs ?? [])])
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(
      `[catalog-import] Failed to inspect product ${product.slug}: ${error.message}`,
    );
  }
  return data ? (data as unknown as ExistingProductRow) : null;
}

async function findExistingVariantId(
  supabase: SupabaseClient,
  productId: string,
  variantKey: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("product_variants")
    .select("id")
    .eq("product_id", productId)
    .eq("variant_key", variantKey)
    .maybeSingle();
  if (error) {
    throw new Error(
      `[catalog-import] Failed to inspect variant ${productId}/${variantKey}: ${error.message}`,
    );
  }
  return typeof data?.id === "string" ? data.id : null;
}

async function readExistingMediaKeys(
  supabase: SupabaseClient,
  productId: string,
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("product_media")
    .select("role, sort_order")
    .eq("product_id", productId);
  if (error) {
    throw new Error(
      `[catalog-import] Failed to inspect media for ${productId}: ${error.message}`,
    );
  }
  return new Set(
    (data ?? []).map((row) => `${String(row.role)}:${String(row.sort_order)}`),
  );
}

async function upsertVariants(
  supabase: SupabaseClient,
  product: LeadersCatalogProduct,
  productId: string,
): Promise<void> {
  const rows = await Promise.all(
    product.variants.map(async (variant) => ({
      id:
        (await findExistingVariantId(
          supabase,
          productId,
          variant.key,
        )) ??
        deterministicUuid(
          `mei-pelle:variant:${product.slug}:${variant.key}`,
        ),
      product_id: productId,
      variant_key: variant.key,
      label: variant.label,
      price_cents: variant.priceCents,
      sku: variant.sku,
      supplier_variant_id: variant.supplierVariantId,
      option_values: variant.optionValues,
      compare_at_price_cents: variant.compareAtPriceCents,
      available: variant.available,
      inventory_status: variant.inventoryStatus,
      volume: variant.volume,
      pack_count: variant.packCount,
      sort_order: variant.sortOrder,
    })),
  );
  const { error } = await supabase.from("product_variants").upsert(rows, {
    onConflict: "product_id,variant_key",
  });
  if (error) {
    throw new Error(
      `[catalog-import] Failed to upsert variants for ${product.slug}: ${error.message}`,
    );
  }
}

async function upsertMedia(
  supabase: SupabaseClient,
  product: LeadersCatalogProduct,
  productId: string,
): Promise<void> {
  const uploaded = await Promise.all(
    product.media.map((media) => uploadMedia(supabase, product, media)),
  );
  const rows = uploaded.map((media) => ({
    product_id: productId,
    media_type: "image",
    url: media.publicUrl,
    alt: media.alt,
    width: media.width,
    height: media.height,
    role: media.role,
    sort_order: media.sortOrder,
    original_source_url: media.sourceUrl,
    source_filename: media.sourceFilename,
  }));
  const { error } = await supabase.from("product_media").upsert(rows, {
    onConflict: "product_id,role,sort_order",
  });
  if (error) {
    throw new Error(
      `[catalog-import] Failed to upsert media for ${product.slug}: ${error.message}`,
    );
  }
}

async function upsertSource(
  supabase: SupabaseClient,
  product: LeadersCatalogProduct,
  productId: string,
): Promise<void> {
  const { error } = await supabase.from("product_sources").upsert(
    {
      product_id: productId,
      supplier: product.source.supplier,
      supplier_title: product.source.supplierTitle,
      supplier_url: product.source.supplierUrl,
      supplier_handle: product.source.supplierHandle,
      supplier_product_id: product.source.supplierProductId,
      source_inspected_at: product.source.sourceInspectedAt,
      source_content_hash: product.source.sourceContentHash,
      original_source_price_cents: product.source.originalSourcePriceCents,
      formulation_version_notes: product.source.formulationVersionNotes,
      raw_source: {
        catalogProduct: {
          name: product.title,
          tagline: product.subtitle,
          subtitle: product.subtitle,
          descriptor: product.descriptor,
          blurb: product.blurb,
          description: product.description,
          howToUse: product.howToUse,
          productType: product.productType,
          texture: product.texture,
          keyIngredients: product.keyIngredients,
          ingredients: product.ingredients,
          productDetails: product.productDetails,
          cautions: product.cautions,
          finish: product.finish,
          volume: product.volume,
          skinTypes: product.skinTypes,
          concerns: product.concerns,
          usageTime: product.usageTime,
        },
        selectionReason: product.selectionReason,
        source: product.source,
        media: product.media.map(
          ({ sourceUrl, sourceFilename, role, sortOrder }) => ({
            sourceUrl,
            sourceFilename,
            role,
            sortOrder,
          }),
        ),
      },
    },
    { onConflict: "product_id" },
  );
  if (error) {
    throw new Error(
      `[catalog-import] Failed to upsert source for ${product.slug}: ${error.message}`,
    );
  }
}

async function readArchiveCandidates(
  supabase: SupabaseClient,
): Promise<Array<{ id: string; slug: string }>> {
  const selectedSlugs = new Set(
    leadersMeiPelleCatalog.map((product) => product.slug),
  );
  const { data, error } = await supabase
    .from("products")
    .select("id, slug")
    .eq("catalog_status", "active");
  if (error) {
    throw new Error(
      `[catalog-import] Failed to inspect active products: ${error.message}`,
    );
  }
  return (data ?? []).filter(
    (row): row is { id: string; slug: string } =>
      typeof row.id === "string" &&
      typeof row.slug === "string" &&
      !selectedSlugs.has(row.slug),
  );
}

function overwriteTargets(
  plans: readonly CatalogProductWritePlan[],
  mediaAffected: ImportReport["mediaAffected"],
): EditorialOverwriteTarget[] {
  return plans.flatMap((plan) => {
    const mediaRows =
      mediaAffected.find(
        (media) => media.slug === plan.slug,
      )?.rowsOverwritten ?? 0;
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

export function parseImportArgs(argv: string[]): ImportOptions {
  const apply = argv.includes("--apply") && !argv.includes("--dry-run");
  return {
    apply,
    overwriteEditorial: argv.includes("--overwrite-editorial"),
    confirmedEditorialOverwrite: argv.includes(
      "--confirm-editorial-overwrite",
    ),
    archiveMissing: argv.includes("--archive-missing"),
  };
}

export async function runCatalogImport(
  options: ImportOptions,
): Promise<ImportReport> {
  const supabase = createSupabaseAdminClient();
  const productStates = await Promise.all(
    leadersMeiPelleCatalog.map(async (product) => {
      const existing = await findExistingProduct(supabase, product);
      const productId =
        existing?.id ??
        deterministicUuid(`mei-pelle:product:${product.slug}`);
      const existingMediaKeys = existing
        ? await readExistingMediaKeys(supabase, productId)
        : new Set<string>();
      const plan = planSupplierProductWrite({
        slug: product.slug,
        existing,
        insert: insertProductValues(product, productId),
        source: sourceProductValues(product),
        commerce: commerceProductValues(product),
        editorial: editorialProductValues(product),
        overwriteEditorial: options.overwriteEditorial,
      });
      return { product, productId, plan, existingMediaKeys };
    }),
  );
  const plans = productStates.map(({ plan }) => plan);
  const archiveCandidates = await readArchiveCandidates(supabase);
  const mediaAffected: ImportReport["mediaAffected"] = productStates.map(
    ({ product, plan, existingMediaKeys }) => {
      const rowsOverwritten =
        !plan.insert && options.overwriteEditorial
          ? product.media.filter((media) =>
              existingMediaKeys.has(`${media.role}:${media.sortOrder}`),
            ).length
          : 0;
      const rowsInserted =
        plan.insert || options.overwriteEditorial
          ? product.media.length - rowsOverwritten
          : 0;
      return {
        slug: product.slug,
        rowsInserted,
        rowsOverwritten,
        rowsSkipped:
          plan.insert || options.overwriteEditorial ? 0 : product.media.length,
      };
    },
  );

  await requireEditorialOverwriteConfirmation({
    apply: options.apply,
    overwriteEditorial: options.overwriteEditorial,
    confirmedNonInteractive: options.confirmedEditorialOverwrite,
    targets: overwriteTargets(plans, mediaAffected),
  });

  const report: ImportReport = {
    ok: true,
    dryRun: !options.apply,
    overwriteEditorial: options.overwriteEditorial,
    productsMatched: leadersMeiPelleCatalog.length,
    rowsInserted: plans.filter((plan) => plan.insert).length,
    productRowsUpdated: plans.filter(
      (plan) => Object.keys(plan.update).length > 0,
    ).length,
    sourceOwnedFieldsUpdated: plans.map((plan) => ({
      slug: plan.slug,
      fields: plan.sourceOwnedFieldsUpdated,
    })),
    commerceFieldsUpdated: plans.map((plan) => ({
      slug: plan.slug,
      fields: plan.commerceFieldsUpdated,
    })),
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
    variantsAffected: productStates.map(({ product }) => ({
      slug: product.slug,
      rows: product.variants.length,
    })),
    mediaAffected,
    sourcesAffected: productStates.length,
    archiveCandidates: archiveCandidates.map((product) => product.slug),
    productsArchived:
      options.apply && options.archiveMissing ? archiveCandidates.length : 0,
    errors: [],
  };
  if (!options.apply) return report;

  await executeCatalogProductWritePlans({
    apply: true,
    plans,
    insert: async (row) => {
      const { error } = await supabase.from("products").insert(row);
      if (error) {
        throw new Error(
          `[catalog-import] Failed to insert product: ${error.message}`,
        );
      }
    },
    update: async (id, row) => {
      const { error } = await supabase
        .from("products")
        .update(row)
        .eq("id", id);
      if (error) {
        throw new Error(
          `[catalog-import] Failed to update product ${id}: ${error.message}`,
        );
      }
    },
  });

  const writesMedia = mediaAffected.some(
    (media) => media.rowsInserted > 0 || media.rowsOverwritten > 0,
  );
  if (writesMedia) await ensureBucket(supabase);
  for (const state of productStates) {
    await upsertVariants(supabase, state.product, state.productId);
    await upsertSource(supabase, state.product, state.productId);
    const media = mediaAffected.find(
      (entry) => entry.slug === state.product.slug,
    );
    if (
      media &&
      (media.rowsInserted > 0 || media.rowsOverwritten > 0)
    ) {
      await upsertMedia(supabase, state.product, state.productId);
    }
  }

  if (options.archiveMissing && archiveCandidates.length > 0) {
    const { error } = await supabase
      .from("products")
      .update({ catalog_status: "archived" })
      .in("id", archiveCandidates.map((product) => product.id));
    if (error) {
      throw new Error(
        `[catalog-import] Failed to archive missing products: ${error.message}`,
      );
    }
  }
  return report;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runCatalogImport(parseImportArgs(process.argv.slice(2)))
    .then((report) => console.log(JSON.stringify(report, null, 2)))
    .catch((error) => {
      console.error(
        JSON.stringify(
          {
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : "Unknown catalog import error",
            errors: [
              error instanceof Error
                ? error.message
                : "Unknown catalog import error",
            ],
          },
          null,
          2,
        ),
      );
      process.exitCode = 1;
    });
}
