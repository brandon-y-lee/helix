-- Run after the Product Family migration against the approved non-production
-- project. Every fixture mutation is enclosed in one transaction and rolled back.

begin;

do $product_family_contract$
declare
  v_family_id uuid;
begin
  select id into strict v_family_id
  from public.product_families
  where slug = 'refine'
    and display_name = 'REFINE'
    and system_step_name = 'REFINE';

  if (
    select jsonb_agg(
      jsonb_build_object(
        'option', membership.option_label,
        'slug', product.slug,
        'entry', membership.is_entry,
        'status', product.status,
        'offers', (
          select count(*)
          from public.product_variants offer
          where offer.product_id = product.id
            and offer.archived_at is null
        )
      ) order by membership.sort_order
    )
    from public.product_family_memberships membership
    join public.products product on product.id = membership.product_id
    where membership.family_id = v_family_id
  ) is distinct from jsonb_build_array(
    jsonb_build_object(
      'option', 'General',
      'slug', 'balancing-prep',
      'entry', true,
      'status', 'coming_soon',
      'offers', 0
    ),
    jsonb_build_object(
      'option', 'Exfoliating',
      'slug', 'polishing-prep',
      'entry', false,
      'status', 'waitlist',
      'offers', 0
    ),
    jsonb_build_object(
      'option', 'Brightening',
      'slug', 'beaming-prep',
      'entry', false,
      'status', 'waitlist',
      'offers', 0
    ),
    jsonb_build_object(
      'option', 'Cooling',
      'slug', 'chilling-prep',
      'entry', false,
      'status', 'waitlist',
      'offers', 0
    )
  ) then
    raise exception 'REFINE family Product order, identity, status, or Offers drifted';
  end if;

  if exists (
    select 1
    from public.product_family_memberships membership
    join public.products product on product.id = membership.product_id
    where membership.family_id = v_family_id
      and (
        product.catalog_status <> 'active'
        or product.system_step_name <> 'REFINE'
        or product.routine_group <> 'beyond_core'
      )
  ) then
    raise exception 'REFINE family eligibility or shared System Step drifted';
  end if;

  if (
    select count(*)
    from public.catalog_product_revisions revision
    where revision.product_id in (
      select membership.product_id
      from public.product_family_memberships membership
      where membership.family_id = v_family_id
    )
      and revision.schema_version = 4
      and revision.document #>> '{productFamily,family,id}' = v_family_id::text
  ) < 4 then
    raise exception 'REFINE family is missing immutable V4 revision state';
  end if;

  if (
    select count(*)
    from public.catalog_editor_audit_log audit
    where audit.action = 'family.published'
      and audit.metadata ->> 'familyId' = v_family_id::text
  ) <> 4 then
    raise exception 'REFINE family migration audit is incomplete';
  end if;

  if (
    select count(*)
    from public.catalog_editor_audit_log audit
    join public.products product on product.id = audit.product_id
    where product.slug = 'balancing-prep'
      and audit.action = 'slug.rename.published'
      and audit.metadata ->> 'oldSlug' = 'refine-02-pore-treatment-pads'
      and audit.metadata ->> 'newSlug' = 'balancing-prep'
  ) <> 1 then
    raise exception 'Balancing Prep requires one durable slug rename audit';
  end if;

  if has_table_privilege('anon', 'public.product_families', 'insert')
     or has_table_privilege(
       'authenticated', 'public.product_family_memberships', 'update'
     )
     or has_table_privilege(
       'anon', 'public.product_family_memberships', 'delete'
     )
  then
    raise exception 'Product Family public write grants are unsafe';
  end if;
end;
$product_family_contract$;

set local role anon;

do $anon_family_contract$
begin
  if (
    select count(*)
    from public.product_families
    where slug = 'refine'
  ) <> 1 or (
    select count(*)
    from public.product_family_memberships membership
    join public.product_families family on family.id = membership.family_id
    where family.slug = 'refine'
  ) <> 4 then
    raise exception 'anonymous family reads do not expose the eligible family';
  end if;

  begin
    update public.product_families
    set display_name = 'unsafe'
    where slug = 'refine';
    raise exception 'anonymous Product Family write unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;
