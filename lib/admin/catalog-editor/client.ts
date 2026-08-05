import type {
  CatalogDraftRecord,
  CatalogEditorResponse,
  CatalogGridRow,
  CatalogPublishSuccess,
  CatalogRevisionRecord,
  CatalogRpcConflict,
  CatalogValidationIssue as CatalogBackendValidationIssue,
  CatalogProductMedia,
  CatalogProductRelationship,
  CatalogProductSource,
  CatalogProductVariant,
  ProductEditorDocumentV3,
} from "@/lib/admin/catalog/types";
import type {
  PdpIngredientCard,
  PdpIngredientHighlight,
} from "@/lib/catalog/product-content";
import type { ProductMediaRole } from "@/lib/catalog/media-roles";

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
  | "product_relationships"
  | "product_sources";

export type CatalogDraftDocument = ProductEditorDocumentV3;
export type CatalogDraft = CatalogDraftRecord;
export type CatalogRevision = CatalogRevisionRecord;
export type CatalogPublishResult = CatalogPublishSuccess & {
  delivery?: {
    cache?: "confirmed" | "pending" | "failed";
    algolia?: "confirmed" | "pending" | "failed";
  };
};
export type CatalogProductListItem = CatalogGridRow;
export type CatalogConflictSnapshot = NonNullable<CatalogRpcConflict["stored"]>;
export type CatalogVariantFields = CatalogProductVariant;
export type CatalogMediaFields = CatalogProductMedia;
export type CatalogRelationshipFields = CatalogProductRelationship;
export type CatalogSourceFields = CatalogProductSource;
export type CatalogIngredientCard = PdpIngredientCard;
export type CatalogIngredientHighlight = PdpIngredientHighlight;
export type { CatalogEditorResponse };

export type CatalogEditorIssue = {
  table: CatalogTable;
  field: string;
  message: string;
  row_id?: string;
};
export type CatalogValidationIssue = CatalogEditorIssue;

type CatalogDiffEntry = {
  field: string;
  before: unknown;
  after: unknown;
  disruptive?: boolean;
  adminOnly?: boolean;
};

export type CatalogValidationResult = {
  valid: boolean;
  issues: CatalogEditorIssue[];
  diff: Partial<Record<CatalogTable, CatalogDiffEntry[]>>;
  affected_tables: CatalogTable[];
  draft: CatalogDraftRecord;
};

class CatalogApiError extends Error {
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
  latestDraft: CatalogConflictSnapshot | null;

  constructor(
    message: string,
    latestDraft: CatalogConflictSnapshot | null,
    details?: unknown,
  ) {
    super(message, 409, details);
    this.name = "CatalogVersionConflictError";
    this.latestDraft = latestDraft;
  }
}

function conflictSnapshot(value: unknown): CatalogConflictSnapshot | null {
  if (!value || typeof value !== "object" || !("stored" in value)) return null;
  const stored = value.stored;
  if (
    !stored ||
    typeof stored !== "object" ||
    !("version" in stored) ||
    !Number.isSafeInteger(stored.version) ||
    !("status" in stored) ||
    !["draft", "ready", "published", "discarded"].includes(
      String(stored.status),
    ) ||
    !("updatedAt" in stored) ||
    typeof stored.updatedAt !== "string" ||
    !("updatedBy" in stored) ||
    typeof stored.updatedBy !== "string"
  ) {
    return null;
  }
  return stored as CatalogConflictSnapshot;
}

function tableForPath(segment: string): CatalogTable {
  if (segment === "productPdpContent") return "product_pdp_content";
  if (segment === "variants") return "product_variants";
  if (segment === "media") return "product_media";
  if (segment === "relationships") return "product_relationships";
  if (segment === "productSource") return "product_sources";
  return "products";
}

