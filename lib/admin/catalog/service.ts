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
import { validateCatalogEditorOwnership } from "@/lib/admin/catalog/ownership";
import type {
  CatalogDraftRecord,
  CatalogEditorResponse,
  CatalogGridRow,
  CatalogPublishSuccess,
  CatalogPublishTransactionSuccess,
  CatalogRevisionRecord,
  ProductEditorDocumentV3,
  CatalogValidationIssue,
} from "@/lib/admin/catalog/types";
import { PRODUCT_EDITOR_SCHEMA_VERSION } from "@/lib/admin/catalog/types";
import type { CatalogAdminAccess } from "@/lib/admin/capabilities";
import { catalogDocumentDiff } from "@/lib/admin/catalog/diff";
import type { CatalogEditorRole } from "@/lib/catalog/field-ownership";
import {
  verifyRealProductMedia,
  type CatalogProductMediaType,
  type RealProductMediaVerificationReport,
} from "@/lib/catalog/real-product-media-verification";
import { productMediaHttpClient } from "@/lib/catalog/product-media-http-client";

type JsonRecord = Record<string, unknown>;

const CATALOG_DRAFT_RECORD_SELECT =
  "id, product_id, schema_version, base_revision, version, document, status, validation_errors, created_by, updated_by, created_at, updated_at, ready_at, published_at, discarded_at" as const;
const CATALOG_REVISION_RECORD_SELECT =
  "id, product_id, revision_number, schema_version, document, source_draft_id, published_by, published_at" as const;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertRpcResult<T extends JsonRecord>(
  data: unknown,
  callerDocument?: ProductEditorDocumentV3,
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

async function readCanonicalDocument(
  productId: string,
): Promise<ProductEditorDocumentV3> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("get_catalog_editor_document", {
    p_product_id: productId,
  });
  if (error) throwDatabaseError(error);
  if (!data) {
    throw new CatalogAdminError("product_not_found", "Product not found.", 404);
  }
  return assertValidProductEditorDocument(data);
}

async function relationshipValidationIssues(
  document: ProductEditorDocumentV3,
): Promise<CatalogValidationIssue[]> {
  const relatedIds = [...new Set(document.relationships.map((item) => item.related_product_id))];
  if (relatedIds.length === 0) return [];
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("products")
    .select("id")
    .in("id", relatedIds);
  if (error) throwDatabaseError(error);
  const existing = new Set((data ?? []).map((product) => product.id));
  return document.relationships.flatMap((relationship, index) =>
    existing.has(relationship.related_product_id)
      ? []
      : [{
          path: `relationships.${index}.related_product_id`,
          code: "related_product_not_found",
          message: "Related product must reference an existing catalog product.",
        }],
  );
}

function assertCatalogEditorOwnership(
  document: ProductEditorDocumentV3,
  canonical: ProductEditorDocumentV3,
  role: CatalogEditorRole,
) {
  const issues = validateCatalogEditorOwnership(document, canonical, role);
  if (issues.length > 0) {
    throw new CatalogAdminError(
      "field_ownership_violation",
      "The draft changes fields that are read only in the catalog editor.",
      422,
      { issues },
    );
  }
}

