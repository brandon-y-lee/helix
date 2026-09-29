import { applySimulatedShipment } from "@/lib/tracking/server";
import { readSimulationCommand, runSimulationRequest } from "@/lib/tracking/request";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function POST(request: Request) {
  return runSimulationRequest(request, async (actor, body) => applySimulatedShipment(readSimulationCommand(body), actor));
}
