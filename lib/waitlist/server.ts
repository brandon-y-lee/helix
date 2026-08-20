import "server-only";

import { createHmac } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const REQUEST_BODY_LIMIT = 2048;
const EMAIL_MAX_LENGTH = 254;
const PRODUCT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

export const WAITLIST_CONSENT_POLICY_VERSION = "2026-08-10";
export const WAITLIST_ENROLLMENT_SOURCE = "pdp_waitlist";

type WaitlistEnrollmentInput = {
  productId: string;
  normalizedEmail: string;
  marketingConsent: boolean;
  policyVersion: string;
  source: string;
  abuseKey: string;
};

type WaitlistEnrollmentResult = {
  data: unknown;
  error: { code?: string; message?: string } | null;
};

export type ProductWaitlistRequestAdapters = {
  enroll: (
    input: WaitlistEnrollmentInput,
  ) => Promise<WaitlistEnrollmentResult>;
  abuseKey: (request: Request) => string;
};

function response(
  body: Record<string, unknown>,
  status: number,
  headers: Record<string, string> = {},
) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      ...headers,
    },
  });
}

function errorResponse(
  code: string,
  message: string,
  status: number,
  headers?: Record<string, string>,
) {
  return response({ ok: false, error: { code, message } }, status, headers);
}

function normalizedEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (
    normalized.length === 0 ||
    normalized.length > EMAIL_MAX_LENGTH ||
    !EMAIL_PATTERN.test(normalized)
  ) {
    return null;
  }
  const [local = ""] = normalized.split("@", 1);
  return local.length <= 64 ? normalized : null;
}

function requestHasSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

async function readBody(request: Request): Promise<unknown> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    const parsed = Number(declaredLength);
    if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > REQUEST_BODY_LIMIT) {
      throw new WaitlistRequestError(
        "payload_too_large",
        "The request payload is too large.",
        413,
      );
    }
  }

  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > REQUEST_BODY_LIMIT) {
    throw new WaitlistRequestError(
      "payload_too_large",
      "The request payload is too large.",
      413,
    );
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new WaitlistRequestError(
      "invalid_json",
      "The request body must be valid JSON.",
      400,
    );
  }
}

class WaitlistRequestError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export function productWaitlistAbuseKey(request: Request): string {
  const vercelForwarded = request.headers.get("x-vercel-forwarded-for");
  const localForwarded =
    process.env.VERCEL === "1"
      ? null
      : request.headers.get("x-forwarded-for");
  const clientAddress = (vercelForwarded ?? localForwarded)
    ?.split(",", 1)[0]
    ?.trim();
  if (!clientAddress) {
    throw new Error("Waitlist trusted client address is unavailable.");
  }
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Waitlist abuse protection is unavailable.");
  return createHmac("sha256", `${key}:waitlist-abuse-v1`)
    .update(clientAddress)
    .digest("hex");
}

function defaultAdapters(): ProductWaitlistRequestAdapters {
  return {
    abuseKey: productWaitlistAbuseKey,
    enroll: async (input) => {
      const { data, error } = await createSupabaseAdminClient().rpc(
        "enroll_product_waitlist",
        {
          p_product_id: input.productId,
          p_normalized_email: input.normalizedEmail,
          p_marketing_consent: input.marketingConsent,
          p_policy_version: input.policyVersion,
          p_source: input.source,
          p_abuse_key: input.abuseKey,
        },
      );
      return { data, error };
    },
  };
}

export async function handleProductWaitlistRequest(
  request: Request,
  adapters: ProductWaitlistRequestAdapters = defaultAdapters(),
): Promise<Response> {
  if (!requestHasSameOrigin(request)) {
    return errorResponse(
      "same_origin_required",
      "This request must originate from helix.",
      403,
    );
  }

  try {
    const body = await readBody(request);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new WaitlistRequestError(
        "invalid_body",
        "Enter a valid email address.",
        400,
      );
    }
    const input = body as Record<string, unknown>;
    const productId = input.productId;
    const email = normalizedEmail(input.email);
    const marketingConsent = input.marketingConsent ?? false;
    if (
      typeof productId !== "string" ||
      !PRODUCT_ID_PATTERN.test(productId) ||
      email === null ||
      typeof marketingConsent !== "boolean"
    ) {
      throw new WaitlistRequestError(
        "invalid_enrollment",
        "Enter a valid email address.",
        400,
      );
    }

    const result = await adapters.enroll({
      productId,
      normalizedEmail: email,
      marketingConsent,
      policyVersion: WAITLIST_CONSENT_POLICY_VERSION,
      source: WAITLIST_ENROLLMENT_SOURCE,
      abuseKey: adapters.abuseKey(request),
    });

    const enrollment = result.data as
      | { ok?: unknown; code?: unknown }
      | null;
    if (enrollment?.code === "rate_limited") {
      return errorResponse(
        "rate_limited",
        "Too many attempts. Try again in ten minutes.",
        429,
        { "Retry-After": "600" },
      );
    }
    if (enrollment?.code === "product_unavailable") {
      return errorResponse(
        "product_unavailable",
        "This Product waitlist is not available.",
        409,
      );
    }
    if (result.error || enrollment?.ok !== true) {
      return errorResponse(
        "waitlist_unavailable",
        "The waitlist is temporarily unavailable. Try again.",
        503,
      );
    }

    return response(
      {
        ok: true,
        message: "Your Product waitlist enrollment is confirmed.",
      },
      200,
    );
  } catch (error) {
    if (error instanceof WaitlistRequestError) {
      return errorResponse(error.code, error.message, error.status);
    }
    return errorResponse(
      "waitlist_unavailable",
      "The waitlist is temporarily unavailable. Try again.",
      503,
    );
  }
}
