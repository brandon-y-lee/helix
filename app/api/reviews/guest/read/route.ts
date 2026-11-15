import { handleGuestReview } from "@/lib/reviews/guest-requests";
import {
  reviewRpc,
  reviewsEnabled,
  invalidateReviews,
} from "@/lib/reviews/server";
export const runtime = "nodejs";
export async function POST(request: Request) {
  return handleGuestReview(request, "read", {
    enabled: () =>
      reviewsEnabled() && process.env.HELIX_GUEST_REVIEWS_ENABLED === "true",
    rpc: reviewRpc,
    invalidate: invalidateReviews,
  });
}
