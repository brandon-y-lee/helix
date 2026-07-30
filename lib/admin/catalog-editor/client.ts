export type CatalogPublicationFilter =
  | "all"
  | "active"
  | "draft"
  | "archived";
export type CatalogRoutineFilter = "all" | "core" | "beyond";
export type CatalogDraftFilter = "all" | "draft" | "ready" | "none";
export type CatalogTable =
  | "products"
  | "product_pdp_content"
  | "product_variants"
  | "product_media"
  | "product_relationships";

export interface CatalogMediaSummary {
  url: string | null;
  alt: string;
}

export interface CatalogProductListItem {
  id: string;
  slug: string;
  display_name: string;
  routine_group: "core" | "beyond" | null;
  product_status: string;
  catalog_status: string;
  variant_count: number | null;
  minimum_price_cents: number | null;
  maximum_price_cents: number | null;
  draft_status: string | null;
  updated_at: string;
  draft_updated_at: string | null;
  primary_media: CatalogMediaSummary | null;
}

export interface CatalogProductListResponse {
  products: CatalogProductListItem[];
  next_cursor: string | null;
}

export interface CatalogSourceFields {
  name?: string | null;
  tagline?: string | null;
  description?: string | null;
  how_to_use?: string | null;
}

export interface CatalogProductFields {
  [key: string]: unknown;
  slug: string;
  display_name: string | null;
  card_tagline: string | null;
  editorial_description: string | null;
  editorial_how_to_use: string | null;
  made_for: string | null;
  good_for: string | null;
  texture: string | null;
  finish: string | null;
  volume: string | null;
  key_ingredients: string[];
  benefits: string[];
  cautions: string[];
  skin_types: string[];
  usage_time: string[];
  routine_group: "core" | "beyond" | null;
  routine_step_number: number | null;
  routine_step_name: string | null;
  routine_display_label: string | null;
  routine_sort: number | null;
  seo_title: string | null;
  seo_description: string | null;
  status: string;
  catalog_status: string;
  source_fields?: CatalogSourceFields;
}

export interface CatalogProfileTitleToken {
  text: string;
  emphasis?: boolean;
}

export interface CatalogIngredientCard {
  name: string;
  description: string;
}

export interface CatalogIngredientHighlight {
  title: string;
  description: string;
}

export interface CatalogPdpContentFields {
  [key: string]: unknown;
  profile_title_tokens: CatalogProfileTitleToken[];
  routine_overlay: string | null;
  outcome_heading: string | null;
  outcome_labels: string[];
  how_to_use_steps: string[];
  application_steps: string[];
  ingredient_cards: CatalogIngredientCard[];
  ingredient_story: {
    heading: string;
    intro: string;
    highlights: CatalogIngredientHighlight[];
    supporting_ingredients: string[];
  } | null;
  routine_guidance: string | null;
}

export interface CatalogVariantFields {
  [key: string]: unknown;
  id: string;
  variant_key: string;
  label: string;
  sku: string | null;
  price_cents: number;
  available: boolean;
  inventory_status: string;
  volume: string | null;
  pack_count: number | null;
  sort_order: number | null;
}

export interface CatalogMediaFields {
  [key: string]: unknown;
  id: string;
  url: string | null;
  media_type: string;
  media_kind: string | null;
  role: string;
  alt: string;
  width: number | null;
  height: number | null;
  sort_order: number;
}

export interface CatalogRelationshipFields {
  [key: string]: unknown;
  id: string;
  related_product_id: string;
  relationship_type: string;
  sort_order: number;
  related_product?: {
    display_name: string;
    slug: string;
  };
}

export interface CatalogDraftDocument {
  schemaVersion: number;
  productId: string;
  products: CatalogProductFields;
  product_pdp_content: CatalogPdpContentFields | null;
  product_variants: CatalogVariantFields[];
  product_media: CatalogMediaFields[];
  product_relationships: CatalogRelationshipFields[];
}

export interface CatalogDraft {
  id: string;
  product_id: string;
  status: "draft" | "ready" | "published" | "discarded";
  base_revision: number | null;
  version: number;
  updated_at: string;
  document: CatalogDraftDocument;
  validation_errors?: WireValidationIssue[];
}

export interface CatalogPermissions {
  publish: boolean;
}

export interface CatalogEditorResponse {
  product: CatalogDraftDocument;
  draft: CatalogDraft | null;
  latest_revision: number;
  permissions: CatalogPermissions;
}

