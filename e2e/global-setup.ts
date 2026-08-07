import { resolve } from "node:path";
import type { FullConfig } from "@playwright/test";
import { assertApprovedSupabaseProjectUrl } from "@/lib/supabase/project-safety";
import {
  createStorefrontBaseline,
  StorefrontBaselineError,
} from "@/test-support/storefront-baseline";
import { createSupabaseStorefrontCatalogAdapter } from "@/test-support/supabase-storefront-catalog";
import { writeStorefrontSnapshot } from "@/test-support/storefront-snapshot-artifact";

const CATALOG_READ_TIMEOUT_MS = 10_000;

function sharedOutputDirectory(config: FullConfig | undefined): string {
  const outputDirectories = new Set(
    (config?.projects ?? []).map((project) => project.outputDir),
  );
  if (outputDirectories.size > 1) {
    throw new Error(
      "e2e: Playwright projects must share one output directory so every worker reads the same Storefront snapshot.",
    );
  }
  return outputDirectories.values().next().value ??
    resolve(process.cwd(), "test-results");
}

// Playwright starts the built Storefront before this hook. Read the approved
// non-production Catalog once, validate it at the shared test/tooling seam,
// and publish one immutable artifact inherited by every worker process.
export default async function globalSetup(
  config?: FullConfig,
): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "e2e: missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY. " +
        "Copy .env.example to .env.local and set your dev Supabase credentials.",
    );
  }

  try {
    assertApprovedSupabaseProjectUrl(url);
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : "Invalid project URL.";
    throw new Error(
      `e2e: refusing unapproved Supabase project. ${detail}`,
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CATALOG_READ_TIMEOUT_MS);

  try {
    const snapshot = await createStorefrontBaseline(
      createSupabaseStorefrontCatalogAdapter({
        url,
        anonKey,
        signal: controller.signal,
      }),
    );
    const artifactPath = await writeStorefrontSnapshot(
      snapshot,
      sharedOutputDirectory(config),
    );
    console.log(
      `e2e global-setup: validated ${snapshot.products.length} active Products ` +
        `and wrote ${artifactPath}.`,
    );
  } catch (cause) {
    if (cause instanceof StorefrontBaselineError) {
      if (cause.code === "catalog-read-timeout") {
        throw new Error(
          "e2e: the approved Supabase project did not respond within 10s. " +
            "Check the configured URL and network connectivity.",
        );
      }
      throw new Error(`e2e: ${cause.detail}`);
    }
    throw cause;
  } finally {
    clearTimeout(timer);
  }
}
