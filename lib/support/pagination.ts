import type { SupportInquiryCursor, SupportInquiryStatus } from "@/lib/support/types";

export type SupportInboxQuery = {
  status: SupportInquiryStatus | "all";
  cursor?: SupportInquiryCursor;
  direction: "older" | "newer";
};
export class SupportPaginationError extends Error {
  constructor() { super("Invalid inquiry navigation."); }
}

export function isSupportInboxCursor(value: unknown): value is SupportInquiryCursor {
  if (!value || typeof value !== "object" || !("id" in value) || !("createdAt" in value)
    || typeof value.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.id)
    || typeof value.createdAt !== "string"
    || !/^(?!0000)\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(value.createdAt)) return false;
  const date = new Date(value.createdAt);
  // Validate calendar parts without rounding the database's microsecond boundary.
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 19) === value.createdAt.slice(0, 19);
}

export function parseSupportInboxQuery(query: Partial<Record<"status" | "before" | "after" | "page", string | string[]>>): SupportInboxQuery {
  const status = query.status === "closed" || query.status === "all" ? query.status : "open";
  if (query.page !== undefined || (query.before !== undefined && query.after !== undefined)) throw new SupportPaginationError();
  const direction = query.after !== undefined ? "newer" : "older";
  const raw = query.before ?? query.after;
  if (raw === undefined) return { status, direction };
  if (typeof raw !== "string" || raw.length > 100) throw new SupportPaginationError();
  const parts = raw.split(",");
  const cursor = { createdAt: parts[0], id: parts[1] };
  if (parts.length !== 2 || !isSupportInboxCursor(cursor)) throw new SupportPaginationError();
  return { status, cursor, direction };
}

export function supportInboxHref(status: SupportInquiryStatus | "all", cursor?: SupportInquiryCursor, direction: "older" | "newer" = "older"): string {
  if (cursor && !isSupportInboxCursor(cursor)) throw new SupportPaginationError();
  return `/admin/support?status=${status}${cursor ? `&${direction === "older" ? "before" : "after"}=${encodeURIComponent(`${cursor.createdAt},${cursor.id}`)}` : ""}`;
}
