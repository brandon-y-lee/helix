// Catalog → Algolia sync dispatch + webhook auth. Pure orchestration over the
// source reader and write client so it is unit-testable by mocking those two
// modules. Supabase remains the source of truth; on any change we rebuild the
// affected product's record from Supabase and upsert it (or delete it).

import { timingSafeEqual } from "node:crypto";
import {
  fetchSearchRecordById,
  fetchSearchRecordsByFamilyId,
} from "@/lib/algolia/source";
import { upsertSearchRecord, deleteSearchRecord } from "@/lib/algolia/server";

/** Header carrying the shared secret on Supabase Database Webhook requests. */
export const WEBHOOK_SECRET_HEADER = "x-webhook-secret";

const PRODUCTS_TABLE = "products";
const VARIANTS_TABLE = "product_variants";
const MEDIA_TABLE = "product_media";
const PDP_CONTENT_TABLE = "product_pdp_content";
const SLUG_ROUTES_TABLE = "product_slug_routes";
const PRODUCT_FAMILIES_TABLE = "product_families";
const PRODUCT_FAMILY_MEMBERSHIPS_TABLE = "product_family_memberships";
const ALLOWED_TABLES = [
  PRODUCTS_TABLE,
  VARIANTS_TABLE,
  MEDIA_TABLE,
  PDP_CONTENT_TABLE,
  SLUG_ROUTES_TABLE,
  PRODUCT_FAMILIES_TABLE,
  PRODUCT_FAMILY_MEMBERSHIPS_TABLE,
] as const;
const ALLOWED_EVENTS = ["INSERT", "UPDATE", "DELETE"] as const;
const PDP_ONLY_MEDIA_ROLES = new Set([
  "gallery",
  "routine_video",
  "routine_video_poster",
  "profile_editorial",
  "ingredients_texture",
  "core_routine_texture",
  "core_routine_editorial",
  "pdp_outcome",
  "pdp_application",
]);

type WebhookEventType = "INSERT" | "UPDATE" | "DELETE";

export type CatalogWebhookPayload = {
  type: WebhookEventType;
  table: string;
  schema?: string;
  record?: Record<string, unknown> | null;
  old_record?: Record<string, unknown> | null;
};

export type SyncOutcome = {
  action: "upsert" | "delete" | "noop";
  table: string;
  objectID?: string;
  slug?: string;
  oldSlug?: string;
  routineGroup?: string;
  oldRoutineGroup?: string;
  reason?: string;
  affectedProducts?: Array<{
    id: string;
    slug: string;
    routineGroup: string;
  }>;
};

export class CatalogWebhookValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CatalogWebhookValidationError";
  }
}

/**
 * Constant-time comparison of the provided secret against the configured one.
 * Returns false (never throws) when the env secret is missing or the values
 * differ, so callers can return 401 uniformly.
 */
