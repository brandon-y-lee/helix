import { handleProductNotificationRequest } from "@/lib/waitlist/notifications";
import { productNotificationStorage } from "@/lib/waitlist/storage";
import { productWaitlistAbuseKey } from "@/lib/waitlist/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  return handleProductNotificationRequest(request, "cancel", {
    storage: productNotificationStorage, abuseKey: productWaitlistAbuseKey, env: process.env,
  });
}
