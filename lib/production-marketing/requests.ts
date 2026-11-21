import "server-only";
import { productionDeploymentAuthorized } from "@/lib/release/deployment-authorization";
import { createHash, createHmac } from "node:crypto";
import { sealProductionMarketingCapabilities, type ProductionMarketingHeldEnvelope } from "./capabilities";
import { isIP } from "node:net";
import { isEmailAddress } from "@/lib/email/config";
import { readBoundedBody } from "@/lib/email/provider";
import { productionMarketingEnrollmentEnabled, readProductionMarketingConfiguration } from "./config";
import { PRODUCTION_MARKETING_CAPABILITY, PRODUCTION_MARKETING_WORDING_VERSION, type ProductionMarketingEnvironment } from "./contract";
export type ProductionMarketingSubscriptionRequest = {
  email: string; explicitConsent: true; wordingVersion: typeof PRODUCTION_MARKETING_WORDING_VERSION;
  confirmationHash: string; preferenceHash: string; requesterHash: string; deliveryPayload: ProductionMarketingHeldEnvelope;
};
export interface ProductionMarketingRequestStorage {
  request(input: ProductionMarketingSubscriptionRequest): Promise<boolean>;
  confirm(hash: string): Promise<boolean>;
  withdraw(hash: string): Promise<boolean>;
}
const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" };
const response = (status: number, ok = false) => Response.json({ ok }, { status, headers });
const hash = (token: string) => createHash("sha256").update(token).digest("hex");
export async function handleProductionMarketingRequest(request: Request, action: "subscription" | "confirm" | "preferences",
  deps: { env: ProductionMarketingEnvironment; storage: ProductionMarketingRequestStorage }) {
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
      if (Object.keys(body).some(key => !["email", "consent"].includes(key)) || typeof body.email !== "string" || body.consent !== true) return response(400);
      const email = body.email.trim().toLowerCase();
      if (!isEmailAddress(email) || email.split("@")[0].length > 64) return response(400);
      if (new URL(request.url).origin !== readProductionMarketingConfiguration(deps.env).siteOrigin) return response(403);
      if (!await productionMarketingEnrollmentEnabled(deps.env)) return response(503);
      // Only trust the platform-owned client address after validating the Vercel production binding.
      const ip = request.headers.get("x-vercel-forwarded-for") ?? "";
      const abuseKey = deps.env.HELIX_PRODUCTION_MARKETING_ABUSE_KEY;
      if (!isIP(ip) || !abuseKey || abuseKey.length < 32) return response(503);
      await deps.storage.request({ email, explicitConsent: true, wordingVersion: PRODUCTION_MARKETING_WORDING_VERSION,
        ...sealProductionMarketingCapabilities(email, deps.env),
        requesterHash: createHmac("sha256", abuseKey).update(`production-marketing:${ip}`).digest("hex") });
      return response(202, true);
    }
    if (Object.keys(body).some(key => key !== "token") || typeof body.token !== "string" || !PRODUCTION_MARKETING_CAPABILITY.test(body.token)) return response(400);
    const config = readProductionMarketingConfiguration(deps.env);
    if (new URL(request.url).origin !== config.siteOrigin) return response(403);
    if (action === "confirm") {
      if (!await productionMarketingEnrollmentEnabled(deps.env)) return response(503);
      return (await deps.storage.confirm(hash(body.token))) ? response(200, true) : response(400);
    }
    // Withdrawal is restrictive and remains available regardless of enrollment/dispatch controls.
    // A validly shaped unknown/used capability has the same public result as a current one.
    if (!await productionDeploymentAuthorized(deps.env)) return response(503);
    await deps.storage.withdraw(hash(body.token));
    return response(200, true);
  } catch { return response(503); }
}

// RFC 8058 clients do not supply Origin. GET/HEAD never mutate state.
export async function handleProductionMarketingUnsubscribe(request: Request,
  deps: { env: ProductionMarketingEnvironment; storage: ProductionMarketingRequestStorage }) {
  if (request.method !== "POST") return response(405);
  const url = new URL(request.url), token = url.searchParams.get("token");
  if (url.searchParams.size !== 1 || !token || !PRODUCTION_MARKETING_CAPABILITY.test(token)
    || request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/x-www-form-urlencoded") return response(400);
  try {
    const form = new URLSearchParams(await readBoundedBody(request, 256));
    if (form.size !== 1 || form.get("List-Unsubscribe") !== "One-Click") return response(400);
    if (url.origin !== readProductionMarketingConfiguration(deps.env).siteOrigin) return response(403);
    if (!await productionDeploymentAuthorized(deps.env)) return response(503);
    await deps.storage.withdraw(hash(token));
    return response(200, true);
  } catch (error) { return response(error instanceof RangeError ? 413 : 503); }
}
