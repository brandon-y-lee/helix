/**
 * Read-only, redacted inventory for the separately approved Ticket #413 runbook.
 * Execute BASE first. Execute INSTALLED only when all three extensions and the
 * listed function prerequisites exist. Neither query calls a provider, queues
 * HTTP, creates a job, reads log contents, or returns secrets/function bodies.
 * These observations cannot verify the project/deployment/Operator manifest.
 */

export const PAYMENT_SCHEDULER_EXTENSION_NAMES = ["pg_net", "pg_cron", "supabase_vault"] as const;
// Explicit Supabase administration boundary; never infer trust from a prefix.
// Platform collaborators and replication/read-all roles can access secrets:
// https://supabase.com/docs/guides/platform/access-control
export const PAYMENT_SCHEDULER_PLATFORM_ROLES = [
  "postgres", "supabase_admin", "supabase_functions_admin", "dashboard_user",
  "supabase_auth_admin", "supabase_storage_admin", "supabase_replication_admin",
  "supabase_etl_admin", "supabase_read_only_user",
] as const;
export const PAYMENT_SCHEDULER_FUNCTION_SIGNATURES = [
  "net.http_post(text,jsonb,jsonb,jsonb,integer)",
  "supabase_functions.http_request()",
  "cron.schedule(text,text,text)",
  "cron.alter_job(bigint,text,text,text,text,boolean)",
  "private.wake_sandbox_payment_worker()",
] as const;

export type SchedulerExtensionInventory = {
  name: (typeof PAYMENT_SCHEDULER_EXTENSION_NAMES)[number];
  installedVersion: string | null;
  availableVersion: string | null;
};

export type SchedulerFunctionInventory = {
  signature: (typeof PAYMENT_SCHEDULER_FUNCTION_SIGNATURES)[number];
  exists: boolean;
  ownerTrusted: boolean;
  securityDefiner: boolean;
  searchPathSafe: boolean;
};

export type SchedulerBaseInventory = {
  databaseName: string;
  postgresSession: boolean;
  extensions: SchedulerExtensionInventory[];
  functions: SchedulerFunctionInventory[];
  installedRelationsPresent: boolean;
  wrapperContractMatches: boolean;
  unsafeTablePrivileges: number;
  unsafeColumnPrivileges: number;
  unsafeSequencePrivileges: number;
  unsafeFunctionPrivileges: number;
  unsafeSchemaCreatePrivileges: number;
  unsafeRoleMemberships: number;
  unsafeViews: number;
  unsafeDefinerWrappers: number;
  customDefinerSignatures: string[];
  catalogTriggerCount: number;
  catalogExecutionPreserved: boolean;
};

export type SchedulerInstalledInventory = {
  jobCount: number;
  matchingJobCount: number;
  activeJobCount: number;
  otherPaymentJobCount: number;
  secretCount: number;
  secretShapeValid: boolean;
};

// The only source hash is for the public, credential-free wrapper body in
// scheduler.sql. It detects drift; it is not a credential or authorization.
export const PAYMENT_SCHEDULER_WRAPPER_BODY_MD5 =
  "9d231c871ee02df6a1282b5ea4dff6f2";

