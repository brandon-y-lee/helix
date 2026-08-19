import { NextResponse } from "next/server";
import { RewardsServiceUnavailableError } from "@/lib/rewards/errors";
import { submitPrivateFeedbackForCurrentUser } from "@/lib/rewards/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function readBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const parsed = await request.json();
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = await readBody(request);
    const result = await submitPrivateFeedbackForCurrentUser({
      feedbackId: typeof body.feedbackId === "string" ? body.feedbackId : "",
      rating: typeof body.rating === "number" ? body.rating : 0,
      comments: typeof body.comments === "string" ? body.comments : "",
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof RewardsServiceUnavailableError) {
      return NextResponse.json(
        {
          error: {
            code: "REWARDS_SERVICE_UNAVAILABLE",
            message: error.message,
            retryable: true,
          },
        },
        {
          status: 503,
          headers: {
            "Cache-Control": "private, no-store",
            "Retry-After": "5",
          },
        },
      );
    }
    const message =
      error instanceof Error
        ? error.message
        : "Private feedback could not be submitted.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
