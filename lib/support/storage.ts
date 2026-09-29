import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { supportStorageError } from "@/lib/support/request";

export async function supportRpc(name: string, args: Record<string, unknown> = {}): Promise<unknown> {
  const { data, error } = await createSupabaseAdminClient().rpc(name, args);
  if (error) supportStorageError(error);
  return data;
}
