-- One-time owner operation after qualifying a clean development bootstrap and
-- its marker. Supabase CLI 2.117.0 creates this schema only when applying a
-- migration. The restricted release login needs an existing empty history.
\set ON_ERROR_STOP on
begin;
set local search_path = pg_catalog, pg_temp;
set local lock_timeout = '4s';
select set_config('helix.history_environment', :'expected_environment', true),
       set_config('helix.history_project_ref', :'expected_project_ref', true);

do $clean$
begin
  if session_user <> 'postgres' or current_user <> session_user
    or current_setting('helix.history_environment') <> 'development'
    or current_setting('helix.history_project_ref') <> 'zyfkunnpnlmgvrojmrbg'
    or (select count(*) from pg_class where oid in
          ('public.products'::regclass, 'private.helix_environment'::regclass)
        and relkind = 'r' and relpersistence = 'p' and relowner = current_user::regrole) <> 2
    or (select count(*) from private.helix_environment) <> 1
    or not exists (select from private.helix_environment where singleton
         and environment = current_setting('helix.history_environment')
         and project_ref = current_setting('helix.history_project_ref')) then
    raise exception 'Expected the authenticated development owner and independently verified child marker';
  end if;
  if to_regnamespace('helix_development_prefix') is not null then
    raise exception 'A recovered development prefix requires its genuine migration history';
  end if;
  if to_regnamespace('supabase_migrations') is not null then
    raise exception 'Migration namespace already exists; inspect its history before enrollment';
  end if;
end;
$clean$;

-- Same column types, order and key as the pinned provider's
-- legacy-migration-history.ts. No version has run at this point.
create schema supabase_migrations;
create table supabase_migrations.schema_migrations (
  version text not null primary key,
  statements text[],
  name text
);

do $acl$
begin
  if exists (
    select from pg_namespace n cross join lateral
      aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) g
    where n.oid = 'supabase_migrations'::regnamespace and g.grantee <> n.nspowner
  ) or exists (
    select from pg_class c cross join lateral
      aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) g
    where c.oid = 'supabase_migrations.schema_migrations'::regclass and g.grantee <> c.relowner
  ) or exists (select from supabase_migrations.schema_migrations) then
    raise exception 'Expected an owner-only empty migration ledger';
  end if;
end;
$acl$;
commit;
