import { createOpsClient, parseFlag, printJson } from "./supabase-ops";

const CLEANUP_BATCH_SIZE = 100;

async function run(): Promise<void> {
  const apply = parseFlag("--apply");
  const supabase = createOpsClient();
  const { data, error } = await supabase.rpc("cleanup_expired_guest_carts", {
    p_limit: CLEANUP_BATCH_SIZE,
    p_apply: apply,
  });

  if (error) {
    throw new Error(`[cart-cleanup] Cleanup failed: ${error.message}`);
  }

  const result = Array.isArray(data) ? data[0] : data;
  printJson({
    mode: apply ? "apply" : "dry-run",
    batchSize: CLEANUP_BATCH_SIZE,
    matchedCount: Number(result?.matched_count ?? 0),
    deletedCount: Number(result?.deleted_count ?? 0),
  });
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
