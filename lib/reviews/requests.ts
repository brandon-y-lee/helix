import {
  MODERATION_REASONS,
  REVIEW_UUID,
  parseReviewSubmission,
  record,
} from "./contract";
import { ReviewError } from "./server";
export type ReviewRequestDependencies = {
  enabled: () => boolean;
  user: () => Promise<string>;
  moderator: () => Promise<string>;
  rpc: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  invalidate: () => void;
};
const headers = { "Cache-Control": "private, no-store" };
export async function handleReviewMutation(
  request: Request,
  action: "submit" | "withdraw" | "moderate",
  deps: ReviewRequestDependencies,
) {
  if (request.method !== "POST")
    return Response.json(
      { error: "Method not allowed." },
      { status: 405, headers },
    );
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return Response.json(
      { error: "Same origin required." },
      { status: 403, headers },
    );
  if (!deps.enabled())
    return Response.json(
      { error: "Reviews are not enabled." },
      { status: 503, headers },
    );
  try {
    const reader = request.body?.getReader();
    if (!reader) throw new ReviewError(400, "Missing request.");
    let size = 0;
    const chunks: Uint8Array[] = [];
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 12288) throw new ReviewError(413, "Review is too large.");
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
    }
    let body: unknown;
    try {
      body = JSON.parse(new TextDecoder().decode(Buffer.concat(chunks)));
    } catch {
      throw new ReviewError(400, "Invalid review.");
    }
    let result: unknown;
    if (action === "submit") {
      let input;
      try {
        input = parseReviewSubmission(body);
      } catch {
        throw new ReviewError(
          400,
          "Check the review fields and publication consent.",
        );
      }
      result = await deps.rpc("submit_product_review", {
        p_user_id: await deps.user(),
        p_order_item_id: input.orderItemId,
        p_expected_revision: input.expectedRevision,
        p_display_name: input.displayName,
        p_rating: input.rating,
        p_title: input.title,
        p_body: input.body,
        p_consent: true,
      });
    } else {
      if (
        !record(body) ||
        typeof body.id !== "string" ||
        !REVIEW_UUID.test(body.id) ||
        !Number.isSafeInteger(body.expectedRevision) ||
        Number(body.expectedRevision) < 1
      )
        throw new ReviewError(400, "Invalid review.");
      if (action === "withdraw")
        result = await deps.rpc("withdraw_product_review", {
          p_user_id: await deps.user(),
          p_review_id: body.id,
          p_expected_revision: body.expectedRevision,
        });
      else {
        if (
          (body.decision === "removed" &&
            (!Number.isSafeInteger(body.expectedPublishedRevision) ||
              Number(body.expectedPublishedRevision) < 1)) ||
          !["published", "rejected", "removed"].includes(
            String(body.decision),
          ) ||
          (body.decision !== "published" &&
            !MODERATION_REASONS.includes(
              body.reason as (typeof MODERATION_REASONS)[number],
            ))
        )
          throw new ReviewError(400, "Choose a neutral moderation reason.");
        result = await deps.rpc("moderate_product_review", {
          p_actor_id: await deps.moderator(),
          p_review_id: body.id,
          p_expected_revision: body.expectedRevision,
          p_decision: body.decision,
          p_expected_published_revision:
            body.decision === "removed" ? body.expectedPublishedRevision : null,
          p_reason: body.decision !== "published" ? body.reason : null,
        });
      }
    }
    deps.invalidate();
    return Response.json({ ok: true, result }, { headers });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof ReviewError
            ? error.message
            : "Reviews are temporarily unavailable.",
      },
      { status: error instanceof ReviewError ? error.status : 503, headers },
    );
  }
}
