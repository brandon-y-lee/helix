import { APPROVED_SUPABASE_PROJECT_REF } from "../../lib/supabase/project-safety";

export { APPROVED_SUPABASE_PROJECT_REF };

export const HELIX_DATABASE_AUDIT_SQL = `
with object_findings as (
  select
    'schema-name'::text as surface,
    pg_catalog.quote_ident(namespace.nspname) as identifier,
    1::bigint as matches
  from pg_catalog.pg_namespace as namespace
  where namespace.nspname ~* ('(' || $1 || ')|(' || $2 || ')')

  union

  select
    'schema-object-name'::text as surface,
    pg_catalog.format('%I.%I', namespace.nspname, relation.relname) as identifier,
    1::bigint as matches
  from pg_catalog.pg_class as relation
  join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
  where namespace.nspname in ('public', 'auth', 'storage')
    and relation.relkind in ('r', 'p', 'v', 'm', 'S', 'i')
    and relation.relname ~* ('(' || $1 || ')|(' || $2 || ')')

  union

  select
    'view-definition',
    pg_catalog.format('%I.%I', namespace.nspname, relation.relname),
    1::bigint
  from pg_catalog.pg_class as relation
  join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
  where namespace.nspname in ('public', 'auth', 'storage')
    and relation.relkind in ('v', 'm')
    and pg_catalog.pg_get_viewdef(relation.oid, true)
      ~* ('(' || $1 || ')|(' || $2 || ')')

  union

  select
    'column-name',
    pg_catalog.format('%I.%I.%I', namespace.nspname, relation.relname, attribute.attname),
    1::bigint
  from pg_catalog.pg_attribute as attribute
  join pg_catalog.pg_class as relation on relation.oid = attribute.attrelid
  join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
  where namespace.nspname in ('public', 'auth', 'storage')
    and attribute.attnum > 0
    and not attribute.attisdropped
    and attribute.attname ~* ('(' || $1 || ')|(' || $2 || ')')

  union

  select
    'constraint-name',
    pg_catalog.format('%I.%I', namespace.nspname, constraint_record.conname),
    1::bigint
  from pg_catalog.pg_constraint as constraint_record
  join pg_catalog.pg_namespace as namespace on namespace.oid = constraint_record.connamespace
  where namespace.nspname in ('public', 'auth', 'storage')
    and (
      constraint_record.conname ~* ('(' || $1 || ')|(' || $2 || ')')
      or pg_catalog.pg_get_constraintdef(constraint_record.oid, true)
        ~* ('(' || $1 || ')|(' || $2 || ')')
    )

  union

  select
    'index-definition',
    pg_catalog.format('%I.%I', namespace.nspname, relation.relname),
    1::bigint
  from pg_catalog.pg_class as relation
  join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
  where namespace.nspname in ('public', 'auth', 'storage')
    and relation.relkind = 'i'
    and pg_catalog.pg_get_indexdef(relation.oid)
      ~* ('(' || $1 || ')|(' || $2 || ')')

  union

  select
    'column-default',
    pg_catalog.format('%I.%I.%I', namespace.nspname, relation.relname, attribute.attname),
    1::bigint
  from pg_catalog.pg_attrdef as default_record
  join pg_catalog.pg_attribute as attribute
    on attribute.attrelid = default_record.adrelid
   and attribute.attnum = default_record.adnum
  join pg_catalog.pg_class as relation on relation.oid = default_record.adrelid
  join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
  where namespace.nspname in ('public', 'auth', 'storage')
    and pg_catalog.pg_get_expr(default_record.adbin, default_record.adrelid)
      ~* ('(' || $1 || ')|(' || $2 || ')')

  union

  select
    'type-name',
    pg_catalog.format('%I.%I', namespace.nspname, type_record.typname),
    1::bigint
  from pg_catalog.pg_type as type_record
  join pg_catalog.pg_namespace as namespace on namespace.oid = type_record.typnamespace
  where namespace.nspname in ('public', 'auth', 'storage')
    and type_record.typname ~* ('(' || $1 || ')|(' || $2 || ')')

  union

  select
    'enum-label',
    pg_catalog.format('%I.%I.%s', namespace.nspname, type_record.typname, enum_record.enumlabel),
    1::bigint
  from pg_catalog.pg_enum as enum_record
  join pg_catalog.pg_type as type_record on type_record.oid = enum_record.enumtypid
  join pg_catalog.pg_namespace as namespace on namespace.oid = type_record.typnamespace
  where namespace.nspname in ('public', 'auth', 'storage')
    and enum_record.enumlabel ~* ('(' || $1 || ')|(' || $2 || ')')

  union

  select
    'function-definition',
    pg_catalog.format(
      '%I.%I(%s)',
      namespace.nspname,
      procedure.proname,
      pg_catalog.pg_get_function_identity_arguments(procedure.oid)
    ),
    1::bigint
  from pg_catalog.pg_proc as procedure
  join pg_catalog.pg_namespace as namespace on namespace.oid = procedure.pronamespace
  where namespace.nspname in ('public', 'auth', 'storage')
    and procedure.prokind in ('f', 'p')
    and (
      procedure.proname ~* ('(' || $1 || ')|(' || $2 || ')')
      or pg_catalog.pg_get_functiondef(procedure.oid) ~* ('(' || $1 || ')|(' || $2 || ')')
      or coalesce(pg_catalog.obj_description(procedure.oid, 'pg_proc'), '')
        ~* ('(' || $1 || ')|(' || $2 || ')')
    )

  union

  select
    'trigger-definition',
    pg_catalog.format('%I.%I.%I', namespace.nspname, relation.relname, trigger_record.tgname),
    1::bigint
  from pg_catalog.pg_trigger as trigger_record
  join pg_catalog.pg_class as relation on relation.oid = trigger_record.tgrelid
  join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
  where namespace.nspname in ('public', 'auth', 'storage')
    and not trigger_record.tgisinternal
    and (
      trigger_record.tgname ~* ('(' || $1 || ')|(' || $2 || ')')
      or pg_catalog.pg_get_triggerdef(trigger_record.oid, true)
        ~* ('(' || $1 || ')|(' || $2 || ')')
    )

  union

  select
    'policy-definition',
    pg_catalog.format('%I.%I.%I', namespace.nspname, relation.relname, policy.polname),
    1::bigint
  from pg_catalog.pg_policy as policy
  join pg_catalog.pg_class as relation on relation.oid = policy.polrelid
  join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
  where namespace.nspname in ('public', 'auth', 'storage')
    and pg_catalog.concat_ws(
      ' ',
      policy.polname,
      pg_catalog.pg_get_expr(policy.polqual, policy.polrelid),
      pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid)
    ) ~* ('(' || $1 || ')|(' || $2 || ')')

  union

  select
    'relation-description',
    pg_catalog.format('%I.%I', namespace.nspname, relation.relname),
    1::bigint
  from pg_catalog.pg_class as relation
  join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
  where namespace.nspname in ('public', 'auth', 'storage')
    and coalesce(pg_catalog.obj_description(relation.oid, 'pg_class'), '')
      ~* ('(' || $1 || ')|(' || $2 || ')')

  union

  select
    'column-description',
    pg_catalog.format('%I.%I.%I', namespace.nspname, relation.relname, attribute.attname),
    1::bigint
  from pg_catalog.pg_attribute as attribute
  join pg_catalog.pg_class as relation on relation.oid = attribute.attrelid
  join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
  where namespace.nspname in ('public', 'auth', 'storage')
    and attribute.attnum > 0
    and not attribute.attisdropped
    and coalesce(
      pg_catalog.col_description(attribute.attrelid, attribute.attnum),
      ''
    ) ~* ('(' || $1 || ')|(' || $2 || ')')

  union

  select
    'role-name',
    pg_catalog.quote_ident(role_record.rolname),
    1::bigint
  from pg_catalog.pg_roles as role_record
  where role_record.rolname ~* ('(' || $1 || ')|(' || $2 || ')')
),
audited_tables as (
  select namespace.nspname as schema_name, relation.relname as table_name
  from pg_catalog.pg_class as relation
  join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
  where namespace.nspname in ('public', 'storage', 'auth')
    and relation.relkind in ('r', 'p')
    and not (namespace.nspname = 'storage' and relation.relname <> 'buckets')
    and not (namespace.nspname = 'auth' and relation.relname <> 'users')
),
current_data_counts as (
  select
    tables.schema_name,
    tables.table_name,
    (
      (
        pg_catalog.xpath(
          '/table/row/matches/text()',
          pg_catalog.query_to_xml(
            pg_catalog.format(
              'select count(1)::bigint as matches from %I.%I as audited_row where %s ~* %L',
              tables.schema_name,
              tables.table_name,
              case
                when tables.schema_name = 'auth' and tables.table_name = 'users' then
                  -- Customer-controlled contact details are private identities, not
                  -- application-managed brand compatibility. Audit the remaining
                  -- Auth row, including active provider and app metadata.
                  '(to_jsonb(audited_row) - array[''email'', ''email_change'', ''phone'', ''phone_change'', ''encrypted_password'', ''confirmation_token'', ''recovery_token'', ''email_change_token_new'', ''email_change_token_current'', ''phone_change_token'', ''reauthentication_token''])::text'
                else 'to_jsonb(audited_row)::text'
              end,
              '(' || $1 || ')|(' || $2 || ')'
            ),
            false,
            true,
            ''
          )
        )
      )[1]::text
    )::bigint as matches
  from audited_tables as tables
)
select surface, identifier, matches
from object_findings

union all

select
  'current-data' as surface,
  pg_catalog.format('%I.%I', schema_name, table_name) as identifier,
  matches
from current_data_counts
where matches > 0

order by surface, identifier
`;

