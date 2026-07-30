import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { CATALOG_MEDIA_BUCKET } from "@/lib/admin/catalog/media";
import { CatalogAdminError, catalogErrorStatus } from "@/lib/admin/catalog/errors";
import {
  decodeCatalogGridCursor,
  encodeCatalogGridCursor,
  parseCatalogGridLimit,
  parseCatalogGridSort,
} from "@/lib/admin/catalog/pagination";
import {
  assertProductEditorDocumentStructure,
  assertValidProductEditorDocument,
  validateProductEditorDocument,
} from "@/lib/admin/catalog/validation";
import type {
  CatalogDraftRecord,
  CatalogGridRow,
  CatalogPublishSuccess,
  CatalogRevisionRecord,
  CatalogRpcConflict,
  ProductEditorDocumentV1,
  CatalogValidationIssue,
} from "@/lib/admin/catalog/types";
import type { CatalogAdminAccess } from "@/lib/admin/catalog/capabilities";

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertRpcResult<T extends JsonRecord>(
  data: unknown,
  callerDocument?: ProductEditorDocumentV1,
): T {
  if (!isRecord(data)) {
    throw new CatalogAdminError(
      "invalid_catalog_response",
      "The catalog database returned an invalid response.",
      503,
    );
  }
  if (data.ok === false && typeof data.code === "string") {
    throw new CatalogAdminError(
      data.code,
      "The catalog operation could not be completed.",
      catalogErrorStatus(data.code),
      {
        ...data,
        callerDocument,
      },
    );
  }
  return data as T;
}

function throwDatabaseError(error: { message: string; code?: string } | null): never {
  const notFound = error?.code === "P0002";
  throw new CatalogAdminError(
    notFound ? "catalog_record_not_found" : "catalog_database_error",
    notFound ? "The requested catalog record was not found." : "The catalog operation failed.",
    notFound ? 404 : 503,
  );
}

async function pendingMediaValidationIssues(
  document: ProductEditorDocumentV1,
): Promise<CatalogValidationIssue[]> {
  const pending = document.media
    .map((media, index) => ({ media, index }))
    .filter(
      (
        entry,
      ): entry is typeof entry & {
        media: typeof entry.media & {
          pendingUpload: NonNullable<typeof entry.media.pendingUpload>;
        };
      } => Boolean(entry.media.pendingUpload),
    );
  if (pending.length === 0) return [];

  const admin = createSupabaseAdminClient();
  const { data: auditRows, error: auditError } = await admin
    .from("catalog_editor_audit_log")
    .select("actor_id, metadata")
    .eq("action", "media.uploaded")
    .eq("product_id", document.productId);
  if (auditError) throwDatabaseError(auditError);

  const directories = new Map<string, Set<string>>();
  for (const { media } of pending) {
    const path = media.pendingUpload.path;
    const separator = path.lastIndexOf("/");
    const directory = path.slice(0, separator);
    const filename = path.slice(separator + 1);
    const names = directories.get(directory) ?? new Set<string>();
    names.add(filename);
    directories.set(directory, names);
  }

  const storedObjects = new Set<string>();
  await Promise.all(
    [...directories.entries()].map(async ([directory, filenames]) => {
      const { data, error } = await admin.storage
        .from(CATALOG_MEDIA_BUCKET)
        .list(directory, { limit: 1000 });
      if (error) {
        throw new CatalogAdminError(
          "media_verification_failed",
          "Staged media could not be verified.",
          503,
        );
      }
      for (const object of data ?? []) {
        if (filenames.has(object.name)) {
          storedObjects.add(`${directory}/${object.name}`);
        }
      }
    }),
  );

  const issues: CatalogValidationIssue[] = [];
  for (const { media, index } of pending) {
    const upload = media.pendingUpload;
    const audited = (auditRows ?? []).some((row) => {
      if (!isRecord(row.metadata)) return false;
      return (
        row.actor_id === upload.uploadedBy &&
        row.metadata.path === upload.path &&
        row.metadata.sha256 === upload.sha256 &&
        row.metadata.mimeType === upload.mimeType &&
        row.metadata.sizeBytes === upload.sizeBytes
      );
    });
    if (!audited || !storedObjects.has(upload.path)) {
      issues.push({
        path: `media.${index}.pendingUpload`,
        code: "unverified_upload",
        message:
          "Pending media must match a server-audited immutable storage object.",
      });
    }
  }
  return issues;
}