export function verifyWebhookSecret(provided: string | null | undefined): boolean {
  const expected = process.env.SUPABASE_CATALOG_WEBHOOK_SECRET;
  if (!expected || !provided) return false;

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function asId(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asRole(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function mediaEventOnlyAffectsPdp(
  payload: Pick<CatalogWebhookPayload, "table" | "record" | "old_record">,
): boolean {
  if (payload.table !== MEDIA_TABLE) return false;
  const roles = [
    asRole(payload.record?.role),
    asRole(payload.old_record?.role),
  ].filter((role): role is string => Boolean(role));
  return roles.length > 0 && roles.every((role) => PDP_ONLY_MEDIA_ROLES.has(role));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function validateCatalogWebhookPayload(
  payload: unknown,
): asserts payload is CatalogWebhookPayload {
  if (!isRecord(payload)) {
    throw new CatalogWebhookValidationError("payload must be an object");
  }
  if (payload.schema !== undefined && payload.schema !== "public") {
    throw new CatalogWebhookValidationError("unsupported schema");
  }
  if (
    typeof payload.type !== "string" ||
    !(ALLOWED_EVENTS as readonly string[]).includes(payload.type)
  ) {
    throw new CatalogWebhookValidationError("unsupported event type");
  }
  if (
    typeof payload.table !== "string" ||
    !(ALLOWED_TABLES as readonly string[]).includes(payload.table)
  ) {
    throw new CatalogWebhookValidationError("unsupported table");
  }
  if (payload.type === "INSERT" && !isRecord(payload.record)) {
    throw new CatalogWebhookValidationError("INSERT requires record");
  }
  if (payload.type === "UPDATE" && (!isRecord(payload.record) || !isRecord(payload.old_record))) {
    throw new CatalogWebhookValidationError("UPDATE requires record and old_record");
  }
  if (payload.type === "DELETE" && !isRecord(payload.old_record)) {
    throw new CatalogWebhookValidationError("DELETE requires old_record");
  }
}

/**
 * Apply one Supabase Database Webhook event to the Algolia index.
 *
 * - products INSERT/UPDATE → rebuild from Supabase + upsert
 * - products DELETE        → delete by old_record.id
 * - variants/media INSERT/UPDATE/DELETE → rebuild parent product (or delete if
 *   the parent no longer exists, e.g. cascade delete)
 */
export async function applyCatalogWebhookEvent(
  payload: CatalogWebhookPayload,
): Promise<SyncOutcome> {
  const { type, table, record, old_record } = payload;

  if (table === PRODUCTS_TABLE) {
    if (type === "DELETE") {
      const id = asId(old_record?.id);
      if (!id) return { action: "noop", table, reason: "delete without old_record.id" };
      await deleteSearchRecord(id);
      return {
        action: "delete",
        table,
        objectID: id,
        slug: asId(old_record?.slug),
        oldSlug: asId(old_record?.slug),
        routineGroup: asId(old_record?.routine_group),
        oldRoutineGroup: asId(old_record?.routine_group),
      };
    }

    const id = asId(record?.id);
    if (!id) return { action: "noop", table, reason: "missing record.id" };

    const built = await fetchSearchRecordById(id);
    if (!built) {
      await deleteSearchRecord(id);
      return {
        action: "delete",
        table,
        objectID: id,
        slug: asId(record?.slug) ?? asId(old_record?.slug),
        oldSlug: asId(old_record?.slug),
        routineGroup:
          asId(record?.routine_group) ?? asId(old_record?.routine_group),
        oldRoutineGroup: asId(old_record?.routine_group),
        reason: "product no longer public",
      };
    }

    await upsertSearchRecord(built);
    return {
      action: "upsert",
      table,
      objectID: id,
      slug: built.slug,
      oldSlug: asId(old_record?.slug),
      routineGroup: built.routineGroup,
      oldRoutineGroup: asId(old_record?.routine_group),
    };
  }

  if (table === VARIANTS_TABLE || table === MEDIA_TABLE) {
    const productId = asId(record?.product_id) ?? asId(old_record?.product_id);
    if (!productId) {
      return { action: "noop", table, reason: "variant event without product_id" };
    }

    const built = await fetchSearchRecordById(productId);
    if (!built) {
      // Parent product is gone (likely a cascade delete) — drop its record.
      await deleteSearchRecord(productId);
      return { action: "delete", table, objectID: productId, reason: "parent missing" };
    }

    if (table === MEDIA_TABLE && mediaEventOnlyAffectsPdp(payload)) {
      return {
        action: "noop",
        table,
        objectID: productId,
        slug: built.slug,
        routineGroup: built.routineGroup,
        reason: "PDP-only media role is not indexed",
      };
    }

    await upsertSearchRecord(built);
    return {
      action: "upsert",
      table,
      objectID: productId,
      slug: built.slug,
      routineGroup: built.routineGroup,
    };
  }

  if (table === PRODUCT_FAMILY_MEMBERSHIPS_TABLE) {
    const productIds = [
      asId(record?.product_id),
      asId(old_record?.product_id),
    ].filter((id): id is string => Boolean(id));
    const uniqueProductIds = [...new Set(productIds)];
    if (uniqueProductIds.length === 0) {
      return {
        action: "noop",
        table,
        reason: "family membership event without product_id",
      };
    }

    const affectedProducts: NonNullable<SyncOutcome["affectedProducts"]> = [];
    for (const productId of uniqueProductIds) {
      const built = await fetchSearchRecordById(productId);
      if (!built) {
        await deleteSearchRecord(productId);
        continue;
      }
      await upsertSearchRecord(built);
      affectedProducts.push({
        id: built.productId,
        slug: built.slug,
        routineGroup: built.routineGroup,
      });
    }
    const first = affectedProducts[0];
    return {
      action: first ? "upsert" : "delete",
      table,
      objectID: first?.id ?? uniqueProductIds[0],
      slug: first?.slug,
      routineGroup: first?.routineGroup,
      affectedProducts,
    };
  }

  if (table === PRODUCT_FAMILIES_TABLE) {
    const familyId = asId(record?.id) ?? asId(old_record?.id);
    if (!familyId) {
      return {
        action: "noop",
        table,
        reason: "family event without id",
      };
    }
    if (type === "DELETE") {
      return {
        action: "noop",
        table,
        reason: "family deletion is synchronized by membership cascades",
      };
    }
    const records = await fetchSearchRecordsByFamilyId(familyId);
    for (const built of records) await upsertSearchRecord(built);
    const affectedProducts = records.map((built) => ({
      id: built.productId,
      slug: built.slug,
      routineGroup: built.routineGroup,
    }));
    return {
      action: records.length ? "upsert" : "noop",
      table,
      objectID: records[0]?.productId,
      slug: records[0]?.slug,
      routineGroup: records[0]?.routineGroup,
      affectedProducts,
      reason: records.length ? undefined : "family has no public members",
    };
  }

  if (table === SLUG_ROUTES_TABLE) {
    const productId =
      asId(record?.target_product_id) ?? asId(old_record?.target_product_id);
    const sourceSlug =
      asId(record?.source_slug) ?? asId(old_record?.source_slug);
    if (!productId) {
      return {
        action: "noop",
        table,
        oldSlug: sourceSlug,
        reason: "slug route event without target_product_id",
      };
    }

    const built = await fetchSearchRecordById(productId);
    if (!built) {
      await deleteSearchRecord(productId);
      return {
        action: "delete",
        table,
        objectID: productId,
        oldSlug: sourceSlug,
        reason: "target product no longer public",
      };
    }

    await upsertSearchRecord(built);
    return {
      action: "upsert",
      table,
      objectID: productId,
      slug: built.slug,
      oldSlug: sourceSlug,
      routineGroup: built.routineGroup,
    };
  }

  if (table === PDP_CONTENT_TABLE) {
    const productId = asId(record?.product_id) ?? asId(old_record?.product_id);
    if (!productId) {
      return {
        action: "noop",
        table,
        reason: "PDP content event without product_id",
      };
    }

    const built = await fetchSearchRecordById(productId);
    return {
      action: "noop",
      table,
      objectID: productId,
      slug: built?.slug,
      routineGroup: built?.routineGroup,
      reason: "PDP content is not indexed",
    };
  }

  return { action: "noop", table, reason: `unhandled table "${table}"` };
}
