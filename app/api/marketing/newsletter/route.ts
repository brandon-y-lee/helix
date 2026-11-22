import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { isEmailAddress } from "@/lib/email/config";
import { readBoundedBody } from "@/lib/email/provider";
import { productionDeploymentAuthorized } from "@/lib/release/deployment-authorization";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  BUSINESS_SANDBOX_STOREFRONT_ORIGIN,
  deploymentSupabaseTarget,
} from "@/lib/supabase/project-safety";

export const runtime = "nodejs";

function respond(status: number, outcome?: "added" | "already_added") {
  return Response.json(outcome ? { outcome } : { ok: false }, {
    status,
    headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" },
  });
}

async function signupOriginAllowed(origin: string) {
  const env = process.env;
  if (origin === "https://www.helixskin.us") return productionDeploymentAuthorized(env);

  return origin === BUSINESS_SANDBOX_STOREFRONT_ORIGIN &&
    env.VERCEL_ENV === "preview" &&
    env.VERCEL_GIT_COMMIT_REF === "codex/558-verified-dev-preview" &&
    deploymentSupabaseTarget(env) === "development";
}

export async function POST(request: Request) {
  const origin = new URL(request.url).origin;
  if (request.headers.get("origin") !== origin) return respond(403);
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") {
    return respond(415);
  }

  let email: string;
  try {
    const input: unknown = JSON.parse(await readBoundedBody(request, 1024));
    if (!input || typeof input !== "object" || Object.keys(input).length !== 1 ||
        !("email" in input) || typeof input.email !== "string") return respond(400);
    email = input.email.trim().toLowerCase();
    if (!isEmailAddress(email) || email.split("@", 1)[0].length > 64) return respond(400);
  } catch (error) {
    return respond(error instanceof RangeError ? 413 : 400);
  }

  try {
    if (!await signupOriginAllowed(origin)) return respond(403);
    const address = request.headers.get("x-vercel-forwarded-for") ?? "";
    const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!isIP(address) || !secret) return respond(503);

    // Persist a rate-limit key only. A signup never calls Auth or an email provider.
    const requesterHash = createHmac("sha256", secret).update(`newsletter:${address}`).digest("hex");
    const { data, error } = await createSupabaseAdminClient().rpc("sign_up_for_newsletter", {
      p_email: email,
      p_requester_hash: requesterHash,
    }).abortSignal(AbortSignal.timeout(3000));

    if (error) return respond(503);
    if (data === "added" || data === "already_added") return respond(200, data);
    return respond(data === "limited" ? 429 : 503);
  } catch {
    return respond(503);
  }
}
