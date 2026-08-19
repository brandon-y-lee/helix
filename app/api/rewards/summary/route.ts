import { NextResponse } from "next/server";
import { getCartState } from "@/lib/cart/server";
import { getRewardsSummaryForCurrentUser } from "@/lib/rewards/server";
import { HELIX_REWARDS_NAME } from "@/lib/rewards/rules";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PRIVATE_RESPONSE_HEADERS = {
  "Cache-Control": "private, no-store",
};

export async function GET(): Promise<NextResponse> {
  try {
    const cart = await getCartState();
    const summary = await getRewardsSummaryForCurrentUser(
      cart.subtotal,
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