export const PAYMENT_SCHEDULER_BASE_INVENTORY_SQL = `
with recursive
platform_roles(name) as (values ${PAYMENT_SCHEDULER_PLATFORM_ROLES.map((name) => `('${name}')`).join(",")}),
ordinary_roles as (
  select oid, rolname from pg_catalog.pg_roles
  where rolname !~ '^pg_'
    and rolname not in (select name from platform_roles)
),
reachable_roles(oid, rolname, rolsuper, rolcreaterole) as (
  select role.oid, role.rolname, role.rolsuper, role.rolcreaterole
  from ordinary_roles ordinary join pg_catalog.pg_roles role on role.oid = ordinary.oid
  union
  select target.oid, target.rolname, target.rolsuper, target.rolcreaterole
  from reachable_roles source cross join pg_catalog.pg_roles target
  where pg_catalog.pg_has_role(source.oid, target.oid, 'SET')
    or pg_catalog.pg_has_role(source.oid, target.oid, 'USAGE')
    or pg_catalog.pg_has_role(source.oid, target.oid, 'USAGE WITH ADMIN OPTION')
),
protected_relations as (
  select relation_oid from (values
    (pg_catalog.to_regclass('net.http_request_queue')),
    (pg_catalog.to_regclass('net._http_response')),
    (pg_catalog.to_regclass('vault.secrets')),
    (pg_catalog.to_regclass('vault.decrypted_secrets')),
    (pg_catalog.to_regclass('cron.job')),
    (pg_catalog.to_regclass('cron.job_run_details'))
  ) relations(relation_oid) where relation_oid is not null
),
dependent_views(oid) as (
  select relation_oid::oid from protected_relations
  union
  select rewrite.ev_class from dependent_views parent
  join pg_catalog.pg_depend dependency
    on dependency.refclassid = 'pg_catalog.pg_class'::regclass
    and dependency.refobjid = parent.oid
    and dependency.classid = 'pg_catalog.pg_rewrite'::regclass
  join pg_catalog.pg_rewrite rewrite on rewrite.oid = dependency.objid
),
sensitive_functions as (
  select p.oid from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('vault', 'cron')
    or (n.nspname = 'net' and p.proname in
      ('http_collect_response', '_http_collect_response', '_await_response'))
    or p.oid = pg_catalog.to_regprocedure('private.wake_sandbox_payment_worker()')
),
protected_owners as (
  select c.relowner as oid from protected_relations relation
    join pg_catalog.pg_class c on c.oid = relation.relation_oid
  union select relowner from pg_catalog.pg_class
    where oid = pg_catalog.to_regclass('net.http_request_queue_id_seq')
  union select nspowner from pg_catalog.pg_namespace
    where nspname in ('private', 'net', 'vault', 'cron', 'supabase_functions')
  union select proowner from pg_catalog.pg_proc
    where oid in (select oid from sensitive_functions)
      or oid in (pg_catalog.to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)'),
        pg_catalog.to_regprocedure('supabase_functions.http_request()'))
),
expected_functions(signature, argument_names, result_type, default_count) as (values
  ('net.http_post(text,jsonb,jsonb,jsonb,integer)',
    array['url','body','params','headers','timeout_milliseconds']::text[], 'bigint'::regtype, 4),
  ('supabase_functions.http_request()', null::text[], 'trigger'::regtype, 0),
  ('cron.schedule(text,text,text)', array['job_name','schedule','command']::text[], 'bigint'::regtype, 0),
  ('cron.alter_job(bigint,text,text,text,text,boolean)',
    array['job_id','schedule','command','database','username','active']::text[], 'void'::regtype, 5),
  ('private.wake_sandbox_payment_worker()', null::text[], 'bigint'::regtype, 0)
),
catalog_path as (
  select hook.proowner as hook_owner, hook.prosecdef as hook_definer,
    post.oid as post_oid, post.proowner as post_owner, post.prosecdef as post_definer
  from pg_catalog.pg_proc hook cross join pg_catalog.pg_proc post
  where hook.oid = pg_catalog.to_regprocedure('supabase_functions.http_request()')
    and post.oid = pg_catalog.to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)')
)
select pg_catalog.jsonb_build_object(
  'databaseName', pg_catalog.current_database(),
  'postgresSession', current_user = 'postgres',
  'extensions', (select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'name', desired.name, 'installedVersion', installed.extversion,
    'availableVersion', available.default_version) order by desired.name)
    from (values ('pg_net'), ('pg_cron'), ('supabase_vault')) desired(name)
    left join pg_catalog.pg_extension installed on installed.extname = desired.name
    left join pg_catalog.pg_available_extensions available on available.name = desired.name),
  'functions', (select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'signature', expected.signature, 'exists', coalesce(p.oid is not null
      and p.proargnames is not distinct from expected.argument_names
      and p.prorettype = expected.result_type and p.pronargdefaults = expected.default_count
      and p.prokind = 'f' and not p.proretset and p.provariadic = 0 and p.proargmodes is null, false),
    'ownerTrusted', coalesce(owner.rolname in ('postgres', 'supabase_admin', 'supabase_functions_admin'), false),
    'securityDefiner', coalesce(p.prosecdef, false),
    'searchPathSafe', coalesce(
      (p.proconfig = array['search_path=pg_catalog']::text[])
      or (p.proconfig = array['search_path=net']::text[])
      or (p.proconfig = array['search_path=supabase_functions']::text[])
      or (language.lanname = 'c'), false)) order by expected.signature)
    from expected_functions expected
    left join pg_catalog.pg_proc p on p.oid = pg_catalog.to_regprocedure(expected.signature)
    left join pg_catalog.pg_roles owner on owner.oid = p.proowner
    left join pg_catalog.pg_language language on language.oid = p.prolang),
  'installedRelationsPresent', (select count(*) = 6 from protected_relations)
    and pg_catalog.to_regclass('net.http_request_queue_id_seq') is not null,
  'wrapperContractMatches', exists (
    select 1 from pg_catalog.pg_proc p
    join pg_catalog.pg_roles owner on owner.oid = p.proowner
    join pg_catalog.pg_language language on language.oid = p.prolang
    where p.oid = pg_catalog.to_regprocedure('private.wake_sandbox_payment_worker()')
      and owner.rolname = 'postgres' and not p.prosecdef and language.lanname = 'plpgsql'
      and p.prorettype = 'bigint'::regtype
      and p.proconfig = array['search_path=pg_catalog']::text[]
      and pg_catalog.md5(p.prosrc) = '${PAYMENT_SCHEDULER_WRAPPER_BODY_MD5}'
      and not exists (
        select 1 from pg_catalog.aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) acl
        where acl.grantee <> p.proowner)),
  'unsafeTablePrivileges', (select count(*) from reachable_roles role cross join protected_relations relation
    where pg_catalog.has_table_privilege(role.oid, relation.relation_oid,
      'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')),
  'unsafeColumnPrivileges', (select count(*) from reachable_roles role cross join protected_relations relation
    where pg_catalog.has_any_column_privilege(role.oid, relation.relation_oid,
      'SELECT,INSERT,UPDATE,REFERENCES')),
  'unsafeSequencePrivileges', (select count(*) from reachable_roles role
    where pg_catalog.has_sequence_privilege(role.oid,
      pg_catalog.to_regclass('net.http_request_queue_id_seq'), 'USAGE,SELECT,UPDATE')),
  'unsafeFunctionPrivileges', (select count(*) from reachable_roles role cross join sensitive_functions fn
    where pg_catalog.has_function_privilege(role.oid, fn.oid, 'EXECUTE')),
  'unsafeSchemaCreatePrivileges', (select count(*) from reachable_roles role
    cross join pg_catalog.pg_namespace schema
    where schema.nspname in ('private', 'net', 'vault', 'cron', 'supabase_functions')
      and pg_catalog.has_schema_privilege(role.oid, schema.oid, 'CREATE')),
  'unsafeRoleMemberships', (select count(*) from reachable_roles role
    where role.rolsuper or role.rolcreaterole or role.rolname in (select name from platform_roles)
      or role.rolname in ('postgres', 'supabase_admin', 'supabase_functions_admin',
        'pg_read_all_data', 'pg_write_all_data', 'pg_read_server_files',
        'pg_write_server_files', 'pg_execute_server_program')
      or role.oid in (select oid from protected_owners)),
  'unsafeViews', (select count(*) from reachable_roles role cross join dependent_views dependency
    join pg_catalog.pg_class relation on relation.oid = dependency.oid
    where relation.relkind in ('v', 'm')
      and (pg_catalog.has_table_privilege(role.oid, relation.oid, 'SELECT,INSERT,UPDATE,DELETE')
        or pg_catalog.has_any_column_privilege(role.oid, relation.oid, 'SELECT,INSERT,UPDATE'))),
  'unsafeDefinerWrappers', (select count(distinct p.oid) from reachable_roles role
    cross join pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where p.prosecdef and pg_catalog.has_function_privilege(role.oid, p.oid, 'EXECUTE')
      and p.prosrc ~* 'vault|http_request_queue|_http_response|http_collect_response|wake_sandbox_payment_worker'
      and p.oid is distinct from pg_catalog.to_regprocedure('net.http_get(text,jsonb,jsonb,integer)')
      and p.oid is distinct from pg_catalog.to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)')
      and p.oid is distinct from pg_catalog.to_regprocedure('net.http_delete(text,jsonb,jsonb,integer,jsonb)')),
  'customDefinerSignatures', (select coalesce(pg_catalog.jsonb_agg(signature order by signature), '[]'::jsonb)
    from (select distinct pg_catalog.format('%I.%I(%s)', n.nspname, p.proname,
        pg_catalog.oidvectortypes(p.proargtypes)) as signature
      from reachable_roles role cross join pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where p.prosecdef and n.nspname not in ('pg_catalog', 'information_schema')
        and pg_catalog.has_function_privilege(role.oid, p.oid, 'EXECUTE')
        and not exists (select 1 from pg_catalog.pg_depend dependency
          where dependency.classid = 'pg_catalog.pg_proc'::regclass
            and dependency.objid = p.oid and dependency.deptype = 'e')) reviewed),
  'catalogTriggerCount', (select count(*) from pg_catalog.pg_trigger trigger
    where not trigger.tgisinternal
      and trigger.tgfoid = pg_catalog.to_regprocedure('supabase_functions.http_request()')
      and trigger.tgname like 'helix_catalog_search_sync_%'),
  'catalogExecutionPreserved', coalesce((select path.hook_definer and path.post_definer
    and pg_catalog.has_schema_privilege(path.hook_owner, pg_catalog.to_regnamespace('net'), 'USAGE')
    and pg_catalog.has_function_privilege(path.hook_owner, path.post_oid, 'EXECUTE')
    and pg_catalog.has_table_privilege(path.post_owner, pg_catalog.to_regclass('net.http_request_queue'), 'INSERT')
    and pg_catalog.has_column_privilege(path.post_owner, pg_catalog.to_regclass('net.http_request_queue'), 'id', 'SELECT')
    and pg_catalog.has_sequence_privilege(path.post_owner, pg_catalog.to_regclass('net.http_request_queue_id_seq'), 'USAGE')
    and pg_catalog.has_function_privilege('postgres', path.post_oid, 'EXECUTE')
    and pg_catalog.has_table_privilege('postgres', pg_catalog.to_regclass('vault.decrypted_secrets'), 'SELECT')
    from catalog_path path), false)
) as inventory;
`;

