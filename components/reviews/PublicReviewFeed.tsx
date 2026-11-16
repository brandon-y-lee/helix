"use client";
import Link from "next/link";
import { useState } from "react";
import { ProductReviewsSection } from "@/components/product-detail/ProductReviewsSection";
import { EMPTY_PRODUCT_REVIEWS } from "@/lib/catalog/product-reviews";
import { parseReviewPage, type ReviewPage } from "@/lib/reviews/contract";
export function PublicReviewFeed({
  slug,
  productName,
  initial,
}: {
  slug: string;
  productName: string;
  initial: ReviewPage | null;
}) {
  const [page, setPage] = useState(initial),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  async function load() {
    if (busy) return;
    setBusy(true);
    try {
      const response = await fetch(
        `/api/reviews?slug=${encodeURIComponent(slug)}${page?.nextCursor ? `&after=${encodeURIComponent(page.nextCursor)}` : ""}`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error();
      const next = parseReviewPage(await response.json());
      setPage((current) => ({
        ...next,
        reviews: current
          ? [
              ...current.reviews,
              ...next.reviews.filter(
                (r) => !current.reviews.some((old) => old.id === r.id),
              ),
            ]
          : next.reviews,
      }));
      setMessage("Reviews loaded.");
    } catch {
      setMessage("Reviews are temporarily unavailable. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      {page ? (
        <ProductReviewsSection
          productName={productName}
          productSlug={slug}
          reviews={{
            ...EMPTY_PRODUCT_REVIEWS,
            aggregate: { count: page.count, average: page.average },
            reviews: page.reviews.map((r) => ({
              id: r.id,
              firstName: r.displayName,
              initials: r.displayName.slice(0, 1),
              rating: r.rating,
              title: r.title,
              body: r.body,
              date: r.date,
              verifiedPurchase: true,
              offerNotice: r.offerNotice,
              ageRange: "",
              skinType: "",
              primaryConcern: "",
              routineContext: "",
              favoriteFeatures: [],
              meterValue: 0,
            })),
            hideMeter: true,
          }}
        />
      ) : (
        <p>Reviews are temporarily unavailable.</p>
      )}
      {(!page || page.nextCursor) && (
        <button
          className="btn btn--ghost"
          disabled={busy}
          onClick={() => void load()}
        >
          {busy ? "Loading…" : "Load more reviews"}
        </button>
      )}
      <p role="status">{message}</p>
      <Link href="/account/reviews">Review a verified purchase</Link>
      <p>
        Reviews are screened using the same rules for every rating. Offers, when
        disclosed, do not require a review.
      </p>
    </div>
  );
}
