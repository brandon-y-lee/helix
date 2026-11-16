import { NextResponse } from "next/server";
import { CatalogAdminError } from "@/lib/admin/catalog/errors";
import { requireAdminCapability } from "@/lib/admin/capabilities";
import { isOrderSimulationEnabled, isOrderSimulationEnvironmentAllowed } from "@/lib/tracking/config";
import { SimulationError, simulationUnavailable } from "@/lib/tracking/server";
import type { SimulatedShipmentCommand } from "@/lib/tracking/types";

const privateHeaders = { "cache-control": "private, no-store", "referrer-policy": "no-referrer" };
const invalid = () => new SimulationError("invalid_request", "Check the demo tracking details and try again.", 400);
export const simulationResponse = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: privateHeaders });

export async function runSimulationRequest(request: Request, operation: (actorId: string, body: Record<string, unknown>) => Promise<unknown>, mutation = true) {
  try {
    const access = await requireAdminCapability("orders.simulate");
    if (!(mutation ? isOrderSimulationEnabled() : isOrderSimulationEnvironmentAllowed())) {
      throw new SimulationError("simulation_disabled", "Demo tracking is not enabled in this environment.", 503);
    }
    if (request.headers.get("origin") !== new URL(request.url).origin) {
      throw new SimulationError("same_origin_required", "This request must originate from helix Admin.", 403);
    }
    const declared = request.headers.get("content-length");
    if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > 16_384)) throw invalid();
    if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") throw invalid();
    // Bound the streamed body even if Content-Length is absent or inaccurate.
    const reader = request.body?.getReader();
    if (!reader) throw invalid();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > 16_384) { await reader.cancel(); throw invalid(); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    let body: unknown;
    try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw invalid(); }
    if (!body || typeof body !== "object" || Array.isArray(body)) throw invalid();
    return simulationResponse(await operation(access.userId, body as Record<string, unknown>));
  } catch (error) {
    const failure = error instanceof SimulationError || error instanceof CatalogAdminError ? error : simulationUnavailable();
    return simulationResponse({ error: { code: failure.code, message: failure.message } }, failure.status);
  }
}

export function readSimulationOrderNumber(body: Record<string, unknown>): string {
  if (Object.keys(body).length !== 1 || typeof body.orderNumber !== "string" || !/^[A-Za-z0-9-]{1,64}$/.test(body.orderNumber)) throw invalid();
  return body.orderNumber;
}

const uuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export function readSimulationCommand(body: Record<string, unknown>): SimulatedShipmentCommand {
  if (Object.keys(body).sort().join(",") !== "commandId,expectedVersion,lines,orderId,resolutionReason,shipmentId,state"
    || !uuid(body.orderId) || !uuid(body.commandId) || (body.shipmentId !== null && !uuid(body.shipmentId))
    || !Number.isSafeInteger(body.expectedVersion) || (body.expectedVersion as number) < 0 || (body.expectedVersion as number) > 1000
    || !["dispatched", "in_transit", "delivered", "exception"].includes(String(body.state))
    || !Array.isArray(body.lines) || body.lines.length > 100
    || (body.resolutionReason !== null && (typeof body.resolutionReason !== "string" || body.resolutionReason.trim().length < 1
      || body.resolutionReason.length > 500 || /[\x00-\x1f\x7f]/.test(body.resolutionReason)))) throw invalid();
  const ids = new Set<string>();
  for (const line of body.lines) {
    if (!line || typeof line !== "object" || Array.isArray(line) || Object.keys(line).sort().join(",") !== "orderItemId,quantity"
      || !uuid(line.orderItemId) || !Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 99 || ids.has(line.orderItemId)) throw invalid();
    ids.add(line.orderItemId);
  }
  if (body.shipmentId === null ? body.state !== "dispatched" || body.expectedVersion !== 0 || body.lines.length < 1 || body.resolutionReason !== null
    : body.state === "dispatched" || body.expectedVersion === 0 || body.lines.length !== 0) throw invalid();
  return body as SimulatedShipmentCommand;
}
