import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { assertEmailEnvironment, emailRecipientAllowed, isEmailAddress, type EmailEnvironment } from "@/lib/email/config";
import { readBoundedBody } from "@/lib/email/provider";
import { CAPABILITY, readMarketingTemplateContract, type MarketingTemplateContract } from "@/lib/marketing/contract";

export type MarketingAction = "subscription" | "confirm" | "preferences";
export type SubscriptionRequest = {
  email: string; consent: true; source: "email_preferences" | "welcome_popup"; wordingVersion: "2026-09-29-welcome-v1" | "2026-11-13-lifecycle-v1" | "2026-11-13-lifecycle-v2";
  confirmationToken: string; abuseKey: string; templateContract: MarketingTemplateContract;
};
export interface MarketingRequestStorage {
  request(input: SubscriptionRequest): Promise<{ status: string }>;
  confirm(token: string, preferenceToken: string, scope: "welcome" | "lifecycle" | "lifecycle_reviews"): Promise<{ status: string }>;
  withdraw(token: string, scope: "all" | "welcome"): Promise<{ status: string }>;
}
const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };
const response = (status: number, ok = false) => Response.json({ ok }, { status, headers });

export async function handleMarketingRequest(request: Request, action: MarketingAction,
  { storage, env }: { storage: MarketingRequestStorage; env: EmailEnvironment }): Promise<Response> {
  if (request.method !== "POST") return response(405);
  if (request.headers.get("origin") !== new URL(request.url).origin) return response(403);
  let body: Record<string, unknown>;
  try {
    const value: unknown = JSON.parse(await readBoundedBody(request, 2_048));
    if (!value || typeof value !== "object" || Array.isArray(value)) return response(400);
    body = value as Record<string, unknown>;
  } catch (error) { return response(error instanceof RangeError ? 413 : 400); }
  try {
    if (action === "subscription") {
      if (typeof body.email !== "string" || body.consent !== true) return response(400);
      if (body.scope !== undefined && body.scope !== "welcome" && body.scope !== "lifecycle" && body.scope !== "lifecycle_reviews") return response(400);
      const reviews = body.scope === "lifecycle_reviews";
      const lifecycle = body.scope === "lifecycle" || reviews;
      if (body.source !== undefined && body.source !== "email_preferences" && !(lifecycle && body.source === "welcome_popup")) return response(400);
      if (reviews && env.HELIX_LIFECYCLE_REVIEWS_ENABLED !== "true") return response(503);
      if (lifecycle && env.HELIX_LIFECYCLE_ENABLED !== "true") return response(503);
      const email = body.email.trim().toLowerCase();
      if (!isEmailAddress(email) || email.split("@")[0].length > 64) return response(400);
      if (env.HELIX_MARKETING_ENABLED !== "true") return response(503);
      assertEmailEnvironment(env);
      // Same outward state for restricted and permitted addresses; never substitute a recipient.
      if (!emailRecipientAllowed(email, env)) return response(202, true);
      const result = await storage.request({ email, consent: true, source: lifecycle && body.source === "welcome_popup" ? "welcome_popup" : "email_preferences",
        wordingVersion: reviews ? "2026-11-13-lifecycle-v2" : lifecycle ? "2026-11-13-lifecycle-v1" : "2026-09-29-welcome-v1",
        confirmationToken: randomBytes(32).toString("base64url"), abuseKey: createHash("sha256").update(`marketing-request:${email}`).digest("hex"),
        templateContract: readMarketingTemplateContract(env, reviews ? "lifecycle_reviews" : lifecycle ? "lifecycle" : "welcome") });
      return response(result.status === "accepted" ? 202 : 503, result.status === "accepted");
    }
    if (typeof body.token !== "string" || !CAPABILITY.test(body.token)) return response(400);
    if (action === "confirm") {
      if (body.scope !== undefined && body.scope !== "welcome" && body.scope !== "lifecycle" && body.scope !== "lifecycle_reviews") return response(400);
      const result = await storage.confirm(body.token, randomBytes(32).toString("base64url"), body.scope === "lifecycle_reviews" ? "lifecycle_reviews" : body.scope === "lifecycle" ? "lifecycle" : "welcome");
      return response(result.status === "confirmed" ? 200 : 400, result.status === "confirmed");
    }
    if (body.scope !== "all" && body.scope !== "welcome") return response(400);
    const result = await storage.withdraw(body.token, body.scope);
    return response(result.status === "accepted" ? 200 : 400, result.status === "accepted");
  } catch { return response(503); }
}

// Mailbox providers cannot supply a browser Origin. This capability only withdraws;
// it neither exposes preferences nor grants consent, and GET never performs it.
export async function handleMarketingUnsubscribe(request: Request, storage: MarketingRequestStorage): Promise<Response> {
  if (request.method !== "POST") return response(405);
  const token = new URL(request.url).searchParams.get("token");
  if (!token || !CAPABILITY.test(token) || !request.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded")) return response(400);
  try {
    const body = new URLSearchParams(await readBoundedBody(request, 256));
    if (body.size !== 1 || body.get("List-Unsubscribe") !== "One-Click") return response(400);
    const result = await storage.withdraw(token, "all");
    return response(result.status === "accepted" ? 200 : 400, result.status === "accepted");
  } catch (error) { return response(error instanceof RangeError ? 413 : 503); }
}
