import { buildCatalogAudit } from "./catalog-data-audit";
import { createOpsClient, printJson } from "./supabase-ops";

async function run(): Promise<void> {
  const supabase = createOpsClient();
  const audit = await buildCatalogAudit(supabase);
  printJson(audit);
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
