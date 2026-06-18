// Server-only Algolia WRITE client. Uses the admin/write key, which is a
// non-NEXT_PUBLIC env var and therefore is never inlined into client bundles.
// This module must only be imported from server code (route handlers).

import { algoliasearch, type Algoliasearch } from "algoliasearch";
import {
  DEFAULT_INDEX_NAME,
  INDEX_SETTINGS,
  type AlgoliaProductRecord,
} from "@/lib/algolia/record";

export class AlgoliaConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AlgoliaConfigError";
  }
}

type WriteConfig = { client: Algoliasearch; indexName: string };

let cached: WriteConfig | null = null;

function getWriteConfig(): WriteConfig {
  const appId = process.env.ALGOLIA_APP_ID;
  const apiKey = process.env.ALGOLIA_WRITE_API_KEY;
  const indexName = process.env.ALGOLIA_INDEX_NAME || DEFAULT_INDEX_NAME;

  const missing: string[] = [];
  if (!appId) missing.push("ALGOLIA_APP_ID");
  if (!apiKey) missing.push("ALGOLIA_WRITE_API_KEY");

  if (missing.length > 0) {
    throw new AlgoliaConfigError(
      `Missing required server Algolia env var(s): ${missing.join(", ")}. ` +
        "Set them in .env.local (server-only — do NOT use NEXT_PUBLIC_ for the " +
        "write key). See .env.example.",
    );
  }

  if (!cached || cached.indexName !== indexName) {
    cached = { client: algoliasearch(appId!, apiKey!), indexName };
  }
  return cached;
}

/** Current write index name (after env resolution). */
export function getIndexName(): string {
  return getWriteConfig().indexName;
}

/** Upsert a single record (INSERT/UPDATE sync). */
export async function upsertSearchRecord(
  record: AlgoliaProductRecord,
): Promise<void> {
  const { client, indexName } = getWriteConfig();
  await client.saveObjects({ indexName, objects: [record] });
}

/** Delete a single record by objectID (product DELETE sync). */
export async function deleteSearchRecord(objectID: string): Promise<void> {
  const { client, indexName } = getWriteConfig();
  await client.deleteObjects({ indexName, objectIDs: [objectID] });
}

/**
 * Full (re)index for initial setup / recovery. Applies index settings then
 * atomically replaces every object. Returns the number of records indexed.
 */
export async function reindexAllSearchRecords(
  records: AlgoliaProductRecord[],
): Promise<number> {
  const { client, indexName } = getWriteConfig();
  await client.setSettings({ indexName, indexSettings: INDEX_SETTINGS });
  await client.replaceAllObjects({ indexName, objects: records });
  return records.length;
}
