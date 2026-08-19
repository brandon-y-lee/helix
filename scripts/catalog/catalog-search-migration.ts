export const LEGACY_CATALOG_SEARCH_INDEX = "mei_pelle_products" as const;
export const HELIX_CATALOG_SEARCH_INDEX = "helix_products" as const;

export type CatalogSearchMigrationMode =
  | "plan"
  | "apply"
  | "verify"
  | "finalize";

export type CatalogSearchRecord = Record<string, unknown> & {
  objectID: string;
};

export type CatalogSearchIndexSnapshot = {
  name: string;
  entries: number;
  replicas: string[];
  primary: string | null;
  rules: number;
  synonyms: number;
  settings: Record<string, unknown>;
  settingsMatch: boolean;
  records: CatalogSearchRecord[];
};

export type CatalogSearchInventory = {
  source: CatalogSearchIndexSnapshot | null;
  target: CatalogSearchIndexSnapshot | null;
  querySuggestions: Array<{
    region: "us" | "eu";
    indexName: string;
    sourceIndices: string[];
  }>;
  recommendDependencies: string[];
  apiKeys: {
    status: "available" | "unavailable";
    configuredPublicKeyVerified: boolean;
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

export type CatalogSearchMigrationReport = {
  ok: boolean;
  mode: CatalogSearchMigrationMode;
  verified: boolean;
  inventory: CatalogSearchInventory;
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

export interface CatalogSearchControlPlane {
  inspect(
    canonicalRecords: CatalogSearchRecord[],
  ): Promise<CatalogSearchInventory>;
  prepareTarget(canonicalRecords: CatalogSearchRecord[]): Promise<void>;
  verifyPublicRead(): Promise<void>;
  deleteSource(): Promise<void>;
}

export type CatalogSearchMigrationConfig = {
  appId: string;
  writeApiKey: string;
  publicSearchApiKey: string;
  targetEnvironment: "development" | "preview";
};

function requiredEnv(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`[catalog-search] Missing ${name}.`);
  if (/^(your-|replace|generate-)/i.test(value)) {
    throw new Error(`[catalog-search] ${name} still contains a placeholder.`);
  }
  return value;
}

export function loadCatalogSearchMigrationConfig(
  env: NodeJS.ProcessEnv,
): CatalogSearchMigrationConfig {
  const targetEnvironment = requiredEnv(env, "SEARCH_BACKFILL_ENVIRONMENT");
  if (targetEnvironment === "production") {
    throw new Error("[catalog-search] Refusing production search migration.");
  }
  if (targetEnvironment !== "development" && targetEnvironment !== "preview") {
    throw new Error(
      "[catalog-search] SEARCH_BACKFILL_ENVIRONMENT must be development or preview.",
    );
  }
  const appId = requiredEnv(env, "ALGOLIA_APP_ID");
  const publicAppId = requiredEnv(env, "NEXT_PUBLIC_ALGOLIA_APP_ID");
  if (appId !== publicAppId) {
    throw new Error(
      "[catalog-search] Public and server Algolia application IDs must match.",
    );
  }
  return {
    appId,
    writeApiKey: requiredEnv(env, "ALGOLIA_WRITE_API_KEY"),
    publicSearchApiKey: requiredEnv(env, "NEXT_PUBLIC_ALGOLIA_SEARCH_API_KEY"),
    targetEnvironment,
  };
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stable(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function recordsMatch(
  observed: CatalogSearchRecord[],
  canonical: CatalogSearchRecord[],
): boolean {
  if (observed.length !== canonical.length) return false;
  const byId = new Map(observed.map((record) => [record.objectID, record]));
  return canonical.every(
    (record) => stable(byId.get(record.objectID)) === stable(record),
  );
}

function representativeMediaUrls(records: CatalogSearchRecord[]): string[] {
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

export function assessCatalogSearchMigration(
  mode: CatalogSearchMigrationMode,
  inventory: CatalogSearchInventory,
  canonicalRecords: CatalogSearchRecord[],
): CatalogSearchMigrationReport {
  const blockers: string[] = [];
  const sourceReplicas = inventory.source?.replicas ?? [];
  if (sourceReplicas.length > 0) {
    blockers.push(`source index has replicas: ${sourceReplicas.join(", ")}`);
  }
  if (inventory.source?.primary) {
    blockers.push(`source index is a replica of ${inventory.source.primary}`);
  }
  for (const config of inventory.querySuggestions) {
    if (config.sourceIndices.includes(LEGACY_CATALOG_SEARCH_INDEX)) {
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
      inventory.target.rules ===
        (inventory.source?.rules ?? inventory.target.rules) &&
      inventory.target.synonyms ===
        (inventory.source?.synonyms ?? inventory.target.synonyms) &&
      recordsMatch(inventory.target.records, canonicalRecords)
    : false;
  const actions: CatalogSearchMigrationReport["actions"] = [];
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

export async function runCatalogSearchMigration(
  mode: CatalogSearchMigrationMode,
  controlPlane: CatalogSearchControlPlane,
  canonicalRecords: CatalogSearchRecord[],
  options: { consumersSwitched?: boolean } = {},
): Promise<CatalogSearchMigrationReport> {
  const initial = await controlPlane.inspect(canonicalRecords);
  const initialReport = assessCatalogSearchMigration(
    mode === "finalize" ? "verify" : mode,
    initial,
    canonicalRecords,
  );
  if (!initialReport.ok) {
    throw new Error(
      `[catalog-search] Preflight failed: ${initialReport.blockers.join("; ") || "target verification failed"}.`,
    );
  }
  if (mode === "plan" || mode === "verify") return initialReport;

  if (mode === "apply") {
    if (!initialReport.reconciliation.targetMatchesCanonical) {
      await controlPlane.prepareTarget(canonicalRecords);
    }
    await controlPlane.verifyPublicRead();
    const finalInventory = await controlPlane.inspect(canonicalRecords);
    const finalReport = assessCatalogSearchMigration(
      "verify",
      finalInventory,
      canonicalRecords,
    );
    if (!finalReport.ok) {
      throw new Error(
        "[catalog-search] Target reconciliation or public read verification failed.",
      );
    }
    return finalReport;
  }

  if (!options.consumersSwitched) {
    throw new Error(
      "[catalog-search] Refusing to delete the source before consumers are switched.",
    );
  }
  await controlPlane.deleteSource();
  const finalInventory = await controlPlane.inspect(canonicalRecords);
  const finalReport = assessCatalogSearchMigration(
    "finalize",
    finalInventory,
    canonicalRecords,
  );
  if (!finalReport.ok) {
    throw new Error("[catalog-search] Final verification detected active legacy state.");
  }
  return finalReport;
}

type SafeResult<T> =
  | { ok: true; value: T }
  | { ok: false; status: number | null };

async function safely<T>(operation: () => Promise<T>): Promise<SafeResult<T>> {
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

function projectObservedRecord(
  observed: Record<string, unknown>,
  canonical: CatalogSearchRecord,
): CatalogSearchRecord {
  return Object.fromEntries(
    Object.keys(canonical).map((key) => [key, observed[key]]),
  ) as CatalogSearchRecord;
}

function settingsMatch(settings: Record<string, unknown>): boolean {
  return Object.entries(INDEX_SETTINGS).every(
    ([key, expected]) => stable(settings[key]) === stable(expected),
  );
}

export class AlgoliaCatalogSearchControlPlane
  implements CatalogSearchControlPlane
{
  private readonly client: Algoliasearch;
  private readonly publicClient: LiteClient;

  constructor(private readonly config: CatalogSearchMigrationConfig) {
    this.client = algoliasearch(config.appId, config.writeApiKey);
    this.publicClient = liteClient(config.appId, config.publicSearchApiKey);
  }

  private async readRecords(
    indexName: string,
    canonicalRecords: CatalogSearchRecord[],
  ): Promise<CatalogSearchRecord[]> {
    const canonicalById = new Map(
      canonicalRecords.map((record) => [record.objectID, record]),
    );
    const records: CatalogSearchRecord[] = [];
    await this.client.browseObjects<Record<string, unknown>>({
      indexName,
      browseParams: { hitsPerPage: 1_000 },
      aggregator(response) {
        for (const hit of response.hits) {
          const canonical = canonicalById.get(hit.objectID);
          records.push(
            canonical
              ? projectObservedRecord(hit, canonical)
              : ({ objectID: hit.objectID } as CatalogSearchRecord),
          );
        }
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
    canonicalRecords: CatalogSearchRecord[],
  ): Promise<CatalogSearchIndexSnapshot> {
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
      this.readRecords(indexName, canonicalRecords),
    ]);
    const rawSettings = settings as Record<string, unknown>;
    return {
      name: indexName,
      entries: index.entries,
      replicas: index.replicas ?? [],
      primary: index.primary ?? null,
      rules: rules.nbHits,
      synonyms: synonyms.nbHits,
      settings: rawSettings,
      settingsMatch: settingsMatch(rawSettings),
      records,
    };
  }

  private async readQuerySuggestions(): Promise<
    CatalogSearchInventory["querySuggestions"]
  > {
    const inventory: CatalogSearchInventory["querySuggestions"] = [];
    for (const region of ["us", "eu"] as const) {
      const result = await safely(() =>
        this.client.initQuerySuggestions({ region }).getAllConfigs(),
      );
      if (!result.ok) continue;
      for (const config of result.value) {
        inventory.push({
          region,
          indexName: String(config.indexName),
          sourceIndices: config.sourceIndices.map((source) =>
            String(source.indexName),
          ),
        });
      }
    }
    return inventory;
  }

  private async readRecommendDependencies(
    objectID: string | undefined,
  ): Promise<string[]> {
    if (!objectID) return [];
    const recommend = this.client.initRecommend();
    const requests = [
      {
        model: "bought-together",
        indexName: LEGACY_CATALOG_SEARCH_INDEX,
        objectID,
        threshold: 0,
        maxRecommendations: 1,
      },
      {
        model: "related-products",
        indexName: LEGACY_CATALOG_SEARCH_INDEX,
        objectID,
        threshold: 0,
        maxRecommendations: 1,
      },
      {
        model: "looking-similar",
        indexName: LEGACY_CATALOG_SEARCH_INDEX,
        objectID,
        threshold: 0,
        maxRecommendations: 1,
      },
      {
        model: "trending-items",
        indexName: LEGACY_CATALOG_SEARCH_INDEX,
        threshold: 0,
        maxRecommendations: 1,
      },
    ] as const;
    const results = await Promise.all(
      requests.map(async (request) => ({
        model: request.model,
        result: await safely(() =>
          recommend.getRecommendations({ requests: [request] }),
        ),
      })),
    );
    return results.filter(({ result }) => result.ok).map(({ model }) => model);
  }

  private async readApiKeys(targetExists: boolean) {
    const result = await safely(() => this.client.listApiKeys());
    const keys = result.ok
      ? result.value.keys.map((key, index) => ({
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
      : undefined;
    const publicRead = targetExists
      ? await safely(() =>
          this.publicClient.searchForHits({
            requests: [
              {
                indexName: HELIX_CATALOG_SEARCH_INDEX,
                query: "",
                hitsPerPage: 1,
              },
            ],
          }),
        )
      : { ok: false as const, status: null };
    return {
      status: result.ok ? ("available" as const) : ("unavailable" as const),
      configuredPublicKeyVerified: publicRead.ok,
      ...(keys ? { keys } : {}),
    };
  }

  async inspect(
    canonicalRecords: CatalogSearchRecord[],
  ): Promise<CatalogSearchInventory> {
    const listed = await this.client.listIndices({ hitsPerPage: 100 });
    const sourceIndex = listed.items.find(
      (index) => index.name === LEGACY_CATALOG_SEARCH_INDEX,
    );
    const targetIndex = listed.items.find(
      (index) => index.name === HELIX_CATALOG_SEARCH_INDEX,
    );
    const [source, target, querySuggestions, recommendDependencies, apiKeys] =
      await Promise.all([
        sourceIndex
          ? this.readIndex(
              LEGACY_CATALOG_SEARCH_INDEX,
              sourceIndex,
              canonicalRecords,
            )
          : Promise.resolve(null),
        targetIndex
          ? this.readIndex(
              HELIX_CATALOG_SEARCH_INDEX,
              targetIndex,
              canonicalRecords,
            )
          : Promise.resolve(null),
        this.readQuerySuggestions(),
        this.readRecommendDependencies(canonicalRecords[0]?.objectID),
        this.readApiKeys(Boolean(targetIndex)),
      ]);
    return {
      source,
      target,
      querySuggestions,
      recommendDependencies,
      apiKeys,
      analytics: {
        implication:
          "Algolia analytics remain attached to the original index name; helix_products starts a separate analytics history and deleting the source does not delete its historical analytics.",
      },
    };
  }

  async prepareTarget(canonicalRecords: CatalogSearchRecord[]): Promise<void> {
    if (
      !(await this.client.indexExists({
        indexName: HELIX_CATALOG_SEARCH_INDEX,
      }))
    ) {
      if (
        !(await this.client.indexExists({
          indexName: LEGACY_CATALOG_SEARCH_INDEX,
        }))
      ) {
        throw new Error("[catalog-search] Source index does not exist.");
      }
      const copied = await this.client.operationIndex({
        indexName: LEGACY_CATALOG_SEARCH_INDEX,
        operationIndexParams: {
          operation: "copy",
          destination: HELIX_CATALOG_SEARCH_INDEX,
        },
      });
      await this.client.waitForTask({
        indexName: LEGACY_CATALOG_SEARCH_INDEX,
        taskID: copied.taskID,
        maxRetries: 20,
      });
    }
    const settings = await this.client.setSettings({
      indexName: HELIX_CATALOG_SEARCH_INDEX,
      indexSettings: INDEX_SETTINGS,
    });
    await this.client.waitForTask({
      indexName: HELIX_CATALOG_SEARCH_INDEX,
      taskID: settings.taskID,
      maxRetries: 20,
    });
    await this.client.replaceAllObjects({
      indexName: HELIX_CATALOG_SEARCH_INDEX,
      objects: canonicalRecords,
      maxRetries: 20,
    });
  }

  async verifyPublicRead(): Promise<void> {
    const { results } = await this.publicClient.searchForHits({
      requests: [
        {
          indexName: HELIX_CATALOG_SEARCH_INDEX,
          query: "",
          hitsPerPage: 1,
        },
      ],
    });
    if ((results[0]?.nbHits ?? 0) < 1) {
      throw new Error("[catalog-search] Public key returned no helix Products.");
    }
  }

  async deleteSource(): Promise<void> {
    if (
      !(await this.client.indexExists({
        indexName: LEGACY_CATALOG_SEARCH_INDEX,
      }))
    ) {
      return;
    }
    const deleted = await this.client.deleteIndex({
      indexName: LEGACY_CATALOG_SEARCH_INDEX,
    });
    await this.client.waitForTask({
      indexName: LEGACY_CATALOG_SEARCH_INDEX,
      taskID: deleted.taskID,
      maxRetries: 20,
    });
  }
}
import { algoliasearch, type Algoliasearch } from "algoliasearch";
import { liteClient, type LiteClient } from "algoliasearch/lite";
import { INDEX_SETTINGS } from "../../lib/algolia/record";
