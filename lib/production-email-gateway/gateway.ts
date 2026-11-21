import "server-only";
import { productionDeploymentAuthorized } from "@/lib/release/deployment-authorization";
import { Resend } from "resend";
import { HASH, UUID } from "@/lib/support/production/config";
import { legacyInbound, legacyReceipt, parseLegacySnapshot, type LegacyDelegates } from "./legacy";
export type GatewayEnvironment = Record<string, string | undefined>;
export type GatewayDependencies = { env: GatewayEnvironment; support?: (raw: Request, secret: string) => Promise<Response>;
  welcome?: (raw: Request, secret: string) => Promise<Response>; legacy?: LegacyDelegates };
const origin = "https://www.helixskin.us", limit = 128 * 1024;
const outgoing = new Set(["email.sent", "email.delivered", "email.delivery_delayed", "email.failed", "email.bounced", "email.complained", "email.suppressed"]);
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const uuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);
const safe = (v: unknown, max: number): v is string => typeof v === "string" && v.length > 0 && v.length <= max && !/[\r\n\0]/.test(v);
function response(status: number) { return Response.json({ ok: status === 200 }, { status,
  headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" } }); }
function configuration(env: GatewayEnvironment): string {
  const secret = env.HELIX_PRODUCTION_EMAIL_GATEWAY_WEBHOOK_SECRET;
  if (env.HELIX_PRODUCTION_EMAIL_GATEWAY_ENABLED !== "true" || env.VERCEL !== "1" || env.VERCEL_ENV !== "production"
    || (env.VERCEL_TARGET_ENV !== undefined && env.VERCEL_TARGET_ENV !== "production")
    || env.HELIX_PRODUCTION_EMAIL_GATEWAY_ORIGIN !== origin || !env.VERCEL_PROJECT_ID || !env.VERCEL_DEPLOYMENT_ID
    || env.VERCEL_PROJECT_ID !== env.HELIX_PRODUCTION_EMAIL_GATEWAY_PROJECT_ID
    || !secret?.startsWith("whsec_") || secret.length > 256 || secret === env.RESEND_WEBHOOK_SECRET) throw new Error();
  const encoded = secret.slice(6), bytes = Buffer.from(encoded, "base64");
  if (bytes.length < 16 || bytes.length > 64 || bytes.toString("base64") !== encoded) throw new Error();
  return secret;
}
async function rawBody(request: Request): Promise<string> {
  if (Number(request.headers.get("content-length")) > limit) throw new RangeError();
  if (!request.body) return "";
  const reader = request.body.getReader(), chunks: Uint8Array[] = [];
  let bytes = 0, expired = false, timer: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => { void reader.cancel().catch(() => {}); };
  try {
    const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => { expired = true; cancel(); reject(new Error()); }, 3000); });
    return await Promise.race([(async () => {
      for (;;) { const chunk = await reader.read(); if (expired) throw new Error(); if (chunk.done) break;
        bytes += chunk.value.byteLength; if (bytes > limit) { cancel(); throw new RangeError(); } chunks.push(chunk.value); }
      return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(Buffer.concat(chunks));
    })(), deadline]);
  } finally { clearTimeout(timer); reader.releaseLock(); }
}
function validTime(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 19) === value.slice(0, 19) && Date.parse(value) <= Date.now() + 300000;
}
export async function receiveProductionEmail(request: Request, deps: GatewayDependencies): Promise<Response> {
  if (request.method !== "POST") return response(405);
  let secret: string;
  try { secret = configuration(deps.env); } catch { return response(503); }
  if (new URL(request.url).origin !== origin) return response(403);
  const id = request.headers.get("svix-id") ?? "", timestamp = request.headers.get("svix-timestamp") ?? "", signature = request.headers.get("svix-signature") ?? "";
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(id) || !/^\d{1,12}$/.test(timestamp) || Math.abs(Date.now()/1000 - Number(timestamp)) > 300 || !signature || signature.length > 1024) return response(400);
  let raw: string, event: unknown;
  try { raw = await rawBody(request); event = new Resend("re_local_signature_verification_only").webhooks.verify({ payload: raw, webhookSecret: secret, headers: { id, timestamp, signature } }); }
  catch (error) { return response(error instanceof RangeError ? 413 : 400); }
  if (!await productionDeploymentAuthorized(deps.env)) return response(503);
  if (!object(event) || !safe(event.type, 100) || !validTime(event.created_at) || !object(event.data)) return response(400);
  const data = event.data, tags = data.tags === undefined ? {} : data.tags;
  if (!object(tags) || Object.keys(tags).length > 20 || Object.entries(tags).some(([k, v]) => !/^[A-Za-z0-9_-]{1,64}$/.test(k) || !safe(v, 256))) return response(400);
  const support = Object.keys(tags).some((key) => key === "helix_support" || key.startsWith("helix_support_"));
  const legacy = tags.helix_environment === "sandbox";
  const welcome = tags.environment === "production" || tags.helix_contract !== undefined || (!legacy && tags.helix_purpose !== undefined);
  if (Number(support) + Number(legacy) + Number(welcome) > 1) return response(400);
  if (support && (!uuid(tags.helix_support_outbox) || !uuid(tags.helix_support_contract) || typeof tags.helix_support_delivery !== "string" || !HASH.test(tags.helix_support_delivery))) return response(400);
  if (welcome && (tags.environment !== "production" || !uuid(tags.helix_message_id) || !["confirmation", "welcome"].includes(String(tags.helix_purpose)) || tags.helix_contract !== "production_welcome_delivery_v1")) return response(400);
  if (legacy && !uuid(tags.helix_message_id)) return response(400);
  if (!support && !welcome && !legacy && Object.keys(tags).some((k) => k.startsWith("helix_"))) return response(503);
  const type = event.type, occurredAt = event.created_at;
  if ((outgoing.has(type) || type === "email.received") && (!uuid(data.email_id) || !safe(data.from, 512)
    || !Array.isArray(data.to) || data.to.length < 1 || data.to.length > 100 || data.to.some((to) => !safe(to, 512)))) return response(400);
  // Never serialize a verified event back to JSON before existing signature verification.
  const cloneRaw = () => new Request(request.url, { method: "POST", headers: request.headers, body: raw });
  const delegate = async (fn: NonNullable<GatewayDependencies["support"]>) => {
    const result = await fn(cloneRaw(), secret);
    return response([200, 400, 403, 405, 413].includes(result.status) ? result.status : 503);
  };
  try {
    if (support) return type === "email.sent" && deps.support ? await delegate(deps.support) : response(503);
    if (welcome) return outgoing.has(type) && deps.welcome ? await delegate(deps.welcome) : response(503);
    if (legacy) {
      if (!outgoing.has(type) || !deps.legacy?.receipt) return response(503);
      const snapshot = parseLegacySnapshot(deps.legacy.snapshot), matched = legacyReceipt(snapshot, id, type, occurredAt, data);
      if (!matched) return response(503);
      const result = await deps.legacy.receipt(matched);
      return response(result === "recorded" || result === "duplicate" ? 200 : 503);
    }
    if (type === "email.received") {
      if (!deps.legacy) return response(503);
      const snapshot = parseLegacySnapshot(deps.legacy.snapshot), matched = legacyInbound(snapshot, id, occurredAt, data);
      if (!matched) return response(200);
      if (!deps.legacy.queue) return response(503);
      const result = await deps.legacy.queue(matched);
      return response(result && ["queued", "duplicate"].includes(result.status) && uuid(result.id) ? 200 : 503);
    }
    return response(200);
  } catch { return response(503); }
}
