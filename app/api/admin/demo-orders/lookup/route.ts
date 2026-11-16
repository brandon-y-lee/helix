import { lookupSimulatedOrder } from "@/lib/tracking/server";
import { readSimulationOrderNumber, runSimulationRequest } from "@/lib/tracking/request";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function POST(request: Request) {
  return runSimulationRequest(request, async (actor, body) => ({ order: await lookupSimulatedOrder(readSimulationOrderNumber(body), actor) }), false);
}