export type HelixDatabaseAuditFinding = Readonly<{
  identifier: string;
  surface: string;
  matches: number;
}>;

export type HelixDatabaseAuditInput = Readonly<{
  project: Readonly<{
    id: string;
    name: string;
  }>;
  rows: readonly HelixDatabaseAuditFinding[];
}>;

export type HelixDatabaseAuditReport = Readonly<{
  ok: boolean;
  project: Readonly<{
    id: string;
    name: string;
    verified: boolean;
  }>;
  findings: readonly HelixDatabaseAuditFinding[];
}>;

type Fetch = typeof fetch;

const FORMER_BRAND_DATABASE_PATTERN = ["mei", "pelle"].join("[ _-]*");
const LEGACY_REWARDS_DATABASE_PATTERN = ["loyal", "ty"].join("");

function requiredEnv(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`[helix-database-audit] Missing ${name}.`);
  return value;
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("[helix-database-audit] Provider returned invalid data.");
  }
  return value as Record<string, unknown>;
}

function rows(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const candidate = object(value);
  for (const key of ["data", "result"]) {
    if (Array.isArray(candidate[key])) return candidate[key] as unknown[];
  }
  throw new Error("[helix-database-audit] Database inventory was invalid.");
}

async function requestJson(
  fetchImpl: Fetch,
  accessToken: string,
  path: string,
  init?: RequestInit,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchImpl(`https://api.supabase.com${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
        ...init?.headers,
      },
    });
  } catch {
    throw new Error("[helix-database-audit] Supabase Management API is unavailable.");
  }
  if (!response.ok) {
    const failure = await response.json().catch(() => null);
    const detail =
      failure && typeof failure === "object" && !Array.isArray(failure)
        ? (failure as Record<string, unknown>).message
        : null;
    throw new Error(
      `[helix-database-audit] Supabase Management API failed (${response.status})${typeof detail === "string" ? `: ${detail.slice(0, 400)}` : "."}`,
    );
  }
  return response.json();
}

export function buildHelixDatabaseAuditReport(
  input: HelixDatabaseAuditInput,
): HelixDatabaseAuditReport {
  const projectVerified =
    input.project.id === APPROVED_SUPABASE_PROJECT_REF &&
    input.project.name === "helix";
  const findings = [...input.rows];

  return {
    ok: projectVerified && findings.length === 0,
    project: {
      ...input.project,
      verified: projectVerified,
    },
    findings,
  };
}

export async function runHelixDatabaseAudit(
  env: NodeJS.ProcessEnv,
  fetchImpl: Fetch = fetch,
): Promise<HelixDatabaseAuditReport> {
  const projectRef = requiredEnv(env, "SUPABASE_PROJECT_REF");
  if (projectRef !== APPROVED_SUPABASE_PROJECT_REF) {
    throw new Error(
      `[helix-database-audit] Refusing project ${projectRef}; expected ${APPROVED_SUPABASE_PROJECT_REF}.`,
    );
  }
  const accessToken = requiredEnv(env, "SUPABASE_ACCESS_TOKEN");
  const [projectValue, queryValue] = await Promise.all([
    requestJson(fetchImpl, accessToken, `/v1/projects/${projectRef}`),
    requestJson(
      fetchImpl,
      accessToken,
      `/v1/projects/${projectRef}/database/query/read-only`,
      {
        method: "POST",
        body: JSON.stringify({
          query: HELIX_DATABASE_AUDIT_SQL,
          parameters: [
            FORMER_BRAND_DATABASE_PATTERN,
            LEGACY_REWARDS_DATABASE_PATTERN,
          ],
        }),
      },
    ),
  ]);
  const project = object(projectValue);
  const findings = rows(queryValue).map((value) => {
    const finding = object(value);
    const matches = Number(finding.matches);
    if (
      typeof finding.identifier !== "string" ||
      typeof finding.surface !== "string" ||
      !Number.isSafeInteger(matches) ||
      matches < 1
    ) {
      throw new Error("[helix-database-audit] Database finding was invalid.");
    }
    return {
      identifier: finding.identifier,
      surface: finding.surface,
      matches,
    };
  });

  const report = buildHelixDatabaseAuditReport({
    project: {
      id: String(project.id ?? ""),
      name: String(project.name ?? ""),
    },
    rows: findings,
  });
  if (!report.project.verified) {
    throw new Error("[helix-database-audit] Approved project identity did not match helix.");
  }
  return report;
}
