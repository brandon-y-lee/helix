-- Disposable local current-schema checkpoint only. Never run against linked data.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
do $boundary$
declare role_name text;
begin
  if current_database() not like 'helix_product_url_%' then
    raise exception 'Product URL tests require a disposable synthetic database';
  end if;
  if to_regprocedure('public.resolve_product_slug(text)') is not null then
    raise exception 'Public Product slug resolver still exists';
  end if;
  foreach role_name in array array['anon','authenticated'] loop
    if has_table_privilege(role_name,'public.product_slug_routes','SELECT')
       or has_any_column_privilege(role_name,'public.product_slug_routes','SELECT') then
      raise exception 'Public slug history remains readable by %', role_name;
    end if;
    execute format('set local role %I', role_name);
    begin
      perform source_slug from public.product_slug_routes;
      raise exception 'Public role read private history';
    exception when insufficient_privilege then null;
    end;
    begin
      perform * from public.resolve_product_slug('super-serum');
      raise exception 'Public role called retired resolver';
    exception when undefined_function then null;
    end;
    reset role;
  end loop;
  set local role service_role;
  if (select count(*) from public.product_slug_routes) <> 2 then
    raise exception 'Service role lost private reservation reads';
  end if;
  reset role;
  if not (select relrowsecurity from pg_class where oid='public.product_slug_routes'::regclass)
     or has_table_privilege('service_role','public.product_slug_routes','INSERT,UPDATE,DELETE,TRUNCATE')
     or has_function_privilege('anon','public.replace_catalog_product_slug(uuid,uuid,uuid)','EXECUTE')
     or not has_function_privilege('service_role','public.replace_catalog_product_slug(uuid,uuid,uuid)','EXECUTE') then
    raise exception 'Private ledger permissions changed';
  end if;
  raise notice 'PASS public table/RPC denial and service-only ledger read';
end $boundary$;

do $publication$
#variable_conflict use_variable
declare
  source_id constant uuid := '10000000-0000-4000-8000-000000000101';
  target_id constant uuid := '10000000-0000-4000-8000-000000000102';
  actor_id constant uuid := '10000000-0000-4000-8000-000000000901';
  draft_id uuid;
  result jsonb;
  document jsonb;
  state_before jsonb;
  historical_revision jsonb;
begin
  select to_jsonb(r) into historical_revision from public.catalog_product_revisions r
    where product_id=source_id and revision_number=1;
  result := public.create_catalog_product_draft(source_id, actor_id);
  draft_id := (result #>> '{draft,id}')::uuid;
  document := jsonb_set(result #> '{draft,document}', '{product,slug}', '"future-serum"');
  perform public.save_catalog_product_draft(draft_id,1,document,actor_id,'admin');
  perform public.transition_catalog_product_draft(draft_id,2,'ready','[]',actor_id);
  result := public.publish_catalog_product_draft(draft_id,3,actor_id,'admin','[]');
  if result #>> '{revision,document,product,slug}' is distinct from 'future-serum'
     or result #>> '{changedTables,productSlugRoutes}' is distinct from 'true'
     or not exists(select 1 from public.product_slug_routes where source_slug='super-serum'
       and source_product_id=source_id and target_product_id=source_id and route_kind='rename')
     or not exists(select 1 from public.product_slug_routes where source_slug='future-serum'
       and source_product_id=source_id and target_product_id=source_id and route_kind='canonical')
     or not exists(select 1 from public.catalog_editor_audit_log audit where audit.draft_id=draft_id
       and action='slug.rename.published'
       and metadata #>> '{changedTables,product_slug_routes}'='true') then
    raise exception 'Current publication did not retain private rename provenance';
  end if;
  set local role anon;
  if not exists(select 1 from public.products where slug='future-serum')
     or exists(select 1 from public.products where slug='super-serum') then
    raise exception 'Future canonical Product is not discoverable directly';
  end if;
  reset role;
  raise notice 'PASS future rename publication, canonical Product visibility, audit';

  result := public.create_catalog_product_draft(source_id,actor_id);
  draft_id := (result #>> '{draft,id}')::uuid;
  document := jsonb_set(result #> '{draft,document}', '{product,slug}', '"synthetic-cleanser"');
  perform public.save_catalog_product_draft(draft_id,1,document,actor_id,'admin');
  perform public.transition_catalog_product_draft(draft_id,2,'ready','[]',actor_id);
  state_before := pg_temp.catalog_identity_state();
  begin
    perform public.publish_catalog_product_draft(draft_id,3,actor_id,'admin','[]');
    set constraints all immediate;
    raise exception 'Reserved slug publication succeeded';
  exception when unique_violation or check_violation then null;
  end;
  if pg_temp.catalog_identity_state() is distinct from state_before then
    raise exception 'Failed publication changed Catalog facts or history';
  end if;
  perform public.transition_catalog_product_draft(draft_id,3,'discard','[]',actor_id);
  begin
    update public.products set slug='super-serum' where id=target_id;
    raise exception 'Retired slug was reassigned';
  exception when unique_violation or check_violation then null;
  end;
  begin
    update public.products set slug=repeat('a',121) where id=target_id;
    raise exception 'Oversized slug was accepted';
  exception when check_violation then null;
  end;
  raise notice 'PASS slug collisions fail atomically and length guard remains';
  begin
    update public.product_slug_routes set source_slug='altered-history' where source_slug='super-serum';
    raise exception 'Provenance was rewritten';
  exception when object_not_in_prerequisite_state then null;
  end;
  begin
    delete from public.product_slug_routes where source_slug='super-serum';
    raise exception 'History was deleted';
  exception when object_not_in_prerequisite_state then null;
  end;
  begin
    perform public.replace_catalog_product_slug(source_id,target_id,actor_id);
    raise exception 'Active source was replaced';
  exception when check_violation then null;
  end;
  update public.products set catalog_status='archived' where id=source_id;
  begin
    perform public.replace_catalog_product_slug(source_id,target_id,null);
    raise exception 'Replacement accepted a missing actor';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.replace_catalog_product_slug(source_id,source_id,actor_id);
    raise exception 'Self replacement succeeded';
  exception when check_violation then null;
  end;
  begin
    perform public.replace_catalog_product_slug(source_id,gen_random_uuid(),actor_id);
    raise exception 'Missing replacement target succeeded';
  exception when foreign_key_violation then null;
  end;
  result := public.replace_catalog_product_slug(source_id,target_id,actor_id);
  if result ->> 'ok' is distinct from 'true'
     or (select count(*) from public.product_slug_routes where source_product_id=source_id
       and target_product_id=target_id and route_kind='replacement') <> 2 then
    raise exception 'Replacement failed to preserve and flatten both reservations';
  end if;
  begin
    update public.products set catalog_status='active' where id=source_id;
    raise exception 'Replaced Product was reactivated';
  exception when check_violation then null;
  end;
  begin
    update public.product_slug_routes set route_kind='rename' where source_slug='super-serum';
    raise exception 'Replacement provenance was reverted';
  exception when object_not_in_prerequisite_state then null;
  end;
  if (select to_jsonb(r) from public.catalog_product_revisions r where product_id=source_id and revision_number=1)
     is distinct from historical_revision then
    raise exception 'Historical revision changed';
  end if;
  raise notice 'PASS provenance, deletion guard, governed replacement, reactivation denial, revision preservation';
end $publication$;
rollback;
