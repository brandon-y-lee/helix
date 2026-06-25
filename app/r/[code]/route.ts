import { NextResponse } from "next/server";
import { REFERRAL_COOKIE } from "@/lib/referrals/constants";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function normalizeReferralCode(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
): Promise<NextResponse> {
  const { code } = await params;
  const normalized = normalizeReferralCode(code);
  const url = new URL("/products", request.url);

  if (!normalized || normalized.length < 6) {
    url.searchParams.set("referral", "invalid");
    return NextResponse.redirect(url);
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("referral_codes")
    .select("code, active")
    .eq("code", normalized)
    .eq("active", true)
    .maybeSingle();

  if (error || !data) {
    url.searchParams.set("referral", "invalid");
    return NextResponse.redirect(url);
  }

  url.searchParams.set("referral", "accepted");
  const response = NextResponse.redirect(url);
  response.cookies.set(REFERRAL_COOKIE, normalized, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
  });
  return response;
}
