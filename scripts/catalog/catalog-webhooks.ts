import { EXPECTED_SUPABASE_PROJECT_REF } from "../../lib/catalog/canonical-catalog";

const CATALOG_WEBHOOK_PATH =
  "/api/webhooks/supabase/catalog-search-sync" as const;
const CATALOG_WEBHOOK_HEADER = "x-webhook-secret" as const;
const CATALOG_WEBHOOK_TIMEOUT_MS = 5_000;
export const CATALOG_WEBHOOK_TABLES = [
  "products",
  "product_variants",
  "product_media",
  "product_pdp_content",
] as const;
export const CATALOG_WEBHOOK_EVENTS = [
  "INSERT",
  "UPDATE",
  "DELETE",
] as const;

export type CatalogWebhookMode = "plan" | "apply" | "verify";
export type CatalogWebhookTable = (typeof CATALOG_WEBHOOK_TABLES)[number];

type Fetch = typeof fetch;

export type CatalogWebhookConfig = {
  projectRef: typeof EXPECTED_SUPABASE_PROJECT_REF;
  targetEnvironment: "development" | "preview";
  endpoint: string;
  secret: string;
  accessToken: string;
};

export type CatalogWebhookSmokeConfig = Pick<
  CatalogWebhookConfig,
  "projectRef" | "targetEnvironment" | "endpoint" | "secret"
> & {
  productId: string;
};

export type DesiredCatalogWebhook = {
  name: string;
  schema: "public";
  table: CatalogWebhookTable;
  events: typeof CATALOG_WEBHOOK_EVENTS;
  method: "POST";
  endpoint: string;
  timeoutMs: typeof CATALOG_WEBHOOK_TIMEOUT_MS;
  headers: {
    "Content-Type": "application/json";
    [CATALOG_WEBHOOK_HEADER]: string;
  };
};

export type ObservedCatalogWebhook = {
  tableName: string;
  triggerName: string;
  enabled: boolean;
  rowLevel: boolean;
  after: boolean;
  firesInsert: boolean;
  firesUpdate: boolean;
  firesDelete: boolean;
  firesTruncate: boolean;
  endpointMatches: boolean;
  methodMatches: boolean;
  headersMatch: boolean;
  paramsMatch: boolean;
  timeoutMatches: boolean;
};

export type CatalogWebhookRemoteState = {
  pgNetEnabled: boolean;
  httpRequestAvailable: boolean;
  missingTables: string[];
  hooks: ObservedCatalogWebhook[];
};

export type CatalogWebhookAction = {
  action: "create" | "update" | "unchanged";
  table: CatalogWebhookTable;
  name: string;
};

export type CatalogWebhookReport = {
  ok: boolean;
  mode: CatalogWebhookMode;
  projectRef: typeof EXPECTED_SUPABASE_PROJECT_REF;
  targetEnvironment: CatalogWebhookConfig["targetEnvironment"];
  endpoint: string;
  databaseWebhooksEnabled: boolean;
  enableDatabaseWebhooks: boolean;
  desired: Array<{
    name: string;
    schema: "public";
    table: CatalogWebhookTable;
    events: typeof CATALOG_WEBHOOK_EVENTS;
    method: "POST";
    endpoint: string;
    timeoutMs: typeof CATALOG_WEBHOOK_TIMEOUT_MS;
    headerNames: ["Content-Type", typeof CATALOG_WEBHOOK_HEADER];
  }>;
  actions: CatalogWebhookAction[];
  duplicates: Array<{
    table: CatalogWebhookTable;
    triggerNames: string[];
  }>;
  missingTables: string[];
  verified: boolean;
};

export interface CatalogWebhookControlPlane {
  inspect(config: CatalogWebhookConfig): Promise<CatalogWebhookRemoteState>;
  enableDatabaseWebhooks(config: CatalogWebhookConfig): Promise<void>;
  applyChanges(
    config: CatalogWebhookConfig,
    desired: DesiredCatalogWebhook[],
    actions: CatalogWebhookAction[],
  ): Promise<void>;
}

function requiredEnv(
  env: NodeJS.ProcessEnv,
  name: string,
  options: { allowPlaceholder?: boolean } = {},
): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(`[catalog-webhooks] Missing required environment variable: ${name}.`);
  }
  if (
    !options.allowPlaceholder &&
    /^(your-|replace|generate-|https:\/\/your-)/i.test(value)
  ) {
    throw new Error(
      `[catalog-webhooks] Environment variable ${name} still contains a placeholder.`,
    );
  }
  return value;
}

