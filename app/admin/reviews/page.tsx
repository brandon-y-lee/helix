import Link from "next/link";
import { REVIEW_UUID } from "@/lib/reviews/contract";
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
export default async function ModerationPage({
  searchParams,
}: {
  searchParams: Promise<{ after?: string }>;
}) {
  const { after } = await searchParams;
  if (after && !REVIEW_UUID.test(after))
    return (
      <p>
        Invalid review page.{" "}
        <Link href="/admin/reviews">Return to first page</Link>
      </p>
    );
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
      p_after: after ?? null,
    });
    const page = rows as ModerationRow[];
    const next = page.length > 100 ? page[99].id : null;
    return (
      <>
        <ReviewModeration key={after ?? "first"} initial={page.slice(0, 100)} />
        <nav aria-label="Review moderation pages">
          {after && <Link href="/admin/reviews">First page</Link>}
          {next && (
            <Link href={`/admin/reviews?after=${next}`}>Next reviews</Link>
          )}
        </nav>
      </>
    );
  } catch {
    return (
      <section>
        <h1>Review moderation unavailable</h1>
        <p>Your moderation permission could not be verified.</p>
      </section>
    );
  }
}
