import {
  ReviewModeration,
  type ModerationRow,
} from "@/components/reviews/ReviewModeration";
import {
  reviewModerator,
  reviewRpc,
  reviewsEnabled,
} from "@/lib/reviews/server";
export const dynamic = "force-dynamic";
export default async function ModerationPage() {
  try {
    const actor = await reviewModerator();
    if (!reviewsEnabled())
      return (
        <section>
          <h1>Product reviews</h1>
          <p>Reviews are disabled.</p>
        </section>
      );
    const rows = await reviewRpc("read_product_review_queue", {
      p_actor_id: actor,
    });
    return <ReviewModeration initial={rows as ModerationRow[]} />;
  } catch {
    return (
      <section>
        <h1>Review moderation unavailable</h1>
        <p>Your moderation permission could not be verified.</p>
      </section>
    );
  }
}