function readProjectAndEnvironment(env: NodeJS.ProcessEnv) {
  const projectRef = requiredEnv(env, "SUPABASE_PROJECT_REF");
  if (projectRef !== EXPECTED_SUPABASE_PROJECT_REF) {
    throw new Error(
      `[catalog-webhooks] Refusing Supabase project "${projectRef}". ` +
        `Expected approved non-production project "${EXPECTED_SUPABASE_PROJECT_REF}".`,
    );
  }

  const targetEnvironment = requiredEnv(
    env,
    "CATALOG_WEBHOOK_TARGET_ENVIRONMENT",
  );
  if (targetEnvironment === "production") {
    throw new Error("[catalog-webhooks] Refusing production webhook provisioning.");
  }
  if (targetEnvironment !== "development" && targetEnvironment !== "preview") {
    throw new Error(
      "[catalog-webhooks] CATALOG_WEBHOOK_TARGET_ENVIRONMENT must be development or preview.",
    );
  }

  return {
    projectRef: EXPECTED_SUPABASE_PROJECT_REF,
    targetEnvironment,
  } as const;
}

function readEndpointAndSecret(env: NodeJS.ProcessEnv) {
  const endpointValue = requiredEnv(env, "SUPABASE_CATALOG_WEBHOOK_URL");
  let endpoint: URL;
  try {
    endpoint = new URL(endpointValue);
  } catch {
    throw new Error(
      "[catalog-webhooks] SUPABASE_CATALOG_WEBHOOK_URL must be a valid absolute URL.",
    );
  }
  if (
    endpoint.protocol !== "https:" ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash ||
    endpoint.pathname !== CATALOG_WEBHOOK_PATH
  ) {
    throw new Error(
      `[catalog-webhooks] SUPABASE_CATALOG_WEBHOOK_URL must be an HTTPS URL ` +
        `with the exact path ${CATALOG_WEBHOOK_PATH} and no credentials, query, or fragment.`,
    );
  }

  const secret = requiredEnv(env, "SUPABASE_CATALOG_WEBHOOK_SECRET");
  if (Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error(
      "[catalog-webhooks] SUPABASE_CATALOG_WEBHOOK_SECRET must contain at least 32 bytes.",
    );
  }

  return { endpoint: endpoint.href, secret };
}

export function loadCatalogWebhookConfig(
  env: NodeJS.ProcessEnv,
): CatalogWebhookConfig {
  return {
    ...readProjectAndEnvironment(env),
    ...readEndpointAndSecret(env),
    accessToken: requiredEnv(env, "SUPABASE_ACCESS_TOKEN"),
  };
}

export function loadCatalogWebhookSmokeConfig(
  env: NodeJS.ProcessEnv,
): CatalogWebhookSmokeConfig {
  const productId = requiredEnv(env, "CATALOG_WEBHOOK_SMOKE_PRODUCT_ID");
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      productId,
    )
  ) {
    throw new Error(
      "[catalog-webhooks] CATALOG_WEBHOOK_SMOKE_PRODUCT_ID must be a UUID.",
    );
  }
  return {
    ...readProjectAndEnvironment(env),
    ...readEndpointAndSecret(env),
    productId,
  };
}

export function catalogWebhookTriggerName(table: CatalogWebhookTable): string {
  return `mei_pelle_catalog_search_sync_${table}`;
}

export function buildDesiredCatalogWebhooks(
  endpoint: string,
  secret: string,
): DesiredCatalogWebhook[] {
  return CATALOG_WEBHOOK_TABLES.map((table) => ({
    name: catalogWebhookTriggerName(table),
    schema: "public",
    table,
    events: CATALOG_WEBHOOK_EVENTS,
    method: "POST",
    endpoint,
    timeoutMs: CATALOG_WEBHOOK_TIMEOUT_MS,
    headers: {
      "Content-Type": "application/json",
      [CATALOG_WEBHOOK_HEADER]: secret,
    },
  }));
}

function observedHookMatches(hook: ObservedCatalogWebhook): boolean {
  return (
    hook.enabled &&
    hook.rowLevel &&
    hook.after &&
    hook.firesInsert &&
    hook.firesUpdate &&
    hook.firesDelete &&
    !hook.firesTruncate &&
    hook.endpointMatches &&
    hook.methodMatches &&
    hook.headersMatch &&
    hook.paramsMatch &&
    hook.timeoutMatches
  );
}