/** Requires installedRelationsPresent=true and all extension versions non-null. */
export const PAYMENT_SCHEDULER_INSTALLED_INVENTORY_SQL = `
select pg_catalog.jsonb_build_object(
  'jobCount', (select count(*) from cron.job
    where jobname = 'helix-sandbox-payment-reconciliation'),
  'matchingJobCount', (select count(*) from cron.job
    where jobname = 'helix-sandbox-payment-reconciliation'
      and username = 'postgres' and database = 'postgres'
      and schedule = '* * * * *'
      and command = 'select private.wake_sandbox_payment_worker();'
      and nodename = 'localhost' and nodeport = pg_catalog.inet_server_port()),
  'activeJobCount', (select count(*) from cron.job
    where jobname = 'helix-sandbox-payment-reconciliation' and active),
  'otherPaymentJobCount', (select count(*) from cron.job
    where (command ~* 'wake_sandbox_payment_worker|/api/internal/payments/reconcile'
      or jobname = 'helix-sandbox-payment-reconciliation')
      and (jobname = 'helix-sandbox-payment-reconciliation'
        and username = 'postgres' and database = 'postgres'
        and schedule = '* * * * *'
        and command = 'select private.wake_sandbox_payment_worker();'
        and nodename = 'localhost' and nodeport = pg_catalog.inet_server_port()) is not true),
  'secretCount', (select count(*) from vault.decrypted_secrets
    where name = 'helix_sandbox_payment_worker_secret'),
  'secretShapeValid', (select count(*) = 1 and coalesce(bool_and(
      decrypted_secret ~ '^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$'), false)
    from vault.decrypted_secrets where name = 'helix_sandbox_payment_worker_secret')
) as inventory;
`;

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid scheduler inventory response.");
  }
  return value as Record<string, unknown>;
}

