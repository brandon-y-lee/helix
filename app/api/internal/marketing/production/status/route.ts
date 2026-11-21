import { handleProductionMarketingStatus } from "@/lib/production-marketing/operator-status";
import { createProductionMarketingEventStorage } from "@/lib/production-marketing/event-storage";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request:Request){return handleProductionMarketingStatus(request,{env:process.env,read:createProductionMarketingEventStorage(process.env).directStatus});}
