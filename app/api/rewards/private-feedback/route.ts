import { NextResponse } from "next/server";
import { RewardsRequestError } from "@/lib/rewards/errors";
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

function unavailableResponse(): NextResponse {
  return NextResponse.json(
    {
      error: {
        code: "REWARDS_SERVICE_UNAVAILABLE",
        message: "helix rewards is temporarily unavailable.",
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
    if (error instanceof RewardsRequestError) {
      return NextResponse.json(
        { error: error.message },
        {
          status: 400,
          headers: { "Cache-Control": "private, no-store" },
        },
      );
    }
    console.error("[rewards] Private feedback submission failed.", {
      errorType: error instanceof Error ? error.name : "UnknownError",
    });
    return unavailableResponse();
  }
}
