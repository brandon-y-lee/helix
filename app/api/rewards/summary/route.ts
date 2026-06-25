import { NextResponse } from "next/server";
import { getRewardsSummaryForCurrentUser } from "@/lib/rewards/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const subtotal = Number(url.searchParams.get("subtotal") ?? 0);

  try {
    const summary = await getRewardsSummaryForCurrentUser(
      Number.isFinite(subtotal) ? subtotal : 0,
    );
    return NextResponse.json(summary);
  } catch {
    return NextResponse.json(
      {
        authenticated: false,
        emailConfirmed: false,
        programName: "MEI PELLE REWARDS",
        pointsBalance: 0,
        lifetimePoints: 0,
        estimatedPurchasePoints: 0,
        affordableTiers: [],
        referralCode: null,
        recentLedger: [],
        feedbackRequests: [],
      },
      { status: 200 },
    );
  }
}
