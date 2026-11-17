import { handleProductionMarketingUnsubscribe } from "@/lib/production-marketing/requests";
import { createProductionMarketingStorage } from "@/lib/production-marketing/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 15;
export async function POST(request: Request) {
  return handleProductionMarketingUnsubscribe(request, { storage: createProductionMarketingStorage(process.env), env: process.env });
}
