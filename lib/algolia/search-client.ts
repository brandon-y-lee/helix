// Browser search path. Uses the Algolia "lite" client with the SEARCH-ONLY
// (public) key — never the admin/write key. All three vars are NEXT_PUBLIC_*
// and safe to ship to the client. If they are absent the UI surfaces a clear
// "search not configured" error state rather than crashing.

import { liteClient, type LiteClient } from "algoliasearch/lite";
import {
  HELIX_PRODUCTS_INDEX,
  isHelixProductsIndex,
} from "@/lib/algolia/index";
import type { AlgoliaProductRecord } from "@/lib/algolia/record";

export class SearchNotConfiguredError extends Error {
  constructor() {
    super(
      "Search is not configured. Set NEXT_PUBLIC_ALGOLIA_APP_ID and " +
        "NEXT_PUBLIC_ALGOLIA_SEARCH_API_KEY and " +
        `NEXT_PUBLIC_ALGOLIA_INDEX_NAME=${HELIX_PRODUCTS_INDEX}.`,
    );
    this.name = "SearchNotConfiguredError";
  }
}

export type SearchResult = {
  hits: AlgoliaProductRecord[];
  nbHits: number;
  query: string;
};

type ClientConfig = { client: LiteClient; indexName: string };

let cached: ClientConfig | null = null;

function getConfig(): ClientConfig {
  const appId = process.env.NEXT_PUBLIC_ALGOLIA_APP_ID;
  const apiKey = process.env.NEXT_PUBLIC_ALGOLIA_SEARCH_API_KEY;
  const indexName = process.env.NEXT_PUBLIC_ALGOLIA_INDEX_NAME;

  if (!appId || !apiKey || !isHelixProductsIndex(indexName)) {
    throw new SearchNotConfiguredError();
  }

  if (!cached || cached.indexName !== indexName) {
    cached = { client: liteClient(appId, apiKey), indexName };
  }
  return cached;
}

/** True when the public search env is present (gates the search UI entry). */
export function isSearchConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_ALGOLIA_APP_ID &&
      process.env.NEXT_PUBLIC_ALGOLIA_SEARCH_API_KEY &&
      isHelixProductsIndex(process.env.NEXT_PUBLIC_ALGOLIA_INDEX_NAME),
  );
}

/**
 * Query the synced Algolia index. Throws SearchNotConfiguredError if env is
 * missing and rethrows network/Algolia errors so the UI can show its error
 * state. The caller is responsible for not calling this with an empty query.
 *
 * Cancellation is handled by the caller (useProductSearch ignores stale
 * resolutions), since the Algolia client does not accept an AbortSignal.
 */
export async function searchProducts(
  query: string,
  { hitsPerPage = 12 }: { hitsPerPage?: number } = {},
): Promise<SearchResult> {
  const { client, indexName } = getConfig();

  const { results } = await client.searchForHits<AlgoliaProductRecord>({
    requests: [{ indexName, query, hitsPerPage }],
  });

  const first = results[0];
  return {
    hits: (first?.hits ?? []) as AlgoliaProductRecord[],
    nbHits: first?.nbHits ?? 0,
    query,
  };
}