end;
$anon_family_contract$;

reset role;

do $family_publisher_contract$
declare
  v_admin_id uuid := '00000000-0000-4000-8000-000000000143';
  v_publisher_id uuid := '00000000-0000-4000-8000-000000000144';
  v_product_id uuid;
  v_stale_product_id uuid;
  v_draft_id uuid;
  v_stale_draft_id uuid;
  v_document jsonb;
  v_changed_document jsonb;
  v_result jsonb;
begin
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
  ) values
    (
      v_admin_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'product-family-admin-test@example.invalid',
      '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()
    ),
    (
      v_publisher_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'product-family-publisher-test@example.invalid',
      '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()
    );

  insert into public.admin_memberships (user_id, role, active, created_by)
  values
    (v_admin_id, 'admin', true, v_admin_id),
    (v_publisher_id, 'catalog_publisher', true, v_admin_id);

  select id into strict v_product_id
  from public.products
  where slug = 'beaming-prep';

  select id into strict v_stale_product_id
  from public.products
  where slug = 'chilling-prep';

  v_result := public.create_catalog_product_draft(
    v_stale_product_id,
    v_admin_id
  );
  v_stale_draft_id := (v_result #>> '{draft,id}')::uuid;

  v_result := public.create_catalog_product_draft(
    v_product_id,
    v_publisher_id
  );
  v_draft_id := (v_result #>> '{draft,id}')::uuid;
  v_document := v_result #> '{draft,document}';
  v_changed_document := jsonb_set(
    v_document,
    '{productFamily,memberships,2,option_label}',
    '"Glow test"'::jsonb
  );

  begin
    perform public.save_catalog_product_draft(
      v_draft_id,
      1,
      v_changed_document,
      v_publisher_id,
      'catalog_publisher'
    );
    raise exception 'Catalog Publisher changed admin-owned family state';
  exception
    when insufficient_privilege then null;
  end;

  v_result := public.save_catalog_product_draft(
    v_draft_id,
    1,
    v_changed_document,
    v_admin_id,
    'admin'
  );
  perform public.transition_catalog_product_draft(
    v_draft_id,
    2,
    'ready',
    '[]'::jsonb,
    v_admin_id
  );
  v_result := public.publish_catalog_product_draft(
    v_draft_id,
    3,
    v_admin_id,
    'admin',
    '[]'::jsonb
  );

  if v_result #>> '{changedTables,productFamily}' <> 'true'
     or not exists (
       select 1
       from public.catalog_editor_audit_log audit
       where audit.draft_id = v_draft_id
         and audit.action = 'family.published'
         and audit.metadata #>> '{after,memberships,2,option_label}' =
           'Glow test'
     )
  then
    raise exception 'Administrator family publication lacked revision/audit state';
  end if;

  if not exists (
    select 1
    from public.catalog_product_revisions revision
    where revision.product_id = v_stale_product_id
      and revision.document
        #>> '{productFamily,memberships,2,option_label}' = 'Glow test'
      and revision.id = (
        select latest.id
        from public.catalog_product_revisions latest
        where latest.product_id = v_stale_product_id
        order by latest.revision_number desc
        limit 1
      )
  ) or not exists (
    select 1
    from public.catalog_editor_audit_log audit
    where audit.product_id = v_stale_product_id
      and audit.action = 'family.published'
      and audit.metadata ->> 'source' = 'shared-family-publication'
      and audit.metadata ->> 'originDraftId' = v_draft_id::text
  ) then
    raise exception 'Family publication did not revise and audit every sibling';
  end if;

  perform public.transition_catalog_product_draft(
    v_stale_draft_id,
    1,
    'ready',
    '[]'::jsonb,
    v_admin_id
  );
  v_result := public.publish_catalog_product_draft(
    v_stale_draft_id,
    2,
    v_admin_id,
    'admin',
    '[]'::jsonb
  );
  if v_result ->> 'code' <> 'revision_conflict' then
    raise exception 'Stale sibling draft overwrote newer Product Family state';
  end if;
end;
$family_publisher_contract$;

rollback;
