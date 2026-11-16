import { handleMarketingRequest } from "@/lib/marketing/requests";
import { marketingRequestStorage } from "@/lib/marketing/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 15;
export async function POST(request: Request) {
  return handleMarketingRequest(request, "subscription", { storage: marketingRequestStorage, env: process.env });
}
