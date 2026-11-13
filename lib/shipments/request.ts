import { requireAdminCapability } from "@/lib/admin/capabilities";
import { CatalogAdminError } from "@/lib/admin/catalog/errors";
import { readBoundedBody } from "@/lib/email/provider";
import { parseShipmentCommand } from "./contract";
import { applyShipment, lookupShipmentOrder } from "./server";
const response = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      "cache-control": "private, no-store",
      "referrer-policy": "no-referrer",
    },
  });
export async function handleShipmentRequest(request: Request) {
  try {
    const access = await requireAdminCapability("fulfillment.manage");
    if (request.method !== "POST")
      return response({ error: "Method not allowed." }, 405);
    if (request.headers.get("origin") !== new URL(request.url).origin)
      return response({ error: "Same origin required." }, 403);
    if (
      request.headers.get("content-type")?.split(";")[0].trim() !==
      "application/json"
    )
      return response({ error: "JSON required." }, 400);
    let body: unknown;
    try {
      body = JSON.parse(await readBoundedBody(request, 16384));
    } catch (error) {
      return response(
        { error: "Invalid request." },
        error instanceof RangeError ? 413 : 400,
      );
    }
    if (!body || typeof body !== "object" || Array.isArray(body))
      return response({ error: "Invalid request." }, 400);
    const input = body as Record<string, unknown>;
    if (
      Object.keys(input).join(",") === "orderNumber" &&
      typeof input.orderNumber === "string" &&
      /^[A-Za-z0-9-]{1,100}$/.test(input.orderNumber)
    )
      return response({
        order: await lookupShipmentOrder(input.orderNumber, access.userId),
      });
    if (process.env.HELIX_MANUAL_SHIPMENTS_ENABLED !== "true")
      return response({ error: "Manual shipment updates are disabled." }, 503);
    let command;
    try {
      command = parseShipmentCommand(body);
    } catch {
      return response({ error: "Check the shipment details." }, 400);
    }
    const result = await applyShipment(command, access.userId);
    return response(
      result,
      ["applied", "replayed"].includes(result.status)
        ? 200
        : result.status === "forbidden"
          ? 403
          : result.status === "disabled"
            ? 503
            : 409,
    );
  } catch (error) {
    return response(
      {
        error:
          error instanceof CatalogAdminError
            ? error.message
            : "Shipment records are temporarily unavailable.",
      },
      error instanceof CatalogAdminError ? error.status : 503,
    );
  }
}
