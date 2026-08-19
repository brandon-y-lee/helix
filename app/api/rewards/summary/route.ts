import { NextResponse } from "next/server";
import { getRewardsSummaryForCurrentUser } from "@/lib/rewards/server";
import { HELIX_REWARDS_NAME } from "@/lib/rewards/rules";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PRIVATE_RESPONSE_HEADERS = {
  "Cache-Control": "private, no-store",
};

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const subtotal = Number(url.searchParams.get("subtotal") ?? 0);

  try {
    const summary = await getRewardsSummaryForCurrentUser(
      Number.isFinite(subtotal) ? subtotal : 0,
    );
    return NextResponse.json(summary, { headers: PRIVATE_RESPONSE_HEADERS });
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "REWARDS_SERVICE_UNAVAILABLE",
          message: `${HELIX_REWARDS_NAME} is temporarily unavailable.`,
          retryable: true,
        },
      },
      {
        status: 503,
        headers: {
          ...PRIVATE_RESPONSE_HEADERS,
          "Retry-After": "5",
        },
      },
    );
  }
}
