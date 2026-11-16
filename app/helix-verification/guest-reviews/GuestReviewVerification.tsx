"use client";
import { useMemo } from "react";
import { GuestReviewPage } from "@/components/reviews/GuestReviewPage";
export function GuestReviewVerification() {
  const transport = useMemo(() => {
    let revision = 0;
    const purchase = {
      orderItemId: "00000000-0000-4000-8000-000000000001",
      productName: "Sample serum",
      productSlug: "sample",
      id: null as string | null,
      revision: null as number | null,
      status: null as string | null,
      environment: "sandbox",
      displayName: null,
      rating: null,
      title: null,
      body: null,
    };
    return (async (input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      if (body.token !== "a".repeat(43))
        return Response.json(
          { error: "This review link is invalid or expired. Contact support." },
          { status: 403 },
        );
      if (String(input).endsWith("/read"))
        return Response.json({ ok: true, result: [purchase] });
      if (body.expectedRevision !== revision)
        return Response.json(
          { error: "This review changed. Reopen your link." },
          { status: 409 },
        );
      revision++;
      purchase.id = "00000000-0000-4000-8000-000000000002";
      purchase.revision = revision;
      purchase.status = body.consent ? "pending" : "withdrawn";
      return Response.json({
        ok: true,
        result: { id: purchase.id, revision, status: purchase.status },
      });
    }) as typeof fetch;
  }, []);
  return (
    <>
      <p role="note">
        Local synthetic guest review. No account, network submission, database,
        publication or email.
      </p>
      <GuestReviewPage transport={transport} />
    </>
  );
}
