import { assertCatalogAudit, buildCatalogAudit } from "./catalog-data-audit";
import { createOpsClient, printJson } from "./supabase-ops";

async function run(): Promise<void> {
  const supabase = createOpsClient();
  const audit = await buildCatalogAudit(supabase);
  assertCatalogAudit(audit);
  printJson({
    ok: true,
    generatedAt: audit.generatedAt,
    activeCanonicalProducts: audit.activeCanonicalProducts,
    completeTheRoutineCount: audit.completeTheRoutineCount,
    tableCounts: audit.tableCounts,
  });
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
