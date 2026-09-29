import "server-only";
import { readBoundedBody } from "@/lib/email/provider";

const failures = {
  support_unavailable: [503, "Support is temporarily unavailable. Please try again."],
  invalid_support_input: [400, "Check the inquiry details and try again."],
  submission_conflict: [409, "This submission changed. Refresh the form and try again."],
  rate_limited: [429, "Too many inquiries. Please try again later."],
  forbidden: [403, "Support access is not available for this account."],
  authentication_required: [401, "Sign in to continue."],
  not_found: [404, "This inquiry is unavailable."],
  stale_inquiry: [409, "This inquiry changed. Reload it before continuing."],
  stale_draft: [409, "This draft changed. Reload it before continuing."],
  reply_reconciliation_required: [409, "An earlier reply needs delivery review before another reply can be queued."],
  same_origin_required: [403, "This request must originate from helix."],
  payload_too_large: [413, "The inquiry is too large. Please shorten your message."],
  pending_support_context: [409, "Incoming content needs processing or review before a reply can be approved."],
  invalid_photo_input: [400, "Check the photos and try again."],
  upload_forbidden: [403, "This photo upload is unavailable."],
  upload_expired: [410, "This photo upload has expired. Send a new inquiry if you still need to share it."],
  photo_limit_exceeded: [400, "You can attach up to five photos to a message."],
  photo_budget_exceeded: [413, "Photos must total 20 MiB or less per message."],
  ai_unavailable: [503, "AI drafting is unavailable. You can still write a manual reply."],
  ai_busy: [409, "Another draft is being prepared. Wait for it to finish or cancel it first."],
  ai_context_unavailable: [409, "This inquiry needs a manual reply or review of incoming content before drafting."],
} as const;
export type SupportErrorCode = keyof typeof failures;

export class SupportError extends Error {
  readonly status: number;
  constructor(readonly code: SupportErrorCode) {
    super(failures[code][1]);
    this.status = failures[code][0];
  }
}

export function supportResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: {
    "cache-control": "private, no-store", "x-content-type-options": "nosniff",
    ...(status === 429 ? { "retry-after": "3600" } : {}),
  } });
}

export function supportFailure(error: unknown): Response {
  const failure = error instanceof SupportError ? error : new SupportError("support_unavailable");
  return supportResponse({ ok: false, error: { code: failure.code, message: failure.message } }, failure.status);
}

export function supportStorageError(error: { message?: string } | null): never {
  const code = error?.message;
  throw new SupportError(code && Object.hasOwn(failures, code) ? code as SupportErrorCode : "support_unavailable");
}

export function assertSupportOrigin(request: Request, configuredOrigin?: string): void {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin || (configuredOrigin && origin !== configuredOrigin)) {
    throw new SupportError("same_origin_required");
  }
}

export async function readSupportJson(request: Request): Promise<Record<string, unknown>> {
  if (!/^application\/json(?:\s*;\s*charset=(?:utf-8|"utf-8"))?$/i.test(request.headers.get("content-type") ?? "")) {
    throw new SupportError("invalid_support_input");
  }
  let text: string;
  try { text = await readBoundedBody(request, 48 * 1024); }
  catch { throw new SupportError("payload_too_large"); }
  try {
    const body: unknown = JSON.parse(text);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    return body as Record<string, unknown>;
  } catch { throw new SupportError("invalid_support_input"); }
}

export function supportText(value: unknown, max: number, multiline = false): string {
  if (typeof value !== "string") throw new SupportError("invalid_support_input");
  const text = value.replace(/\r\n/g, "\n").trim();
  if (!text || text.length > max || (multiline ? /[\u0000-\u0008\u000b-\u001f\u007f]/ : /[\u0000-\u001f\u007f]/).test(text)) {
    throw new SupportError("invalid_support_input");
  }
  return text;
}

export function supportUuid(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new SupportError("invalid_support_input");
  }
  return value;
}