export interface CatalogValidationIssue {
  table: CatalogTable;
  field: string;
  message: string;
  row_id?: string;
}

export interface CatalogDiffEntry {
  field: string;
  before: unknown;
  after: unknown;
}

export interface CatalogValidationResult {
  valid: boolean;
  issues: CatalogValidationIssue[];
  diff: Partial<Record<CatalogTable, CatalogDiffEntry[]>>;
  affected_tables: CatalogTable[];
  draft: CatalogDraft;
}

export interface CatalogRevision {
  id: string;
  revision: number;
  created_at: string;
  created_by: string | null;
  summary: string | null;
}

export interface CatalogPublishResult {
  draft: CatalogDraft;
  revision: CatalogRevision;
  changed_tables: CatalogTable[];
  delivery?: {
    cache?: "confirmed" | "pending" | "failed";
    algolia?: "confirmed" | "pending" | "failed";
  };
}

interface WireDocument {
  schemaVersion: number;
  productId: string;
  product: CatalogProductFields;
  productPdpContent: CatalogPdpContentFields | null;
  variants: CatalogVariantFields[];
  media: CatalogMediaFields[];
  relationships: CatalogRelationshipFields[];
}

interface WireValidationIssue {
  path: string;
  code: string;
  message: string;
}

interface WireDraft extends Omit<CatalogDraft, "document"> {
  document: WireDocument;
}

interface WireRevision {
  id: string;
  revision_number: number;
  published_at: string;
  published_by: string | null;
}

export class CatalogApiError extends Error {
  status: number;
  details: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = "CatalogApiError";
    this.status = status;
    this.details = details;
  }
}

export class CatalogVersionConflictError extends CatalogApiError {
  latestDraft: CatalogDraft | null;

  constructor(
    message: string,
    latestDraft: CatalogDraft | null,
    details?: unknown,
  ) {
    super(message, 409, details);
    this.name = "CatalogVersionConflictError";
    this.latestDraft = latestDraft;
  }
}

function fromWireDocument(document: WireDocument): CatalogDraftDocument {
  return {
    schemaVersion: document.schemaVersion,
    productId: document.productId,
    products: {
      ...document.product,
      source_fields: {
        name:
          typeof document.product.name === "string"
            ? document.product.name
            : null,
        tagline:
          typeof document.product.tagline === "string"
            ? document.product.tagline
            : null,
        description:
          typeof document.product.description === "string"
            ? document.product.description
            : null,
        how_to_use:
          typeof document.product.how_to_use === "string"
            ? document.product.how_to_use
            : null,
      },
    },
    product_pdp_content: document.productPdpContent,
    product_variants: document.variants,
    product_media: document.media,
    product_relationships: document.relationships,
  };
}

function toWireDocument(document: CatalogDraftDocument): WireDocument {
  const product = { ...document.products };
  delete product.source_fields;
  return {
    schemaVersion: document.schemaVersion,
    productId: document.productId,
    product: product as CatalogProductFields,
    productPdpContent: document.product_pdp_content,
    variants: document.product_variants,
    media: document.product_media,
    relationships: document.product_relationships,
  };
}

function fromWireDraft(draft: WireDraft): CatalogDraft {
  return {
    ...draft,
    document: fromWireDocument(draft.document),
  };
}

function fromWireRevision(revision: WireRevision): CatalogRevision {
  return {
    id: revision.id,
    revision: revision.revision_number,
    created_at: revision.published_at,
    created_by: revision.published_by,
    summary: null,
  };
}

function tableForPath(segment: string): CatalogTable {
  if (segment === "product") return "products";
  if (segment === "productPdpContent") return "product_pdp_content";
  if (segment === "variants") return "product_variants";
  if (segment === "media") return "product_media";
  if (segment === "relationships") return "product_relationships";
  return "products";
}

function fromWireIssue(
  issue: WireValidationIssue,
  document: CatalogDraftDocument,
): CatalogValidationIssue {
  const parts = issue.path.split(".");
  const table = tableForPath(parts[0] ?? "");
  const index = Number(parts[1]);
  const isCollection = [
    "product_variants",
    "product_media",
    "product_relationships",
  ].includes(table);
  const collection =
    table === "product_variants"
      ? document.product_variants
      : table === "product_media"
        ? document.product_media
        : table === "product_relationships"
          ? document.product_relationships
          : [];
  return {
    table,
    field: isCollection ? (parts[2] ?? parts[1] ?? "section") : (parts[1] ?? "section"),
    row_id:
      isCollection && Number.isInteger(index) ? collection[index]?.id : undefined,
    message: issue.message,
  };
}

