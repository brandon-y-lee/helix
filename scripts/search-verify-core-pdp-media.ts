import { resolve } from "node:path";
import { config } from "dotenv";
import { algoliasearch } from "algoliasearch";
import { fetchAllSearchRecords } from "@/lib/algolia/source";
import type { AlgoliaProductRecord } from "@/lib/algolia/record";

config({ path: resolve(process.cwd(), ".env.local"), quiet: true });

const CORE_SLUGS = new Set([
  "cleanse-01-calming-gel-cleanser",
  "treat-03-pdrn-5-ampoule",
  "seal-05-green-collagen-cream",
]);

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

async function main() {
  const indexName = requiredEnv("ALGOLIA_INDEX_NAME");
  const client = algoliasearch(
    requiredEnv("ALGOLIA_APP_ID"),
    process.env.ALGOLIA_WRITE_API_KEY ||
      requiredEnv("ALGOLIA_ADMIN_API_KEY"),
  );
  const expected = (await fetchAllSearchRecords()).filter((record) =>
    CORE_SLUGS.has(record.slug),
  );
  const response = await client.searchForHits<AlgoliaProductRecord>({
    requests: [
      {
        indexName,
        query: "",
        hitsPerPage: 100,
        attributesToRetrieve: ["objectID", "slug", "imageMedia"],
      },
    ],
  });
  const hits = response.results[0]?.hits ?? [];
  const actualById = new Map(hits.map((hit) => [hit.objectID, hit]));

  const results = expected.map((record) => {
    const actual = actualById.get(record.objectID);
    const expectedMedia = record.imageMedia;
    const actualMedia = actual?.imageMedia ?? null;
    const matches =
      actual?.slug === record.slug &&
      actualMedia?.url === expectedMedia?.url &&
      actualMedia?.role === expectedMedia?.role;
    return {
      slug: record.slug,
      objectID: record.objectID,
      matches,
      expectedRole: expectedMedia?.role ?? null,
      actualRole: actualMedia?.role ?? null,
      expectedUrl: expectedMedia?.url ?? null,
      actualUrl: actualMedia?.url ?? null,
    };
  });

  if (results.length !== CORE_SLUGS.size || results.some((item) => !item.matches)) {
    throw new Error(
      `[search-verify] Core media mismatch: ${JSON.stringify(results)}`,
    );
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        indexName,
        recordsVerified: results.length,
        results,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown Algolia verification error",
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
});