export function buildCatalogWebhookReport(
  mode: CatalogWebhookMode,
  config: CatalogWebhookConfig,
  state: CatalogWebhookRemoteState,
): CatalogWebhookReport {
  const desired = buildDesiredCatalogWebhooks(config.endpoint, config.secret);
  const duplicates: CatalogWebhookReport["duplicates"] = [];
  const actions: CatalogWebhookAction[] = [];

  for (const webhook of desired) {
    const tableHooks = state.hooks.filter(
      (hook) => hook.tableName === webhook.table,
    );
    const managedHook = tableHooks.find(
      (hook) => hook.triggerName === webhook.name,
    );
    const unmanagedHooks = tableHooks.filter(
      (hook) => hook.triggerName !== webhook.name,
    );

    if (tableHooks.length > 1 || unmanagedHooks.length > 0) {
      duplicates.push({
        table: webhook.table,
        triggerNames: tableHooks
          .map((hook) => hook.triggerName)
          .sort((a, b) => a.localeCompare(b)),
      });
      continue;
    }

    actions.push({
      action: managedHook
        ? observedHookMatches(managedHook)
          ? "unchanged"
          : "update"
        : "create",
      table: webhook.table,
      name: webhook.name,
    });
  }

  const databaseWebhooksEnabled =
    state.pgNetEnabled && state.httpRequestAvailable;
  const verified =
    databaseWebhooksEnabled &&
    state.missingTables.length === 0 &&
    duplicates.length === 0 &&
    actions.length === desired.length &&
    actions.every((action) => action.action === "unchanged");
  const ok =
    state.missingTables.length === 0 &&
    duplicates.length === 0 &&
    (mode !== "verify" || verified);

  return {
    ok,
    mode,
    projectRef: config.projectRef,
    targetEnvironment: config.targetEnvironment,
    endpoint: config.endpoint,
    databaseWebhooksEnabled,
    enableDatabaseWebhooks: !databaseWebhooksEnabled,
    desired: desired.map((webhook) => ({
      name: webhook.name,
      schema: webhook.schema,
      table: webhook.table,
      events: webhook.events,
      method: webhook.method,
      endpoint: webhook.endpoint,
      timeoutMs: webhook.timeoutMs,
      headerNames: ["Content-Type", CATALOG_WEBHOOK_HEADER],
    })),
    actions,
    duplicates,
    missingTables: [...state.missingTables].sort((a, b) => a.localeCompare(b)),
    verified,
  };
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function quoteLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

export function buildCatalogWebhookApplySql(
  desired: DesiredCatalogWebhook[],
  actions: CatalogWebhookAction[],
): string {
  const desiredByName = new Map(
    desired.map((webhook) => [webhook.name, webhook]),
  );
  const statements = actions.flatMap((action) => {
    if (action.action === "unchanged") return [];
    const webhook = desiredByName.get(action.name);
    if (!webhook) {
      throw new Error(
        `[catalog-webhooks] Missing desired configuration for trigger "${action.name}".`,
      );
    }
    const drop =
      action.action === "update"
        ? [
            `drop trigger if exists ${quoteIdentifier(webhook.name)} on ` +
              `${quoteIdentifier(webhook.schema)}.${quoteIdentifier(webhook.table)};`,
          ]
        : [];
    const headers = JSON.stringify(webhook.headers);
    return [
      ...drop,
      `create trigger ${quoteIdentifier(webhook.name)}`,
      `after insert or update or delete on ${quoteIdentifier(webhook.schema)}.${quoteIdentifier(webhook.table)}`,
      "for each row",
      `execute function ${quoteIdentifier("supabase_functions")}.${quoteIdentifier("http_request")}(`,
      `  ${quoteLiteral(webhook.endpoint)},`,
      `  ${quoteLiteral(webhook.method)},`,
      `  ${quoteLiteral(headers)},`,
      `  ${quoteLiteral("{}")},`,
      `  ${quoteLiteral(String(webhook.timeoutMs))}`,
      ");",
    ];
  });

  if (statements.length === 0) return "";
  return ["begin;", ...statements, "commit;"].join("\n");
}

const INSPECT_SQL = `
with target_tables(table_name) as (
  values
    ('products'),
    ('product_variants'),
    ('product_media'),
    ('product_pdp_content')
),
hook_rows as (
  select
    c.relname as table_name,
    t.tgname as trigger_name,
    t.tgenabled = 'O' as enabled,
    (t.tgtype & 1) <> 0 as row_level,
    (t.tgtype & 2) = 0 and (t.tgtype & 64) = 0 as after,
    (t.tgtype & 4) <> 0 as fires_insert,
    (t.tgtype & 16) <> 0 as fires_update,
    (t.tgtype & 8) <> 0 as fires_delete,
    (t.tgtype & 32) <> 0 as fires_truncate,
    pg_catalog.regexp_split_to_array(
      pg_catalog.encode(t.tgargs, 'escape'),
      E'\\\\\\\\000'
    ) as args
  from pg_catalog.pg_trigger t
  join pg_catalog.pg_class c on c.oid = t.tgrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  join pg_catalog.pg_proc p on p.oid = t.tgfoid
  join pg_catalog.pg_namespace pn on pn.oid = p.pronamespace
  join target_tables tt on tt.table_name = c.relname
  where not t.tgisinternal
    and n.nspname = 'public'
    and (
      (pn.nspname = 'supabase_functions' and p.proname = 'http_request')
      or t.tgname like 'mei_pelle_catalog_search_sync_%'
    )
)
select
  exists(
    select 1
    from pg_catalog.pg_extension e
    where e.extname = 'pg_net'
  ) as "pgNetEnabled",
  exists(
    select 1
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'supabase_functions'
      and p.proname = 'http_request'
  ) as "httpRequestAvailable",
  (
    select coalesce(
      pg_catalog.json_agg(tt.table_name order by tt.table_name)
        filter (where c.oid is null),
      '[]'::pg_catalog.json
    )
    from target_tables tt
    left join pg_catalog.pg_namespace n on n.nspname = 'public'
    left join pg_catalog.pg_class c
      on c.relnamespace = n.oid
     and c.relname = tt.table_name
     and c.relkind in ('r', 'p')
  ) as "missingTables",
  (
    select coalesce(
      pg_catalog.json_agg(
        pg_catalog.json_build_object(
          'tableName', h.table_name,
          'triggerName', h.trigger_name,
          'enabled', h.enabled,
          'rowLevel', h.row_level,
          'after', h.after,
          'firesInsert', h.fires_insert,
          'firesUpdate', h.fires_update,
          'firesDelete', h.fires_delete,
          'firesTruncate', h.fires_truncate,
          'endpointMatches', h.args[1] = $1,
          'methodMatches', pg_catalog.upper(h.args[2]) = 'POST',
          'headersMatch',
            case
              when pg_catalog.pg_input_is_valid(
                h.args[3],
                'pg_catalog.jsonb'
              )
              then h.args[3]::pg_catalog.jsonb = $2::pg_catalog.jsonb
              else false
            end,
          'paramsMatch', h.args[4] = '{}',
          'timeoutMatches', h.args[5] = $3
        )
        order by h.table_name, h.trigger_name
      ),
      '[]'::pg_catalog.json
    )
    from hook_rows h
  ) as hooks
`;

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("[catalog-webhooks] Supabase Management API returned invalid data.");
  }
  return value as Record<string, unknown>;
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // Fall through to the safe generic error below.
    }
  }
  throw new Error("[catalog-webhooks] Supabase Management API returned invalid data.");
}

