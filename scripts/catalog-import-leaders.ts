import { createHash } from "node:crypto";
import { extname, resolve } from "node:path";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import {
  leadersMeiPelleCatalog,
  type LeadersCatalogProduct,
} from "../data/catalog/leaders-mei-pelle-source";
import { productRoutineForSlug } from "../lib/catalog/product-routine";

config({ path: resolve(process.cwd(), ".env.local"), quiet: true });

const BUCKET = "mei-pelle-catalog";
const STORAGE_PREFIX = "products";

type ImportReport = {
  read: number;
  productsUpserted: number;
  variantsUpserted: number;
  collectionsUpserted: number;
  mediaUploaded: number;
  mediaRowsUpserted: number;
  sourcesUpserted: number;
  relationshipsUpserted: number;
  archivedProducts: number;
  skipped: number;
  failed: number;
};

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

const supabase = createClient(
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

function deterministicUuid(seed: string): string {
  const bytes = Buffer.from(createHash("sha256").update(seed).digest().subarray(0, 16));
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

async function ensureBucket() {
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
    throw new Error(`[catalog-import] Failed to prepare storage bucket: ${createError.message}`);
  }
}

async function uploadMedia(product: LeadersCatalogProduct, media: LeadersCatalogProduct["media"][number]) {
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
  return { ...media, storagePath: path, publicUrl: data.publicUrl };
}

async function findExistingProductId(slug: string, legacySlugs: readonly string[] = []): Promise<string | null> {
  const slugs = [slug, ...legacySlugs];
  const { data, error } = await supabase
    .from("products")
    .select("id")
    .in("slug", slugs)
    .limit(1);

  if (error) throw new Error(`[catalog-import] Failed to inspect product ${slug}: ${error.message}`);
  const row = (data ?? [])[0];
  return typeof row?.id === "string" ? row.id : null;
}

async function findExistingVariantId(productId: string, variantKey: string): Promise<string | null> {
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

async function upsertCollections(products: readonly LeadersCatalogProduct[]): Promise<number> {
  const names = [
    ...new Set(
      products.map(
        (product) =>
          productRoutineForSlug(product.slug)?.routineGroupLabel ??
          product.collection,
      ),
    ),
  ];
  const rows = names.map((name, index) => ({
    slug: slugify(name),
    name,
    description:
      name === "The Core"
        ? "The core Mei Pelle routine."
        : "Targeted steps beyond the daily core.",
    sort_order: index,
    is_active: true,
  }));

  const { error } = await supabase.from("collections").upsert(rows, {
    onConflict: "slug",
  });

  if (error) throw new Error(`[catalog-import] Failed to upsert collections: ${error.message}`);
  return rows.length;
}

async function upsertProduct(product: LeadersCatalogProduct, productId: string) {
  const createdAt = new Date(
    Date.parse(product.source.sourceInspectedAt) + product.sortOrder * 1000,
  ).toISOString();
  const routine = productRoutineForSlug(product.slug);

  const row = {
    id: productId,
    slug: product.slug,
    name: product.title,
    tagline: product.subtitle,
    collection: routine?.routineGroupLabel ?? product.collection,
    action_name: product.actionName,
    routine_number: routine?.routineStepNumber
      ? String(routine.routineStepNumber).padStart(2, "0")
      : null,
    routine_group: routine?.routineGroup ?? null,
    routine_group_label: routine?.routineGroupLabel ?? null,
    routine_step_number: routine?.routineStepNumber ?? null,
    routine_step_name: routine?.routineStepName ?? null,
    routine_display_label: routine?.routineDisplayLabel ?? null,
    routine_sort: routine?.routineSort ?? null,
    legacy_routine_group_label: routine?.legacyRoutineGroupLabel ?? null,
    legacy_routine_display_label: routine?.legacyRoutineDisplayLabel ?? null,
    subtitle: product.subtitle,
    descriptor: product.descriptor,
    product_type: product.productType,
    catalog_status: product.catalogStatus,
    badge: product.badge,
    currency: product.currency,
    featured_rank: product.featuredRank,
    sort_order: product.sortOrder,
    blurb: product.blurb,
    description: product.description,
    benefits: product.benefits,
    how_to_use: product.howToUse,
    swatch_from: product.swatchFrom,
    swatch_to: product.swatchTo,
    status: product.status,
    made_for: product.skinTypes.join(", "),
    good_for: product.concerns.slice(0, 3).join(", "),
    texture: product.texture,
    key_ingredients: product.keyIngredients,
    ingredients: product.ingredients,
    product_details: product.productDetails,
    cautions: product.cautions,
    finish: product.finish,
    volume: product.volume,
    skin_types: product.skinTypes,
    concerns: product.concerns,
    routine_step: routine?.routineStepName ?? null,
    routine_order: product.routineOrder,
    usage_time: product.usageTime,
    seo_title: product.seoTitle,
    seo_description: product.seoDescription,
    search_keywords: product.searchKeywords,
    position: product.sortOrder,
    created_at: createdAt,
    published_at: product.catalogStatus === "active" ? createdAt : null,
  };

  const { error } = await supabase.from("products").upsert(row, {
    onConflict: "slug",
  });

  if (error) throw new Error(`[catalog-import] Failed to upsert ${product.slug}: ${error.message}`);
}

async function upsertVariants(product: LeadersCatalogProduct, productId: string): Promise<number> {
  const rows = await Promise.all(
    product.variants.map(async (variant) => ({
      id:
        (await findExistingVariantId(productId, variant.key)) ??
        deterministicUuid(`mei-pelle:variant:${product.slug}:${variant.key}`),
      product_id: productId,
      variant_key: variant.key,
      label: variant.label,
      price_cents: variant.priceCents,
      position: variant.sortOrder,
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

  if (error) throw new Error(`[catalog-import] Failed to upsert variants for ${product.slug}: ${error.message}`);
  return rows.length;
}

async function upsertMedia(
  product: LeadersCatalogProduct,
  productId: string,
): Promise<{ uploaded: number; rows: number }> {
  const uploaded = await Promise.all(product.media.map((media) => uploadMedia(product, media)));
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

  if (error) throw new Error(`[catalog-import] Failed to upsert media for ${product.slug}: ${error.message}`);
  return { uploaded: uploaded.length, rows: rows.length };
}

async function upsertSource(product: LeadersCatalogProduct, productId: string) {
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
        selectionReason: product.selectionReason,
        source: product.source,
        media: product.media.map(({ sourceUrl, sourceFilename, role, sortOrder }) => ({
          sourceUrl,
          sourceFilename,
          role,
          sortOrder,
        })),
      },
    },
    { onConflict: "product_id" },
  );

  if (error) throw new Error(`[catalog-import] Failed to upsert source for ${product.slug}: ${error.message}`);
}

async function upsertRelationships(productIds: Map<string, string>): Promise<number> {
  const products = leadersMeiPelleCatalog
    .slice()
    .sort(
      (a, b) =>
        (productRoutineForSlug(a.slug)?.routineSort ?? a.routineOrder) -
        (productRoutineForSlug(b.slug)?.routineSort ?? b.routineOrder),
    );

  const rows = products.flatMap((product) => {
    const productId = productIds.get(product.slug);
    if (!productId) return [];

    const related = products
      .filter((candidate) => candidate.slug !== product.slug)
      .sort((a, b) => {
        const productSort =
          productRoutineForSlug(product.slug)?.routineSort ?? product.routineOrder;
        const aSort = productRoutineForSlug(a.slug)?.routineSort ?? a.routineOrder;
        const bSort = productRoutineForSlug(b.slug)?.routineSort ?? b.routineOrder;
        const aAfter = aSort > productSort ? 0 : 1;
        const bAfter = bSort > productSort ? 0 : 1;
        return aAfter - bAfter || aSort - bSort;
      })
      .slice(0, 5);

    return related.map((candidate, index) => ({
      product_id: productId,
      related_product_id: productIds.get(candidate.slug),
      relationship_type: "complete_the_routine",
      sort_order: index,
    }));
  }).filter((row): row is {
    product_id: string;
    related_product_id: string;
    relationship_type: "complete_the_routine";
    sort_order: number;
  } => Boolean(row.related_product_id));

  const { error } = await supabase.from("product_relationships").upsert(rows, {
    onConflict: "product_id,related_product_id,relationship_type",
  });

  if (error) throw new Error(`[catalog-import] Failed to upsert routine relationships: ${error.message}`);
  return rows.length;
}

async function archiveOldProducts(selectedSlugs: string[]): Promise<number> {
  const { data, error } = await supabase
    .from("products")
    .select("id, slug")
    .eq("catalog_status", "active");

  if (error) throw new Error(`[catalog-import] Failed to inspect active products: ${error.message}`);

  const ids = (data ?? [])
    .filter((row) => typeof row.id === "string" && !selectedSlugs.includes(String(row.slug)))
    .map((row) => row.id as string);

  if (ids.length === 0) return 0;

  const { error: updateError } = await supabase
    .from("products")
    .update({ catalog_status: "archived" })
    .in("id", ids);

  if (updateError) throw new Error(`[catalog-import] Failed to archive old products: ${updateError.message}`);
  return ids.length;
}

async function run(): Promise<ImportReport> {
  const report: ImportReport = {
    read: leadersMeiPelleCatalog.length,
    productsUpserted: 0,
    variantsUpserted: 0,
    collectionsUpserted: 0,
    mediaUploaded: 0,
    mediaRowsUpserted: 0,
    sourcesUpserted: 0,
    relationshipsUpserted: 0,
    archivedProducts: 0,
    skipped: 0,
    failed: 0,
  };

  await ensureBucket();
  report.collectionsUpserted = await upsertCollections(leadersMeiPelleCatalog);

  const productIds = new Map<string, string>();
  for (const product of leadersMeiPelleCatalog) {
    const productId =
      (await findExistingProductId(product.slug, product.legacySlugs)) ??
      deterministicUuid(`mei-pelle:product:${product.slug}`);

    await upsertProduct(product, productId);
    report.productsUpserted += 1;
    productIds.set(product.slug, productId);

    report.variantsUpserted += await upsertVariants(product, productId);

    const media = await upsertMedia(product, productId);
    report.mediaUploaded += media.uploaded;
    report.mediaRowsUpserted += media.rows;

    await upsertSource(product, productId);
    report.sourcesUpserted += 1;
  }

  report.relationshipsUpserted = await upsertRelationships(productIds);
  report.archivedProducts = await archiveOldProducts(
    leadersMeiPelleCatalog.map((product) => product.slug),
  );

  return report;
}

try {
  const report = await run();
  console.log(JSON.stringify({ ok: true, ...report }, null, 2));
} catch (error) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown catalog import error",
        failed: 1,
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
}
