import { handleProductWaitlistRequest } from "@/lib/waitlist/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleProductWaitlistRequest(request);
}
