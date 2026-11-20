import "server-only";
import { CANONICAL_PUBLIC_SITE_ORIGIN, compatibleRequestOrigin, isControlledPublicSiteOrigin, resolvePublicSiteOrigin } from "@/lib/site-url";
import { assertSupabaseTargetUrl, deploymentSupabaseTarget } from "@/lib/supabase/project-safety";

export const accountEmailHeaders = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow",
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
};

export function accountEmailOrigin(requestOrigin?: string | null): string {
  if (process.env.NODE_ENV === "development") return resolvePublicSiteOrigin({ requestOrigin });
  const configured = process.env.HELIX_EMAIL_SITE_ORIGIN?.trim();
  if (configured && !isControlledPublicSiteOrigin(configured)) {
    throw new Error("Invalid account email origin.");
  }
  return compatibleRequestOrigin(configured || resolvePublicSiteOrigin(), requestOrigin);
}

export const accountEmailUnavailable = {
  signup: "Account creation is temporarily unavailable.",
  recovery: "Password reset links are temporarily unavailable.",
};

/** Only new link issuance needs the independently qualified Preview return host. */
export function accountEmailLinkOrigin(
  request: Pick<Headers, "get">,
  purpose: "page" | "action",
): string | null {
  const env = process.env;
  try {
    const target = deploymentSupabaseTarget(env);
    if (env.VERCEL_ENV !== "preview") {
      // Existing callbacks may honor their original cookie host. New Production
      // links always use the configured destination, independent of a request.
      return accountEmailOrigin(target === "production" ? null : request.get("origin"));
    }
    const origin = CANONICAL_PUBLIC_SITE_ORIGIN;
    const buildTarget = process.env.NEXT_PUBLIC_HELIX_SUPABASE_TARGET;
    if (
      env.VERCEL_GIT_COMMIT_REF !== "dev" ||
      env.HELIX_DEV_AUTH_RETURN_ORIGIN !== origin ||
      env.NEXT_PUBLIC_SITE_URL !== origin ||
      (env.HELIX_EMAIL_SITE_ORIGIN && env.HELIX_EMAIL_SITE_ORIGIN !== origin) ||
      (buildTarget !== undefined && buildTarget !== target)
    ) return null;
    assertSupabaseTargetUrl(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", target);

    // The deployment settings grant the capability. Request headers can only
    // narrow it to the qualified site's own page and same-origin form submission.
    if (request.get("host") !== new URL(origin).host) return null;
    if (purpose === "action" && request.get("origin") !== origin) return null;
    return origin;
  } catch {
    return null;
  }
}

export const emailOtpTypes = ["signup", "email", "recovery", "invite", "magiclink", "email_change"] as const;
export function validEmailConfirmation(token: string | null, type: string | null): type is typeof emailOtpTypes[number] {
  return Boolean(token && /^[A-Za-z0-9_-]{1,512}$/.test(token) && emailOtpTypes.some((allowed) => allowed === type));
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);

// A standalone document avoids loading storefront analytics/assets with a token in the URL.
export function accountConfirmationPage(title: string, message: string, form?: { token: string; type: string; next: string }): string {
  const controls = form
    ? `<form method="post" action="/auth/confirm"><input type="hidden" name="token_hash" value="${escapeHtml(form.token)}"><input type="hidden" name="type" value="${escapeHtml(form.type)}"><input type="hidden" name="next" value="${escapeHtml(form.next)}"><button type="submit">${form.type === "recovery" ? "Continue to password reset" : "Confirm email"}</button></form>`
    : '<a href="/account/sign-in">Return to sign in</a>';
  return `<!doctype html><html lang="en" dir="ltr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)} | helix</title><style>body{margin:0;background:#f5f5f7;color:#111312;font:16px/1.6 Manrope,Arial,sans-serif}main{box-sizing:border-box;max-width:560px;margin:8vh auto;padding:32px 24px;background:white}h1,.brand{font-family:Marcellus,Georgia,serif;font-weight:400}.brand{font-size:28px}h1{font-size:30px;line-height:1.3}button{font:inherit;background:#28362f;color:white;border:0;border-radius:4px;padding:12px 20px;cursor:pointer}a{color:#28362f}button:focus-visible,a:focus-visible{outline:3px solid #536d5b;outline-offset:4px}</style></head><body><main><p class="brand">helix</p><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p>${controls}</main></body></html>`;
}