async function requestJson<T>(
  url: string,
  init: RequestInit = {},
  signal?: AbortSignal,
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData)) {
    headers.set("content-type", "application/json");
  }

  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers,
      credentials: "same-origin",
      cache: "no-store",
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new CatalogApiError(
      "The catalog service is unavailable. Try again when the admin backend is online.",
      0,
      error,
    );
  }

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const errorPayload =
      typeof data === "object" &&
      data !== null &&
      "error" in data &&
      typeof data.error === "object" &&
      data.error !== null
        ? (data.error as { message?: unknown; details?: unknown })
        : null;
    const message =
      typeof errorPayload?.message === "string"
        ? errorPayload.message
        : response.status === 401
          ? "Your admin session has expired. Sign in again."
          : response.status === 403
            ? "You do not have permission to perform this catalog action."
            : response.status === 409
              ? "Another edit was saved before yours."
              : "The catalog service could not complete this request.";

    if (response.status === 409) {
      throw new CatalogVersionConflictError(
        message,
        null,
        errorPayload?.details ?? data,
      );
    }
    throw new CatalogApiError(
      message,
      response.status,
      errorPayload?.details ?? data,
    );
  }
  return data as T;
}

function catalogProductsQuery(params: {
  search?: string;
  publication?: CatalogPublicationFilter;
  routine?: CatalogRoutineFilter;
  draft?: CatalogDraftFilter;
  cursor?: string | null;
}): string {
  const query = new URLSearchParams();
  if (params.search) query.set("query", params.search);
  if (params.publication && params.publication !== "all") {
    query.set("catalogStatus", params.publication);
  }
  if (params.routine && params.routine !== "all") {
    query.set("routineGroup", params.routine);
  }
  if (params.draft && params.draft !== "all") {
    query.set("draftStatus", params.draft);
  }
  if (params.cursor) query.set("cursor", params.cursor);
  query.set("sort", "name_asc");
  return `?${query.toString()}`;
}

function normalizeListResponse(data: {
  items: Array<{
    id: string;
    slug: string;
    displayName: string;
    catalogStatus: string;
    productStatus: string;
    routineGroup: string | null;
    updatedAt: string;
    activeDraft: {
      status: string;
      updatedAt: string;
    } | null;
    variantCount?: number;
    minimumPriceCents?: number | null;
    maximumPriceCents?: number | null;
    primaryMedia?: CatalogMediaSummary | null;
  }>;
  nextCursor: string | null;
}): CatalogProductListResponse {
  return {
    products: data.items.map((item) => ({
      id: item.id,
      slug: item.slug,
      display_name: item.displayName,
      routine_group:
        item.routineGroup === "core" || item.routineGroup === "beyond"
          ? item.routineGroup
          : null,
      product_status: item.productStatus,
      catalog_status: item.catalogStatus,
      variant_count: item.variantCount ?? null,
      minimum_price_cents: item.minimumPriceCents ?? null,
      maximum_price_cents: item.maximumPriceCents ?? null,
      draft_status: item.activeDraft?.status ?? null,
      updated_at: item.updatedAt,
      draft_updated_at: item.activeDraft?.updatedAt ?? null,
      primary_media: item.primaryMedia ?? null,
    })),
    next_cursor: data.nextCursor,
  };
}

