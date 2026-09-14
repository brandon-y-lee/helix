-- Narrow synthetic signature fixture, not a Catalog schema checkpoint or provisioner.
-- The runner installs the exact V3 dispatcher from its applied migration afterward.
-- These preserved functions intentionally do not implement Restore or Publish.
do $fixture_guard$
begin
  if current_database() <> 'catalog_t8'
     or current_setting('server_version_num')::integer not between 170000 and 179999
  then
    raise exception 'dispatcher fixture requires the isolated catalog_t8 PostgreSQL 17 database';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role;
  end if;
end;
$fixture_guard$;

create schema private;

do $synthetic_signatures$
declare
  v_signature text;
begin
  foreach v_signature in array array[
    'private.catalog_editor_upgrade_v1_to_v2(jsonb)',
    'private.catalog_editor_upgrade_v2_to_v3(jsonb)',
    'private.catalog_editor_upgrade_v3_to_v4(jsonb)',
    'private.catalog_editor_upgrade_to_v4_without_family(jsonb)',
    'private.catalog_editor_upgrade_to_v4(jsonb)',
    'public.restore_catalog_product_revision(uuid, uuid)',
    'public.publish_catalog_product_draft_v4_without_family(uuid, bigint, uuid, text, jsonb)',
    'public.publish_catalog_product_draft_v4_without_family_concurrency(uuid, bigint, uuid, text, jsonb)',
    'public.publish_catalog_product_draft_v4(uuid, bigint, uuid, text, jsonb)',
    'public.publish_catalog_product_draft_without_family_lock_order(uuid, bigint, uuid, text, jsonb)',
    'public.publish_catalog_product_draft(uuid, bigint, uuid, text, jsonb)'
  ] loop
    execute format(
      'create function %s returns jsonb language sql security definer set search_path = %L as %L',
      v_signature, '', 'select ''{"synthetic_signature_only": true}''::jsonb'
    );
    execute format('revoke all on function %s from public', v_signature);
  end loop;
end;
$synthetic_signatures$;

grant execute on function public.restore_catalog_product_revision(uuid, uuid)
  to service_role;
grant execute on function public.publish_catalog_product_draft(uuid, bigint, uuid, text, jsonb)
  to service_role;

create temporary table preserved_dispatcher_fixture_functions as
select p.oid::regprocedure::text as signature,
       pg_get_functiondef(p.oid) as definition,
       p.proacl::text as privileges
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('private', 'public');
