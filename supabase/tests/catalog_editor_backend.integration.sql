-- Run against the linked approved non-production project:
-- pnpm dlx supabase db query --linked \
--   --file supabase/tests/catalog_editor_backend.integration.sql
--
-- Every fixture and mutation is enclosed in one transaction and rolled back.

begin;

do $catalog_editor_test$
declare
  v_actor_id uuid := '00000000-0000-4000-8000-000000000091';
  v_product_id uuid;
  v_updated_before timestamptz;
  v_document_before jsonb;
  v_document_with_editorial jsonb;
  v_draft_result jsonb;
  v_draft_id uuid;
  v_result jsonb;
  v_revision_id uuid;
  v_legacy_revision_id uuid;
  v_legacy_v2_revision_id uuid;
  v_legacy_v1_revision_id uuid;
  v_restored_draft_id uuid;
  v_second_draft_id uuid;
begin
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
  )
  values (
    v_actor_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'catalog-editor-test@example.invalid',
    '',
    now(),
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  );

  v_result := public.bootstrap_catalog_admin_membership(
    v_actor_id,
    'admin'
  );
  if v_result ->> 'action' <> 'created' then
    raise exception 'admin membership bootstrap was not recorded';
  end if;
  if (
    select count(*)
    from public.catalog_editor_audit_log
    where actor_id = v_actor_id
      and action = 'membership.created'
  ) <> 1 then
    raise exception 'admin membership bootstrap was not audited';
  end if;

  select id, updated_at
  into v_product_id, v_updated_before
  from public.products
  where routine_group = 'core'
  order by created_at
  limit 1;

  if v_product_id is null then
    raise exception 'integration test requires one catalog product';
  end if;

  v_document_before := public.get_catalog_editor_document(v_product_id);
  if v_document_before ->> 'schemaVersion' <> '4'
     or (v_document_before -> 'product') ?| array[
       'formal_title',
       'card_tagline',
       'routine_step_number',
       'routine_step_name'
     ]
     or v_document_before #>> '{product,system_step_name}' is null
  then
    raise exception 'canonical editor document is not V4';
  end if;
  v_document_with_editorial := jsonb_set(
    v_document_before,
    '{media}',
    coalesce(
      (
        select jsonb_agg(media_item)
        from jsonb_array_elements(v_document_before -> 'media') media_item
        where media_item ->> 'role' <> 'core_routine_editorial'
      ),
      '[]'::jsonb
    ) || jsonb_build_array(
      jsonb_build_object(
        'id', gen_random_uuid(),
        'variant_id', null,
        'media_type', 'image',
        'url', 'https://erasogmsqpgiirovubjh.supabase.co/storage/v1/object/public/mei-pelle-catalog/products/integration/core-routine-editorial.webp',
        'alt', 'Integration Core routine editorial',
        'width', 1200,
        'height', 1500,
        'role', 'core_routine_editorial',
        'sort_order', 1,
        'palette_id', null,
        'placeholder_palette', '{}'::jsonb,
        'original_source_url', null,
        'source_filename', 'integration-core-routine-editorial.webp'
      )
    )
  );
  v_draft_result := public.create_catalog_product_draft(
    v_product_id,
    v_actor_id
  );
  v_draft_id := (v_draft_result #>> '{draft,id}')::uuid;

  if (v_draft_result ->> 'created')::boolean is not true then
    raise exception 'draft creation did not return a new draft';
  end if;

  if (
    select count(*)
    from public.product_content_drafts
    where product_id = v_product_id
      and status in ('draft', 'ready')
  ) <> 1 then
    raise exception 'one-open-draft invariant failed';
  end if;

  v_result := public.save_catalog_product_draft(
    v_draft_id,
    99,
    v_document_before,
    v_actor_id,
    'admin'
  );
  if v_result ->> 'code' <> 'version_conflict' then
    raise exception 'stale save did not return version_conflict';
  end if;

  if (
    select updated_at from public.products where id = v_product_id
  ) is distinct from v_updated_before then
    raise exception 'draft operations changed canonical product state';
  end if;

  v_result := public.save_catalog_product_draft(
    v_draft_id,
    1,
    jsonb_set(
      v_document_before,
      '{variants,0,price_cents}',
      '-1'::jsonb
    ),
    v_actor_id,
    'admin'
  );
  if v_result #>> '{draft,version}' <> '2' then
    raise exception 'draft save did not advance version';
  end if;

  v_result := public.transition_catalog_product_draft(
    v_draft_id,
    2,
    'ready',
    '[]'::jsonb,
    v_actor_id
  );
  if v_result #>> '{draft,version}' <> '3' then
    raise exception 'ready transition did not advance version';
  end if;

  begin
    perform public.publish_catalog_product_draft(
      v_draft_id,
      3,
      v_actor_id,
      'admin',
      '[]'::jsonb
    );
    raise exception 'invalid child publication unexpectedly succeeded';
  exception
    when check_violation then
      if sqlerrm not like '%product_variants_price_cents_check%' then
        raise;
      end if;
  end;

  if (
    select count(*)
    from public.catalog_product_revisions
    where product_id = v_product_id
  ) <> 0 then
    raise exception 'failed publication created a revision';
  end if;

  if (
    select updated_at from public.products where id = v_product_id
  ) is distinct from v_updated_before then
    raise exception 'failed publication did not roll canonical updates back';
  end if;

  v_result := public.save_catalog_product_draft(
    v_draft_id,
    3,
    v_document_with_editorial,
    v_actor_id,
    'admin'
  );
  if v_result #>> '{draft,version}' <> '4' then
    raise exception 'valid recovery save did not advance version';
  end if;

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

  if (v_result ->> 'ok')::boolean is not true then
    raise exception 'valid ready draft did not publish';
  end if;
  if (v_result #>> '{revision,revision_number}')::integer <> 1 then
    raise exception 'first publication did not create revision one';
  end if;
  if v_result -> 'changedTables' <> jsonb_build_object(
    'products', false,
    'productPdpContent', false,
    'variants', false,
    'media', true,
    'relationships', false,
    'productSource', false
  ) then
    raise exception 'changed canonical tables were reported incorrectly';
  end if;
  if (v_result #> '{revision,document}') ? 'reviews' then
    raise exception 'revision unexpectedly contains review data';
  end if;
  if not jsonb_path_exists(
    v_result #> '{revision,document,media}',
    '$[*] ? (@.role == "core_routine_editorial")'
  ) then
    raise exception 'published revision lost Core routine editorial media';
  end if;

  v_revision_id := (v_result #>> '{revision,id}')::uuid;
  begin
    update public.catalog_product_revisions
    set revision_number = 9
    where id = v_revision_id;
    raise exception 'append-only revision unexpectedly updated';
  exception
    when sqlstate '55000' then
      if sqlerrm <> 'catalog_product_revisions is append-only' then
        raise;
      end if;
  end;

  v_result := public.create_catalog_product_draft(
    v_product_id,
    v_actor_id
  );
  v_second_draft_id := (v_result #>> '{draft,id}')::uuid;

  insert into public.catalog_product_revisions (
    product_id,
    revision_number,
    schema_version,
    document,
    published_by
  )
  values (
    v_product_id,
    2,
    3,
    jsonb_set(
      jsonb_set(v_document_before, '{schemaVersion}', '3'::jsonb),
      '{product}',
      (
        (v_document_before -> 'product') - 'system_step_name'
      ) || jsonb_build_object(
        'formal_title', 'Legacy formal title',
        'card_tagline', 'Legacy card tagline',
        'routine_step_number', 1,
        'routine_step_name',
          v_document_before #>> '{product,system_step_name}'
      )
    ),
    v_actor_id
  )
  returning id into v_legacy_revision_id;

  perform public.transition_catalog_product_draft(
    v_second_draft_id,
    1,
    'ready',
    '[]'::jsonb,
    v_actor_id
  );
  v_result := public.publish_catalog_product_draft(
    v_second_draft_id,
    2,
    v_actor_id,
    'admin',
    '[]'::jsonb
  );
  if v_result ->> 'code' <> 'revision_conflict' then
    raise exception 'stale base revision did not reject publication';
  end if;

  perform public.transition_catalog_product_draft(
    v_second_draft_id,
    2,
    'discard',
    '[]'::jsonb,
    v_actor_id
  );
  v_result := public.restore_catalog_product_revision(
    v_legacy_revision_id,
    v_actor_id
  );
  if (v_result ->> 'ok')::boolean is not true then
    raise exception 'published revision did not restore into a new draft';
  end if;
  if not jsonb_path_exists(
    v_result #> '{draft,document,media}',
    '$[*] ? (@.role == "core_routine_editorial")'
  ) then
    raise exception 'revision restore lost Core routine editorial media';
  end if;
  if v_result #>> '{draft,document,schemaVersion}' <> '4'
     or (v_result #> '{draft,document,product}') ?| array[
       'formal_title',
       'card_tagline',
       'routine_step_number',
       'routine_step_name'
     ]
     or v_result #>> '{draft,document,product,system_step_name}' is null
  then
    raise exception 'V3 revision did not restore through the V4 adapter';
  end if;

  v_restored_draft_id := (v_result #>> '{draft,id}')::uuid;
  perform public.transition_catalog_product_draft(
    v_restored_draft_id,
    1,
    'discard',
    '[]'::jsonb,
    v_actor_id
  );

  insert into public.catalog_product_revisions (
    product_id,
    revision_number,
    schema_version,
    document,
    published_by
  ) values (
    v_product_id,
    3,
    2,
    jsonb_set(v_document_before, '{schemaVersion}', '2'::jsonb),
    v_actor_id
  ) returning id into v_legacy_v2_revision_id;

  v_result := public.restore_catalog_product_revision(
    v_legacy_v2_revision_id,
    v_actor_id
  );
  if v_result #>> '{draft,document,schemaVersion}' <> '4'
     or (v_result #> '{draft,document,product}') ?| array[
       'formal_title',
       'card_tagline',
       'routine_step_number',
       'routine_step_name'
     ]
     or v_result #>> '{draft,document,product,system_step_name}' is null
     or (
       select schema_version
       from public.catalog_product_revisions
       where id = v_legacy_v2_revision_id
     ) <> 2
  then
    raise exception 'V2 revision did not restore immutably through V4';
  end if;

  v_restored_draft_id := (v_result #>> '{draft,id}')::uuid;
  perform public.transition_catalog_product_draft(
    v_restored_draft_id,
    1,
    'discard',
    '[]'::jsonb,
    v_actor_id
  );

  insert into public.catalog_product_revisions (
    product_id,
    revision_number,
    schema_version,
    document,
    published_by
  ) values (
    v_product_id,
    4,
    1,
    jsonb_set(v_document_before, '{schemaVersion}', '1'::jsonb),
    v_actor_id
  ) returning id into v_legacy_v1_revision_id;

  v_result := public.restore_catalog_product_revision(
    v_legacy_v1_revision_id,
    v_actor_id
  );
  if v_result #>> '{draft,document,schemaVersion}' <> '4'
     or (v_result #> '{draft,document,product}') ?| array[
       'formal_title',
       'card_tagline',
       'routine_step_number',
       'routine_step_name'
     ]
     or v_result #>> '{draft,document,product,system_step_name}' is null
     or (
       select schema_version
       from public.catalog_product_revisions
       where id = v_legacy_v1_revision_id
     ) <> 1
  then
    raise exception 'V1 revision did not restore immutably through V4';
  end if;

  if (
    select array_agg(format('%s:%s:%s', name, position, routine_group)
      order by position)
    from public.system_steps
  ) <> array[
    'CLEANSE:1:core',
    'REFINE:2:beyond_core',
    'TREAT:3:core',
    'FRAME:4:beyond_core',
    'SEAL:5:core',
    'PROTECT:6:beyond_core',
    'LIFT:7:beyond_core'
  ] then
    raise exception 'System Step registry is not canonical';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.system_steps'::regclass
      and conname = 'system_steps_fixed_contract_check'
      and contype = 'c'
  ) then
    raise exception 'System Step fixed contract is not enforced';
  end if;

  if not has_table_privilege('anon', 'public.system_steps', 'select')
     or has_table_privilege('anon', 'public.system_steps', 'insert')
     or has_table_privilege('authenticated', 'public.system_steps', 'update')
  then
    raise exception 'System Step table privileges are unsafe';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'products'
      and column_name in (
        'formal_title',
        'card_tagline',
        'routine_step_number',
        'routine_step_name'
      )
  ) then
    raise exception 'retired Product identity columns still exist';
  end if;

  if has_table_privilege(
    'anon',
    'public.product_content_drafts',
    'select'
  ) or has_table_privilege(
    'authenticated',
    'public.product_content_drafts',
    'insert'
  ) then
    raise exception 'browser roles have direct draft privileges';
  end if;

  if not (
    select relrowsecurity
    from pg_class
    where oid = 'public.product_content_drafts'::regclass
  ) then
    raise exception 'draft table does not have RLS enabled';
  end if;

  if (
    select count(*)
    from public.catalog_editor_audit_log
    where product_id = v_product_id
      and actor_id = v_actor_id
  ) < 7 then
    raise exception 'catalog editor audit trail is incomplete';
  end if;
end;
$catalog_editor_test$;

rollback;