function readQueryRows(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const object = asObject(value);
  for (const key of ["data", "result"]) {
    if (Array.isArray(object[key])) return object[key] as unknown[];
  }
  throw new Error("[catalog-webhooks] Supabase Management API returned invalid data.");
}

export class SupabaseCatalogWebhookControlPlane
  implements CatalogWebhookControlPlane
{
  constructor(private readonly fetchImpl: Fetch = fetch) {}

  private async request(
    config: CatalogWebhookConfig,
    path: string,
    init: RequestInit,
  ): Promise<unknown> {
    let response: Response;
    try {
      response = await this.fetchImpl(`https://api.supabase.com${path}`, {
        ...init,
        headers: {
          authorization: `Bearer ${config.accessToken}`,
          "content-type": "application/json",
          ...init.headers,
        },
      });
    } catch {
      throw new Error("[catalog-webhooks] Supabase Management API is unavailable.");
    }
    if (!response.ok) {
      throw new Error(
        `[catalog-webhooks] Supabase Management API request failed (${response.status}).`,
      );
    }
    if (response.status === 204) return null;
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  async inspect(
    config: CatalogWebhookConfig,
  ): Promise<CatalogWebhookRemoteState> {
    const response = await this.request(
      config,
      `/v1/projects/${config.projectRef}/database/query/read-only`,
      {
        method: "POST",
        body: JSON.stringify({
          query: INSPECT_SQL,
          parameters: [
            config.endpoint,
            JSON.stringify({
              "Content-Type": "application/json",
              [CATALOG_WEBHOOK_HEADER]: config.secret,
            }),
            String(CATALOG_WEBHOOK_TIMEOUT_MS),
          ],
        }),
      },
    );
    const rows = readQueryRows(response);
    if (rows.length !== 1) {
      throw new Error(
        "[catalog-webhooks] Supabase Management API returned an unexpected inspection result.",
      );
    }
    const row = asObject(rows[0]);
    const hooks = asArray(row.hooks).map((value) => {
      const hook = asObject(value);
      return {
        tableName: String(hook.tableName),
        triggerName: String(hook.triggerName),
        enabled: hook.enabled === true,
        rowLevel: hook.rowLevel === true,
        after: hook.after === true,
        firesInsert: hook.firesInsert === true,
        firesUpdate: hook.firesUpdate === true,
        firesDelete: hook.firesDelete === true,
        firesTruncate: hook.firesTruncate === true,
        endpointMatches: hook.endpointMatches === true,
        methodMatches: hook.methodMatches === true,
        headersMatch: hook.headersMatch === true,
        paramsMatch: hook.paramsMatch === true,
        timeoutMatches: hook.timeoutMatches === true,
      };
    });

    return {
      pgNetEnabled: row.pgNetEnabled === true,
      httpRequestAvailable: row.httpRequestAvailable === true,
      missingTables: asArray(row.missingTables).map(String),
      hooks,
    };
  }

  async enableDatabaseWebhooks(config: CatalogWebhookConfig): Promise<void> {
    await this.request(
      config,
      `/v1/projects/${config.projectRef}/database/webhooks/enable`,
      { method: "POST" },
    );
  }

  async applyChanges(
    config: CatalogWebhookConfig,
    desired: DesiredCatalogWebhook[],
    actions: CatalogWebhookAction[],
  ): Promise<void> {
    const query = buildCatalogWebhookApplySql(desired, actions);
    if (!query) return;
    await this.request(
      config,
      `/v1/projects/${config.projectRef}/database/query`,
      {
        method: "POST",
        body: JSON.stringify({ query, read_only: false }),
      },
    );
  }
}

export async function runCatalogWebhookProvisioning(
  mode: CatalogWebhookMode,
  config: CatalogWebhookConfig,
  controlPlane: CatalogWebhookControlPlane,
): Promise<CatalogWebhookReport> {
  const initialState = await controlPlane.inspect(config);
  const initialReport = buildCatalogWebhookReport(mode, config, initialState);
  if (mode !== "apply" || !initialReport.ok) return initialReport;

  const desired = buildDesiredCatalogWebhooks(config.endpoint, config.secret);
  let currentState = initialState;
  let enabledDuringRun = false;

  if (initialReport.enableDatabaseWebhooks) {
    await controlPlane.enableDatabaseWebhooks(config);
    enabledDuringRun = true;
    try {
      currentState = await controlPlane.inspect(config);
    } catch {
      throw new Error(
        "[catalog-webhooks] Partial failure: Database Webhooks enablement completed, but its state could not be verified.",
      );
    }
    if (!currentState.pgNetEnabled || !currentState.httpRequestAvailable) {
      throw new Error(
        "[catalog-webhooks] Partial failure: Database Webhooks enablement was requested, " +
          "but the required database function is still unavailable.",
      );
    }
  }

  const currentReport = buildCatalogWebhookReport("plan", config, currentState);
  if (!currentReport.ok) {
    throw new Error(
      "[catalog-webhooks] Partial failure: remote state became unsafe after enablement; no trigger changes were applied.",
    );
  }

  try {
    await controlPlane.applyChanges(config, desired, currentReport.actions);
  } catch {
    throw new Error(
      `[catalog-webhooks] ${enabledDuringRun ? "Partial failure" : "Apply failed"}: ` +
        "the trigger transaction did not complete.",
    );
  }

  let finalState: CatalogWebhookRemoteState;
  try {
    finalState = await controlPlane.inspect(config);
  } catch {
    throw new Error(
      "[catalog-webhooks] Partial failure: the trigger transaction completed, but final state could not be verified.",
    );
  }
  const finalReport = buildCatalogWebhookReport("verify", config, finalState);
  if (!finalReport.ok) {
    throw new Error(
      "[catalog-webhooks] Partial failure: the trigger transaction completed, but final verification detected drift.",
    );
  }
  return {
    ...initialReport,
    ok: finalReport.ok,
    databaseWebhooksEnabled: finalReport.databaseWebhooksEnabled,
    enableDatabaseWebhooks: false,
    verified: finalReport.verified,
  };
}

type WebhookResponseBody = {
  ok?: boolean;
  error?: string;
  action?: string;
  table?: string;
  objectID?: string;
  reason?: string;
  cache?: {
    tags?: unknown;
    paths?: unknown;
  };
};

async function readWebhookBody(response: Response): Promise<WebhookResponseBody> {
  try {
    return asObject(await response.json()) as WebhookResponseBody;
  } catch {
    return {};
  }
}

function webhookFailureCategory(
  response: Response,
  body: WebhookResponseBody,
): string {
  if (response.status === 401) return "invalid signature";
  if (response.status === 400 && /unsupported table/i.test(body.error ?? "")) {
    return "unknown table";
  }
  if (
    response.status === 400 ||
    /without product_id|missing record\.id/i.test(body.reason ?? body.error ?? "")
  ) {
    return "missing product identity";
  }
  if (body.error === "sync failed") return "Algolia failure";
  if (body.error === "cache invalidation failed") {
    return "cache invalidation failure";
  }
  return "delivery failure";
}

async function postSyntheticChildEvent(
  config: CatalogWebhookSmokeConfig,
  fetchImpl: Fetch,
): Promise<{ response: Response; body: WebhookResponseBody }> {
  const row = {
    id: "00000000-0000-4000-8000-000000000001",
    product_id: config.productId,
    available: true,
  };
  const response = await fetchImpl(config.endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      [CATALOG_WEBHOOK_HEADER]: config.secret,
    },
    body: JSON.stringify({
      schema: "public",
      type: "UPDATE",
      table: "product_variants",
      record: row,
      old_record: row,
    }),
  });
  return { response, body: await readWebhookBody(response) };
}

