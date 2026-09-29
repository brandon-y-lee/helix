import "server-only";
import { randomBytes } from "node:crypto";
import { assertEmailEnvironment, emailRecipientAllowed, isEmailAddress, type EmailEnvironment } from "@/lib/email/config";
import { readBoundedBody } from "@/lib/email/provider";

export const NOTIFICATION_CAPABILITY = /^[A-Za-z0-9_-]{43}$/;
export const NOTIFICATION_REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const MAX_RECOVERY_LINKS = 20;
export type NotificationRecoveryInput = {
  email: string; requestId: string; abuseKey: string; tokens: string[]; deliveryAllowed: boolean;
};
export interface ProductNotificationStorage {
  recover(input: NotificationRecoveryInput): Promise<{ ok: boolean }>;
  cancel(token: string): Promise<{ ok: boolean }>;
}
const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };
function response(status: number, ok = false) {
  return Response.json(ok ? { ok: true } : { ok: false, error: {
    message: status === 503 ? "Product notifications are temporarily unavailable. Try again." : "Check this request and try again.",
  } }, { status, headers });
}

export async function handleProductNotificationRequest(request: Request, action: "recovery" | "cancel",
  dependencies: { storage: ProductNotificationStorage; abuseKey(request: Request): string; env: EmailEnvironment }): Promise<Response> {
  if (request.method !== "POST") return response(405);
  if (request.headers.get("origin") !== new URL(request.url).origin) return response(403);
  if (!/^application\/json(?:\s*;\s*charset=(?:utf-8|"utf-8"))?$/i.test(request.headers.get("content-type") ?? "")) return response(400);
  let body: Record<string, unknown>;
  try {
    const value: unknown = JSON.parse(await readBoundedBody(request, 2_048));
    if (!value || typeof value !== "object" || Array.isArray(value)) return response(400);
    body = value as Record<string, unknown>;
  } catch (error) { return response(error instanceof RangeError ? 413 : 400); }
  try {
    if (action === "cancel") {
      if (Object.keys(body).some((key) => key !== "token") || typeof body.token !== "string" || !NOTIFICATION_CAPABILITY.test(body.token)) return response(400);
      const result = await dependencies.storage.cancel(body.token);
      return response(result.ok ? 200 : 503, result.ok);
    }
    if (Object.keys(body).some((key) => key !== "email" && key !== "requestId") || typeof body.email !== "string"
      || typeof body.requestId !== "string" || !NOTIFICATION_REQUEST_ID.test(body.requestId)) return response(400);
    const email = body.email.trim().toLowerCase();
    if (!isEmailAddress(email) || email.split("@")[0].length > 64) return response(400);
    assertEmailEnvironment(dependencies.env);
    // Even a restricted recipient reaches durable abuse accounting. The SQL
    // boundary never returns existence, Product interest, or a capability.
    const result = await dependencies.storage.recover({ email, requestId: body.requestId,
      abuseKey: dependencies.abuseKey(request), deliveryAllowed: emailRecipientAllowed(email, dependencies.env),
      tokens: Array.from({ length: MAX_RECOVERY_LINKS }, () => randomBytes(32).toString("base64url")) });
    return response(result.ok ? 202 : 503, result.ok);
  } catch { return response(503); }
}
