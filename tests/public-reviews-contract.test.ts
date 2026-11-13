import { describe, expect, it } from "vitest";
import { parseReviewSubmission, parseReviewPage } from "@/lib/reviews/contract";
describe("public review contract", () => {
  it("requires explicit publication consent and bounded plain text", () => {
    const input = {
      orderItemId: "00000000-0000-4000-8000-000000000001",
      expectedRevision: 0,
      displayName: "Alex",
      rating: 1,
      title: "Not for me",
      body: "The texture did not work for me.",
      consent: true,
    };
    expect(parseReviewSubmission(input).rating).toBe(1);
    expect(() => parseReviewSubmission({ ...input, offerNotice: false })).toThrow();
    expect(() => parseReviewSubmission({ ...input, offerNotice: true })).toThrow();
    expect(() => parseReviewSubmission({ ...input, consent: false })).toThrow();
    expect(() => parseReviewSubmission({ ...input, rating: 5.5 })).toThrow();
    expect(() =>
      parseReviewSubmission({ ...input, displayName: "a".repeat(61) }),
    ).toThrow();
    expect(() =>
      parseReviewSubmission({ ...input, userId: "someone" }),
    ).toThrow();
  });
  it("rejects private fields and invalid aggregate projections", () => {
    expect(
      parseReviewPage({ reviews: [], count: 0, average: 0, nextCursor: null }),
    ).toEqual({ reviews: [], count: 0, average: 0, nextCursor: null });
    expect(() =>
      parseReviewPage({ reviews: [], count: -1, average: 0, nextCursor: null }),
    ).toThrow();
  });
});
