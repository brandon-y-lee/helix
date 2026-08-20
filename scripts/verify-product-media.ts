import { resolve } from "node:path";
import { config as loadDotEnv } from "dotenv";
import {
  createSupabaseStorefrontCatalogAdapter,
} from "../test-support/supabase-storefront-catalog";
import type { StorefrontCatalogReadAdapter } from "../test-support/storefront-baseline";
import {
  verifyRealProductMedia,
  type ExpectedProductMedia,
  type ProductMediaHttpClient,
  type RealProductMediaVerificationReport,
} from "../lib/catalog/real-product-media-verification";
import { createBoundedProductMediaHttpClient } from "../lib/catalog/product-media-http-client";
import { CATALOG_MEDIA_BUCKET } from "../lib/catalog/media-storage";

export { createBoundedProductMediaHttpClient };

const DEFAULT_MEDIA_PATH_PREFIX =
  `/storage/v1/object/public/${CATALOG_MEDIA_BUCKET}/`;
const DEFAULT_MAX_REDIRECTS = 3;
const DEFAULT_TIMEOUT_MS = 5_000;

export type VerifiedProductMediaFailure = Readonly<{
  url: string;
  expectedMediaType: "image" | "video";
  code: Exclude<RealProductMediaVerificationReport["results"][number]["failure"], null>["code"];
  message: string;
  status: number | null;
  receivedBytes: number;
  totalBytes: number | null;
  contentType: string | null;
  redirects: number;
}>;

export type ProductMediaVerificationCommandReport = Readonly<{
  ok: boolean;
  generatedAt: string;
  catalog: Readonly<{
    activeProducts: number;
    expectedRecords: number;
    distinctUrls: number;
  }>;
  verification: Readonly<{
    expectedRecords: number;
    distinctUrls: number;
    successes: number;
    failures: number;
    receivedBodyBytes: number;
    bodyBudgetBytes: number;
  }>;
  failures: readonly VerifiedProductMediaFailure[];
  errors: readonly string[];
}>;

export type ProductMediaCatalogProduct = Readonly<{
  id: string;
  slug: string;
  product_media: readonly Readonly<{
    media_type: string;
    url: unknown;
  }>[];
}>;

export type ProductMediaCatalogSnapshot = Readonly<{
  products: readonly ProductMediaCatalogProduct[];
}>;

export type ProductMediaVerifierRuntime = Readonly<{
  loadCatalog(): Promise<ProductMediaCatalogSnapshot>;
  approvedMediaOrigin: string;
  createHttpClient(fetchImpl?: typeof fetch): ProductMediaHttpClient;
  pathPrefix: string;
  maxRedirects: number;
  timeoutMs: number;
}>;

type CommandMode = "json-only" | "default";

type CommandLogger = Readonly<{
  output: (line: string) => void;
  error: (line: string) => void;
}>;

class ProductMediaConfigurationError extends Error {}
class ProductMediaInventoryError extends Error {}

function safeReportUrl(value: string): string {
  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    url.search = "";
    return url.href;
  } catch {
    return "[invalid Product Media URL]";
  }
}

function requiredEnv(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new ProductMediaConfigurationError(
      `Missing required environment variable: ${name}.`,
    );
  }
  return value;
}

export function collectExpectedProductMedia(
  catalog: ProductMediaCatalogSnapshot,
): readonly ExpectedProductMedia[] {
  const expected: ExpectedProductMedia[] = [];

  for (const product of catalog.products) {
    for (const candidate of product.product_media) {
      if (candidate.media_type !== "image" && candidate.media_type !== "video") {
        throw new ProductMediaInventoryError(
          "Active Product Media inventory contains an unsupported media type.",
        );
      }

      if (candidate.url === null) continue;
      if (typeof candidate.url !== "string" || !candidate.url.trim()) {
        throw new ProductMediaInventoryError(
          "Active Product Media inventory contains a missing or invalid public URL.",
        );
      }

      expected.push({
        mediaType: candidate.media_type,
        url: candidate.url,
      });
    }
  }

  return Object.freeze(expected);
}

