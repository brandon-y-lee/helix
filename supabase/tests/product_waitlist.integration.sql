-- Run against the linked approved non-production project:
-- pnpm dlx supabase db query --linked \
--   --file supabase/tests/product_waitlist.integration.sql
--
-- Every fixture and mutation is enclosed in one transaction and rolled back.

begin;

do $product_waitlist_test$
declare
  v_actor_id uuid := '00000000-0000-4000-8000-000000000093';
  v_product_id uuid;
  v_document jsonb;
  v_waitlist_document jsonb;
  v_draft_id uuid;
  v_result jsonb;
  v_enrollment_id bigint;
  v_attempt integer;
  v_table text;
begin
  foreach v_table in array array[
    'product_waitlist_enrollments',
    'product_waitlist_consent_events',
    'product_waitlist_rate_limits'
  ] loop
    if not exists (
      select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'private'
        and c.relname = v_table
        and c.relrowsecurity
        and c.relforcerowsecurity
    ) then
      raise exception 'private.% must enforce RLS', v_table;
    end if;

    if has_table_privilege('anon', format('private.%I', v_table), 'select')
       or has_table_privilege('authenticated', format('private.%I', v_table), 'select')
       or has_table_privilege('service_role', format('private.%I', v_table), 'select')
    then
      raise exception 'private.% exposes direct table reads', v_table;
    end if;
  end loop;

  if has_function_privilege(
       'anon',
       'public.enroll_product_waitlist(uuid,text,boolean,text,text,text)',
       'execute'
     )
     or has_function_privilege(
       'authenticated',
       'public.enroll_product_waitlist(uuid,text,boolean,text,text,text)',
       'execute'
     )
     or not has_function_privilege(
       'service_role',
       'public.enroll_product_waitlist(uuid,text,boolean,text,text,text)',
       'execute'
     )
  then
    raise exception 'Product waitlist RPC grants are not service-role-only';
  end if;

  insert into auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
  ) values (
    v_actor_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'product-waitlist-test@example.invalid',
    '',
    now(),
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  );

  perform public.bootstrap_catalog_admin_membership(v_actor_id, 'admin');

  select p.id
  into v_product_id
  from public.products p
  where p.catalog_status = 'active'
    and p.status = 'available'
    and exists (
      select 1
      from public.product_variants pv
      where pv.product_id = p.id and pv.archived_at is null
    )
    and not exists (
      select 1
      from public.product_content_drafts d
      where d.product_id = p.id and d.status in ('draft', 'ready')
    )
  order by p.created_at
  limit 1;

  if v_product_id is null then
    raise exception 'integration test requires one active Product with an Offer';
  end if;

  v_document := public.get_catalog_editor_document(v_product_id);
  v_result := public.create_catalog_product_draft(v_product_id, v_actor_id);
  v_draft_id := (v_result #>> '{draft,id}')::uuid;
  v_waitlist_document := jsonb_set(
    v_document,
    '{product,status}',
    '"waitlist"'::jsonb
  );

  v_result := public.save_catalog_product_draft(
    v_draft_id,
    1,
    v_waitlist_document,
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

  begin
    perform public.publish_catalog_product_draft(
      v_draft_id,
      3,
      v_actor_id,
      'admin',
      '[]'::jsonb
    );
    raise exception 'waitlist Product with an Offer unexpectedly published';
  exception
    when invalid_parameter_value then null;
  end;

  v_waitlist_document := jsonb_set(
    v_waitlist_document,
    '{variants}',
    '[]'::jsonb
  );
  v_result := public.save_catalog_product_draft(
    v_draft_id,
    3,
    v_waitlist_document,
    v_actor_id,
    'admin'
  );
  perform public.transition_catalog_product_draft(
    v_draft_id,
    4,
    'ready',
    '[]'::jsonb,
    v_actor_id
  );
  v_result := public.publish_catalog_product_draft(
    v_draft_id,
    5,
    v_actor_id,
    'admin',
    '[]'::jsonb
  );

  if (select status from public.products where id = v_product_id) <> 'waitlist'
     or exists (
       select 1
       from public.product_variants
       where product_id = v_product_id and archived_at is null
     )
  then
    raise exception 'zero-Offer waitlist Product did not publish canonically';
  end if;

  v_result := public.enroll_product_waitlist(
    v_product_id,
    'retry@example.invalid',
    false,
    '2026-08-10',
    'pdp_waitlist',
    repeat('a', 64)
  );
  if v_result <> jsonb_build_object('ok', true) then
    raise exception 'valid Product waitlist enrollment failed';
  end if;

  perform public.enroll_product_waitlist(
    v_product_id,
    'retry@example.invalid',
    false,
    '2026-08-10',
    'pdp_waitlist',
    repeat('b', 64)
  );
  if (
    select count(*)
    from private.product_waitlist_enrollments
    where product_id = v_product_id
      and normalized_email = 'retry@example.invalid'
  ) <> 1 then
    raise exception 'retry created a duplicate enrollment';
  end if;

  select id
  into v_enrollment_id
  from private.product_waitlist_enrollments
  where product_id = v_product_id
    and normalized_email = 'retry@example.invalid';

  if exists (
    select 1
    from private.product_waitlist_consent_events
    where enrollment_id = v_enrollment_id
  ) then
    raise exception 'unchecked marketing consent created evidence';
  end if;

  perform public.enroll_product_waitlist(
    v_product_id,
    'retry@example.invalid',
    true,
    '2026-08-10',
    'pdp_waitlist',
    repeat('c', 64)
  );
  perform public.enroll_product_waitlist(
    v_product_id,
    'retry@example.invalid',
    true,
    '2026-08-10',
    'pdp_waitlist',
    repeat('c', 64)
  );
  if (
    select count(*)
    from private.product_waitlist_consent_events
    where enrollment_id = v_enrollment_id
  ) <> 1 then
    raise exception 'marketing consent evidence is not retry-safe';
  end if;

  begin
    update private.product_waitlist_consent_events
    set source = 'mutated'
    where enrollment_id = v_enrollment_id;
    raise exception 'consent evidence unexpectedly updated';
  exception
    when sqlstate '55000' then null;
  end;
  begin
    delete from private.product_waitlist_consent_events
    where enrollment_id = v_enrollment_id;
    raise exception 'consent evidence unexpectedly deleted';
  exception
    when sqlstate '55000' then null;
  end;

  for v_attempt in 1..6 loop
    v_result := public.enroll_product_waitlist(
      v_product_id,
      'bounded@example.invalid',
      false,
      '2026-08-10',
      'pdp_waitlist',
      repeat('d', 64)
    );
    if v_attempt <= 5 and v_result <> jsonb_build_object('ok', true) then
      raise exception 'abuse bound rejected request % too early', v_attempt;
    end if;
  end loop;
  if v_result <> jsonb_build_object('ok', false, 'code', 'rate_limited') then
    raise exception 'sixth request was not transactionally rate limited';
  end if;

  insert into private.product_waitlist_rate_limits (
    abuse_key,
    window_started_at,
    request_count,
    updated_at
  ) values (
    repeat('e', 64),
    now() - interval '25 hours',
    1,
    now() - interval '25 hours'
  );
  perform public.enroll_product_waitlist(
    v_product_id,
    'prune@example.invalid',
    false,
    '2026-08-10',
    'pdp_waitlist',
    repeat('f', 64)
  );
  if exists (
    select 1
    from private.product_waitlist_rate_limits
    where abuse_key = repeat('e', 64)
  ) then
    raise exception 'expired abuse-control state was not pruned';
  end if;
end;
$product_waitlist_test$;

rollback;
