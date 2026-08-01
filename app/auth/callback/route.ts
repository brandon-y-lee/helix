import { NextResponse, type NextRequest } from "next/server";
import { mergeGuestCartIntoCurrentUser } from "@/lib/cart/server";
import { markCartIdentityChanged } from "@/lib/cart/auth-sync";
import { safeReturnTo } from "@/lib/auth/redirect";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeReturnTo(url.searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(new URL("/account/sign-in?error=invalid-link", request.url));
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL("/account/sign-in?error=expired-link", request.url));
  }

  await mergeGuestCartIntoCurrentUser();
  await markCartIdentityChanged();

  return NextResponse.redirect(new URL(next, request.url));
}