function singleInventory(rows: unknown): Record<string, unknown> {
  if (!Array.isArray(rows) || rows.length !== 1) {
    throw new Error("Invalid scheduler inventory row count.");
  }
  return record(record(rows[0]).inventory);
}

function text(value: unknown): string {
  if (typeof value !== "string" || value.length > 2_000) {
    throw new Error("Invalid scheduler inventory text.");
  }
  return value;
}

function version(value: unknown): string | null {
  if (value === null) return null;
  const result = text(value);
  if (!/^\d{1,4}(?:\.\d{1,4}){1,3}$/.test(result)) {
    throw new Error("Invalid scheduler extension version.");
  }
  return result;
}

function known<const T extends readonly string[]>(value: unknown, expected: T): T[number] {
  if (typeof value !== "string" || !expected.includes(value)) {
    throw new Error("Invalid scheduler inventory identifier.");
  }
  return value as T[number];
}

function customDefinerSignatures(value: unknown): string[] {
  const signatures = list(value).map(text);
  const identifier = "[a-z_][a-z0-9_]{0,62}";
  const argument = `(?:(?:${identifier}\\.)?${identifier}|timestamp (?:with|without) time zone|time (?:with|without) time zone|double precision|character varying)(?:\\[\\]){0,2}`;
  const signature = new RegExp(`^${identifier}\\.${identifier}\\((?:${argument}(?:, ?${argument}){0,31})?\\)$`);
  if (signatures.length > 256 || new Set(signatures).size !== signatures.length ||
    signatures.some((item) => item.length > 1024 || !signature.test(item))) {
    throw new Error("Invalid scheduler custom function identifiers.");
  }
  return signatures;
}

