import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { ProductNotificationStorage } from "@/lib/waitlist/notifications";

async function rpc(name: string, args: Record<string, unknown>): Promise<unknown> {
  const abort = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => { abort.abort(); reject(new Error("Product notifications are temporarily unavailable.")); }, 3_000);
  });
  try {
    const { data, error } = await Promise.race([createSupabaseAdminClient().rpc(name, args).abortSignal(abort.signal), deadline]);
    if (error) throw new Error("Product notifications are temporarily unavailable.");
    return data;
  } finally { clearTimeout(timer); abort.abort(); }
}
function result(value: unknown): { ok: boolean } {
  if (!value || typeof value !== "object" || !("ok" in value) || typeof value.ok !== "boolean") throw new Error("Invalid Product notification result.");
  return { ok: value.ok };
}
export const productNotificationStorage: ProductNotificationStorage = {
  async recover(input) {
    return result(await rpc("request_product_notification_recovery", { p_normalized_email: input.email,
      p_abuse_key: input.abuseKey, p_request_id: input.requestId, p_tokens: input.tokens, p_delivery_allowed: input.deliveryAllowed }));
  },
  async cancel(token) { return result(await rpc("cancel_product_notification", { p_token: token })); },
};

export async function materializeProductNotifications(): Promise<number> {
  const value = await rpc("materialize_product_notifications", { p_limit: 20 });
  if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) > 20) throw new Error("Invalid Product notification work.");
  return Number(value);
}
