import { NextResponse } from "next/server";
import { CatalogAdminError } from "@/lib/admin/catalog/errors";

const CATALOG_JSON_BODY_LIMIT = 2 * 1024 * 1024;
const CATALOG_MEDIA_BODY_LIMIT = 17 * 1024 * 1024;

function parseOrigin(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function assertSameOrigin(request: Request): void {
  const requestOrigin = new URL(request.url).origin;
  const suppliedOrigin = parseOrigin(request.headers.get("origin"));
  if (!suppliedOrigin || suppliedOrigin !== requestOrigin) {
    throw new CatalogAdminError(
      "same_origin_required",
      "This request must originate from the Mei Pelle admin.",
      403,
    );
  }
}

function assertDeclaredBodySize(request: Request, maxBytes: number): void {
  const value = request.headers.get("content-length");
  if (!value) return;
  const declared = Number(value);
  if (!Number.isSafeInteger(declared) || declared < 0 || declared > maxBytes) {
    throw new CatalogAdminError(
      "payload_too_large",
      "The request payload is too large.",
      413,
    );
  }
}

export async function readCatalogJson(
  request: Request,
  maxBytes = CATALOG_JSON_BODY_LIMIT,
): Promise<unknown> {
  assertDeclaredBodySize(request, maxBytes);
  const body = await request.text();
  if (Buffer.byteLength(body, "utf8") > maxBytes) {
    throw new CatalogAdminError(
      "payload_too_large",
      "The request payload is too large.",
      413,
    );
  }
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new CatalogAdminError(
      "invalid_json",
      "The request body must be valid JSON.",
      400,
    );
  }
}

export function assertMediaRequestSize(request: Request): void {
  assertDeclaredBodySize(request, CATALOG_MEDIA_BODY_LIMIT);
}

export function requireRequestObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CatalogAdminError(
      "invalid_body",
      "The request body must be an object.",
      400,
    );
  }
  return value as Record<string, unknown>;
}

export function requireExpectedVersion(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new CatalogAdminError(
      "invalid_version",
      "expectedVersion must be a positive integer.",
      400,
    );
  }
  return value as number;
}

function catalogErrorResponse(error: unknown): NextResponse {
  if (error instanceof CatalogAdminError) {
    return NextResponse.json(
      {
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        },
      },
      { status: error.status },
    );
  }

  const message =
    error instanceof Error ? error.message : "Unknown catalog editor error.";
  console.error("[catalog-editor] request failed:", message);
  return NextResponse.json(
    {
      error: {
        code: "catalog_editor_unavailable",
        message: "The catalog editor is temporarily unavailable.",
      },
    },
    { status: 503 },
  );
}

export async function runCatalogRoute(
  operation: () => Promise<NextResponse>,
): Promise<NextResponse> {
  try {
    return await operation();
  } catch (error) {
    return catalogErrorResponse(error);
  }
}
