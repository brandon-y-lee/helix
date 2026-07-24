// Catalog → Algolia sync dispatch + webhook auth. Pure orchestration over the
// source reader and write client so it is unit-testable by mocking those two
// modules. Supabase remains the source of truth; on any change we rebuild the
// affected product's record from Supabase and upsert it (or delete it).

import { timingSafeEqual } from "node:crypto";
import { fetchSearchRecordById } from "@/lib/algolia/source";
import { upsertSearchRecord, deleteSearchRecord } from "@/lib/algolia/server";

/** Header carrying the shared secret on Supabase Database Webhook requests. */
export const WEBHOOK_SECRET_HEADER = "x-webhook-secret";

const PRODUCTS_TABLE = "products";
const VARIANTS_TABLE = "product_variants";
const MEDIA_TABLE = "product_media";
const ALLOWED_TABLES = [PRODUCTS_TABLE, VARIANTS_TABLE, MEDIA_TABLE] as const;
const ALLOWED_EVENTS = ["INSERT", "UPDATE", "DELETE"] as const;
const EDITORIAL_MEDIA_ROLES = new Set([
  "routine_video",
  "routine_video_poster",
  "profile_editorial",
  "ingredients_texture",
]);

export type WebhookEventType = "INSERT" | "UPDATE" | "DELETE";

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
  collection?: string;
  oldCollection?: string;
  reason?: string;
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
  return roles.length > 0 && roles.every((role) => EDITORIAL_MEDIA_ROLES.has(role));
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
        collection: asId(old_record?.collection),
        oldCollection: asId(old_record?.collection),
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
        collection: asId(record?.collection) ?? asId(old_record?.collection),
        oldCollection: asId(old_record?.collection),
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
      collection: built.collection,
      oldCollection: asId(old_record?.collection),
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
        collection: built.collection,
        reason: "PDP-only media role is not indexed",
      };
    }

    await upsertSearchRecord(built);
    return {
      action: "upsert",
      table,
      objectID: productId,
      slug: built.slug,
      collection: built.collection,
    };
  }

  return { action: "noop", table, reason: `unhandled table "${table}"` };
}
