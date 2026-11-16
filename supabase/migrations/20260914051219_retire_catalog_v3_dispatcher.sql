-- Spec #358 / Ticket #367. Retire only the superseded V3 dispatcher.
-- Applied migrations and the individual historical revision decoders stay intact.
do $retire_catalog_v3_dispatcher$
declare
  v_candidate pg_catalog.pg_proc%rowtype;
  v_required_signature text;
begin
  select * into v_candidate
  from pg_catalog.pg_proc
  where oid = pg_catalog.to_regprocedure(
    'private.catalog_editor_upgrade_to_v3(jsonb)'
  );

  if not found then
    return;
  end if;

  if not v_candidate.prosecdef
     or v_candidate.proconfig is distinct from array['search_path=""']::text[]
     or pg_catalog.pg_get_userbyid(v_candidate.proowner) <> 'postgres'
     or v_candidate.proacl::text is distinct from '{postgres=X/postgres}'
  then
    raise exception 'Catalog V3 dispatcher security changed; review required';
  end if;

  -- Exact body verified on the approved project on 2026-09-14 and independently
  -- sourced from the applied V3 migration. Any later replacement needs review.
  if pg_catalog.md5(v_candidate.prosrc) <> '25dce3ac1d7751e620f8dd8ad4ee56a7'
     or pg_catalog.md5(pg_catalog.pg_get_functiondef(v_candidate.oid))
       <> '5d5c7b7875a91b4026f70887e78a5382'
  then
    raise exception 'Catalog V3 dispatcher definition changed; review required';
  end if;

  foreach v_required_signature in array array[
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
    if pg_catalog.to_regprocedure(v_required_signature) is null then
      raise exception 'Current Catalog functions missing; review required';
    end if;
  end loop;

  if exists (
    select 1 from pg_catalog.pg_depend
    where refclassid = 'pg_catalog.pg_proc'::regclass
      and refobjid = v_candidate.oid
  ) then
    raise exception 'Catalog V3 dispatcher has tracked dependents; review required';
  end if;

  -- PostgreSQL does not track calls inside string-defined routine bodies in
  -- pg_depend. Check those separately, including routines in other schemas.
  if exists (
    select 1 from pg_catalog.pg_proc
    where oid <> v_candidate.oid
      and prosrc ilike '%catalog_editor_upgrade_to_v3%'
  ) then
    raise exception 'Catalog V3 dispatcher has routine callers; review required';
  end if;

  drop function private.catalog_editor_upgrade_to_v3(jsonb) restrict;
end;
$retire_catalog_v3_dispatcher$;