function extractFailures(report: RealProductMediaVerificationReport): readonly VerifiedProductMediaFailure[] {
  return Object.freeze(
    report.results
      .filter(
        (
          result,
        ): result is typeof result & {
          failure: NonNullable<typeof result.failure>;
        } => result.outcome === "failed" && result.failure !== null,
      )
      .map((result) =>
        Object.freeze({
          url: safeReportUrl(result.url),
          expectedMediaType: result.expectedMediaType,
          code: result.failure.code,
          message: result.failure.message,
          status: result.status,
          receivedBytes: result.receivedBytes,
          totalBytes: result.totalBytes,
          contentType: result.contentType,
          redirects: result.redirects,
        }),
      ),
  );
}

function buildVerificationPolicy(
  approvedMediaOrigin: string,
  pathPrefix: string,
  maxRedirects: number,
  timeoutMs: number,
) {
  const origin = new URL(approvedMediaOrigin).origin;
  return {
    approvedLocations: [{ origin, pathPrefix }],
    maxRedirects,
    timeoutMs,
  } as const;
}

function buildSummaryLines(report: ProductMediaVerificationCommandReport): readonly string[] {
  const status = report.ok ? "PASS" : "FAIL";
  const header = `Active Product Media verification ${status}`;

  const catalog = `Catalog: activeProducts=${report.catalog.activeProducts}, expectedRecords=${report.catalog.expectedRecords}, distinctUrls=${report.catalog.distinctUrls}`;
  const verification =
    `Verification: expectedRecords=${report.verification.expectedRecords}, distinctUrls=${report.verification.distinctUrls}, successes=${report.verification.successes}, failures=${report.verification.failures}, receivedBodyBytes=${report.verification.receivedBodyBytes}/${report.verification.bodyBudgetBytes}`;

  const failureLines = report.failures.map(
    (failure) =>
      `- ${failure.url} ${failure.expectedMediaType} ${failure.code} status=${failure.status ?? "n/a"} redirects=${failure.redirects} reason=${failure.message}`,
  );
  const errorLines = report.errors.map((message) => `- ${message}`);

  const statusMessage = report.ok
    ? "All active Product Media URLs were verified successfully."
    : "Active Product Media verification failed.";

  const details = [...failureLines, ...errorLines];

  return Object.freeze([
    header,
    catalog,
    verification,
    statusMessage,
    ...details,
  ]);
}

function emitReport(
  report: ProductMediaVerificationCommandReport,
  mode: CommandMode | undefined,
  logger: CommandLogger,
): void {
  if (mode === "json-only") {
    logger.output(JSON.stringify(report, null, 2));
    return;
  }

  for (const line of buildSummaryLines(report)) {
    if (line.startsWith("- ")) logger.error(line);
    else logger.output(line);
  }
  logger.output(JSON.stringify(report, null, 2));
}

function failedCommandReport(input: Readonly<{
  generatedAt: string;
  error: string;
  activeProducts?: number;
  expectedRecords?: number;
  distinctUrls?: number;
}>): ProductMediaVerificationCommandReport {
  const activeProducts = input.activeProducts ?? 0;
  const expectedRecords = input.expectedRecords ?? 0;
  const distinctUrls = input.distinctUrls ?? 0;

  return Object.freeze({
    ok: false,
    generatedAt: input.generatedAt,
    catalog: Object.freeze({ activeProducts, expectedRecords, distinctUrls }),
    verification: Object.freeze({
      expectedRecords,
      distinctUrls,
      successes: 0,
      failures: 0,
      receivedBodyBytes: 0,
      bodyBudgetBytes: distinctUrls * 32,
    }),
    failures: Object.freeze([]),
    errors: Object.freeze([input.error]),
  });
}

