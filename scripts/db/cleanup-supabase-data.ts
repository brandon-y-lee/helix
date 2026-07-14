import { buildCleanupPlan } from "./catalog-data-audit";
import { createOpsClient, parseFlag, printJson } from "./supabase-ops";

async function run(): Promise<void> {
  const apply = parseFlag("--apply");
  const supabase = createOpsClient();
  const plan = await buildCleanupPlan(supabase, apply ? "apply" : "dry-run");

  if (!plan.safeToApply) {
    printJson({ ...plan, applied: false });
    process.exitCode = 1;
    return;
  }

  if (!apply || plan.deletableProductIds.length === 0) {
    printJson({ ...plan, applied: false });
    return;
  }

  const { data, error } = await supabase
    .from("products")
    .delete()
    .eq("catalog_status", "archived")
    .in("id", plan.deletableProductIds)
    .select("id, slug");

  if (error) throw new Error(`[db-cleanup] Failed to delete cleanup candidates: ${error.message}`);

  printJson({
    ...plan,
    applied: true,
    deletedProducts: data ?? [],
  });
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
