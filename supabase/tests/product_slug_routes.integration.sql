-- Run against the linked approved non-production project:
-- pnpm dlx supabase db query --linked \
--   --file supabase/tests/product_slug_routes.integration.sql
--
-- Every fixture and mutation is enclosed in one transaction and rolled back.

begin;

do $product_slug_routes_test$
declare
  v_actor_id uuid := '00000000-0000-4000-8000-000000000092';
  v_source_product_id uuid;
  v_source_slug text;
  v_renamed_slug text;
  v_target_product_id uuid;
  v_target_slug text;
  v_draft_result jsonb;
  v_draft_id uuid;
  v_document jsonb;
  v_result jsonb;
  v_revision_count integer;
begin
  if (
    select count(*)
    from public.product_slug_routes
    where route_kind = 'canonical'
  ) <> (select count(*) from public.products) then
    raise exception 'canonical Product slug routes were not completely backfilled';
  end if;

  if not exists (
    select 1
    from public.product_slug_routes r
    join public.products p on p.id = r.target_product_id
    where r.source_slug = 'reset-01-calming-gel-cleanser'
      and r.route_kind = 'rename'
      and p.slug = 'cleanse-01-calming-gel-cleanser'
  ) or not exists (
    select 1
    from public.product_slug_routes r
    join public.products p on p.id = r.target_product_id
    where r.source_slug = 'recode-03-pdrn-5-ampoule'
      and r.route_kind = 'rename'
      and p.slug = 'treat-03-pdrn-5-ampoule'
  ) then
    raise exception 'static Product redirects were not backfilled';
  end if;

  if not (
    select relrowsecurity
    from pg_class
    where oid = 'public.product_slug_routes'::regclass
  ) or not has_table_privilege(
    'anon', 'public.product_slug_routes', 'select'
  ) or has_table_privilege(
    'anon', 'public.product_slug_routes', 'insert'
  ) or has_table_privilege(
    'authenticated', 'public.product_slug_routes', 'update'
  ) or has_table_privilege(
    'service_role', 'public.product_slug_routes', 'delete'
  ) then
    raise exception 'Product slug route privileges are unsafe';
  end if;

  if not has_function_privilege(
    'anon', 'public.resolve_product_slug(text)', 'execute'
  ) or has_function_privilege(
    'anon',
    'public.replace_catalog_product_slug(uuid,uuid,uuid)',
    'execute'
  ) or not has_function_privilege(
    'service_role',
    'public.replace_catalog_product_slug(uuid,uuid,uuid)',
    'execute'
  ) then
    raise exception 'Product slug route function grants are unsafe';
  end if;

  begin
    update public.products
    set slug = repeat('a', 121)
    where id = (
      select id from public.products order by id limit 1
    );
    raise exception 'oversized Product slug unexpectedly succeeded';
  exception
    when check_violation then null;
  end;

  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
  ) values (
    v_actor_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'product-slug-routes-test@example.invalid',
    '',
    now(),
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  );

  v_result := public.bootstrap_catalog_admin_membership(v_actor_id, 'admin');
  if v_result ->> 'action' <> 'created' then
    raise exception 'slug route test admin was not created';
  end if;

  select id, slug
  into v_source_product_id, v_source_slug
  from public.products
  where catalog_status = 'active'
    and slug not in (
      'cleanse-01-calming-gel-cleanser',
      'treat-03-pdrn-5-ampoule'
    )
  order by created_at
  limit 1;

  select id, slug
  into v_target_product_id, v_target_slug
  from public.products
  where catalog_status = 'active'
    and id <> v_source_product_id
  order by created_at desc
  limit 1;

  if v_source_product_id is null or v_target_product_id is null then
    raise exception 'slug route test requires two active Products';
  end if;

  v_renamed_slug := v_source_slug || '-durable-test';
  v_draft_result := public.create_catalog_product_draft(
    v_source_product_id,
    v_actor_id
  );
  v_draft_id := (v_draft_result #>> '{draft,id}')::uuid;
  v_document := jsonb_set(
    v_draft_result #> '{draft,document}',
    '{product,slug}',
    to_jsonb(v_renamed_slug)
  );

  v_result := public.save_catalog_product_draft(
    v_draft_id,
    1,
    v_document,
    v_actor_id,
    'admin'
  );
  perform public.transition_catalog_product_draft(
    v_draft_id,
    2,
    'ready',
    '[]'::jsonb,
    v_actor_id
  );
  v_result := public.publish_catalog_product_draft(
    v_draft_id,
    3,
    v_actor_id,
    'admin',
    jsonb_build_array(jsonb_build_object(
      'table', 'products',
      'field', 'slug',
      'before', v_source_slug,
      'after', v_renamed_slug
    ))
  );

  if v_result #>> '{revision,document,product,slug}' <> v_renamed_slug
     or v_result #>> '{changedTables,productSlugRoutes}' <> 'true'
     or not exists (
       select 1
       from public.product_slug_routes
       where source_slug = v_source_slug
         and source_product_id = v_source_product_id
         and target_product_id = v_source_product_id
         and route_kind = 'rename'
     ) or not exists (
       select 1
       from public.product_slug_routes
       where source_slug = v_renamed_slug
         and source_product_id = v_source_product_id
         and target_product_id = v_source_product_id
         and route_kind = 'canonical'
     ) then
    raise exception 'Catalog publication did not atomically preserve the prior slug';
  end if;

  if (
    select route_kind || ':' || target_slug
    from public.resolve_product_slug(v_source_slug)
  ) <> ('rename:' || v_renamed_slug) then
    raise exception 'historical rename did not resolve directly to the canonical slug';
  end if;

  if not exists (
    select 1
    from public.catalog_editor_audit_log
    where draft_id = v_draft_id
      and action = 'slug.rename.published'
      and metadata #>> '{changedTables,product_slug_routes}' = 'true'
  ) then
    raise exception 'slug route publication was not included in Catalog audit';
  end if;

  select count(*) into v_revision_count
  from public.catalog_product_revisions
  where product_id = v_source_product_id;

  v_draft_result := public.create_catalog_product_draft(
    v_source_product_id,
    v_actor_id
  );
  v_draft_id := (v_draft_result #>> '{draft,id}')::uuid;
  v_document := jsonb_set(
    v_draft_result #> '{draft,document}',
    '{product,slug}',
    to_jsonb('reset-01-calming-gel-cleanser'::text)
  );
  perform public.save_catalog_product_draft(
    v_draft_id, 1, v_document, v_actor_id, 'admin'
  );
  perform public.transition_catalog_product_draft(
    v_draft_id, 2, 'ready', '[]'::jsonb, v_actor_id
  );
  begin
    perform public.publish_catalog_product_draft(
      v_draft_id, 3, v_actor_id, 'admin', '[]'::jsonb
    );
    set constraints all immediate;
    raise exception 'reserved slug publication unexpectedly succeeded';
  exception
    when unique_violation or check_violation then null;
  end;

  if (select slug from public.products where id = v_source_product_id)
       <> v_renamed_slug
     or (
       select count(*)
       from public.catalog_product_revisions
       where product_id = v_source_product_id
     ) <> v_revision_count then
    raise exception 'failed slug publication was not atomic';
  end if;

  perform public.transition_catalog_product_draft(
    v_draft_id, 3, 'discard', '[]'::jsonb, v_actor_id
  );

  begin
    perform public.replace_catalog_product_slug(
      v_source_product_id,
      v_source_product_id,
      v_actor_id
    );
    raise exception 'self replacement unexpectedly succeeded';
  exception
    when check_violation then null;
  end;

  begin
    perform public.replace_catalog_product_slug(
      v_source_product_id,
      gen_random_uuid(),
      v_actor_id
    );
    raise exception 'missing replacement target unexpectedly succeeded';
  exception
    when foreign_key_violation then null;
  end;

  update public.products
  set catalog_status = 'archived'
  where id = v_source_product_id;

  begin
    perform public.replace_catalog_product_slug(
      v_source_product_id,
      v_target_product_id,
      null
    );
    raise exception 'replacement with a NULL actor unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;

  begin
    perform public.replace_catalog_product_slug(
      v_source_product_id,
      v_target_product_id,
      gen_random_uuid()
    );
    raise exception 'replacement without an Admin membership unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;

  v_result := public.replace_catalog_product_slug(
    v_source_product_id,
    v_target_product_id,
    v_actor_id
  );
  if v_result ->> 'ok' <> 'true'
     or v_result ->> 'targetSlug' <> v_target_slug
     or exists (
       select 1
       from public.product_slug_routes
       where target_product_id = v_source_product_id
     ) or not exists (
       select 1
       from public.product_slug_routes
       where source_product_id = v_source_product_id
         and target_product_id = v_target_product_id
         and route_kind = 'replacement'
     ) then
    raise exception 'explicit replacement did not flatten every source route';
  end if;

  if (
    select route_kind || ':' || target_slug
    from public.resolve_product_slug(v_source_slug)
  ) <> ('replacement:' || v_target_slug) then
    raise exception 'replacement route did not resolve directly to the active target';
  end if;

  begin
    update public.products
    set catalog_status = 'active'
    where id = v_source_product_id;
    raise exception 'replaced Product was reactivated';
  exception
    when check_violation then null;
  end;

  if (
    select catalog_status
    from public.products
    where id = v_source_product_id
  ) <> 'archived' then
    raise exception 'failed reactivation changed the replaced Product';
  end if;

  begin
    delete from public.product_slug_routes
    where source_slug = v_source_slug;
    raise exception 'slug route history was silently deleted';
  exception
    when object_not_in_prerequisite_state then
      if sqlerrm <> 'product_slug_routes is append-only' then
        raise;
      end if;
  end;
end;
$product_slug_routes_test$;

rollback;
