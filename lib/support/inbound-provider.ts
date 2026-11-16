import "server-only";
import { toPlainText } from "@react-email/render";
import { isEmailAddress } from "@/lib/email/config";

export type NormalizedReceivedEmail = {
  providerEmailId: string;
  rfcMessageId: string;
  from: string;
  to: string[];
  subject: string;
  /** Plain text only. Render as a text node, never as HTML. */
  body: string;
  inReplyTo: string | null;
  references: string[];
  quarantineReason: string | null;
  attachments: { id: string; contentType: string; size: number }[];
};

export type InboundProviderErrorCode = "invalid_input" | "provider_unavailable" | "provider_rate_limited"
  | "provider_failed" | "provider_blocked" | "provider_invalid_response" | "provider_response_too_large"
  | "provider_connection_failed" | "attachment_url_invalid" | "attachment_too_large" | "aborted";
export class InboundProviderError extends Error {
  constructor(readonly kind: "permanent" | "transient" | "blocked", readonly code: InboundProviderErrorCode) {
    super("The received message could not be processed.");
    this.name = "InboundProviderError";
  }
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
function mailbox(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 512 || /[\r\n\0]/.test(value)) return null;
  const address = isEmailAddress(value) ? value : value.match(/^[^<>,;\r\n]{1,200}\s+<([^<>\s]+)>$/)?.[1];
  return address && isEmailAddress(address) ? address.toLowerCase() : null;
}

