type ProductResponseMeter = {
  question: string;
  lowLabel: string;
  highLabel: string;
};

export type ProductReview = {
  id: string;
  initials: string;
  firstName: string;
  ageRange: string;
  skinType: string;
  primaryConcern: string;
  routineContext: string;
  favoriteFeatures: string[];
  rating: number;
  date: string;
  title: string;
  body: string;
  meterValue: number;
};

export type ProductReviews = {
  meter: ProductResponseMeter;
  reviews: ProductReview[];
};

export const EMPTY_PRODUCT_REVIEWS: ProductReviews = {
  meter: {
    question: "How well did this fit your routine?",
    lowLabel: "Not useful",
    highLabel: "Easy to repeat",
  },
  reviews: [],
};

export function reviewSummary(reviews: ProductReview[]) {
  if (reviews.length === 0) return { average: 0, count: 0 };
  const total = reviews.reduce((sum, review) => sum + review.rating, 0);
  return { average: total / reviews.length, count: reviews.length };
}
