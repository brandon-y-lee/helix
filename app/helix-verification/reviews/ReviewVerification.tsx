"use client";
import { useMemo } from "react";
import { ReviewForm } from "@/components/reviews/ReviewForm";
import { PublicReviewFeed } from "@/components/reviews/PublicReviewFeed";
export function ReviewVerification() {
  const transport = useMemo(() => {
    let revision = 0;
    return (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      if (body.expectedRevision !== revision)
        return Response.json(
          { error: "This review changed. Reload before trying again." },
          { status: 409 },
        );
      revision++;
      return Response.json({
        ok: true,
        result: {
          id: "00000000-0000-4000-8000-000000000001",
          revision,
          status: body.consent ? "pending" : "withdrawn",
        },
      });
    }) as typeof fetch;
  }, []);
  return (
    <main className="review-page">
      <h1>Synthetic review verification</h1>
      <p>
        Local-only fixture. No account, database, publication or network
        mutation.
      </p>
      <ReviewForm
        transport={transport}
        purchase={{
          orderItemId: "00000000-0000-4000-8000-000000000001",
          productName: "Sample serum",
          productSlug: "sample",
          id: null,
          revision: null,
          status: null,
          environment: "sandbox",
          displayName: null,
          rating: null,
          title: null,
          body: null,
        }}
      />
      <PublicReviewFeed
        slug="sample"
        productName="Sample serum"
        initial={{
          count: 1,
          average: 2,
          nextCursor: null,
          reviews: [
            {
              id: "00000000-0000-4000-8000-000000000002",
              displayName: "Sample reviewer",
              rating: 2,
              title: "Sample mixed experience",
              body: "This is synthetic review content, not an endorsement.",
              date: "2026-11-01",
              verifiedPurchase: true,
              offerNotice: true,
            },
          ],
        }}
      />
    </main>
  );
}
