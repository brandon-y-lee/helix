import "server-only";

import type {
  CatalogDraftPreviewRecord,
  CatalogDraftStatus,
} from "@/lib/catalog-editor/contracts";

const DRAFT_RESPONSE_LIMIT_BYTES = 1_000_000;
const DRAFT_REQUEST_TIMEOUT_MS = 8_000;
const DRAFT_STATUSES: CatalogDraftStatus[] = [
  "draft",
  "discarded",
  "published",
];

export const CATALOG_DRAFT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type CatalogDraftLoadFailure =
  | "backend_unavailable"
  | "draft_discarded"
  | "draft_not_found"
  | "draft_published"
  | "permission_revoked"
  | "validation_error";

export type CatalogDraftLoadResult =
  | { ok: true; record: CatalogDraftPreviewRecord }
  | { ok: false; reason: CatalogDraftLoadFailure };

type DraftLoaderOptions = {
  draftId: string;
  accessToken: string | null;
  backendUrl?: string;
  fetchImpl?: typeof fetch;
};

function draftBackendUrl(configured: string | undefined, draftId: string) {
  if (!configured) return null;

  try {
    const base = new URL(configured);
    if (
      base.username ||
      base.password ||
      base.search ||
      base.hash ||
      (process.env.NODE_ENV === "production" && base.protocol !== "https:") ||
      (base.protocol !== "https:" &&
        !(base.protocol === "http:" &&
          ["localhost", "127.0.0.1", "::1"].includes(base.hostname)))
    ) {
      return null;
    }
    base.pathname = `${base.pathname.replace(/\/$/, "")}/drafts/${encodeURIComponent(draftId)}`;
    return base;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function parseRecord(
  value: unknown,
  requestedDraftId: string,
): CatalogDraftPreviewRecord | null {
  if (!isRecord(value)) return null;

  const draftId =
    typeof value.draftId === "string"
      ? value.draftId
      : typeof value.id === "string"
        ? value.id
        : null;
  const lastSavedAt =
    typeof value.lastSavedAt === "string"
      ? value.lastSavedAt
      : typeof value.updatedAt === "string"
        ? value.updatedAt
        : null;

  if (
    draftId !== requestedDraftId ||
    typeof value.status !== "string" ||
    !DRAFT_STATUSES.includes(value.status as CatalogDraftStatus) ||
    typeof value.version !== "number" ||
    !Number.isSafeInteger(value.version) ||
    value.version < 1 ||
    !lastSavedAt ||
    Number.isNaN(Date.parse(lastSavedAt)) ||
    !("document" in value)
  ) {
    return null;
  }

  const editorPath =
    typeof value.editorPath === "string" &&
    value.editorPath.startsWith("/admin/catalog") &&
    !value.editorPath.startsWith("//")
      ? value.editorPath
      : `/admin/catalog/${encodeURIComponent(draftId)}`;
  const publishedSlug =
    typeof value.publishedSlug === "string" &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.publishedSlug)
      ? value.publishedSlug
      : null;

  return {
    draftId,
    status: value.status as CatalogDraftStatus,
    version: value.version,
    lastSavedAt,
    editorPath,
    publishedSlug,
    document: value.document,
  };
}

export async function loadCatalogDraftPreview({
  draftId,
  accessToken,
  backendUrl = process.env.CATALOG_EDITOR_BACKEND_URL,
  fetchImpl = fetch,
}: DraftLoaderOptions): Promise<CatalogDraftLoadResult> {
  if (!CATALOG_DRAFT_ID_PATTERN.test(draftId)) {
    return { ok: false, reason: "draft_not_found" };
  }
  if (!accessToken) {
    return { ok: false, reason: "permission_revoked" };
  }

  const url = draftBackendUrl(backendUrl, draftId);
  if (!url) return { ok: false, reason: "backend_unavailable" };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DRAFT_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
      next: { revalidate: 0 },
      signal: controller.signal,
    });

    if (response.status === 401 || response.status === 403) {
      return { ok: false, reason: "permission_revoked" };
    }
    if (response.status === 404) {
      return { ok: false, reason: "draft_not_found" };
    }
    if (response.status === 409) {
      return { ok: false, reason: "draft_published" };
    }
    if (response.status === 410) {
      return { ok: false, reason: "draft_discarded" };
    }
    if (!response.ok) {
      return response.status === 400 || response.status === 422
        ? { ok: false, reason: "validation_error" }
        : { ok: false, reason: "backend_unavailable" };
    }

    const contentLength = Number(response.headers.get("content-length") ?? 0);
    if (
      Number.isFinite(contentLength) &&
      contentLength > DRAFT_RESPONSE_LIMIT_BYTES
    ) {
      return { ok: false, reason: "validation_error" };
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return { ok: false, reason: "validation_error" };
    }
    const record = parseRecord(payload, draftId);
    return record
      ? { ok: true, record }
      : { ok: false, reason: "validation_error" };
  } catch {
    return { ok: false, reason: "backend_unavailable" };
  } finally {
    clearTimeout(timeout);
  }
}
