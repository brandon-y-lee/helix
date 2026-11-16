import { readCurrentOffers } from "@/lib/offers/server";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET() {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const offers = (await readCurrentOffers()).map(({ id, kind, percentOff, expiresAt }) => ({ id, kind, percentOff, expiresAt }));
    return Response.json({ offers }, { headers });
  } catch {
    return Response.json({ error: "Offers are temporarily unavailable." }, { status: 503, headers });
  }
}
