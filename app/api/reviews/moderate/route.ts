import { handleReviewMutation } from "@/lib/reviews/requests";
import {
  reviewsEnabled,
  reviewUser,
  reviewModerator,
  reviewRpc,
  invalidateReviews,
} from "@/lib/reviews/server";
export const runtime = "nodejs";
export async function POST(request: Request) {
  return handleReviewMutation(request, "moderate", {
    enabled: reviewsEnabled,
    user: reviewUser,
    moderator: reviewModerator,
    rpc: reviewRpc,
    invalidate: invalidateReviews,
  });
}
