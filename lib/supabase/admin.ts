import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseFetch, SupabaseTransportAbortError } from "@/lib/supabase/network";
import { getPaymentDeadlineRemainingMs, paymentDeadlineFetch } from "@/lib/payments/deadline";

let adminClient: SupabaseClient | null = null;
const boundedFetch = createSupabaseFetch({ fetchImplementation: paymentDeadlineFetch });

const adminFetch: typeof fetch = async (input, init) => {
  const response = await boundedFetch(input, init);
  // The pinned PostgREST SDK retries HTTP 520 with an internal sleep that does
  // not receive this request-scoped signal. The durable worker owns its retries.
  if (Number.isFinite(getPaymentDeadlineRemainingMs()) && response.status === 520) {
    await response.body?.cancel();
    throw new SupabaseTransportAbortError();
  }
  return response;
};

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required Supabase env var: ${name}`);
  return value;
}

export function createSupabaseAdminClient(): SupabaseClient {
  if (adminClient) return adminClient;

  adminClient = createClient(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      global: {
        fetch: adminFetch,
      },
    },
  );

  return adminClient;
}
