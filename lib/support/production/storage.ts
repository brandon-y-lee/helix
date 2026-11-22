import "server-only";
import { ProductionSupportError, type ProductionConfig } from "./config";
import { boundedText, object } from "./request";

const rpcs = new Set(["read_support_prod_contract", "submit_support_prod_inquiry", "claim_support_prod_outbox", "start_support_prod_send",
  "complete_support_prod_send", "record_support_prod_sent",
  "reserve_support_prod_photo", "complete_support_prod_photo", "read_support_prod_photos", "claim_support_prod_photo",
  "record_support_prod_photo_raw", "finish_support_prod_photo", "prepare_support_prod_media", "finalize_support_prod_media", "reconcile_support_prod_media"]);
export function productionSupportHeaders(serviceKey: string): Record<string, string> {
  const headers: Record<string, string> = { apikey: serviceKey };
  if (!serviceKey.startsWith("sb_secret_")) headers.authorization = `Bearer ${serviceKey}`;
  return headers;
}
/** Explicit project only. No generic admin/client or shared environment inheritance. */
export async function productionRpc(config: ProductionConfig, name: string, input?: Record<string, unknown>, network: typeof fetch = fetch): Promise<unknown> {
  if (!rpcs.has(name)) throw new ProductionSupportError();
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new ProductionSupportError()); }, 5_000); });
  try {
    const result = await Promise.race([network(`${config.projectUrl}/rest/v1/rpc/${name}`, {
      method: "POST", redirect: "error", signal: controller.signal,
      headers: { ...productionSupportHeaders(config.serviceKey), "content-type": "application/json" },
      body: JSON.stringify(input === undefined ? {} : { p_input: input }),
    }), deadline]);
    const raw = await Promise.race([boundedText(result, 64 * 1024), deadline]);
    let value: unknown;
    try { value = JSON.parse(raw); } catch { throw new ProductionSupportError(); }
    if (!result.ok) {
      // Only fixed domain errors survive the storage boundary. Never expose raw diagnostics.
      if (object(value) && value.message === "support_submission_conflict") throw new ProductionSupportError(409, "submission_conflict");
      if (object(value) && value.message === "support_rate_limited") throw new ProductionSupportError(429, "rate_limited");
      throw new ProductionSupportError();
    }
    return value;
  } catch (error) { throw error instanceof ProductionSupportError ? error : new ProductionSupportError(); }
  finally { if (timer) clearTimeout(timer); }
}
