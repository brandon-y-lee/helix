import Link from "next/link";
import { ReviewForm } from "@/components/reviews/ReviewForm";
import { ownedReviews, reviewsEnabled } from "@/lib/reviews/server";
export const dynamic = "force-dynamic";
export default async function ReviewsPage() {
  if (!reviewsEnabled())
    return (
      <section className="review-page">
        <h1>Your product reviews</h1>
        <p>Product reviews are not available yet.</p>
      </section>
    );
  try {
    const purchases = await ownedReviews();
    return (
      <section className="review-page">
        <h1>Your product reviews</h1>
        <p>
          Share an honest experience with products you purchased. Public reviews
          are separate from private feedback.
        </p>
        <Link href="/account">Back to account</Link>
        {purchases.length === 0 ? (
          <p>No eligible verified purchases yet.</p>
        ) : (
          purchases.map((p) => <ReviewForm key={p.orderItemId} purchase={p} />)
        )}
      </section>
    );
  } catch {
    return (
      <section className="review-page">
        <h1>Your product reviews</h1>
        <p>
          Sign in with your verified email to see eligible purchases. If you are
          already signed in, reviews may be temporarily unavailable.
        </p>
        <Link href="/account">Go to your account</Link>
      </section>
    );
  }
}
