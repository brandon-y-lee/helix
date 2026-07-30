import { fetchAllSearchRecords } from "@/lib/algolia/source";
import {
  getIndexName,
  reindexAllSearchRecords,
} from "@/lib/algolia/server";

export type SearchBackfillEnvironment = "development" | "preview" | "production";

export type SearchBackfillReport = {
  dryRun: boolean;
  environment: SearchBackfillEnvironment;
  indexName: string | null;
  read: number;
  transformed: number;
  upserted: number;
  skipped: number;
  failed: number;
  verified: number;
};

export class SearchBackfillError extends Error {
  constructor(
    message: string,
    readonly report: SearchBackfillReport,
  ) {
    super(message);
    this.name = "SearchBackfillError";
  }
}

function getBackfillEnvironment(): SearchBackfillEnvironment {
  const value =
    process.env.SEARCH_BACKFILL_ENVIRONMENT || process.env.VERCEL_ENV;
  if (value !== "development" && value !== "preview" && value !== "production") {
    throw new Error(
      "Set SEARCH_BACKFILL_ENVIRONMENT to development, preview, or production " +
        "before rebuilding the search index.",
    );
  }
  if (
    value === "production" &&
    process.env.ALLOW_PRODUCTION_SEARCH_REINDEX !== "true"
  ) {
    throw new Error(
      "Production search reindex is disabled. Set " +
        "ALLOW_PRODUCTION_SEARCH_REINDEX=true only for an intentional rebuild.",
    );
  }
  return value;
}

export async function runSearchBackfill({
  apply = true,
}: {
  apply?: boolean;
} = {}): Promise<SearchBackfillReport> {
  const environment = getBackfillEnvironment();
  const report: SearchBackfillReport = {
    dryRun: !apply,
    environment,
    indexName: null,
    read: 0,
    transformed: 0,
    upserted: 0,
    skipped: 0,
    failed: 0,
    verified: 0,
  };

  try {
    report.indexName = getIndexName();
    const records = await fetchAllSearchRecords();
    report.read = records.length;
    report.transformed = records.length;

    if (records.length === 0) {
      throw new Error(
        "Supabase returned an empty catalog; refusing to replace the Algolia " +
          "index with zero records.",
      );
    }

    if (!apply) {
      report.skipped = records.length;
      return report;
    }

    const result = await reindexAllSearchRecords(records);
    report.upserted = result.submitted;
    report.verified = result.verified;
    return report;
  } catch (error) {
    report.failed = 1;
    const message = error instanceof Error ? error.message : "Unknown backfill error";
    throw new SearchBackfillError(message, report);
  }
}
