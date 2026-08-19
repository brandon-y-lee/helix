export type ProductSearchMigrationMode =
  | "plan"
  | "apply"
  | "verify"
  | "finalize";

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
  mode: ProductSearchMigrationMode;
  verified: boolean;
  inventory: ProductSearchInventory;
  blockers: string[];
  actions: Array<
    "prepare-target" | "reconcile-target" | "verify-public-read" | "delete-source"
  >;
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
  prepareTarget(canonicalRecords: ProductSearchRecord[]): Promise<void>;
  verifyPublicRead(): Promise<void>;
  deleteSource(): Promise<void>;
}

export type ProductSearchConsumerVerification = {
  publicReadIndex: typeof HELIX_PRODUCTS_INDEX;
  serverWriteIndex: typeof HELIX_PRODUCTS_INDEX;
  webhookDeliveryVerified: true;
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

export function assessProductSearchMigration(
  mode: ProductSearchMigrationMode,
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
  if (
    (mode === "plan" || mode === "apply" || mode === "finalize") &&
    inventory.apiKeys.status !== "all-keys-enumerated"
  ) {
    blockers.push("all Algolia API keys must be inventoried before mutation");
  }
  const sourceReplicas = inventory.source?.replicas ?? [];
  if (sourceReplicas.length > 0) {
    blockers.push(`source index has replicas: ${sourceReplicas.join(", ")}`);
  }
  if (inventory.source?.primary) {
    blockers.push(`source index is a replica of ${inventory.source.primary}`);
  }
  if (inventory.source && !inventory.source.settingsMatch) {
    blockers.push("source settings do not match canonical Product Search settings");
  }
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
      (!inventory.source ||
        canonicalJson(inventory.target.settings) === canonicalJson(inventory.source.settings)) &&
      (!inventory.source ||
        canonicalJson(inventory.target.rules) === canonicalJson(inventory.source.rules)) &&
      (!inventory.source ||
        canonicalJson(inventory.target.synonyms) === canonicalJson(inventory.source.synonyms)) &&
      recordsMatch(inventory.target.records, canonicalRecords)
    : false;
  const actions: ProductSearchMigrationReport["actions"] = [];
  if (!inventory.target) actions.push("prepare-target");
  else if (!targetMatchesCanonical) actions.push("reconcile-target");
  if (inventory.target && !inventory.apiKeys.configuredPublicKeyVerified) {
    actions.push("verify-public-read");
  }
  if (mode === "finalize" && inventory.source) actions.push("delete-source");

  const targetVerified =
    targetMatchesCanonical && inventory.apiKeys.configuredPublicKeyVerified;
  const verified =
    targetVerified && (mode !== "finalize" || inventory.source === null);

  return {
    ok: blockers.length === 0 && (mode === "plan" || mode === "apply" || verified),
    mode,
    verified,
    inventory,
    blockers,
    actions,
    reconciliation: {
      canonicalRecords: canonicalRecords.length,
      sourceRecords: inventory.source?.entries ?? 0,
      targetRecords: inventory.target?.entries ?? 0,
      targetMatchesCanonical,
      representativeMediaUrls: representativeMediaUrls(canonicalRecords),
    },
  };
}

export async function runProductSearchMigration(
  mode: ProductSearchMigrationMode,
  controlPlane: ProductSearchControlPlane,
  canonicalRecords: ProductSearchRecord[],
  options: { consumerVerification?: ProductSearchConsumerVerification } = {},
): Promise<ProductSearchMigrationReport> {
  const initial = await controlPlane.inspect(canonicalRecords);
  const initialReport = assessProductSearchMigration(
    mode === "finalize" ? "verify" : mode,
    initial,
    canonicalRecords,
  );
  if (!initialReport.ok) {
    throw new Error(
      `[product-search] Preflight failed: ${initialReport.blockers.join("; ") || "target verification failed"}.`,
    );
  }
  if (mode === "plan" || mode === "verify") return initialReport;

  if (mode === "apply") {
    if (!initialReport.reconciliation.targetMatchesCanonical) {
      await retryProviderOperation(() =>
        controlPlane.prepareTarget(canonicalRecords),
      );
    }
    await retryProviderOperation(() => controlPlane.verifyPublicRead());
    const finalInventory = await retryProviderOperation(() =>
      controlPlane.inspect(canonicalRecords),
    );
    const finalReport = assessProductSearchMigration(
      "verify",
      finalInventory,
      canonicalRecords,
    );
    if (!finalReport.ok) {
      throw new Error(
        "[product-search] Target reconciliation or public read verification failed.",
      );
    }
    return finalReport;
  }

  if (
    options.consumerVerification?.publicReadIndex !== HELIX_PRODUCTS_INDEX ||
    options.consumerVerification.serverWriteIndex !== HELIX_PRODUCTS_INDEX ||
    !options.consumerVerification.webhookDeliveryVerified
  ) {
    throw new Error(
      "[product-search] Refusing to delete the source without deployed consumer verification.",
    );
  }
  if (initial.apiKeys.status !== "all-keys-enumerated") {
    throw new Error(
      "[product-search] Refusing to delete the source without complete API key inventory.",
    );
  }
  await retryProviderOperation(() => controlPlane.verifyPublicRead());
  await retryProviderOperation(() => controlPlane.deleteSource());
  const finalInventory = await retryProviderOperation(() =>
    controlPlane.inspect(canonicalRecords),
  );
  const finalReport = assessProductSearchMigration(
    "finalize",
    finalInventory,
    canonicalRecords,
  );
  if (!finalReport.ok) {
    throw new Error("[product-search] Final verification detected active legacy state.");
  }
  return finalReport;
}

async function retryProviderOperation<T>(
  operation: () => Promise<T>,
  attempts = 3,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
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
      this.client.searchRules({
        indexName,
        searchRulesParams: { query: "", hitsPerPage: 1_000 },
      }),
      this.client.searchSynonyms({
        indexName,
        searchSynonymsParams: { query: "", hitsPerPage: 1_000 },
      }),
      this.readRecords(indexName),
    ]);
    const rawSettings = settings as Record<string, unknown>;
    return {
      name: indexName,
      entries: index.entries,
      replicas: index.replicas ?? [],
      primary: index.primary ?? null,
      rules: (rules.hits as Array<Record<string, unknown>>).sort((left, right) =>
        canonicalJson(left).localeCompare(canonicalJson(right)),
      ),
      synonyms: (synonyms.hits as Array<Record<string, unknown>>).sort(
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
    const listed = await this.client.listIndices({ hitsPerPage: 100 });
    const sourceIndex = listed.items.find(
      (index) => index.name === LEGACY_PRODUCTS_INDEX,
    );
    const targetIndex = listed.items.find(
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

  async prepareTarget(canonicalRecords: ProductSearchRecord[]): Promise<void> {
    const [sourceSettings, sourceRules, sourceSynonyms] = await Promise.all([
      this.client.getSettings({ indexName: LEGACY_PRODUCTS_INDEX }),
      this.client.searchRules({
        indexName: LEGACY_PRODUCTS_INDEX,
        searchRulesParams: { query: "", hitsPerPage: 1_000 },
      }),
      this.client.searchSynonyms({
        indexName: LEGACY_PRODUCTS_INDEX,
        searchSynonymsParams: { query: "", hitsPerPage: 1_000 },
      }),
    ]);
    if (
      !(await this.client.indexExists({
        indexName: HELIX_PRODUCTS_INDEX,
      }))
    ) {
      if (
        !(await this.client.indexExists({
          indexName: LEGACY_PRODUCTS_INDEX,
        }))
      ) {
        throw new Error("[product-search] Source index does not exist.");
      }
      const copied = await this.client.operationIndex({
        indexName: LEGACY_PRODUCTS_INDEX,
        operationIndexParams: {
          operation: "copy",
          destination: HELIX_PRODUCTS_INDEX,
        },
      });
      await this.client.waitForTask({
        indexName: LEGACY_PRODUCTS_INDEX,
        taskID: copied.taskID,
        maxRetries: 20,
      });
    }
    const settings = await this.client.setSettings({
      indexName: HELIX_PRODUCTS_INDEX,
      indexSettings: sourceSettings,
    });
    await this.client.waitForTask({
      indexName: HELIX_PRODUCTS_INDEX,
      taskID: settings.taskID,
      maxRetries: 20,
    });
    const rules = sourceRules.hits.length
      ? await this.client.saveRules({
          indexName: HELIX_PRODUCTS_INDEX,
          rules: sourceRules.hits,
          clearExistingRules: true,
          forwardToReplicas: false,
        })
      : await this.client.clearRules({
          indexName: HELIX_PRODUCTS_INDEX,
          forwardToReplicas: false,
        });
    await this.client.waitForTask({
      indexName: HELIX_PRODUCTS_INDEX,
      taskID: rules.taskID,
      maxRetries: 20,
    });
    const synonyms = sourceSynonyms.hits.length
      ? await this.client.saveSynonyms({
          indexName: HELIX_PRODUCTS_INDEX,
          synonymHit: sourceSynonyms.hits,
          replaceExistingSynonyms: true,
          forwardToReplicas: false,
        })
      : await this.client.clearSynonyms({
          indexName: HELIX_PRODUCTS_INDEX,
          forwardToReplicas: false,
        });
    await this.client.waitForTask({
      indexName: HELIX_PRODUCTS_INDEX,
      taskID: synonyms.taskID,
      maxRetries: 20,
    });
    await this.client.replaceAllObjects({
      indexName: HELIX_PRODUCTS_INDEX,
      objects: canonicalRecords,
      maxRetries: 20,
    });
  }

  async verifyPublicRead(): Promise<void> {
    const { results } = await this.publicClient.searchForHits({
      requests: [
        {
          indexName: HELIX_PRODUCTS_INDEX,
          query: "",
          hitsPerPage: 1,
        },
      ],
    });
    if ((results[0]?.nbHits ?? 0) < 1) {
      throw new Error("[product-search] Public key returned no helix Products.");
    }
  }

  async deleteSource(): Promise<void> {
    if (
      !(await this.client.indexExists({
        indexName: LEGACY_PRODUCTS_INDEX,
      }))
    ) {
      return;
    }
    const deleted = await this.client.deleteIndex({
      indexName: LEGACY_PRODUCTS_INDEX,
    });
    await this.client.waitForTask({
      indexName: LEGACY_PRODUCTS_INDEX,
      taskID: deleted.taskID,
      maxRetries: 20,
    });
  }
}
import { algoliasearch, type Algoliasearch } from "algoliasearch";
import { liteClient, type LiteClient } from "algoliasearch/lite";
import { INDEX_SETTINGS } from "../../lib/algolia/record";
import {
  HELIX_PRODUCTS_INDEX,
  LEGACY_PRODUCTS_INDEX,
} from "../../lib/algolia/index";