export async function listCatalogProducts(url: URL): Promise<{
  items: CatalogGridRow[];
  nextCursor: string | null;
}> {
  const admin = createSupabaseAdminClient();
  const limit = parseCatalogGridLimit(url.searchParams.get("limit"));
  const sort = parseCatalogGridSort(url.searchParams.get("sort"));
  const { offset } = decodeCatalogGridCursor(url.searchParams.get("cursor"));
  const queryText = url.searchParams.get("query")?.trim() ?? "";
  if (queryText.length > 80 || !/^[a-z0-9 _-]*$/i.test(queryText)) {
    throw new CatalogAdminError(
      "invalid_query",
      "Catalog search supports letters, numbers, spaces, underscores, and hyphens.",
      400,
    );
  }

  let query = admin
    .from("products")
    .select(
      "id, slug, name, display_name, formal_title, catalog_status, status, routine_group, routine_sort, published_at, updated_at",
    );
  if (queryText) {
    query = query.or(
      `slug.ilike.%${queryText}%,name.ilike.%${queryText}%,display_name.ilike.%${queryText}%`,
    );
  }

  const catalogStatus = url.searchParams.get("catalogStatus");
  if (catalogStatus) query = query.eq("catalog_status", catalogStatus);
  const routineGroup = url.searchParams.get("routineGroup");
  if (routineGroup) query = query.eq("routine_group", routineGroup);

  if (sort === "name_asc") {
    query = query.order("name", { ascending: true }).order("id");
  } else if (sort === "published_desc") {
    query = query.order("published_at", { ascending: false }).order("id");
  } else if (sort === "routine_asc") {
    query = query
      .order("routine_sort", { ascending: true, nullsFirst: false })
      .order("id");
  } else {
    query = query.order("updated_at", { ascending: false }).order("id");
  }

  const { data, error } = await query.range(offset, offset + limit);
  if (error) throwDatabaseError(error);
  const page = (data ?? []) as Array<{
    id: string;
    slug: string;
    name: string;
    display_name: string | null;
    formal_title: string | null;
    catalog_status: string;
    status: string;
    routine_group: string | null;
    routine_sort: number | null;
    published_at: string;
    updated_at: string;
  }>;
  const visible = page.slice(0, limit);
  const productIds = visible.map((product) => product.id);

  const [draftResult, revisionResult] = productIds.length
    ? await Promise.all([
        admin
          .from("product_content_drafts")
          .select("id, product_id, status, version, updated_at, updated_by")
          .in("product_id", productIds)
          .in("status", ["draft", "ready"]),
        admin
          .from("catalog_product_revisions")
          .select("product_id, revision_number")
          .in("product_id", productIds)
          .order("revision_number", { ascending: false }),
      ])
    : [
        { data: [], error: null },
        { data: [], error: null },
      ];
  if (draftResult.error) throwDatabaseError(draftResult.error);
  if (revisionResult.error) throwDatabaseError(revisionResult.error);

  const drafts = new Map(
    (draftResult.data ?? []).map((draft) => [draft.product_id, draft]),
  );
  const revisions = new Map<string, number>();
  for (const revision of revisionResult.data ?? []) {
    if (!revisions.has(revision.product_id)) {
      revisions.set(revision.product_id, revision.revision_number);
    }
  }

  return {
    items: visible.map((product) => {
      const draft = drafts.get(product.id);
      return {
        id: product.id,
        slug: product.slug,
        displayName: product.display_name ?? product.name,
        formalTitle: product.formal_title ?? product.name,
        catalogStatus: product.catalog_status,
        productStatus: product.status,
        routineGroup: product.routine_group,
        routineSort: product.routine_sort,
        publishedAt: product.published_at,
        updatedAt: product.updated_at,
        activeDraft: draft
          ? {
              id: draft.id,
              status: draft.status as CatalogDraftRecord["status"],
              version: draft.version,
              updatedAt: draft.updated_at,
              updatedBy: draft.updated_by,
            }
          : null,
        latestRevision: revisions.get(product.id) ?? 0,
      };
    }),
    nextCursor:
      page.length > limit
        ? encodeCatalogGridCursor({ offset: offset + limit })
        : null,
  };
}

