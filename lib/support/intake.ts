import "server-only";
import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { contactInquiryTypes } from "@/content/support/contact";
import { isEmailAddress, type EmailEnvironment } from "@/lib/email/config";
import { getCurrentUser } from "@/lib/auth/session";
import { authorizeCheckoutReceipt } from "@/lib/orders/receipt-access";
import { STRIPE_SANDBOX_ACCOUNT_ID } from "@/lib/checkout/config";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { supportRpc } from "@/lib/support/storage";
import { assertSupportOrigin, readSupportJson, SupportError, supportFailure, supportResponse, supportText, supportUuid } from "@/lib/support/request";

export type SupportIntakeInput = {
  submissionId: string; name: string; email: string; inquiryType: string; subject: string; body: string;
  abuseKey: string; emailAbuseKey: string; orderId: string | null;
};
export type SupportIntakeDependencies = {
  env: EmailEnvironment;
  available(): Promise<boolean>;
  abuseKeys(request: Request, email: string): { source: string; email: string };
  authorizeOrder(sessionId: string): Promise<string | null>;
  submit(input: SupportIntakeInput): Promise<{ inquiryId: string }>;
};

function intakeOrigin(env: EmailEnvironment): string | null {
  if (env.HELIX_SUPPORT_INTAKE_ENABLED !== "true" || env.HELIX_EMAIL_ENVIRONMENT !== "sandbox" || env.HELIX_EMAIL_MODE !== "restricted") return null;
  const origin = env.HELIX_EMAIL_SITE_ORIGIN?.trim();
  try {
    if (!origin) return null;
    const url = new URL(origin);
    const local = env.NODE_ENV !== "production" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    return url.origin === origin && !url.username && !url.password && (url.protocol === "https:" || (url.protocol === "http:" && local)) ? origin : null;
  } catch { return null; }
}

async function authorizeSupportOrder(sessionId: string): Promise<string | null> {
  if (!/^cs_[A-Za-z0-9_]{1,200}$/.test(sessionId)) return null;
  const { data, error } = await createSupabaseAdminClient().from("orders").select("id")
    .eq("stripe_checkout_session_id", sessionId).maybeSingle();
  if (error) throw new SupportError("support_unavailable");
  if (!data || typeof data.id !== "string") return null;
  const user = await getCurrentUser();
  return await authorizeCheckoutReceipt({ orderId: data.id, sessionId, accountId: STRIPE_SANDBOX_ACCOUNT_ID, verifiedUserId: user?.id ?? null }) ? data.id : null;
}

function defaultDependencies(): SupportIntakeDependencies {
  return {
    env: process.env,
    available: async () => (await supportRpc("support_intake_available")) === true,
    abuseKeys(request, email) {
      const address = (request.headers.get("x-vercel-forwarded-for")
        ?? (process.env.VERCEL === "1" ? null : request.headers.get("x-forwarded-for")))?.split(",", 1)[0]?.trim();
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!address || !isIP(address) || !key) throw new SupportError("support_unavailable");
      const digest = (purpose: string, value: string) => createHmac("sha256", `${key}:support-${purpose}-v1`).update(value).digest("hex");
      return { source: digest("source", address), email: digest("email", email) };
    },
    authorizeOrder: authorizeSupportOrder,
    async submit(input) {
      const data = await supportRpc("submit_support_inquiry", { p_submission_id: input.submissionId,
        p_abuse_key: input.abuseKey, p_email_abuse_key: input.emailAbuseKey, p_name: input.name,
        p_email: input.email, p_inquiry_type: input.inquiryType, p_subject: input.subject, p_body: input.body, p_order_id: input.orderId });
      if (!data || typeof data !== "object" || !("inquiryId" in data) || typeof data.inquiryId !== "string") throw new SupportError("support_unavailable");
      return { inquiryId: data.inquiryId };
    },
  };
}

export async function handleSupportIntakeRequest(request: Request, dependencies: SupportIntakeDependencies = defaultDependencies()): Promise<Response> {
  try {
    const origin = intakeOrigin(dependencies.env);
    if (request.method === "GET") return supportResponse({ available: Boolean(origin && await dependencies.available()) });
    if (!origin) throw new SupportError("support_unavailable");
    assertSupportOrigin(request, origin);
    if (!await dependencies.available()) throw new SupportError("support_unavailable");
    const body = await readSupportJson(request);
    if (Object.keys(body).some((key) => !["submissionId", "name", "email", "inquiryType", "subject", "body", "orderSessionId"].includes(key))) throw new SupportError("invalid_support_input");
    const email = supportText(body.email, 254).toLowerCase();
    const inquiryType = supportText(body.inquiryType, 32);
    if (!isEmailAddress(email) || !contactInquiryTypes.some((item) => item.value === inquiryType)) throw new SupportError("invalid_support_input");
    const input = { submissionId: supportUuid(body.submissionId), name: supportText(body.name, 100), email,
      inquiryType, subject: supportText(body.subject, 200), body: supportText(body.body, 10_000, true) };
    const keys = dependencies.abuseKeys(request, email);
    let orderId: string | null = null;
    if (body.orderSessionId !== undefined) {
      const sessionId = supportText(body.orderSessionId, 203);
      orderId = await dependencies.authorizeOrder(sessionId);
      if (!orderId) throw new SupportError("invalid_support_input");
    }
    await dependencies.submit({ ...input, abuseKey: keys.source, emailAbuseKey: keys.email, orderId });
    return supportResponse({ ok: true });
  } catch (error) {
    if (request.method === "GET") return supportResponse({ available: false });
    return supportFailure(error);
  }
}