export async function runCatalogWebhookSmoke(
  config: CatalogWebhookSmokeConfig,
  fetchImpl: Fetch = fetch,
) {
  const unauthorized = await fetchImpl(config.endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      [CATALOG_WEBHOOK_HEADER]: `${config.secret}.invalid`,
    },
    body: JSON.stringify({
      schema: "public",
      type: "UPDATE",
      table: "product_variants",
      record: { product_id: config.productId },
      old_record: { product_id: config.productId },
    }),
  });
  if (unauthorized.status !== 401) {
    throw new Error(
      "[catalog-webhook-smoke] Endpoint authentication check failed closed.",
    );
  }

  const first = await postSyntheticChildEvent(config, fetchImpl);
  if (!first.response.ok) {
    throw new Error(
      `[catalog-webhook-smoke] ${webhookFailureCategory(first.response, first.body)}.`,
    );
  }
  if (
    first.body.action !== "upsert" ||
    first.body.table !== "product_variants" ||
    first.body.objectID !== config.productId
  ) {
    throw new Error(
      "[catalog-webhook-smoke] Missing product identity: the child event did not resolve to the expected product.",
    );
  }
  if (
    !Array.isArray(first.body.cache?.tags) ||
    first.body.cache.tags.length === 0 ||
    !Array.isArray(first.body.cache?.paths) ||
    first.body.cache.paths.length === 0
  ) {
    throw new Error(
      "[catalog-webhook-smoke] Cache invalidation failure: no invalidation targets were reported.",
    );
  }

  const duplicate = await postSyntheticChildEvent(config, fetchImpl);
  if (!duplicate.response.ok) {
    throw new Error(
      "[catalog-webhook-smoke] Partial success: the first delivery succeeded but its duplicate failed.",
    );
  }
  if (
    duplicate.body.action !== first.body.action ||
    duplicate.body.objectID !== first.body.objectID
  ) {
    throw new Error(
      "[catalog-webhook-smoke] Duplicate delivery was not idempotent.",
    );
  }

  return {
    ok: true,
    projectRef: config.projectRef,
    targetEnvironment: config.targetEnvironment,
    endpoint: config.endpoint,
    authenticationVerified: true,
    childProductResolutionVerified: true,
    algoliaAttemptVerified: true,
    cacheInvalidationAttemptVerified: true,
    duplicateDeliveryVerified: true,
    productId: config.productId,
  };
}
