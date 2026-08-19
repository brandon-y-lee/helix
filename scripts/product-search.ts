import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { config as loadDotEnv } from "dotenv";
import {
  AlgoliaProductSearchControlPlane,
  loadProductSearchMigrationConfig,
  runProductSearchMigration,
  type ProductSearchMigrationMode,
  type ProductSearchRecord,
} from "./catalog/product-search-migration";
import {
  loadCatalogWebhookSmokeConfig,
  runCatalogWebhookSmoke,
} from "./catalog/catalog-webhooks";
import { HELIX_PRODUCTS_INDEX } from "../lib/algolia/index";

loadDotEnv({
  path: resolve(
    process.env.PRODUCT_SEARCH_ENV_FILE ?? resolve(process.cwd(), ".env.local"),
  ),
  quiet: true,
});

function readMode(argv: string[]): ProductSearchMigrationMode {
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
    "[product-search] Expected plan, apply, verify, or finalize.",
  );
}

function summarizeIndex(
  index: Awaited<
    ReturnType<AlgoliaProductSearchControlPlane["inspect"]>
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

export async function runProductSearchCli(
  argv: string[],
  env: NodeJS.ProcessEnv,
) {
  const mode = readMode(argv);
  const config = loadProductSearchMigrationConfig(env);
  const { fetchAllSearchRecords } = await import("../lib/algolia/source");
  const canonicalRecords =
    (await fetchAllSearchRecords()) as unknown as ProductSearchRecord[];
  const smoke =
    mode === "finalize"
      ? await runCatalogWebhookSmoke(loadCatalogWebhookSmokeConfig(env))
      : null;
  const report = await runProductSearchMigration(
    mode,
    new AlgoliaProductSearchControlPlane(config),
    canonicalRecords,
    smoke
      ? {
          consumerVerification: {
            publicReadIndex: HELIX_PRODUCTS_INDEX,
            serverWriteIndex: smoke.indexName,
            webhookDeliveryVerified: true,
          },
        }
      : {},
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
  runProductSearchCli(process.argv.slice(2), process.env)
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
              : "[product-search] Unknown failure.",
        }),
      );
      process.exitCode = 1;
    });
}