function messageId(value: unknown): string | null {
  return typeof value === "string" && value.length <= 512
    && /^<[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?>$/.test(value) ? value : null;
}
function automationHeader(key: string, value: unknown): boolean {
  const normalizedKey = key.toLowerCase();
  const text = typeof value === "string" ? value.replace(/\r\n[\t ]+/g, " ").trim().toLowerCase() : "";
  return (normalizedKey === "auto-submitted" && text !== "no")
    || (normalizedKey === "precedence" && /^(?:bulk|list|junk)$/.test(text))
    || /^(?:x-autoreply|x-autorespond|x-auto-response-suppress|list-id|feedback-id)$/.test(normalizedKey)
    || (normalizedKey === "return-path" && text === "<>");
}

// Keep aligned with the database review_support_inbound acceptance allowlist.
// Unknown/new reasons fail closed so a reviewable symptom cannot hide a safety failure.
const reviewableQuarantineReasons = new Set([
  "uncorrelated", "unknown_history", "ambiguous_history", "forwarded_message", "body_truncated",
  "attachment_limits_exceeded", "invalid_history", "authentication_unknown",
]);
function quarantinePriority(reason: string): number {
  if (reason === "mail_loop") return 4;
  if (reason === "automated_message") return 3;
  return reviewableQuarantineReasons.has(reason) ? 1 : 2;
}

function normalizeReceived(value: Record<string, unknown>, emailId: string): NormalizedReceivedEmail {
  let quarantineReason: string | null = null;
  const quarantine = (reason: string) => {
    if (quarantineReason === null || quarantinePriority(reason) > quarantinePriority(quarantineReason)) quarantineReason = reason;
  };
  const from = mailbox(value.from);
  if (!from) quarantine("invalid_sender");
  const addresses = (input: unknown, reason: string): string[] => {
    if (input == null) return [];
    if (!Array.isArray(input) || input.length > 5) { quarantine(reason); return []; }
    const parsed = input.map(mailbox);
    if (parsed.some((entry) => entry === null)) quarantine(reason);
    return [...new Set(parsed.filter((entry): entry is string => entry !== null))];
  };
  const to = addresses(value.to, "ambiguous_recipients");
  if (to.length !== 1 || addresses(value.cc, "ambiguous_recipients").length || addresses(value.bcc, "ambiguous_recipients").length) {
    quarantine("ambiguous_recipients");
  }
  const replyTo = addresses(value.reply_to, "reply_to_changed");
  if (replyTo.some((entry) => entry !== from)) quarantine("reply_to_changed");
  const receivedFor = addresses(value.received_for, "forwarded_message");
  if (receivedFor.some((entry) => !to.includes(entry))) quarantine("forwarded_message");

  const headers = new Map<string, string>();
  if (value.headers != null && !record(value.headers)) quarantine("invalid_headers");
  const entries = record(value.headers) ? Object.entries(value.headers) : [];
  if (entries.length > 100) quarantine("invalid_headers");
  for (const [key, entry] of entries.slice(0, 100)) {
    const normalizedKey = key.toLowerCase();
    // Unfold only legal continuation whitespace. Bare newlines and injected fields remain invalid.
    const unfolded = typeof entry === "string" ? entry.replace(/\r\n[\t ]+/g, " ") : entry;
    if (!/^[a-z0-9-]{1,78}$/.test(normalizedKey) || headers.has(normalizedKey) || typeof unfolded !== "string" || unfolded.length > 8192 || /[\x00-\x08\x0a-\x1f\x7f]/.test(unfolded)) {
      quarantine("invalid_headers"); continue;
    }
    headers.set(normalizedKey, unfolded);
  }
  if (headers.has("from") && mailbox(headers.get("from")) !== from) quarantine("invalid_sender");
  if ((headers.has("to") && !to.includes(mailbox(headers.get("to")) ?? "")) || headers.get("cc")?.trim() || headers.get("bcc")?.trim()) quarantine("ambiguous_recipients");
  if (headers.has("reply-to") && mailbox(headers.get("reply-to")) !== from) quarantine("reply_to_changed");
  const rfcMessageId = messageId(value.message_id);
  const rawInReplyTo = headers.get("in-reply-to");
  const inReplyTo = rawInReplyTo === undefined ? null : messageId(rawInReplyTo);
  const rawReferences = headers.get("references");
  let references: string[] = [];
  if (!rfcMessageId || (rawInReplyTo !== undefined && !inReplyTo)) quarantine("invalid_history");
  if (rawReferences !== undefined) {
    const ids = rawReferences.trim().split(/\s+/);
    if (rawReferences.length > 4096 || ids.length > 20 || !ids.every(messageId)) quarantine("invalid_history");
    else references = ids;
  }
  let subject = typeof value.subject === "string" ? value.subject : "";
  if ((value.subject != null && typeof value.subject !== "string") || subject.length > 200 || /[\x00-\x1f\x7f]/.test(subject)) quarantine("invalid_subject");
  subject = subject.replace(/[\x00-\x1f\x7f]/g, " ").trim().slice(0, 200) || "(No subject)";
  const hasHeader = (pattern: RegExp) => [...headers.keys()].some((key) => pattern.test(key));
  if (hasHeader(/^(?:resent-|x-forwarded-)/) || (headers.has("x-original-to") && !to.includes(mailbox(headers.get("x-original-to")) ?? ""))
    || /^(?:(?:re|aw|sv)\s*:\s*)*(?:fw|fwd)\s*:/i.test(subject)) quarantine("forwarded_message");
  // Hard-denial evidence must survive duplicated, malformed, or excess headers rather than becoming reviewable noise.
  if (entries.some(([key, entry]) => automationHeader(key, entry)) || /^(?:mailer-daemon|postmaster)@/i.test(from ?? "")) quarantine("automated_message");
  if (entries.some(([key]) => key.toLowerCase() === "x-loop") || (from !== null && to.includes(from))) quarantine("mail_loop");

  // Only Resend's receiver-computed result counts; sender-supplied authentication headers never do.
  const authentication = record(value.authentication) ? value.authentication : {};
  const authenticationResults = [authentication.spf, authentication.dkim, authentication.dmarc];
  if (authenticationResults.some((entry) => entry === "fail")) quarantine("authentication_failed");
  else if (!authenticationResults.every((entry) => entry === "pass")) quarantine("authentication_unknown");

  const attachments: NormalizedReceivedEmail["attachments"] = [];
  const rawAttachments = Array.isArray(value.attachments) ? value.attachments : [];
  if (value.attachments != null && !Array.isArray(value.attachments)) quarantine("attachment_metadata_invalid");
  if (rawAttachments.length > 5) quarantine("attachment_limits_exceeded");
  let declaredTotal = 0;
  const seenAttachmentIds = new Set<string>();
  for (const entry of rawAttachments.slice(0, 100)) {
    if (!record(entry) || typeof entry.id !== "string" || !uuid.test(entry.id) || seenAttachmentIds.has(entry.id)
      || typeof entry.content_type !== "string" || !/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i.test(entry.content_type) || entry.content_type.length > 128
      || typeof entry.size !== "number" || !Number.isSafeInteger(entry.size) || entry.size < 0) {
      quarantine("attachment_metadata_invalid"); continue;
    }
    seenAttachmentIds.add(entry.id);
    declaredTotal += entry.size;
    if (entry.size > 10 * 1024 * 1024 || declaredTotal > 20 * 1024 * 1024) quarantine("attachment_limits_exceeded");
    if (attachments.length < 5) attachments.push({ id: entry.id, contentType: entry.content_type.toLowerCase(), size: entry.size });
  }

  if ((value.text != null && typeof value.text !== "string") || (value.html != null && typeof value.html !== "string")) quarantine("invalid_body");
  const truncationMarker = "[Helix text conversion limit]";
  let body = typeof value.text === "string" && value.text.trim() ? value.text :
    typeof value.html === "string" ? toPlainText(value.html, {
      limits: { maxInputLength: 512 * 1024, maxDepth: 50, maxChildNodes: 10_000, ellipsis: truncationMarker },
      selectors: [
        ...["script", "style", "template", "svg", "math", "iframe", "object", "embed", "noscript", "img"].map((selector) => ({ selector, format: "skip" })),
        { selector: "a", options: { ignoreHref: true } },
      ],
    }) : "";
  body = body.replace(/\r\n?/g, "\n").replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "").trim();
  if (body.length > 10_000 || body.includes(truncationMarker)) quarantine("body_truncated");
  if (!body) {
    if (attachments.length) body = attachments.every((entry) => ["image/jpeg", "image/png", "image/webp"].includes(entry.contentType))
      ? "The customer sent photos without a message." : "The customer sent attachments without a message.";
    else { quarantine("empty_message"); body = "The received email contained no readable message."; }
  }
  return { providerEmailId: emailId, rfcMessageId: rfcMessageId ?? "", from: from ?? "", to, subject,
    body: body.slice(0, 10_000), inReplyTo, references, quarantineReason, attachments };
}

function assertNotAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new InboundProviderError("transient", "aborted");
}
function assertInput(emailId: string, apiKey: string, signal: AbortSignal, attachmentId?: string): void {
  assertNotAborted(signal);
  if (!uuid.test(emailId) || (attachmentId !== undefined && !uuid.test(attachmentId))) throw new InboundProviderError("permanent", "invalid_input");
  if (!/^re_[A-Za-z0-9_-]{1,256}$/.test(apiKey)) throw new InboundProviderError("blocked", "provider_blocked");
}
function responseFailure(status: number, authenticated: boolean): InboundProviderError {
  if (authenticated && [401, 403].includes(status)) return new InboundProviderError("blocked", "provider_blocked");
  if (status === 404) return new InboundProviderError("permanent", "provider_unavailable");
  if (status === 429) return new InboundProviderError("transient", "provider_rate_limited");
  return new InboundProviderError(status >= 500 || status === 408 ? "transient" : "permanent", "provider_failed");
}
async function safeOperation<T>(signal: AbortSignal, operation: () => Promise<T>): Promise<T> {
  try { return await operation(); } catch (error) {
    if (error instanceof InboundProviderError) throw error;
    throw new InboundProviderError("transient", signal.aborted ? "aborted" : "provider_connection_failed");
  }
}
async function readBytes(response: Response, limit: number, signal: AbortSignal, tooLarge: InboundProviderErrorCode): Promise<Buffer> {
  assertNotAborted(signal);
  if (Number(response.headers.get("content-length")) > limit) {
    await response.body?.cancel();
    throw new InboundProviderError("permanent", tooLarge);
  }
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  const cancelOnAbort = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener("abort", cancelOnAbort, { once: true });
  try {
    for (;;) {
      assertNotAborted(signal);
      const { done, value } = await reader.read();
      assertNotAborted(signal);
      if (done) break;
      length += value.byteLength;
      if (length > limit) {
        await reader.cancel();
        throw new InboundProviderError("permanent", tooLarge);
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks, length);
  } finally { signal.removeEventListener("abort", cancelOnAbort); reader.releaseLock(); }
}
async function apiJson(path: string, apiKey: string, signal: AbortSignal, limit: number, fetcher: typeof fetch): Promise<Record<string, unknown>> {
  assertNotAborted(signal);
  const response = await fetcher(`https://api.resend.com${path}`, {
    method: "GET", signal, redirect: "error", cache: "no-store", headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (response.status !== 200) {
    await response.body?.cancel();
    throw responseFailure(response.status, true);
  }
  const body = await readBytes(response, limit, signal, "provider_response_too_large");
  try {
    const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body));
    if (!record(value)) throw new Error();
    return value;
  } catch { throw new InboundProviderError("permanent", "provider_invalid_response"); }
}

export async function readResendInbound(emailId: string, apiKey: string, signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<NormalizedReceivedEmail> {
  return safeOperation(signal, async () => {
    assertInput(emailId, apiKey, signal);
    const value = await apiJson(`/emails/receiving/${emailId}?html_format=cid`, apiKey, signal, 512 * 1024, fetcher);
    if (value.id !== emailId) throw new InboundProviderError("permanent", "provider_invalid_response");
    try { return normalizeReceived(value, emailId); }
    catch { throw new InboundProviderError("permanent", "provider_invalid_response"); }
  });
}

export async function readResendSentMessageId(emailId: string, apiKey: string, signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<string | null> {
  return safeOperation(signal, async () => {
    assertInput(emailId, apiKey, signal);
    const value = await apiJson(`/emails/${emailId}`, apiKey, signal, 512 * 1024, fetcher);
    if (value.id !== emailId) throw new InboundProviderError("permanent", "provider_invalid_response");
    if (value.message_id == null) return null;
    const rfcMessageId = messageId(value.message_id);
    if (!rfcMessageId) throw new InboundProviderError("permanent", "provider_invalid_response");
    return rfcMessageId;
  });
}

function attachmentUrl(value: Record<string, unknown>, emailId: string, attachmentId: string): string {
  if (value.id !== attachmentId) throw new InboundProviderError("permanent", "provider_invalid_response");
  if (typeof value.size !== "number" || !Number.isSafeInteger(value.size) || value.size < 0) throw new InboundProviderError("permanent", "provider_invalid_response");
  if (value.size > 10 * 1024 * 1024) throw new InboundProviderError("permanent", "attachment_too_large");
  const rawUrl = value.download_url;
  if (typeof rawUrl !== "string" || rawUrl.length > 8192 || /[\s\x00-\x1f\x7f]/.test(rawUrl)) throw new InboundProviderError("permanent", "attachment_url_invalid");
  let url: URL;
  try { url = new URL(rawUrl); } catch { throw new InboundProviderError("permanent", "attachment_url_invalid"); }
  // Pin the currently documented provider CDN contract. Fail closed if Resend changes it.
  const expected = `https://inbound-cdn.resend.com/${emailId}/attachments/${attachmentId}`;
  if ((rawUrl !== expected && !rawUrl.startsWith(`${expected}?`)) || url.origin !== "https://inbound-cdn.resend.com"
    || url.pathname !== `/${emailId}/attachments/${attachmentId}` || url.username || url.password || url.port || url.hash) {
    throw new InboundProviderError("permanent", "attachment_url_invalid");
  }
  if (typeof value.expires_at !== "string" || !Number.isFinite(Date.parse(value.expires_at))) throw new InboundProviderError("permanent", "provider_invalid_response");
  if (Date.parse(value.expires_at) <= Date.now()) throw new InboundProviderError("transient", "provider_unavailable");
  return rawUrl;
}

export async function downloadResendPhoto(emailId: string, attachmentId: string, apiKey: string, signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<Buffer> {
  return safeOperation(signal, async () => {
    assertInput(emailId, apiKey, signal, attachmentId);
    for (let attempt = 0; attempt < 2; attempt++) {
      const metadata = await apiJson(`/emails/receiving/${emailId}/attachments/${attachmentId}`, apiKey, signal, 16 * 1024, fetcher);
      const url = attachmentUrl(metadata, emailId, attachmentId);
      assertNotAborted(signal);
      const response = await fetcher(url, { method: "GET", signal, redirect: "error", cache: "no-store" });
      if (response.status === 200) return readBytes(response, 10 * 1024 * 1024, signal, "attachment_too_large");
      await response.body?.cancel();
      assertNotAborted(signal);
      if (response.status !== 403) throw responseFailure(response.status, false);
      // The signed URL may have expired in transit. Retrieve one fresh URL within the same worker deadline.
    }
    throw new InboundProviderError("transient", "provider_unavailable");
  });
}