async function saveWireDraft(
  draftId: string,
  version: number,
  document: CatalogDraftDocument,
) {
  const response = await requestJson<{ draft: WireDraft }>(
    `/api/admin/catalog/drafts/${encodeURIComponent(draftId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        expectedVersion: version,
        document: toWireDocument(document),
      }),
    },
  );
  return { draft: fromWireDraft(response.draft) };
}

export const catalogEditorApi = {
  async listProducts(
    params: Parameters<typeof catalogProductsQuery>[0],
    signal?: AbortSignal,
  ) {
    const data = await requestJson<Parameters<typeof normalizeListResponse>[0]>(
      `/api/admin/catalog/products${catalogProductsQuery(params)}`,
      {},
      signal,
    );
    const normalized = normalizeListResponse(data);
    if (!params.draft || params.draft === "all") return normalized;
    return {
      ...normalized,
      products: normalized.products.filter((product) => {
        if (params.draft === "none") return product.draft_status === null;
        return product.draft_status === params.draft;
      }),
    };
  },

  async getEditor(productId: string, signal?: AbortSignal) {
    const data = await requestJson<{
      canonical: WireDocument;
      draft: WireDraft | null;
      latestRevision: number;
      permissions: Record<string, boolean>;
    }>(
      `/api/admin/catalog/products/${encodeURIComponent(productId)}/editor`,
      {},
      signal,
    );
    return {
      product: fromWireDocument(data.canonical),
      draft: data.draft ? fromWireDraft(data.draft) : null,
      latest_revision: data.latestRevision,
      permissions: { publish: Boolean(data.permissions["catalog.publish"]) },
    } satisfies CatalogEditorResponse;
  },

  async createDraft(productId: string, document: CatalogDraftDocument) {
    const created = await requestJson<{ draft: WireDraft }>(
      `/api/admin/catalog/products/${encodeURIComponent(productId)}/drafts`,
      { method: "POST" },
    );
    return saveWireDraft(created.draft.id, created.draft.version, document);
  },

  saveDraft: saveWireDraft,

  async validateDraft(
    draftId: string,
    version: number,
  ): Promise<CatalogValidationResult> {
    const response = await requestJson<{ draft: WireDraft }>(
      `/api/admin/catalog/drafts/${encodeURIComponent(draftId)}/validate`,
      {
        method: "POST",
        body: JSON.stringify({ expectedVersion: version }),
      },
    );
    const draft = fromWireDraft(response.draft);
    const issues = (response.draft.validation_errors ?? []).map((issue) =>
      fromWireIssue(issue, draft.document),
    );
    return {
      valid: issues.length === 0,
      issues,
      diff: {},
      affected_tables: [],
      draft,
    } satisfies CatalogValidationResult;
  },

  async markReady(draftId: string, version: number) {
    const response = await requestJson<{ draft: WireDraft }>(
      `/api/admin/catalog/drafts/${encodeURIComponent(draftId)}/ready`,
      {
        method: "POST",
        body: JSON.stringify({ expectedVersion: version }),
      },
    );
    return { draft: fromWireDraft(response.draft) };
  },

  async publishDraft(draftId: string, version: number) {
    const response = await requestJson<{
      draft: WireDraft;
      revision: WireRevision;
      changedTables: Record<string, boolean>;
    }>(`/api/admin/catalog/drafts/${encodeURIComponent(draftId)}/publish`, {
      method: "POST",
      body: JSON.stringify({ expectedVersion: version }),
    });
    const tableMap: Record<string, CatalogTable> = {
      products: "products",
      productPdpContent: "product_pdp_content",
      variants: "product_variants",
      media: "product_media",
      relationships: "product_relationships",
    };
    return {
      draft: fromWireDraft(response.draft),
      revision: fromWireRevision(response.revision),
      changed_tables: Object.entries(response.changedTables)
        .filter(([, changed]) => changed)
        .map(([table]) => tableMap[table])
        .filter((table): table is CatalogTable => Boolean(table)),
    } satisfies CatalogPublishResult;
  },

  async discardDraft(draftId: string, version: number) {
    await requestJson<{ draft: WireDraft }>(
      `/api/admin/catalog/drafts/${encodeURIComponent(draftId)}/discard`,
      {
        method: "POST",
        body: JSON.stringify({ expectedVersion: version }),
      },
    );
    return { discarded: true as const };
  },

  async listRevisions(draftId: string) {
    const response = await requestJson<{ items: WireRevision[] }>(
      `/api/admin/catalog/drafts/${encodeURIComponent(draftId)}/revisions`,
    );
    return { revisions: response.items.map(fromWireRevision) };
  },

  async restoreRevision(revisionId: string) {
    const response = await requestJson<{ draft: WireDraft }>(
      `/api/admin/catalog/revisions/${encodeURIComponent(revisionId)}/restore`,
      { method: "POST" },
    );
    return { draft: fromWireDraft(response.draft) };
  },

  uploadMedia(
    file: File,
    productId: string,
    metadata: {
      role: string;
      alt: string;
      sortOrder: number;
      variantId?: string | null;
    },
  ) {
    const form = new FormData();
    form.set("file", file);
    form.set("productId", productId);
    form.set("role", metadata.role);
    form.set("alt", metadata.alt);
    form.set("sortOrder", String(metadata.sortOrder));
    form.set("variantId", metadata.variantId ?? "");
    return requestJson<{ media: CatalogMediaFields }>(
      "/api/admin/catalog/media/upload",
      { method: "POST", body: form },
    );
  },
};