async function pendingMediaValidationIssues(
  document: ProductEditorDocumentV3,
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

  const catalogStatus = url.searchParams.get("catalogStatus");
  if (
    catalogStatus &&
    !["active", "archived", "draft"].includes(catalogStatus)
  ) {
    throw new CatalogAdminError(
      "invalid_catalog_status",
      "Unsupported catalog publication filter.",
      400,
    );
  }
  const routineFilter = url.searchParams.get("routineGroup");
  if (routineFilter && !["core", "beyond"].includes(routineFilter)) {
    throw new CatalogAdminError(
      "invalid_routine_group",
      "Unsupported routine classification filter.",
      400,
    );
  }
  const draftFilter = url.searchParams.get("draftStatus");
  if (draftFilter && !["draft", "ready", "none"].includes(draftFilter)) {
    throw new CatalogAdminError(
      "invalid_draft_status",
      "Unsupported draft status filter.",
      400,
    );
  }

  let filteredDrafts: Array<{
    id: string;
    product_id: string;
    status: string;
    version: number;
    updated_at: string;
    updated_by: string;
  }> | null = null;
  if (draftFilter) {
    const { data, error } = await admin
      .from("product_content_drafts")
      .select("id, product_id, status, version, updated_at, updated_by")
      .in("status", ["draft", "ready"]);
    if (error) throwDatabaseError(error);
    filteredDrafts = data ?? [];
  }

  let query = admin
    .from("products")
    .select(
      "id, slug, display_name, formal_title, catalog_status, status, routine_group, routine_sort, published_at, updated_at",
    );
  if (queryText) {
    query = query.or(
      `slug.ilike.%${queryText}%,display_name.ilike.%${queryText}%,formal_title.ilike.%${queryText}%`,
    );
  }
  if (catalogStatus) query = query.eq("catalog_status", catalogStatus);
  if (routineFilter) {
    query = query.eq(
      "routine_group",
      routineFilter === "beyond" ? "beyond_core" : routineFilter,
    );
  }
  if (draftFilter && filteredDrafts) {
    const productIds = filteredDrafts
      .filter(
        (draft) =>
          draftFilter === "none" || draft.status === draftFilter,
      )
      .map((draft) => draft.product_id);
    if (draftFilter === "none") {
      if (productIds.length > 0) {
        query = query.not("id", "in", `(${productIds.join(",")})`);
      }
    } else if (productIds.length === 0) {
      return { items: [], nextCursor: null };
    } else {
      query = query.in("id", productIds);
    }
  }

  if (sort === "name_asc") {
    query = query.order("display_name", { ascending: true }).order("id");
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
    display_name: string;
    formal_title: string;
    catalog_status: string;
    status: string;
    routine_group: string | null;
    routine_sort: number | null;
    published_at: string;
    updated_at: string;
  }>;
  const visible = page.slice(0, limit);
  const productIds = visible.map((product) => product.id);

  const [draftResult, revisionResult, variantResult, mediaResult] = productIds.length
    ? await Promise.all([
        filteredDrafts
          ? Promise.resolve({ data: filteredDrafts, error: null })
          : admin
              .from("product_content_drafts")
              .select("id, product_id, status, version, updated_at, updated_by")
              .in("product_id", productIds)
              .in("status", ["draft", "ready"]),
        admin
          .from("catalog_product_revisions")
          .select("product_id, revision_number")
          .in("product_id", productIds)
          .order("revision_number", { ascending: false }),
        admin
          .from("product_variants")
          .select("product_id, price_cents")
          .in("product_id", productIds)
          .is("archived_at", null),
        admin
          .from("product_media")
          .select(
            "product_id, url, alt, role, sort_order, media_type",
          )
          .in("product_id", productIds)
          .is("archived_at", null)
          .eq("media_type", "image")
          .in("role", ["card_default", "card", "detail", "hero"])
          .order("sort_order", { ascending: true }),
      ])
    : [
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
      ];
  if (draftResult.error) throwDatabaseError(draftResult.error);
  if (revisionResult.error) throwDatabaseError(revisionResult.error);
  if (variantResult.error) throwDatabaseError(variantResult.error);
  if (mediaResult.error) throwDatabaseError(mediaResult.error);

  const drafts = new Map(
    (draftResult.data ?? [])
      .filter((draft) => productIds.includes(draft.product_id))
      .map((draft) => [draft.product_id, draft]),
  );
  const revisions = new Map<string, number>();
  for (const revision of revisionResult.data ?? []) {
    if (!revisions.has(revision.product_id)) {
      revisions.set(revision.product_id, revision.revision_number);
    }
  }
  const offerSummaries = new Map<
    string,
    { count: number; minimum: number; maximum: number }
  >();
  for (const variant of variantResult.data ?? []) {
    const summary = offerSummaries.get(variant.product_id);
    if (!summary) {
      offerSummaries.set(variant.product_id, {
        count: 1,
        minimum: variant.price_cents,
        maximum: variant.price_cents,
      });
      continue;
    }
    summary.count += 1;
    summary.minimum = Math.min(summary.minimum, variant.price_cents);
    summary.maximum = Math.max(summary.maximum, variant.price_cents);
  }
  const mediaRoleRank = new Map([
    ["card_default", 0],
    ["card", 1],
    ["detail", 2],
    ["hero", 3],
  ]);
  const primaryMedia = new Map<
    string,
    { url: string | null; alt: string; rank: number; sortOrder: number }
  >();
  for (const media of mediaResult.data ?? []) {
    if (media.media_type !== "image" || !media.url) continue;
    const candidate = {
      url: media.url,
      alt: media.alt,
      rank: mediaRoleRank.get(media.role) ?? 99,
      sortOrder: media.sort_order,
    };
    const current = primaryMedia.get(media.product_id);
    if (
      !current ||
      candidate.rank < current.rank ||
      (candidate.rank === current.rank &&
        candidate.sortOrder < current.sortOrder)
    ) {
      primaryMedia.set(media.product_id, candidate);
    }
  }

  return {
    items: visible.map((product) => {
      const draft = drafts.get(product.id);
      const offers = offerSummaries.get(product.id);
      const media = primaryMedia.get(product.id);
      return {
        id: product.id,
        slug: product.slug,
        displayName: product.display_name,
        formalTitle: product.formal_title,
        catalogStatus: product.catalog_status,
        productStatus: product.status,
        routineGroup: product.routine_group,
        routineSort: product.routine_sort,
        publishedAt: product.published_at,
        updatedAt: product.updated_at,
        primaryMedia: media ? { url: media.url, alt: media.alt } : null,
        variantCount: offers?.count ?? 0,
        minimumPriceCents: offers?.minimum ?? null,
        maximumPriceCents: offers?.maximum ?? null,
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
): Promise<CatalogEditorResponse> {
  const admin = createSupabaseAdminClient();
  const [
    canonical,
    draftResult,
    revisionHistoryResult,
    draftHistoryResult,
    auditResult,
    relationshipTargetsResult,
  ] = await Promise.all([
    readCanonicalDocument(productId),
    admin
      .from("product_content_drafts")
      .select(CATALOG_DRAFT_RECORD_SELECT)
      .eq("product_id", productId)
      .in("status", ["draft", "ready"])
      .maybeSingle(),
    admin
      .from("catalog_product_revisions")
      .select(CATALOG_REVISION_RECORD_SELECT)
      .eq("product_id", productId)
      .order("revision_number", { ascending: false })
      .limit(100),
    admin
      .from("product_content_drafts")
      .select(CATALOG_DRAFT_RECORD_SELECT)
      .eq("product_id", productId)
      .order("updated_at", { ascending: false })
      .limit(100),
    admin
      .from("catalog_editor_audit_log")
      .select("id, action, actor_id, product_id, draft_id, revision_id, metadata, created_at")
      .eq("product_id", productId)
      .order("created_at", { ascending: false })
      .limit(100),
    admin
      .from("products")
      .select("id, display_name, slug")
      .neq("id", productId)
      .order("display_name"),
  ]);
  if (draftResult.error) throwDatabaseError(draftResult.error);
  if (revisionHistoryResult.error) throwDatabaseError(revisionHistoryResult.error);
  if (draftHistoryResult.error) throwDatabaseError(draftHistoryResult.error);
  if (auditResult.error) throwDatabaseError(auditResult.error);
  if (relationshipTargetsResult.error) throwDatabaseError(relationshipTargetsResult.error);

  const draft = draftResult.data
    ? normalizeDraftRecord(draftResult.data)
    : null;

  return {
    canonical,
    draft,
    latestRevision: revisionHistoryResult.data?.[0]?.revision_number ?? 0,
    role: access.role,
    permissions: Object.fromEntries(
      access.capabilities.map((capability) => [capability, true]),
    ),
    relationshipTargets: (relationshipTargetsResult.data ?? []).map((product) => ({
      id: product.id,
      displayName: product.display_name,
      slug: product.slug,
    })),
    systemMetadata: {
      drafts: draftHistoryResult.data ?? [],
      revisions: revisionHistoryResult.data ?? [],
      audit: auditResult.data ?? [],
    },
  };
}

function normalizeDraftRecord(data: unknown): CatalogDraftRecord {
  if (
    !isRecord(data) ||
    data.schema_version !== PRODUCT_EDITOR_SCHEMA_VERSION ||
    !isRecord(data.document)
  ) {
    throw new CatalogAdminError(
      "invalid_catalog_response",
      "The catalog database returned a noncanonical draft.",
      503,
    );
  }
  return {
    ...data,
    schema_version: PRODUCT_EDITOR_SCHEMA_VERSION,
    document: assertValidProductEditorDocument(data.document),
  } as CatalogDraftRecord;
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
  const result = assertRpcResult<{
    created: boolean;
    draft: unknown;
  }>(data);
  return {
    created: result.created,
    draft: normalizeDraftRecord(result.draft),
  };
}

export async function saveCatalogDraft(input: {
  draftId: string;
  expectedVersion: number;
  document: unknown;
  actorId: string;
  role: CatalogEditorRole;
}): Promise<{ ok: true; draft: CatalogDraftRecord }> {
  const document = assertProductEditorDocumentStructure(input.document);
  const canonical = await readCanonicalDocument(document.productId);
  assertCatalogEditorOwnership(document, canonical, input.role);
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("save_catalog_product_draft", {
    p_draft_id: input.draftId,
    p_expected_version: input.expectedVersion,
    p_document: document,
    p_actor_id: input.actorId,
    p_actor_role: input.role,
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
    .select(CATALOG_DRAFT_RECORD_SELECT)
    .eq("id", draftId)
    .maybeSingle();
  if (error) throwDatabaseError(error);
  if (!data) {
    throw new CatalogAdminError("draft_not_found", "Draft not found.", 404);
  }
  return normalizeDraftRecord(data);
}

export async function getCatalogDraftForPreview(
  draftId: string,
): Promise<CatalogDraftRecord> {
  return readDraft(draftId);
}

export async function transitionCatalogDraft(input: {
  draftId: string;
  expectedVersion: number;
  action: "discard" | "ready" | "validate";
  actorId: string;
  role: CatalogEditorRole;
}): Promise<{ ok: true; draft: CatalogDraftRecord }> {
  const draft = await readDraft(input.draftId);
  let validationErrors: CatalogValidationIssue[] = [];
  if (input.action !== "discard") {
    const result = validateProductEditorDocument(draft.document);
    validationErrors = result.document
      ? [
          ...result.issues,
          ...validateCatalogEditorOwnership(
            result.document,
            await readCanonicalDocument(result.document.productId),
            input.role,
          ),
          ...(await pendingMediaValidationIssues(result.document)),
          ...(await relationshipValidationIssues(result.document)),
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

type PublishCatalogDraftInput = {
  draftId: string;
  expectedVersion: number;
  actorId: string;
  role: CatalogEditorRole;
};

type PublishTransactionInput = PublishCatalogDraftInput & {
  changeAudit: ReturnType<typeof catalogDocumentDiff>["advancedChanges"];
};

export type CatalogPublishDependencies = Readonly<{
  readDraft: typeof readDraft;
  readCanonicalDocument: typeof readCanonicalDocument;
  pendingMediaValidationIssues: typeof pendingMediaValidationIssues;
  relationshipValidationIssues: typeof relationshipValidationIssues;
  verifyMedia(
    document: ProductEditorDocumentV3,
  ): Promise<RealProductMediaVerificationReport>;
  publishTransaction(
    input: PublishTransactionInput,
  ): Promise<CatalogPublishTransactionSuccess>;
}>;

async function verifyCatalogProductMedia(
  document: ProductEditorDocumentV3,
): Promise<RealProductMediaVerificationReport> {
  let approvedOrigin: string | null = null;
  try {
    approvedOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL
      ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin
      : null;
  } catch {
    approvedOrigin = null;
  }
  return verifyRealProductMedia({
    expectedMedia: document.media
      .filter(
        (media): media is typeof media & { url: string } =>
          media.archived_at === null &&
          typeof media.url === "string" &&
          media.url.length > 0,
      )
      .map((media) => ({
        url: media.url,
        mediaType: media.media_type as CatalogProductMediaType,
      })),
    urlPolicy: {
      approvedLocations: approvedOrigin
        ? [{
            origin: approvedOrigin,
            pathPrefix: `/storage/v1/object/public/${CATALOG_MEDIA_BUCKET}/`,
          }]
        : [],
      maxRedirects: 2,
      timeoutMs: 5_000,
    },
    httpClient: productMediaHttpClient,
  });
}

async function publishCatalogDraftTransaction(
  input: PublishTransactionInput,
): Promise<CatalogPublishTransactionSuccess> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("publish_catalog_product_draft", {
    p_draft_id: input.draftId,
    p_expected_version: input.expectedVersion,
    p_actor_id: input.actorId,
    p_actor_role: input.role,
    p_change_audit: input.changeAudit,
  });
  if (error) throwDatabaseError(error);
  return assertRpcResult<CatalogPublishTransactionSuccess>(data);
}

export async function publishCatalogDraft(
  input: PublishCatalogDraftInput,
  dependencies: CatalogPublishDependencies = {
    readDraft,
    readCanonicalDocument,
    pendingMediaValidationIssues,
    relationshipValidationIssues,
    verifyMedia: verifyCatalogProductMedia,
    publishTransaction: publishCatalogDraftTransaction,
  },
): Promise<CatalogPublishSuccess> {
  const draft = await dependencies.readDraft(input.draftId);
  const document = assertValidProductEditorDocument(draft.document);
  const [canonical, mediaIssues, relationshipIssues] = await Promise.all([
    dependencies.readCanonicalDocument(document.productId),
    dependencies.pendingMediaValidationIssues(document),
    dependencies.relationshipValidationIssues(document),
  ]);
  const ownershipIssues = validateCatalogEditorOwnership(
    document,
    canonical,
    input.role,
  );
  if (
    mediaIssues.length > 0 ||
    relationshipIssues.length > 0 ||
    ownershipIssues.length > 0
  ) {
    throw new CatalogAdminError(
      "validation_failed",
      "The product editor document failed publication validation.",
      422,
      { issues: [...ownershipIssues, ...mediaIssues, ...relationshipIssues] },
    );
  }
  const mediaVerification = await dependencies.verifyMedia(document);
  if (mediaVerification.summary.failures > 0) {
    throw new CatalogAdminError(
      "validation_failed",
      "Candidate Product Media failed publication verification.",
      422,
      {
        issues: mediaVerification.results
          .filter((result) => result.outcome === "failed")
          .map((result) => ({
            path: `media.${document.media.findIndex((media) => media.url === result.url)}.url`,
            code: result.failure?.code ?? "media_verification_failed",
            message: result.failure?.message ?? "Product Media verification failed.",
          })),
        mediaVerification,
      },
    );
  }
  const changeAudit = catalogDocumentDiff(canonical, document).advancedChanges;
  const published = await dependencies.publishTransaction({ ...input, changeAudit });
  try {
    const publishedDocument = assertValidProductEditorDocument(
      published.revision.document,
    );
    const report = await dependencies.verifyMedia(publishedDocument);
    return {
      ...published,
      mediaVerification: report.summary.failures > 0
        ? {
            status: "warning",
            report,
            message:
              "The revision was published, but its Product Media failed verification.",
          }
        : { status: "healthy", report },
    };
  } catch {
    return {
      ...published,
      mediaVerification: {
        status: "warning",
        report: null,
        message:
          "The revision was published, but its Product Media could not be verified.",
      },
    };
  }
}

export async function listCatalogRevisions(
  draftId: string,
): Promise<CatalogRevisionRecord[]> {
  const draft = await readDraft(draftId);
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("catalog_product_revisions")
    .select(CATALOG_REVISION_RECORD_SELECT)
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
