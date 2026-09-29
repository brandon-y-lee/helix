import "server-only";
import { resolvePublicSiteOrigin } from "@/lib/site-url";

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
  if (!configured) return resolvePublicSiteOrigin({ requestOrigin });
  const origin = new URL(configured);
  if (origin.protocol !== "https:" || origin.origin !== configured || origin.username || origin.password || !/^[a-z0-9.-]+$/i.test(origin.hostname)) {
    throw new Error("Invalid account email origin.");
  }
  return origin.origin;
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
