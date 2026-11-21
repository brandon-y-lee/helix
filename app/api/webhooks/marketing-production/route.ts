import { receiveProductionMarketingEvent } from "@/lib/production-marketing/events";
import { createProductionMarketingEventStorage } from "@/lib/production-marketing/event-storage";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST(request: Request) {
  const { record, preference, hold } = createProductionMarketingEventStorage(process.env);
  return receiveProductionMarketingEvent(request, { env: process.env, record, preference, hold });
}
