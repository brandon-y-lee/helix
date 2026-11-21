import { readBoundedBody } from "@/lib/email/provider";
import { productionDeploymentAuthorized } from "@/lib/release/deployment-authorization";
import { readProductionMarketingConfiguration } from "@/lib/production-marketing/config";
import { productionMarketingWorkerAuthorized } from "@/lib/production-marketing/delivery-config";
import { createProductionMarketingDeliveryStorage } from "@/lib/production-marketing/delivery-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const reply = (status: number, data: object) => Response.json(data, {
  status, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" },
});

export async function POST(request: Request) {
  const env = process.env;
  if (!productionMarketingWorkerAuthorized(request, env)) return reply(401, { status: "unavailable" });
  try {
    const config = readProductionMarketingConfiguration(env);
    if (request.url !== config.siteOrigin + "/api/internal/marketing/production/maintenance") return reply(403, { status: "unavailable" });
    if (!await productionDeploymentAuthorized(env)) return reply(503, { status: "unavailable" });
    if (request.body) await readBoundedBody(request, 0);
    const storage = createProductionMarketingDeliveryStorage(env);
    // Erasure and inspection remain available when new consent and dispatch are paused.
    await storage.cleanup();
    const counts = await storage.nativeAlerts();
    return reply(200, { ...counts, dispatchEnabled: env.HELIX_PRODUCTION_MARKETING_DISPATCH_ENABLED === "true" });
  } catch {
    return reply(503, { status: "unavailable" });
  }
}
