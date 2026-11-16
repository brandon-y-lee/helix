import "server-only";
import type { EmailAttemptOutcome, EmailRequest } from "@/lib/email/types";

// Use a bounded REST request: SDK development logging may include raw provider errors.
export async function sendResendEmail(payload: EmailRequest, idempotencyKey: string, apiKey: string): Promise<EmailAttemptOutcome> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<EmailAttemptOutcome>((resolve) => {
    timer = setTimeout(() => { controller.abort(); resolve({ kind: "uncertain", code: "provider_connection_uncertain" }); }, 8_000);
  });
  try {
    return await Promise.race([send(), deadline]);
  } catch { return { kind: "uncertain", code: "provider_connection_uncertain" }; }
  finally { clearTimeout(timer); controller.abort(); }

  async function send(): Promise<EmailAttemptOutcome> {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST", signal: controller.signal, redirect: "error", cache: "no-store",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(payload),
    });
    if (response.status >= 500 || response.status === 408 || response.status === 409) {
      await response.body?.cancel();
      return { kind: "uncertain", code: `provider_http_${response.status}` };
    }
    if (!response.ok) {
      await response.body?.cancel();
      return { kind: response.status === 429 ? "retry" : [401, 403].includes(response.status) ? "blocked" : "failed", code: `provider_http_${response.status}` };
    }
    const body = await readBoundedBody(response, 16_384);
    const data: unknown = JSON.parse(body);
    if (!data || typeof data !== "object" || !("id" in data) || typeof data.id !== "string" || !/^[A-Za-z0-9_-]{1,200}$/.test(data.id)) {
      return { kind: "uncertain", code: "provider_invalid_response" };
    }
    return { kind: "accepted", id: data.id };
  }
}

export async function readBoundedBody(message: Pick<Request, "body" | "headers">, limit: number): Promise<string> {
  if (Number(message.headers.get("content-length")) > limit) throw new RangeError();
  if (!message.body) return "";
  const reader = message.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) { await reader.cancel(); throw new RangeError(); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks).toString("utf8");
}
