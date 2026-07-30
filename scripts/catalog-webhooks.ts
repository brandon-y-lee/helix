import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { config as loadDotEnv } from "dotenv";
import {
  loadCatalogWebhookConfig,
  loadCatalogWebhookSmokeConfig,
  runCatalogWebhookProvisioning,
  runCatalogWebhookSmoke,
  SupabaseCatalogWebhookControlPlane,
  type CatalogWebhookMode,
} from "./catalog/catalog-webhooks";

loadDotEnv({ path: resolve(process.cwd(), ".env.local"), quiet: true });

function command(argv: string[]): CatalogWebhookMode | "smoke" {
  const value = argv[0];
  if (
    value === "plan" ||
    value === "apply" ||
    value === "verify" ||
    value === "smoke"
  ) {
    return value;
  }
  throw new Error(
    "[catalog-webhooks] Expected one command: plan, apply, verify, or smoke.",
  );
}

export async function runCatalogWebhookCli(
  argv: string[],
  env: NodeJS.ProcessEnv,
) {
  const selected = command(argv);
  if (selected === "smoke") {
    return runCatalogWebhookSmoke(loadCatalogWebhookSmokeConfig(env));
  }
  return runCatalogWebhookProvisioning(
    selected,
    loadCatalogWebhookConfig(env),
    new SupabaseCatalogWebhookControlPlane(),
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runCatalogWebhookCli(process.argv.slice(2), process.env)
    .then((report) => {
      console.log(JSON.stringify(report, null, 2));
      if (!report.ok) process.exitCode = 1;
    })
    .catch((error) => {
      console.error(
        JSON.stringify(
          {
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : "[catalog-webhooks] Unknown failure.",
          },
          null,
          2,
        ),
      );
      process.exitCode = 1;
    });
}
