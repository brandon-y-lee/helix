export const REVIEW_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export type ReviewSubmission = {
  orderItemId: string;
  expectedRevision: number;
  displayName: string;
  rating: number;
  title: string;
  body: string;
  consent: true;
};
export type PublicReview = {
  id: string;
  displayName: string;
  rating: number;
  title: string;
  body: string;
  date: string;
  verifiedPurchase: true;
  offerNotice: boolean;
};
export type ReviewPage = {
  reviews: PublicReview[];
  count: number;
  average: number;
  nextCursor: string | null;
};
export type OwnedReview = {
  orderItemId: string;
  productName: string;
  productSlug: string;
  id: string | null;
  revision: number | null;
  status: string | null;
  environment: string | null;
  displayName: string | null;
  rating: number | null;
  title: string | null;
  body: string | null;
};
export const MODERATION_REASONS = [
  "spam",
  "personal_data",
  "threats",
  "unrelated",
  "promotional_claims",
] as const;
export function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function text(value: unknown, max: number, min = 1, multiline = false): value is string {
  return (
    typeof value === "string" &&
    value.trim().length >= min &&
    value.trim().length <= max &&
    !/[\u0000-\u001f\u007f]/.test(multiline ? value.replace(/[\r\n\t]/g, "") : value)
  );
}
export function parseReviewSubmission(value: unknown): ReviewSubmission {
  if (
    !record(value) ||
    Object.keys(value).some(
      (k) =>
        ![
          "orderItemId",
          "expectedRevision",
          "displayName",
          "rating",
          "title",
          "body",
          "consent",
        ].includes(k),
    ) ||
    typeof value.orderItemId !== "string" ||
    !REVIEW_UUID.test(value.orderItemId) ||
    !Number.isSafeInteger(value.expectedRevision) ||
    Number(value.expectedRevision) < 0 ||
    value.consent !== true ||
    !text(value.displayName, 60) ||
    !text(value.title, 120) ||
    !text(value.body, 2000, 10, true) ||
    !Number.isInteger(value.rating) ||
    Number(value.rating) < 1 ||
    Number(value.rating) > 5
  )
    throw new Error("Invalid review.");
  return value as ReviewSubmission;
}
export function parseReviewPage(value: unknown): ReviewPage {
  if (
    !record(value) ||
    Object.keys(value).some(
      (k) => !["reviews", "count", "average", "nextCursor"].includes(k),
    ) ||
    !Array.isArray(value.reviews) ||
    value.reviews.length > 20 ||
    !Number.isSafeInteger(value.count) ||
    Number(value.count) < 0 ||
    typeof value.average !== "number" ||
    !Number.isFinite(value.average) ||
    value.average < 0 ||
    value.average > 5 ||
    (value.nextCursor !== null &&
      (typeof value.nextCursor !== "string" ||
        !REVIEW_UUID.test(value.nextCursor)))
  )
    throw new Error("Invalid review projection.");
  for (const r of value.reviews)
    if (
      !record(r) ||
      Object.keys(r).some(
        (k) =>
          ![
            "id",
            "displayName",
            "rating",
            "title",
            "body",
            "date",
            "verifiedPurchase",
            "offerNotice",
          ].includes(k),
      ) ||
      typeof r.id !== "string" ||
      !REVIEW_UUID.test(r.id) ||
      !text(r.displayName, 60) ||
      !text(r.title, 120) ||
      !text(r.body, 2000, 10, true) ||
      !Number.isInteger(r.rating) ||
      Number(r.rating) < 1 ||
      Number(r.rating) > 5 ||
      typeof r.date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(r.date) ||
      r.verifiedPurchase !== true ||
      typeof r.offerNotice !== "boolean"
    )
      throw new Error("Invalid review projection.");
  return value as ReviewPage;
}
