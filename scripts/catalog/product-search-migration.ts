export type ProductSearchRecord = Record<string, unknown> & {
  objectID: string;
};

export type ProductSearchIndexSnapshot = {
  name: string;
  entries: number;
  replicas: string[];
  primary: string | null;
  rules: Array<Record<string, unknown>>;
  synonyms: Array<Record<string, unknown>>;
  settings: Record<string, unknown>;
  settingsMatch: boolean;
  records: ProductSearchRecord[];
};

export type ProductSearchInventory = {
  indices: Array<{ name: string }>;
  source: ProductSearchIndexSnapshot | null;
  target: ProductSearchIndexSnapshot | null;
  querySuggestions: Array<{
    region: "us" | "eu";
    indexName: string;
    sourceIndices: string[];
  }>;
  recommendDependencies: string[];
  providerChecks: {
    querySuggestions: "verified" | "unavailable";
    recommend: "verified" | "unavailable";
  };
  apiKeys: {
    status:
      | "all-keys-enumerated"
      | "configured-keys-verified"
      | "unavailable";
    configuredPublicKeyVerified: boolean;
    configuredWriteKeyVerified: boolean;
    keys?: Array<{
      identity: string;
      acl: string[];
      indexes: string[];
      description: string | null;
    }>;
  };
  analytics: {
    implication: string;
  };
};

export type ProductSearchMigrationReport = {
  ok: boolean;
  verified: boolean;
  inventory: ProductSearchInventory;
  blockers: string[];
  reconciliation: {
    canonicalRecords: number;
    sourceRecords: number;
    targetRecords: number;
    targetMatchesCanonical: boolean;
    representativeMediaUrls: string[];
  };
};

export interface ProductSearchControlPlane {
  inspect(
    canonicalRecords: ProductSearchRecord[],
  ): Promise<ProductSearchInventory>;
};

export type ProductSearchMigrationConfig = {
  appId: string;
  writeApiKey: string;
  adminApiKey: string | null;
  publicSearchApiKey: string;
  querySuggestionsRegion: "us" | "eu";
  targetEnvironment: "development" | "preview";
};

function requiredEnv(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`[product-search] Missing ${name}.`);
  if (/^(your-|replace|generate-)/i.test(value)) {
    throw new Error(`[product-search] ${name} still contains a placeholder.`);
  }
  return value;
}

