import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import {
  meiPellePresentationCatalog,
  presentationMediaForProduct,
} from "../data/catalog/mei-pelle-presentation";

config({ path: resolve(process.cwd(), ".env.local"), quiet: true });

type RefreshReport = {
  productsRead: number;
  productsUpdated: number;
  mediaRowsAdded: number;
  mediaRowsArchived: number;
  palettesCreated: number;
  skipped: string[];
  failed: number;
  backupPath: string;
};

type ProductRow = {
  id: string;
  slug: string;
  name: string;
  catalog_status: string;
};

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function deterministicUuid(seed: string): string {
  const bytes = Buffer.from(createHash("sha256").update(seed).digest().subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
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

function assertHexPalette(value: Record<string, string>) {
  const hex = /^#[0-9a-f]{6}$/i;
  const required = ["start", "end", "accent", "surface", "ink", "highlight"];
  for (const key of required) {
    if (!hex.test(value[key] ?? "")) {
      throw new Error(`Invalid palette value for "${key}": ${value[key] ?? "<missing>"}`);
    }
  }
}

async function readActiveProducts(): Promise<ProductRow[]> {
  const { data, error } = await supabase
    .from("products")
    .select("id, slug, name, catalog_status")
    .in(
      "slug",
      meiPellePresentationCatalog.map((product) => product.slug),
    )
    .eq("catalog_status", "active");

  if (error) throw new Error(`[presentation-refresh] Failed to read products: ${error.message}`);
  return (data ?? []) as ProductRow[];
}

async function backupPresentationData(productIds: string[]): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = "/private/tmp/mei-pelle-catalog-backups";
  if (!existsSync(backupDir)) mkdirSync(backupDir, { recursive: true });

  const [products, variants, media, relationships] = await Promise.all([
    supabase
      .from("products")
      .select(
        "id, slug, name, display_name, formal_title, tagline, subtitle, descriptor, card_tagline, editorial_description, editorial_how_to_use, product_type, collection, routine_number, routine_step, blurb, description, how_to_use, swatch_from, swatch_to, featured_rank, sort_order, search_keywords, formula_notes, seo_title, seo_description, updated_at",
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
        "id, product_id, media_type, media_kind, url, alt, width, height, role, sort_order, palette_id, placeholder_palette, original_source_url, source_filename, updated_at",
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
      throw new Error(`[presentation-refresh] Failed to backup ${label}: ${result.error.message}`);
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

async function replaceMediaRows(productRows: ProductRow[]): Promise<{
  added: number;
  archived: number;
  palettes: number;
}> {
  const productIds = productRows.map((product) => product.id);
  const { data: removed, error: deleteError } = await supabase
    .from("product_media")
    .delete()
    .in("product_id", productIds)
    .select("id");

  if (deleteError) {
    throw new Error(`[presentation-refresh] Failed to replace product media: ${deleteError.message}`);
  }

  const bySlug = new Map(productRows.map((row) => [row.slug, row]));
  const rows = meiPellePresentationCatalog.flatMap((product) => {
    const row = bySlug.get(product.slug);
    if (!row) return [];

    return presentationMediaForProduct(product).map((media) => {
      assertHexPalette(media.palette);
      return {
        id: deterministicUuid(`mei-pelle:media:${product.slug}:${media.role}:${media.sortOrder}`),
        product_id: row.id,
        media_type: "image",
        media_kind: "placeholder",
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

  if (rows.length === 0) {
    return { added: 0, archived: removed?.length ?? 0, palettes: 0 };
  }

  const { error } = await supabase.from("product_media").insert(rows);
  if (error) throw new Error(`[presentation-refresh] Failed to insert placeholder media: ${error.message}`);

  return {
    added: rows.length,
    archived: removed?.length ?? 0,
    palettes: new Set(rows.map((row) => row.palette_id)).size,
  };
}

async function updateProducts(productRows: ProductRow[]): Promise<{
  updated: number;
  skipped: string[];
}> {
  const bySlug = new Map(productRows.map((row) => [row.slug, row]));
  const skipped: string[] = [];
  let updated = 0;

  for (const product of meiPellePresentationCatalog) {
    const row = bySlug.get(product.slug);
    if (!row) {
      skipped.push(product.slug);
      continue;
    }

    const { error } = await supabase
      .from("products")
      .update({
        name: product.displayName,
        display_name: product.displayName,
        formal_title: product.formalTitle,
        tagline: product.cardTagline,
        subtitle: product.productType,
        descriptor: product.editorialDescription,
        card_tagline: product.cardTagline,
        editorial_description: product.editorialDescription,
        editorial_how_to_use: product.editorialHowToUse,
        action_name: product.displayName,
        routine_number: product.routineNumber,
        routine_step: product.routineStep,
        product_type: product.productType,
        collection: product.collection,
        badge: null,
        blurb: product.cardTagline,
        description: product.editorialDescription,
        how_to_use: product.editorialHowToUse,
        formula_notes: product.formulaNotes,
        search_keywords: product.searchKeywords,
        seo_title: `${product.formalTitle} | Mei Pelle`,
        seo_description: product.editorialDescription,
      })
      .eq("id", row.id);

    if (error) {
      throw new Error(`[presentation-refresh] Failed to update ${product.slug}: ${error.message}`);
    }
    updated += 1;
  }

  return { updated, skipped };
}

async function run(): Promise<RefreshReport> {
  const productRows = await readActiveProducts();
  const backupPath = await backupPresentationData(productRows.map((product) => product.id));
  const productUpdate = await updateProducts(productRows);
  const mediaUpdate = await replaceMediaRows(productRows);

  return {
    productsRead: productRows.length,
    productsUpdated: productUpdate.updated,
    mediaRowsAdded: mediaUpdate.added,
    mediaRowsArchived: mediaUpdate.archived,
    palettesCreated: mediaUpdate.palettes,
    skipped: productUpdate.skipped,
    failed: 0,
    backupPath,
  };
}

try {
  const report = await run();
  console.log(JSON.stringify({ ok: true, ...report }, null, 2));
} catch (error) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown presentation refresh error",
        failed: 1,
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
}
