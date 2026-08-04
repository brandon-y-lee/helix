"use client";

import {
  useEffect,
  useId,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import {
  reviewSummary,
  type ProductReviewFixture,
  type ProductReviews,
} from "@/lib/catalog/product-reviews";

export const INITIAL_VISIBLE_REVIEW_COUNT = 2;
export const REVIEW_VISIBLE_INCREMENT = 5;

type StarRatingStyle = CSSProperties & {
  "--star-rating-fill": string;
};

function clampRating(value: number) {
  return Math.min(Math.max(value, 0), 5);
}

function reviewCountLabel(count: number) {
  return `Based on ${count} ${count === 1 ? "review" : "reviews"}.`;
}

function formatReviewDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function StarRating({
  value,
  label,
}: {
  value: number;
  label?: string;
}) {
  const clamped = clampRating(value);
  const accessibleLabel = label ?? `${clamped.toFixed(1)} out of 5 stars`;
  const style = {
    "--star-rating-fill": `${(clamped / 5) * 100}%`,
  } as StarRatingStyle;

  return (
    <span className="star-rating" role="img" aria-label={accessibleLabel}>
      <span className="star-rating__base" aria-hidden="true">
        ★★★★★
      </span>
      <span className="star-rating__fill" style={style} aria-hidden="true">
        ★★★★★
      </span>
    </span>
  );
}

function ReviewResponseMeter({ reviews }: { reviews: ProductReviews }) {
  const values = reviews.reviews.map((review) => review.meterValue);
  const value = values.length
    ? Math.round(values.reduce((sum, item) => sum + item, 0) / values.length)
    : 0;

  if (values.length === 0) return null;

  return (
    <div className="review-meter">
      <p>{reviews.meter.question}</p>
      <div className="review-meter__track">
        <span>{reviews.meter.lowLabel}</span>
        <meter
          min={0}
          max={100}
          value={value}
          aria-label={`${reviews.meter.question}: ${value} out of 100`}
        />
        <span>{reviews.meter.highLabel}</span>
      </div>
    </div>
  );
}

function ReviewRow({
  review,
  hasDivider,
}: {
  review: ProductReviewFixture;
  hasDivider: boolean;
}) {
  const reviewerFacts = [
    { label: "Age", value: review.ageRange },
    { label: "Skin type", value: review.skinType },
    { label: "Concern", value: review.primaryConcern },
  ].filter((item) => item.value.trim().length > 0);
  const reviewDetails = [
    { label: "Routine", value: review.routineContext },
    { label: "Favorite", value: review.favoriteFeatures.join(", ") },
  ].filter((item) => item.value.trim().length > 0);

  return (
    <article
      className="review-row"
      data-review-row
      data-review-id={review.id}
      data-review-divider={hasDivider}
    >
      <div className="review-row__reviewer">
        <div className="review-row__identity">
          {review.initials && (
            <span className="review-row__initials" aria-hidden="true">
              {review.initials}
            </span>
          )}
          <strong>{review.firstName}</strong>
        </div>
        {reviewerFacts.length > 0 && (
          <dl className="review-row__reviewer-facts">
            {reviewerFacts.map((item) => (
              <div key={item.label}>
                <dt>{item.label}</dt>
                <dd>{item.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      <div className="review-row__content">
        <div className="review-row__content-head">
          <StarRating
            value={review.rating}
            label={`${review.rating} out of 5 stars`}
          />
          {review.date && (
            <time dateTime={review.date}>{formatReviewDate(review.date)}</time>
          )}
        </div>
        <h3>{review.title}</h3>
        <p className="storefront-reading">{review.body}</p>
        {reviewDetails.length > 0 && (
          <dl className="review-row__details">
            {reviewDetails.map((item) => (
              <div key={item.label}>
                <dt>{item.label}</dt>
                <dd>{item.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </article>
  );
}

export function ProductReviewsSection({
  productName,
  productSlug,
  reviews,
}: {
  productName: string;
  productSlug: string;
  reviews: ProductReviews;
}) {
  const reviewListId = useId();
  const collectionKey = useMemo(
    () => reviews.reviews.map((review) => review.id).join("|"),
    [reviews.reviews],
  );
  const [visibleCount, setVisibleCount] = useState(() =>
    Math.min(INITIAL_VISIBLE_REVIEW_COUNT, reviews.reviews.length),
  );

  useEffect(() => {
    setVisibleCount(
      Math.min(INITIAL_VISIBLE_REVIEW_COUNT, reviews.reviews.length),
    );
  }, [collectionKey, productSlug, reviews.reviews.length]);

  const summary = reviewSummary(reviews.reviews);
  const visibleReviews = reviews.reviews.slice(0, visibleCount);
  const hasMore = visibleCount < reviews.reviews.length;

  return (
    <section
      className="pdp-reviews"
      aria-labelledby="pdp-reviews-heading"
      data-review-section
    >
      <h2 id="pdp-reviews-heading" className="sr-only">
        {productName} customer reviews
      </h2>

      <div className="pdp-reviews__overview" data-review-header>
        <div className="pdp-reviews__rating-summary">
          <strong>{summary.count > 0 ? summary.average.toFixed(1) : "—"}</strong>
          <StarRating
            value={summary.average}
            label={
              summary.count > 0
                ? `${summary.average.toFixed(1)} average rating out of 5 stars`
                : "No ratings yet"
            }
          />
          <span>AVERAGE RATING</span>
          <p>{reviewCountLabel(summary.count)}</p>
        </div>
        <ReviewResponseMeter reviews={reviews} />
      </div>

      {visibleReviews.length > 0 ? (
        <>
          <div
            id={reviewListId}
            className="pdp-reviews__list"
            data-review-list
            data-visible-count={visibleReviews.length}
          >
            {visibleReviews.map((review, index) => (
              <ReviewRow
                key={review.id}
                review={review}
                hasDivider={index < visibleReviews.length - 1}
              />
            ))}
          </div>

          <p className="sr-only" aria-live="polite" aria-atomic="true">
            Showing {visibleReviews.length} of {reviews.reviews.length} reviews.
          </p>

          {hasMore && (
            <div className="pdp-reviews__more">
              <button
                type="button"
                aria-controls={reviewListId}
                onClick={() =>
                  setVisibleCount((current) =>
                    Math.min(
                      current + REVIEW_VISIBLE_INCREMENT,
                      reviews.reviews.length,
                    ),
                  )
                }
              >
                SHOW MORE
              </button>
            </div>
          )}
        </>
      ) : (
        <p className="pdp-reviews__empty">
          Reviews are not available for this product yet.
        </p>
      )}
    </section>
  );
}
