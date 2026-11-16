import { NextResponse, type NextRequest } from "next/server";
import { mergeGuestCartIntoCurrentUser } from "@/lib/cart/server";
import { markCartIdentityChanged } from "@/lib/cart/auth-sync";
import { safeReturnTo } from "@/lib/auth/redirect";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { accountEmailHeaders, accountEmailOrigin } from "@/lib/auth/email-confirmation";
import { isSupabaseNetworkError } from "@/lib/supabase/network";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeReturnTo(url.searchParams.get("next"));
  const origin = accountEmailOrigin(url.origin);
  const redirect = (path: string) => NextResponse.redirect(new URL(path, origin), { headers: accountEmailHeaders });

  if (!code) {
    return redirect("/account/sign-in?error=invalid-link");
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      if (error.status === 429) {
        return new NextResponse("Account requests are temporarily limited. Try the original email link again in a minute.", { status: 429, headers: { ...accountEmailHeaders, "Retry-After": "60" } });
      }
      if (isSupabaseNetworkError(error) || (error.status ?? 0) >= 500) throw new Error("Account unavailable");
      return redirect("/account/sign-in?error=expired-link");
    }

    await mergeGuestCartIntoCurrentUser();
    await markCartIdentityChanged();
    return redirect(next);
  } catch {
    return new NextResponse("Account services are temporarily unavailable. Try the original email link again later, or return to sign in.", { status: 503, headers: accountEmailHeaders });
  }
}
