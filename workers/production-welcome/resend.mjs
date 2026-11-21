import { validRecipient, validUuid } from "./bindings.mjs";

const destination = "https://api.resend.com/events/send";
const event = "helix.welcome.confirmed.v1";
const timeoutMs = 8000;
const maxResponseBytes = 512;

export function validProviderKey(key) {
  return typeof key === "string" && /^re_[A-Za-z0-9_-]{12,250}$/.test(key);
}

async function accepted(response) {
  if (response.status !== 202 || response.redirected || !response.body) {
    void response.body?.cancel().catch(() => {});
    return false;
  }
  const reader = response.body.getReader();
  const bytes = new Uint8Array(maxResponseBytes);
  let used = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (used + value.byteLength > bytes.length) {
        void reader.cancel().catch(() => {});
        return false;
      }
      bytes.set(value, used);
      used += value.byteLength;
    }
    const result = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, used)));
    return result?.object === "event" && result.event === event && Object.keys(result).length === 2;
  } finally {
    reader.releaseLock();
  }
}

// The only production caller gets this binding from the committed DB row.
// No request headers, endpoint, template, content or arbitrary event properties enter this boundary.
export async function submitReservedEvent(reservation, key, fetchImpl = fetch) {
  if (!validProviderKey(key) || !validUuid(reservation?.attemptId) || !validRecipient(reservation.recipient))
    return "unknown";
  // The committed attempt consumed a slot on the database's UTC quota day.
  // A suspended invocation must not publish it later or on another day's quota.
  const now = Date.now();
  const reservedAt = Date.parse(reservation.reservedAt);
  const utcDayMs = 24 * 60 * 60 * 1000;
  if (!Number.isFinite(reservedAt) || Math.abs(now - reservedAt) > timeoutMs ||
      Math.floor(now / utcDayMs) !== Math.floor(reservedAt / utcDayMs)) return "unknown";
  const body = JSON.stringify({
    event,
    email: reservation.recipient,
    payload: { attempt_id: reservation.attemptId },
  });
  const controller = new AbortController();
  let timer;
  try {
    const deadline = new Promise((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        resolve(false);
      }, timeoutMs);
    });
    // Resend offers no idempotency or submission ID on /events/send. Every response
    // after this one network attempt, including 4xx/5xx, is terminal for automatic work.
    const response = fetchImpl(destination, {
      method: "POST",
      redirect: "error",
      cache: "no-store",
      signal: controller.signal,
      headers: { authorization: "Bearer " + key, "content-type": "application/json" },
      body,
    }).then(accepted);
    return (await Promise.race([response, deadline])) ? "submitted" : "unknown";
  } catch {
    return "unknown";
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
