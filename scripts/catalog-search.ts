import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { config as loadDotEnv } from "dotenv";
import {
  AlgoliaCatalogSearchControlPlane,
  loadCatalogSearchMigrationConfig,
  runCatalogSearchMigration,
  type CatalogSearchMigrationMode,
  type CatalogSearchRecord,
} from "./catalog/catalog-search-migration";

loadDotEnv({
  path: resolve(
    process.env.CATALOG_SEARCH_ENV_FILE ?? resolve(process.cwd(), ".env.local"),
  ),
  quiet: true,
});

function readMode(argv: string[]): CatalogSearchMigrationMode {
  const value = argv[0];
  if (
    value === "plan" ||
    value === "apply" ||
    value === "verify" ||
    value === "finalize"
  ) {
    return value;
  }
  throw new Error(
    "[catalog-search] Expected plan, apply, verify, or finalize.",
  );
}

function summarizeIndex(
  index: Awaited<
    ReturnType<AlgoliaCatalogSearchControlPlane["inspect"]>
  >["source"],
) {
  if (!index) return null;
  return {
    ...index,
    records: {
      count: index.records.length,
      objectIDs: index.records.map((record) => record.objectID),
    },
  };
}

export async function runCatalogSearchCli(
  argv: string[],
  env: NodeJS.ProcessEnv,
) {
  const mode = readMode(argv);
  const config = loadCatalogSearchMigrationConfig(env);
  const { fetchAllSearchRecords } = await import("../lib/algolia/source");
  const canonicalRecords =
    (await fetchAllSearchRecords()) as unknown as CatalogSearchRecord[];
  const report = await runCatalogSearchMigration(
    mode,
    new AlgoliaCatalogSearchControlPlane(config),
    canonicalRecords,
    { consumersSwitched: argv.includes("--consumers-switched") },
  );
  return {
    ...report,
    inventory: {
      ...report.inventory,
      source: summarizeIndex(report.inventory.source),
      target: summarizeIndex(report.inventory.target),
    },
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runCatalogSearchCli(process.argv.slice(2), process.env)
    .then((report) => {
      console.log(JSON.stringify(report, null, 2));
      if (!report.ok) process.exitCode = 1;
    })
    .catch((error) => {
      console.error(
        JSON.stringify({
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : "[catalog-search] Unknown failure.",
        }),
      );
      process.exitCode = 1;
    });
}
