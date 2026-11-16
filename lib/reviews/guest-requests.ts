import { parseReviewSubmission, record, REVIEW_UUID } from "./contract";
import { ReviewError } from "./server";
export const GUEST_REVIEW_TOKEN = /^[A-Za-z0-9_-]{43}$/;
export type GuestReviewDependencies = {
  enabled: () => boolean;
  rpc: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  invalidate: () => void;
};
const headers = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
};
export async function handleGuestReview(
  request: Request,
  action: "read" | "submit" | "withdraw",
  deps: GuestReviewDependencies,
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
    if (!reader) throw new ReviewError(400, "Invalid review request.");
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
    let input: unknown;
    try {
      input = JSON.parse(new TextDecoder().decode(Buffer.concat(chunks)));
    } catch {
      throw new ReviewError(400, "Invalid review request.");
    }
    if (
      !record(input) ||
      typeof input.token !== "string" ||
      !GUEST_REVIEW_TOKEN.test(input.token)
    )
      throw new ReviewError(
        403,
        "This review link is invalid or expired. Reopen the original email link, or contact support.",
      );
    const { token, ...body } = input;
    let result: unknown;
    if (action === "read") {
      if (Object.keys(body).length)
        throw new ReviewError(400, "Invalid review request.");
      result = await deps.rpc("read_guest_product_reviews", { p_token: token });
    } else if (action === "submit") {
      let value;
      try {
        value = parseReviewSubmission(body);
      } catch {
        throw new ReviewError(
          400,
          "Check the review fields and publication consent.",
        );
      }
      result = await deps.rpc("submit_guest_product_review", {
        p_token: token,
        p_order_item_id: value.orderItemId,
        p_expected_revision: value.expectedRevision,
        p_display_name: value.displayName,
        p_rating: value.rating,
        p_title: value.title,
        p_body: value.body,
        p_consent: true,
      });
    } else {
      if (
        Object.keys(body).some(
          (k) => !["id", "expectedRevision"].includes(k),
        ) ||
        typeof body.id !== "string" ||
        !REVIEW_UUID.test(body.id) ||
        !Number.isSafeInteger(body.expectedRevision) ||
        Number(body.expectedRevision) < 1
      )
        throw new ReviewError(400, "Invalid review request.");
      result = await deps.rpc("withdraw_guest_product_review", {
        p_token: token,
        p_review_id: body.id,
        p_expected_revision: body.expectedRevision,
      });
    }
    if (action !== "read") deps.invalidate();
    return Response.json({ ok: true, result }, { headers });
  } catch (error) {
    const status = error instanceof ReviewError ? error.status : 503;
    return Response.json(
      {
        error:
          status === 403
            ? "This review link is invalid or expired. Reopen the original email link, or contact support."
            : error instanceof ReviewError
              ? error.message
              : "Reviews are temporarily unavailable.",
      },
      { status, headers },
    );
  }
}
