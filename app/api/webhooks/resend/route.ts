import { NextResponse } from "next/server";
import { Resend } from "resend";
import { assertEmailEnvironment, EmailConfigurationError } from "@/lib/email/config";
import { readBoundedBody } from "@/lib/email/provider";
import { recordEmailDeliveryEvent } from "@/lib/email/storage";
import { recordSupportReceivedEvent } from "@/lib/support/inbound-webhook";
import { inboundStorage } from "@/lib/support/inbound-storage";
import { supportRfcMessageId } from "@/lib/support/threading";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };
const deliveryEvents = new Set(["email.sent", "email.delivered", "email.delivery_delayed", "email.bounced", "email.complained", "email.suppressed", "email.failed"]);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export async function POST(request: Request) {
  let event: unknown;
  try {
    assertEmailEnvironment(process.env);
    const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
    if (!webhookSecret?.startsWith("whsec_")) throw new EmailConfigurationError("missing_webhook_secret");
    const payload = await readBoundedBody(request, 128 * 1024);
    // Verification is local; a sending API key and enabled dispatch are not required.
    event = new Resend("re_webhook_verification_only").webhooks.verify({ payload, webhookSecret,
      headers: { id: request.headers.get("svix-id") ?? "", timestamp: request.headers.get("svix-timestamp") ?? "", signature: request.headers.get("svix-signature") ?? "" } });
  } catch (error) {
    return NextResponse.json({ error: "Webhook could not be verified." }, {
      status: error instanceof EmailConfigurationError ? 503 : error instanceof RangeError ? 413 : 400, headers,
    });
  }
  if (!record(event) || typeof event.type !== "string" || !record(event.data)) {
    return NextResponse.json({ error: "Invalid delivery event." }, { status: 400, headers });
  }
  const data = event.data;
  if (event.type === "email.received") {
    if (typeof data.email_id !== "string" || !uuid.test(data.email_id)
      || typeof event.created_at !== "string" || !Number.isFinite(Date.parse(event.created_at))) {
      return NextResponse.json({ error: "Invalid receiving event." }, { status: 400, headers });
    }
    try {
      await recordSupportReceivedEvent(request.headers.get("svix-id")!, data, event.created_at, process.env);
      return NextResponse.json({ ok: true }, { headers });
    } catch {
      return NextResponse.json({ error: "Incoming event could not be recorded." }, { status: 500, headers });
    }
  }
  if (!deliveryEvents.has(event.type)) return NextResponse.json({ ok: true }, { headers });
  if (!record(data.tags)) return NextResponse.json({ ok: true }, { headers });
  const messageId = data.tags?.helix_message_id;
  if (data.tags.helix_environment !== "sandbox" || typeof messageId !== "string" || !uuid.test(messageId)) return NextResponse.json({ ok: true }, { headers });
  if (!Array.isArray(data.to) || data.to.length !== 1 || typeof data.to[0] !== "string" || data.to[0].length > 254
    || typeof data.from !== "string" || data.from.length > 320 || typeof data.email_id !== "string" || !uuid.test(data.email_id)
    || typeof event.created_at !== "string" || !Number.isFinite(Date.parse(event.created_at))) {
    return NextResponse.json({ error: "Invalid delivery event." }, { status: 400, headers });
  }
  try {
    await recordEmailDeliveryEvent({ eventId: request.headers.get("svix-id")!, messageId,
      providerEmailId: data.email_id, eventType: event.type, occurredAt: event.created_at, sender: data.from, recipient: data.to[0] });
    if (supportRfcMessageId(data.message_id)) await inboundStorage.recordRfc(messageId, data.email_id, data.message_id);
    return NextResponse.json({ ok: true }, { headers });
  } catch {
    return NextResponse.json({ error: "Delivery event could not be recorded." }, { status: 500, headers });
  }
}