export async function getCatalogEditor(
  productId: string,
  access: CatalogAdminAccess,
): Promise<{
  canonical: ProductEditorDocumentV1;
  draft: CatalogDraftRecord | null;
  latestRevision: number;
  permissions: Record<string, boolean>;
}> {
  const admin = createSupabaseAdminClient();
  const [documentResult, draftResult, revisionResult] = await Promise.all([
    admin.rpc("get_catalog_editor_document", { p_product_id: productId }),
    admin
      .from("product_content_drafts")
      .select("*")
      .eq("product_id", productId)
      .in("status", ["draft", "ready"])
      .maybeSingle(),
    admin
      .from("catalog_product_revisions")
      .select("revision_number")
      .eq("product_id", productId)
      .order("revision_number", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (documentResult.error) throwDatabaseError(documentResult.error);
  if (!documentResult.data) {
    throw new CatalogAdminError("product_not_found", "Product not found.", 404);
  }
  if (draftResult.error) throwDatabaseError(draftResult.error);
  if (revisionResult.error) throwDatabaseError(revisionResult.error);

  const canonical = assertValidProductEditorDocument(documentResult.data);
  return {
    canonical,
    draft: (draftResult.data as CatalogDraftRecord | null) ?? null,
    latestRevision: revisionResult.data?.revision_number ?? 0,
    permissions: Object.fromEntries(
      access.capabilities.map((capability) => [capability, true]),
    ),
  };
}

export async function createCatalogDraft(
  productId: string,
  actorId: string,
): Promise<{ created: boolean; draft: CatalogDraftRecord }> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("create_catalog_product_draft", {
    p_product_id: productId,
    p_actor_id: actorId,
  });
  if (error) throwDatabaseError(error);
  return assertRpcResult<{
    created: boolean;
    draft: CatalogDraftRecord;
  }>(data);
}

export async function saveCatalogDraft(input: {
  draftId: string;
  expectedVersion: number;
  document: unknown;
  actorId: string;
}): Promise<{ ok: true; draft: CatalogDraftRecord }> {
  const document = assertProductEditorDocumentStructure(input.document);
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("save_catalog_product_draft", {
    p_draft_id: input.draftId,
    p_expected_version: input.expectedVersion,
    p_document: document,
    p_actor_id: input.actorId,
  });
  if (error) throwDatabaseError(error);
  return assertRpcResult<{ ok: true; draft: CatalogDraftRecord }>(
    data,
    document,
  );
}

async function readDraft(draftId: string): Promise<CatalogDraftRecord> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("product_content_drafts")
    .select("*")
    .eq("id", draftId)
    .maybeSingle();
  if (error) throwDatabaseError(error);
  if (!data) {
    throw new CatalogAdminError("draft_not_found", "Draft not found.", 404);
  }
  return data as CatalogDraftRecord;
}

export async function transitionCatalogDraft(input: {
  draftId: string;
  expectedVersion: number;
  action: "discard" | "ready" | "validate";
  actorId: string;
}): Promise<{ ok: true; draft: CatalogDraftRecord }> {
  const draft = await readDraft(input.draftId);
  let validationErrors: CatalogValidationIssue[] = [];
  if (input.action !== "discard") {
    const result = validateProductEditorDocument(draft.document);
    validationErrors = result.document
      ? [
          ...result.issues,
          ...(await pendingMediaValidationIssues(result.document)),
        ]
      : result.issues;
  }
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("transition_catalog_product_draft", {
    p_draft_id: input.draftId,
    p_expected_version: input.expectedVersion,
    p_action: input.action,
    p_validation_errors: validationErrors,
    p_actor_id: input.actorId,
  });
  if (error) throwDatabaseError(error);
  return assertRpcResult<{ ok: true; draft: CatalogDraftRecord }>(data);
}

export async function publishCatalogDraft(input: {
  draftId: string;
  expectedVersion: number;
  actorId: string;
}): Promise<CatalogPublishSuccess> {
  const draft = await readDraft(input.draftId);
  const document = assertValidProductEditorDocument(draft.document);
  const mediaIssues = await pendingMediaValidationIssues(document);
  if (mediaIssues.length > 0) {
    throw new CatalogAdminError(
      "validation_failed",
      "The product editor document has unverified media.",
      422,
      { issues: mediaIssues },
    );
  }
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("publish_catalog_product_draft", {
    p_draft_id: input.draftId,
    p_expected_version: input.expectedVersion,
    p_actor_id: input.actorId,
  });
  if (error) throwDatabaseError(error);
  return assertRpcResult<CatalogPublishSuccess>(data);
}

export async function listCatalogRevisions(
  draftId: string,
): Promise<CatalogRevisionRecord[]> {
  const draft = await readDraft(draftId);
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("catalog_product_revisions")
    .select("*")
    .eq("product_id", draft.product_id)
    .order("revision_number", { ascending: false });
  if (error) throwDatabaseError(error);
  return (data ?? []) as CatalogRevisionRecord[];
}

export async function restoreCatalogRevision(
  revisionId: string,
  actorId: string,
): Promise<{ ok: true; draft: CatalogDraftRecord }> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("restore_catalog_product_revision", {
    p_revision_id: revisionId,
    p_actor_id: actorId,
  });
  if (error) throwDatabaseError(error);
  return assertRpcResult<{ ok: true; draft: CatalogDraftRecord }>(data);
}

export type { CatalogRpcConflict };
