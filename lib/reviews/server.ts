import "server-only";
import { unstable_noStore, revalidateTag } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth/session";
import {
  ADMIN_CAPABILITIES,
  checkAdminCapability,
} from "@/lib/admin/capabilities";
import { parseReviewPage, type OwnedReview, type ReviewPage } from "./contract";
export const REVIEW_CACHE_TAG = "public-product-reviews";
export class ReviewError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function reviewRpc(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const { data, error } = await createSupabaseAdminClient()
    .rpc(name, args)
    .abortSignal(AbortSignal.timeout(5000));
  if (error) {
    const status =
      error.code === "40001"
        ? 409
        : error.code === "42501"
          ? 403
          : error.code === "22023"
            ? 400
            : error.code === "54000"
              ? 429
              : 503;
    throw new ReviewError(
      status,
      status === 409
        ? "This review changed. Reload before trying again."
        : status === 429
          ? "Please wait before trying again."
          : "Reviews are temporarily unavailable or this action is not permitted.",
    );
  }
  return data;
}
export async function reviewUser() {
  const user = await getCurrentUser();
  if (!user?.email_confirmed_at)
    throw new ReviewError(
      401,
      "Sign in with a verified email to review your purchase.",
    );
  return user.id;
}
export async function reviewModerator() {
  const access = await checkAdminCapability(ADMIN_CAPABILITIES.reviewsModerate);
  if (access.status !== "allowed")
    throw new ReviewError(
      access.status === "unavailable" ? 503 : 403,
      "Review moderation is unavailable.",
    );
  return access.access.userId;
}
export async function ownedReviews(): Promise<OwnedReview[]> {
  const data = await reviewRpc("read_owned_product_reviews", {
    p_user_id: await reviewUser(),
  });
  if (!Array.isArray(data)) throw new ReviewError(503, "Reviews unavailable.");
  return data as OwnedReview[];
}
export const readReviewPage = async (
  slug: string,
  after: string | null = null,
): Promise<ReviewPage> => {
  // Disclosure can change after publication; opt this enabled read out of Data/Full Route caching.
  unstable_noStore();
  return parseReviewPage(
    await reviewRpc("read_public_product_reviews", {
      p_slug: slug,
      p_after: after,
      p_limit: 5,
    }),
  );
};
export function invalidateReviews() {
  revalidateTag(REVIEW_CACHE_TAG);
}
export function reviewsEnabled() {
  return process.env.HELIX_PUBLIC_REVIEWS_ENABLED === "true";
}
