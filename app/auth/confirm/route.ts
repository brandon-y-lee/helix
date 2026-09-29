import { NextResponse, type NextRequest } from "next/server";
import { safeReturnTo } from "@/lib/auth/redirect";
import { accountConfirmationPage, accountEmailHeaders, accountEmailOrigin, validEmailConfirmation } from "@/lib/auth/email-confirmation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { mergeGuestCartIntoCurrentUser } from "@/lib/cart/server";
import { markCartIdentityChanged } from "@/lib/cart/auth-sync";
import { readBoundedBody } from "@/lib/email/provider";
import { isSupabaseNetworkError } from "@/lib/supabase/network";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function page(title: string, message: string, status: number) {
  return new NextResponse(accountConfirmationPage(title, message), { status, headers: { ...accountEmailHeaders, "Content-Type": "text/html; charset=utf-8" } });
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const token = params.get("token_hash");
  const type = params.get("type");
  if (!validEmailConfirmation(token, type)) {
    return new NextResponse(accountConfirmationPage("Invalid email link", "Request a new email and try again."), { status: 400, headers: { ...accountEmailHeaders, "Content-Type": "text/html; charset=utf-8" } });
  }
  // no-referrer would make native form POSTs send Origin:null. strict-origin
  // preserves the CSRF Origin check without disclosing the token-bearing path.
  return new NextResponse(accountConfirmationPage("Confirm your request", "Continue only if you requested this account action. Opening this page does not use your email link.", { token: token!, type, next: safeReturnTo(params.get("next")) }), { headers: { ...accountEmailHeaders, "Referrer-Policy": "strict-origin", "Content-Type": "text/html; charset=utf-8" } });
}

export async function HEAD() {
  return new NextResponse(null, { headers: accountEmailHeaders });
}

export async function POST(request: NextRequest) {
  let origin: string;
  try { origin = accountEmailOrigin(request.nextUrl.origin); }
  catch { return page("Account services unavailable", "Please try again later.", 503); }
  if (request.headers.get("origin") !== origin || request.nextUrl.origin !== origin) {
    return page("Request not allowed", "Open the original email link and try again.", 403);
  }
  if (!/^application\/x-www-form-urlencoded(?:;\s*charset=utf-8)?$/i.test(request.headers.get("content-type") ?? "")) {
    return page("Invalid request", "Open the original email link and try again.", 400);
  }
  let params: URLSearchParams;
  try { params = new URLSearchParams(await readBoundedBody(request, 4096)); }
  catch { return page("Invalid request", "Open the original email link and try again.", 400); }
  const token = params.get("token_hash");
  const type = params.get("type");
  if ([...params.keys()].some((key) => !["token_hash", "type", "next"].includes(key) || params.getAll(key).length !== 1)
    || !validEmailConfirmation(token, type)) {
    return page("Invalid email link", "Request a new email and try again.", 400);
  }
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: token!, type });
    if (error) {
      if (error.status === 429 || error.code === "over_request_rate_limit") {
        const response = page("Please wait before trying again", "Account requests are temporarily limited. Wait a minute and reopen the original email link.", 429);
        response.headers.set("Retry-After", "60");
        return response;
      }
      if (isSupabaseNetworkError(error) || (error.status ?? 0) >= 500) {
        return page("Account services unavailable", "Please try the original email link again later.", 503);
      }
      return NextResponse.redirect(new URL("/account/sign-in?error=expired-link", origin), { status: 303, headers: accountEmailHeaders });
    }
    if (!data.session) {
      return type === "email_change"
        ? page("Confirmation received", "If you received another confirmation email at your other address, open that email to finish the change. Then return to sign in.", 200)
        : page("Account services unavailable", "Please request a new email and try again.", 503);
    }
    await mergeGuestCartIntoCurrentUser();
    await markCartIdentityChanged();
    const next = type === "recovery" ? "/account/reset-password" : safeReturnTo(params.get("next"));
    return NextResponse.redirect(new URL(next, origin), { status: 303, headers: accountEmailHeaders });
  } catch {
    return page("Account services unavailable", "Please try again later. If the link has already been used, return to sign in or request a new email.", 503);
  }
}