export function loadProductSearchMigrationConfig(
  env: NodeJS.ProcessEnv,
): ProductSearchMigrationConfig {
  const targetEnvironment = requiredEnv(env, "SEARCH_BACKFILL_ENVIRONMENT");
  if (targetEnvironment === "production") {
    throw new Error("[product-search] Refusing production search migration.");
  }
  if (targetEnvironment !== "development" && targetEnvironment !== "preview") {
    throw new Error(
      "[product-search] SEARCH_BACKFILL_ENVIRONMENT must be development or preview.",
    );
  }
  const appId = requiredEnv(env, "ALGOLIA_APP_ID");
  const publicAppId = requiredEnv(env, "NEXT_PUBLIC_ALGOLIA_APP_ID");
  if (appId !== publicAppId) {
    throw new Error(
      "[product-search] Public and server Algolia application IDs must match.",
    );
  }
  const querySuggestionsRegion = requiredEnv(
    env,
    "ALGOLIA_QUERY_SUGGESTIONS_REGION",
  );
  if (querySuggestionsRegion !== "us" && querySuggestionsRegion !== "eu") {
    throw new Error(
      "[product-search] ALGOLIA_QUERY_SUGGESTIONS_REGION must be us or eu.",
    );
  }
  return {
    appId,
    writeApiKey: requiredEnv(env, "ALGOLIA_WRITE_API_KEY"),
    adminApiKey: env.ALGOLIA_ADMIN_API_KEY?.trim() || null,
    publicSearchApiKey: requiredEnv(env, "NEXT_PUBLIC_ALGOLIA_SEARCH_API_KEY"),
    querySuggestionsRegion,
    targetEnvironment,
  };
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function recordsMatch(
  observed: ProductSearchRecord[],
  canonical: ProductSearchRecord[],
): boolean {
  if (observed.length !== canonical.length) return false;
  const byId = new Map(observed.map((record) => [record.objectID, record]));
  return canonical.every(
    (record) => canonicalJson(byId.get(record.objectID)) === canonicalJson(record),
  );
}

function representativeMediaUrls(records: ProductSearchRecord[]): string[] {
  return records
    .map((record) => {
      const media = record.imageMedia;
      if (!media || typeof media !== "object" || Array.isArray(media)) return null;
      const url = (media as Record<string, unknown>).url;
      return typeof url === "string" ? url : null;
    })
    .filter((url): url is string => Boolean(url))
    .slice(0, 5);
}

export async function collectPaginatedSearchConfiguration<T>(
  readPage: (
    page: number,
    hitsPerPage: number,
  ) => Promise<{ hits: T[]; nbHits: number }>,
  hitsPerPage = 1_000,
): Promise<T[]> {
  if (!Number.isSafeInteger(hitsPerPage) || hitsPerPage < 1) {
    throw new Error("[product-search] Invalid configuration page size.");
  }

  const hits: T[] = [];
  let expectedTotal: number | null = null;
  for (let page = 0; ; page += 1) {
    const response = await readPage(page, hitsPerPage);
    if (!Number.isSafeInteger(response.nbHits) || response.nbHits < 0) {
      throw new Error("[product-search] Invalid configuration total.");
    }
    if (expectedTotal === null) expectedTotal = response.nbHits;
    else if (response.nbHits !== expectedTotal) {
      throw new Error(
        "[product-search] Search configuration changed during inventory.",
      );
    }

    hits.push(...response.hits);
    if (hits.length === expectedTotal) return hits;
    if (response.hits.length === 0 || hits.length > expectedTotal) {
      throw new Error(
        "[product-search] Search configuration inventory was incomplete.",
      );
    }
  }
}

export async function collectPaginatedIndices<T>(
  readPage: (
    page: number,
    hitsPerPage: number,
  ) => Promise<{ items: T[]; nbPages?: number }>,
  hitsPerPage = 100,
): Promise<T[]> {
  if (!Number.isSafeInteger(hitsPerPage) || hitsPerPage < 1) {
    throw new Error("[product-search] Invalid index inventory page size.");
  }

  const items: T[] = [];
  let expectedPages: number | null = null;
  for (let page = 0; ; page += 1) {
    const response = await readPage(page, hitsPerPage);
    const pages = response.nbPages;
    if (
      typeof pages !== "number" ||
      !Number.isSafeInteger(pages) ||
      pages < 0
    ) {
      throw new Error("[product-search] Invalid index inventory page count.");
    }
    if (expectedPages === null) expectedPages = pages;
    else if (pages !== expectedPages) {
      throw new Error("[product-search] Index inventory changed during read.");
    }

    if (pages === 0 && response.items.length > 0) {
      throw new Error("[product-search] Invalid empty index inventory.");
    }
    if (pages > 0 && response.items.length === 0) {
      throw new Error("[product-search] Index inventory was incomplete.");
    }
    items.push(...response.items);
    if (page + 1 >= pages) return items;
  }
}

function wildcardMatches(pattern: string, value: string): boolean {
  let patternIndex = 0;
  let valueIndex = 0;
  let starIndex = -1;
  let valueAfterStar = -1;

  while (valueIndex < value.length) {
    if (
      patternIndex < pattern.length &&
      pattern[patternIndex] === value[valueIndex]
    ) {
      patternIndex += 1;
      valueIndex += 1;
    } else if (pattern[patternIndex] === "*") {
      starIndex = patternIndex;
      valueAfterStar = valueIndex;
      patternIndex += 1;
    } else if (starIndex >= 0) {
      patternIndex = starIndex + 1;
      valueAfterStar += 1;
      valueIndex = valueAfterStar;
    } else {
      return false;
    }
  }

  while (pattern[patternIndex] === "*") patternIndex += 1;
  return patternIndex === pattern.length;
}

function containsRetiredIdentifier(value: string): boolean {
  const formerBrand = new RegExp(["mei", "pelle"].join("[\\s_-]*"), "i");
  const retiredRewards = new RegExp(["loyal", "ty"].join(""), "i");
  return formerBrand.test(value) || retiredRewards.test(value);
}

export function assessProductSearchMigration(
  inventory: ProductSearchInventory,
  canonicalRecords: ProductSearchRecord[],
): ProductSearchMigrationReport {
  const blockers: string[] = [];
  if (inventory.providerChecks.querySuggestions === "unavailable") {
    blockers.push("Query Suggestions inventory is unavailable");
  }
  if (inventory.providerChecks.recommend === "unavailable") {
    blockers.push("Recommend inventory is unavailable");
  }
  if (
    inventory.apiKeys.status === "unavailable" ||
    !inventory.apiKeys.configuredWriteKeyVerified
  ) {
    blockers.push("configured Algolia keys could not be verified");
  }
  if (!inventory.apiKeys.configuredPublicKeyVerified) {
    blockers.push("configured public Product Search key could not read helix_products");
  }
  if (inventory.apiKeys.status !== "all-keys-enumerated") {
    blockers.push("all Algolia API keys must be inventoried");
  }
  for (const index of inventory.indices) {
    if (containsRetiredIdentifier(index.name)) {
      blockers.push(`Algolia index ${index.name} contains a retired identifier`);
    }
  }
  for (const key of inventory.apiKeys.keys ?? []) {
    if (key.description && containsRetiredIdentifier(key.description)) {
      blockers.push(
        `Algolia API key ${key.identity} description contains a retired identifier`,
      );
    }
    if (
      key.indexes.some(
        (restriction) =>
          wildcardMatches(restriction, LEGACY_PRODUCTS_INDEX) &&
          !wildcardMatches(restriction, HELIX_PRODUCTS_INDEX),
      )
    ) {
      blockers.push(
        `Algolia API key ${key.identity} is scoped to the source index`,
      );
    }
  }
  if (inventory.source) blockers.push("former Product Search index still exists");
  for (const config of inventory.querySuggestions) {
    if (config.sourceIndices.includes(LEGACY_PRODUCTS_INDEX)) {
      blockers.push(
        `Query Suggestions ${config.indexName} (${config.region}) reads the source index`,
      );
    }
  }
  for (const dependency of inventory.recommendDependencies) {
    blockers.push(`Recommend model ${dependency} depends on the source index`);
  }

  const targetMatchesCanonical = inventory.target
    ? inventory.target.settingsMatch &&
      inventory.target.primary === null &&
      inventory.target.replicas.length === 0 &&
      inventory.target.rules.length === 0 &&
      inventory.target.synonyms.length === 0 &&
      recordsMatch(inventory.target.records, canonicalRecords)
    : false;
  if (!inventory.target) blockers.push("helix_products index is missing");
  else if (!targetMatchesCanonical) {
    blockers.push("helix_products does not match canonical Product Search state");
  }
  const verified = blockers.length === 0;

  return {
    ok: verified,
    verified,
    inventory,
    blockers,
    reconciliation: {
      canonicalRecords: canonicalRecords.length,
      sourceRecords: inventory.source?.entries ?? 0,
      targetRecords: inventory.target?.entries ?? 0,
      targetMatchesCanonical,
      representativeMediaUrls: representativeMediaUrls(canonicalRecords),
    },
  };
}

export async function runProductSearchVerification(
  controlPlane: ProductSearchControlPlane,
  canonicalRecords: ProductSearchRecord[],
): Promise<ProductSearchMigrationReport> {
  return assessProductSearchMigration(
    await controlPlane.inspect(canonicalRecords),
    canonicalRecords,
  );
}

type ProviderInspection<T> =
  | { ok: true; value: T }
  | { ok: false; status: number | null };

async function inspectProvider<T>(
  operation: () => Promise<T>,
): Promise<ProviderInspection<T>> {
  try {
    return { ok: true, value: await operation() };
  } catch (error) {
    const candidate = error as { status?: unknown; statusCode?: unknown };
    const status =
      typeof candidate.status === "number"
        ? candidate.status
        : typeof candidate.statusCode === "number"
          ? candidate.statusCode
          : null;
    return { ok: false, status };
  }
}

function settingsMatch(settings: Record<string, unknown>): boolean {
  return Object.entries(INDEX_SETTINGS).every(
    ([key, expected]) => canonicalJson(settings[key]) === canonicalJson(expected),
  );
}

export class AlgoliaProductSearchControlPlane
  implements ProductSearchControlPlane
{
  private readonly client: Algoliasearch;
  private readonly publicClient: LiteClient;

  constructor(private readonly config: ProductSearchMigrationConfig) {
    this.client = algoliasearch(
      config.appId,
      config.adminApiKey ?? config.writeApiKey,
    );
    this.publicClient = liteClient(config.appId, config.publicSearchApiKey);
  }

  private async readRecords(
    indexName: string,
  ): Promise<ProductSearchRecord[]> {
    const records: ProductSearchRecord[] = [];
    await this.client.browseObjects<Record<string, unknown>>({
      indexName,
      browseParams: { hitsPerPage: 1_000 },
      aggregator(response) {
        records.push(...(response.hits as ProductSearchRecord[]));
      },
    });
    return records;
  }

  private async readIndices(): Promise<FetchedIndex[]> {
    return collectPaginatedIndices(async (page, hitsPerPage) => {
      const response = await this.client.listIndices({ page, hitsPerPage });
      return { items: response.items, nbPages: response.nbPages };
    });
  }

  private async readRules(indexName: string): Promise<Rule[]> {
    return collectPaginatedSearchConfiguration(async (page, hitsPerPage) => {
      const response = await this.client.searchRules({
        indexName,
        searchRulesParams: { query: "", page, hitsPerPage },
      });
      return {
        hits: response.hits,
        nbHits: response.nbHits,
      };
    });
  }

  private async readSynonyms(indexName: string): Promise<SynonymHit[]> {
    return collectPaginatedSearchConfiguration(async (page, hitsPerPage) => {
      const response = await this.client.searchSynonyms({
        indexName,
        searchSynonymsParams: { query: "", page, hitsPerPage },
      });
      return {
        hits: response.hits,
        nbHits: response.nbHits,
      };
    });
  }

  private async readIndex(
    indexName: string,
    index: {
      entries: number;
      replicas?: string[];
      primary?: string;
    },
  ): Promise<ProductSearchIndexSnapshot> {
    const [settings, rules, synonyms, records] = await Promise.all([
      this.client.getSettings({ indexName }),
      this.readRules(indexName),
      this.readSynonyms(indexName),
      this.readRecords(indexName),
    ]);
    const rawSettings = settings as Record<string, unknown>;
    return {
      name: indexName,
      entries: index.entries,
      replicas: index.replicas ?? [],
      primary: index.primary ?? null,
      rules: (rules as unknown as Array<Record<string, unknown>>).sort(
        (left, right) => canonicalJson(left).localeCompare(canonicalJson(right)),
      ),
      synonyms: (synonyms as unknown as Array<Record<string, unknown>>).sort(
        (left, right) => canonicalJson(left).localeCompare(canonicalJson(right)),
      ),
      settings: rawSettings,
      settingsMatch: settingsMatch(rawSettings),
      records,
    };
  }

  private async readQuerySuggestions(): Promise<{
    configurations: ProductSearchInventory["querySuggestions"];
    status: ProductSearchInventory["providerChecks"]["querySuggestions"];
  }> {
    const inventory: ProductSearchInventory["querySuggestions"] = [];
    const region = this.config.querySuggestionsRegion;
    const result = await inspectProvider(() =>
      this.client.initQuerySuggestions({ region }).getAllConfigs(),
    );
    if (!result.ok) {
      return { configurations: [], status: "unavailable" };
    }
    for (const config of result.value) {
      inventory.push({
        region,
        indexName: String(config.indexName),
        sourceIndices: config.sourceIndices.map((source) =>
          String(source.indexName),
        ),
      });
    }
    return {
      configurations: inventory,
      status: "verified",
    };
  }

  private async readRecommendDependencies(
    objectID: string | undefined,
  ): Promise<{
    dependencies: string[];
    status: ProductSearchInventory["providerChecks"]["recommend"];
  }> {
    const recommend = this.client.initRecommend();
    const requests = [
      ...(objectID
        ? ([
            {
              model: "bought-together",
              indexName: LEGACY_PRODUCTS_INDEX,
              objectID,
              threshold: 0,
              maxRecommendations: 1,
            },
            {
              model: "related-products",
              indexName: LEGACY_PRODUCTS_INDEX,
              objectID,
              threshold: 0,
              maxRecommendations: 1,
            },
            {
              model: "looking-similar",
              indexName: LEGACY_PRODUCTS_INDEX,
              objectID,
              threshold: 0,
              maxRecommendations: 1,
            },
          ] as const)
        : []),
      {
        model: "trending-items",
        indexName: LEGACY_PRODUCTS_INDEX,
        threshold: 0,
        maxRecommendations: 1,
      },
    ] as const;
    const results = await Promise.all(
      requests.map(async (request) => ({
        model: request.model,
        result: await inspectProvider(() =>
          recommend.getRecommendations({ requests: [request] }),
        ),
      })),
    );
    const unavailable = results.some(
      ({ result }) => !result.ok && result.status !== 404,
    );
    return {
      dependencies: results
        .filter(({ result }) => result.ok)
        .map(({ model }) => model),
      status: unavailable ? "unavailable" : "verified",
    };
  }

  private async readApiKeys(targetExists: boolean) {
    const allKeys = await inspectProvider(() => this.client.listApiKeys());
    const writeKey = await inspectProvider(() =>
      this.client.getApiKey({ key: this.config.writeApiKey }),
    );
    const keys = allKeys.ok
      ? allKeys.value.keys.map((key, index) => ({
          identity:
            key.value === this.config.publicSearchApiKey
              ? "configured-public-search-key"
              : key.value === this.config.writeApiKey
                ? "configured-write-key"
                : `other-key-${index + 1}`,
          acl: [...key.acl],
          indexes: [...(key.indexes ?? [])],
          description: key.description ?? null,
        }))
      : writeKey.ok
        ? [
            {
              identity: "configured-write-key",
              acl: [...writeKey.value.acl],
              indexes: [...(writeKey.value.indexes ?? [])],
              description: writeKey.value.description ?? null,
            },
          ]
        : undefined;
    const publicRead = targetExists
      ? await inspectProvider(() =>
          this.publicClient.searchForHits({
            requests: [
              {
                indexName: HELIX_PRODUCTS_INDEX,
                query: "",
                hitsPerPage: 1,
              },
            ],
          }),
        )
      : { ok: false as const, status: null };
    return {
      status: allKeys.ok
        ? ("all-keys-enumerated" as const)
        : writeKey.ok && (!targetExists || publicRead.ok)
          ? ("configured-keys-verified" as const)
          : ("unavailable" as const),
      configuredPublicKeyVerified: publicRead.ok,
      configuredWriteKeyVerified: writeKey.ok,
      ...(keys ? { keys } : {}),
    };
  }

  async inspect(
    canonicalRecords: ProductSearchRecord[],
  ): Promise<ProductSearchInventory> {
    const indices = await this.readIndices();
    const sourceIndex = indices.find(
      (index) => index.name === LEGACY_PRODUCTS_INDEX,
    );
    const targetIndex = indices.find(
      (index) => index.name === HELIX_PRODUCTS_INDEX,
    );
    const [source, target, querySuggestions, recommend, apiKeys] =
      await Promise.all([
        sourceIndex
          ? this.readIndex(
              LEGACY_PRODUCTS_INDEX,
              sourceIndex,
            )
          : Promise.resolve(null),
        targetIndex
          ? this.readIndex(
              HELIX_PRODUCTS_INDEX,
              targetIndex,
            )
          : Promise.resolve(null),
        this.readQuerySuggestions(),
        this.readRecommendDependencies(canonicalRecords[0]?.objectID),
        this.readApiKeys(Boolean(targetIndex)),
      ]);
    return {
      indices: indices.map(({ name }) => ({ name })),
      source,
      target,
      querySuggestions: querySuggestions.configurations,
      recommendDependencies: recommend.dependencies,
      providerChecks: {
        querySuggestions: querySuggestions.status,
        recommend: recommend.status,
      },
      apiKeys,
      analytics: {
        implication:
          "Algolia analytics remain attached to the original index name; helix_products starts a separate analytics history and deleting the source does not delete its historical analytics.",
      },
    };
  }

}
import {
  algoliasearch,
  type Algoliasearch,
  type FetchedIndex,
  type Rule,
  type SynonymHit,
} from "algoliasearch";
import { liteClient, type LiteClient } from "algoliasearch/lite";
import { INDEX_SETTINGS } from "../../lib/algolia/record";
import {
  HELIX_PRODUCTS_INDEX,
  LEGACY_PRODUCTS_INDEX,
} from "../../lib/algolia/index";