function editorIssue(
  issue: CatalogBackendValidationIssue,
  document: ProductEditorDocumentV3,
): CatalogEditorIssue {
  const parts = issue.path.split(".");
  const table = tableForPath(parts[0] ?? "");
  const index = Number(parts[1]);
  const collection =
    table === "product_variants"
      ? document.variants
      : table === "product_media"
        ? document.media
        : table === "product_relationships"
          ? document.relationships
          : [];
  const row = Number.isInteger(index) ? collection[index] : undefined;
  const rowId =
    row && "id" in row
      ? row.id
      : row && "related_product_id" in row
        ? `${row.related_product_id}:${row.relationship_type}`
        : undefined;
  return {
    table,
    field:
      collection.length > 0
        ? (parts[2] ?? parts[1] ?? "section")
        : (parts[1] ?? "section"),
    row_id: rowId,
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
        conflictSnapshot(errorPayload?.details),
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

async function saveDraft(
  draftId: string,
  version: number,
  document: ProductEditorDocumentV3,
) {
  return requestJson<{ ok: true; draft: CatalogDraftRecord }>(
    `/api/admin/catalog/drafts/${encodeURIComponent(draftId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ expectedVersion: version, document }),
    },
  );
}

export const catalogEditorApi = {
  listProducts(
    params: Parameters<typeof catalogProductsQuery>[0],
    signal?: AbortSignal,
  ) {
    return requestJson<{ items: CatalogGridRow[]; nextCursor: string | null }>(
      `/api/admin/catalog/products${catalogProductsQuery(params)}`,
      {},
      signal,
    );
  },

  getEditor(productId: string, signal?: AbortSignal) {
    return requestJson<CatalogEditorResponse>(
      `/api/admin/catalog/products/${encodeURIComponent(productId)}/editor`,
      {},
      signal,
    );
  },

  async createDraft(productId: string, document: ProductEditorDocumentV3) {
    const created = await requestJson<{
      created: boolean;
      draft: CatalogDraftRecord;
    }>(`/api/admin/catalog/products/${encodeURIComponent(productId)}/drafts`, {
      method: "POST",
    });
    return saveDraft(created.draft.id, created.draft.version, document);
  },

  saveDraft,

  async validateDraft(
    draftId: string,
    version: number,
  ): Promise<CatalogValidationResult> {
    const response = await requestJson<{
      ok: true;
      draft: CatalogDraftRecord;
    }>(`/api/admin/catalog/drafts/${encodeURIComponent(draftId)}/validate`, {
      method: "POST",
      body: JSON.stringify({ expectedVersion: version }),
    });
    const issues = response.draft.validation_errors.map((issue) =>
      editorIssue(issue, response.draft.document),
    );
    return {
      valid: issues.length === 0,
      issues,
      diff: {},
      affected_tables: [],
      draft: response.draft,
    };
  },

  async markReady(draftId: string, version: number) {
    return requestJson<{ ok: true; draft: CatalogDraftRecord }>(
      `/api/admin/catalog/drafts/${encodeURIComponent(draftId)}/ready`,
      {
        method: "POST",
        body: JSON.stringify({ expectedVersion: version }),
      },
    );
  },

  publishDraft(draftId: string, version: number) {
    return requestJson<CatalogPublishResult>(
      `/api/admin/catalog/drafts/${encodeURIComponent(draftId)}/publish`,
      {
        method: "POST",
        body: JSON.stringify({ expectedVersion: version }),
      },
    );
  },

  async discardDraft(draftId: string, version: number) {
    await requestJson<{ ok: true; draft: CatalogDraftRecord }>(
      `/api/admin/catalog/drafts/${encodeURIComponent(draftId)}/discard`,
      {
        method: "POST",
        body: JSON.stringify({ expectedVersion: version }),
      },
    );
    return { discarded: true as const };
  },

  async listRevisions(draftId: string) {
    return requestJson<{ items: CatalogRevisionRecord[] }>(
      `/api/admin/catalog/drafts/${encodeURIComponent(draftId)}/revisions`,
    );
  },

  restoreRevision(revisionId: string) {
    return requestJson<{ ok: true; draft: CatalogDraftRecord }>(
      `/api/admin/catalog/revisions/${encodeURIComponent(revisionId)}/restore`,
      { method: "POST" },
    );
  },

  uploadMedia(
    file: File,
    productId: string,
    metadata: {
      role: ProductMediaRole;
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
    return requestJson<{ media: CatalogProductMedia }>(
      "/api/admin/catalog/media/upload",
      { method: "POST", body: form },
    );
  },
};
