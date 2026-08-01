import { NextResponse, type NextRequest } from "next/server";
import { mergeGuestCartIntoCurrentUser } from "@/lib/cart/server";
import { markCartIdentityChanged } from "@/lib/cart/auth-sync";
import { safeReturnTo } from "@/lib/auth/redirect";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const next = safeReturnTo(url.searchParams.get("next"));

  if (!tokenHash || !type) {
    return NextResponse.redirect(new URL("/account/sign-in?error=invalid-link", request.url));
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: type as "signup" | "email" | "recovery" | "invite" | "magiclink" | "email_change",
  });

  if (error) {
    return NextResponse.redirect(new URL("/account/sign-in?error=expired-link", request.url));
  }

  await mergeGuestCartIntoCurrentUser();
  await markCartIdentityChanged();

  if (type === "recovery") {
    return NextResponse.redirect(new URL("/account/reset-password", request.url));
  }

  return NextResponse.redirect(new URL(next, request.url));
}