function flag(value: unknown): boolean {
  if (typeof value !== "boolean") throw new Error("Invalid scheduler inventory flag.");
  return value;
}

function count(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error("Invalid scheduler inventory count.");
  }
  return value;
}

function list(value: unknown): unknown[] {
  if (!Array.isArray(value) || value.length > 10_000) {
    throw new Error("Invalid scheduler inventory list.");
  }
  return value;
}

/** Accepts the Management query endpoint's row array; returns only known fields. */
export function parseSchedulerBaseInventory(rows: unknown): SchedulerBaseInventory {
  const item = singleInventory(rows);
  const extensions = list(item.extensions).map((value) => {
    const extension = record(value);
    return {
      name: known(extension.name, PAYMENT_SCHEDULER_EXTENSION_NAMES),
      installedVersion: version(extension.installedVersion),
      availableVersion: version(extension.availableVersion),
    };
  });
  if (extensions.length !== 3 ||
    new Set(extensions.map((extension) => extension.name)).size !== 3) {
    throw new Error("Invalid scheduler extension inventory.");
  }
  const functions = list(item.functions).map((value) => {
    const fn = record(value);
    return {
      signature: known(fn.signature, PAYMENT_SCHEDULER_FUNCTION_SIGNATURES), exists: flag(fn.exists),
      ownerTrusted: flag(fn.ownerTrusted), securityDefiner: flag(fn.securityDefiner),
      searchPathSafe: flag(fn.searchPathSafe),
    };
  });
  if (functions.length !== PAYMENT_SCHEDULER_FUNCTION_SIGNATURES.length ||
    new Set(functions.map((fn) => fn.signature)).size !== functions.length) {
    throw new Error("Invalid scheduler function inventory.");
  }
  return {
    databaseName: known(item.databaseName, ["postgres"] as const), postgresSession: flag(item.postgresSession),
    extensions, functions,
    installedRelationsPresent: flag(item.installedRelationsPresent),
    wrapperContractMatches: flag(item.wrapperContractMatches),
    unsafeTablePrivileges: count(item.unsafeTablePrivileges),
    unsafeColumnPrivileges: count(item.unsafeColumnPrivileges),
    unsafeSequencePrivileges: count(item.unsafeSequencePrivileges),
    unsafeFunctionPrivileges: count(item.unsafeFunctionPrivileges),
    unsafeSchemaCreatePrivileges: count(item.unsafeSchemaCreatePrivileges),
    unsafeRoleMemberships: count(item.unsafeRoleMemberships),
    unsafeViews: count(item.unsafeViews),
    unsafeDefinerWrappers: count(item.unsafeDefinerWrappers),
    customDefinerSignatures: customDefinerSignatures(item.customDefinerSignatures),
    catalogTriggerCount: count(item.catalogTriggerCount),
    catalogExecutionPreserved: flag(item.catalogExecutionPreserved),
  };
}

export function parseSchedulerInstalledInventory(rows: unknown): SchedulerInstalledInventory {
  const item = singleInventory(rows);
  return {
    jobCount: count(item.jobCount), matchingJobCount: count(item.matchingJobCount),
    activeJobCount: count(item.activeJobCount), otherPaymentJobCount: count(item.otherPaymentJobCount),
    secretCount: count(item.secretCount), secretShapeValid: flag(item.secretShapeValid),
  };
}