export async function runActiveProductMediaVerification(
  runtime: ProductMediaVerifierRuntime,
): Promise<ProductMediaVerificationCommandReport> {
  const generatedAt = new Date().toISOString();
  let catalogLoaded = false;
  let activeProducts = 0;
  let expectedRecords = 0;
  let distinctUrls = 0;

  try {
    const catalog = await runtime.loadCatalog();
    catalogLoaded = true;
    activeProducts = catalog.products.length;
    expectedRecords = catalog.products.reduce(
      (total, product) => total + product.product_media.length,
      0,
    );
    distinctUrls = new Set(
      catalog.products.flatMap((product) =>
        product.product_media.flatMap((media) =>
          typeof media.url === "string" && media.url.trim() ? [media.url] : [],
        ),
      ),
    ).size;
    const expectedMedia = collectExpectedProductMedia(catalog);
    const policy = buildVerificationPolicy(
      runtime.approvedMediaOrigin,
      runtime.pathPrefix,
      runtime.maxRedirects,
      runtime.timeoutMs,
    );

    const verification = await verifyRealProductMedia({
      expectedMedia,
      urlPolicy: policy,
      httpClient: runtime.createHttpClient(),
    });

    const failures = extractFailures(verification);
    const summary = verification.summary;

    return Object.freeze({
      ok: summary.failures === 0,
      generatedAt,
      catalog: Object.freeze({
        activeProducts: catalog.products.length,
        expectedRecords: summary.expectedRecords,
        distinctUrls: summary.distinctUrls,
      }),
      verification: Object.freeze({
        expectedRecords: summary.expectedRecords,
        distinctUrls: summary.distinctUrls,
        successes: summary.successes,
        failures: summary.failures,
        receivedBodyBytes: summary.receivedBodyBytes,
        bodyBudgetBytes: summary.bodyBudgetBytes,
      }),
      failures,
      errors: Object.freeze([]),
    });
  } catch (cause) {
    return failedCommandReport({
      generatedAt,
      activeProducts,
      expectedRecords,
      distinctUrls,
      error:
        cause instanceof ProductMediaInventoryError
          ? cause.message
          : !catalogLoaded
            ? "Active Product Catalog read failed."
            : "Active Product Media verification did not complete.",
    });
  }
}

export function createRuntimeFromCatalogAdapter(adapter: StorefrontCatalogReadAdapter): ProductMediaVerifierRuntime {
  if (!adapter.approvedMediaOrigin) {
    throw new Error("Cannot verify Product Media without an approved media origin.");
  }

  return {
    approvedMediaOrigin: adapter.approvedMediaOrigin,
    createHttpClient: (fetchImpl = fetch) => createBoundedProductMediaHttpClient(fetchImpl),
    loadCatalog: async () => {
      const catalog = await adapter.readCatalog();
      return Object.freeze({
        products: Object.freeze(
          catalog.products.map((product) =>
            Object.freeze({
              id: product.id,
              slug: product.slug,
              product_media: Object.freeze(
                (product.product_media ?? []).map((media) =>
                  Object.freeze({
                    media_type: media.media_type,
                    url: media.url,
                  }),
                ),
              ),
            }),
          ),
        ),
      });
    },
    pathPrefix: DEFAULT_MEDIA_PATH_PREFIX,
    maxRedirects: DEFAULT_MAX_REDIRECTS,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };
}

function createCatalogAdapter(env: NodeJS.ProcessEnv): StorefrontCatalogReadAdapter {
  return createSupabaseStorefrontCatalogAdapter({
    url: requiredEnv(env, "NEXT_PUBLIC_SUPABASE_URL"),
    anonKey: requiredEnv(env, "NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    fetchImpl: fetch,
  });
}

function readCommandMode(argv: string[]): CommandMode {
  if (argv.length === 0) return "default";
  if (argv.length === 1 && argv[0] === "--json") return "json-only";

  throw new Error("Usage: pnpm tsx scripts/verify-product-media.ts [--json]");
}

export async function runActiveProductMediaVerificationCli(
  env: NodeJS.ProcessEnv,
  options?: Readonly<{
    mode?: CommandMode;
    logger?: CommandLogger;
    runtime?: ProductMediaVerifierRuntime;
  }>,
): Promise<number> {
  const logger: CommandLogger = options?.logger ?? {
    output: (line) => console.log(line),
    error: (line) => console.error(line),
  };

  try {
    const runtime =
      options?.runtime ??
      createRuntimeFromCatalogAdapter(
        createCatalogAdapter(env),
      );

    const report = await runActiveProductMediaVerification(runtime);

    emitReport(report, options?.mode, logger);

    return report.ok ? 0 : 1;
  } catch (cause) {
    const report = failedCommandReport({
      generatedAt: new Date().toISOString(),
      error:
        cause instanceof ProductMediaConfigurationError
          ? cause.message
          : "Active Product Media verification command failed before it could start.",
    });
    emitReport(report, options?.mode, logger);
    return 1;
  }
}

if (import.meta.url === new URL(process.argv[1] ?? "", import.meta.url).href) {
  loadDotEnv({ path: resolve(process.cwd(), ".env.local"), quiet: true });

  const mode = readCommandMode(process.argv.slice(2));
  void runActiveProductMediaVerificationCli(process.env, {
    mode,
  }).then((code) => {
    process.exitCode = code;
  });
}
