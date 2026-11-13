import { readReviewPage, reviewsEnabled } from "@/lib/reviews/server";
import { REVIEW_UUID } from "@/lib/reviews/contract";
import { isValidProductSlug } from "@/lib/catalog/product-slug";
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const slug = params.get("slug") ?? "";
  const after = params.get("after");
  if (!isValidProductSlug(slug) || (after && !REVIEW_UUID.test(after)))
    return Response.json({ error: "Invalid request." }, { status: 400 });
  if (!reviewsEnabled())
    return Response.json({
      reviews: [],
      count: 0,
      average: 0,
      nextCursor: null,
    });
  try {
    return Response.json(await readReviewPage(slug, after), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json(
      { error: "Reviews are temporarily unavailable." },
      { status: 503 },
    );
  }
}
