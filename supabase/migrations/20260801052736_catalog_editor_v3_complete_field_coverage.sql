create or replace function private.catalog_editor_document_v3(
  p_product_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'schemaVersion', 3,
    'productId', p.id,
    'product', to_jsonb(p),
    'productPdpContent', (
      select to_jsonb(pc)
      from public.product_pdp_content pc
      where pc.product_id = p.id
    ),
    'variants', coalesce((
      select jsonb_agg(to_jsonb(v) order by v.sort_order, v.variant_key)
      from public.product_variants v
      where v.product_id = p.id
        and v.archived_at is null
    ), '[]'::jsonb),
    'media', coalesce((
      select jsonb_agg(to_jsonb(m) order by m.role, m.sort_order, m.id)
      from public.product_media m
      where m.product_id = p.id
        and m.archived_at is null
    ), '[]'::jsonb),
    'relationships', coalesce((
      select jsonb_agg(
        to_jsonb(r)
        order by r.relationship_type, r.sort_order, r.related_product_id
      )
      from public.product_relationships r
      where r.product_id = p.id
        and r.archived_at is null
    ), '[]'::jsonb),
    'productSource', (
      select to_jsonb(s)
      from public.product_sources s
      where s.product_id = p.id
    )
  )
  from public.products p
  where p.id = p_product_id;
$$;

revoke all on function private.catalog_editor_document_v3(uuid)
  from public, anon, authenticated, service_role;

create or replace function private.catalog_editor_upgrade_v2_to_v3(
  p_document jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_product_id uuid;
  v_current jsonb;
  v_product jsonb;
  v_pdp jsonb;
  v_variants jsonb;
  v_media jsonb;
  v_relationships jsonb;
begin
  if jsonb_typeof(p_document) <> 'object'
     or p_document ->> 'schemaVersion' <> '2'
     or (p_document ->> 'productId') is null
  then
    raise exception 'invalid catalog editor V2 document'
      using errcode = '22023';
  end if;

  v_product_id := (p_document ->> 'productId')::uuid;
  v_current := private.catalog_editor_document_v3(v_product_id);
  if v_current is null then
    raise exception 'catalog product not found'
      using errcode = 'P0002';
  end if;

  v_product := (v_current -> 'product') || (p_document -> 'product');
  v_product := v_product || jsonb_build_object(
    'id', v_product_id,
    'created_at', v_current #> '{product,created_at}',
    'published_at', v_current #> '{product,published_at}',
    'updated_at', v_current #> '{product,updated_at}'
  );

  if coalesce(jsonb_typeof(p_document -> 'productPdpContent'), 'null') = 'null'
  then
    v_pdp := 'null'::jsonb;
  else
    v_pdp := coalesce(v_current -> 'productPdpContent', '{}'::jsonb)
      || (p_document -> 'productPdpContent')
      || jsonb_build_object(
        'product_id', v_product_id,
        'created_at', coalesce(
          v_current #> '{productPdpContent,created_at}',
          to_jsonb(clock_timestamp())
        ),
        'updated_at', coalesce(
          v_current #> '{productPdpContent,updated_at}',
          to_jsonb(clock_timestamp())
        )
      );
  end if;

  select coalesce(jsonb_agg(
    coalesce((
      select to_jsonb(v)
      from public.product_variants v
      where v.id = (item ->> 'id')::uuid
        and v.product_id = v_product_id
    ), '{}'::jsonb)
    || item
    || jsonb_build_object(
      'product_id', v_product_id,
      'updated_at', coalesce((
        select to_jsonb(v.updated_at)
        from public.product_variants v
        where v.id = (item ->> 'id')::uuid
      ), to_jsonb(clock_timestamp())),
      'archived_at', null
    )
    order by ordinality
  ), '[]'::jsonb)
  into v_variants
  from jsonb_array_elements(p_document -> 'variants')
    with ordinality as entries(item, ordinality);

  select coalesce(jsonb_agg(
    coalesce((
      select to_jsonb(m)
      from public.product_media m
      where m.id = (item ->> 'id')::uuid
        and m.product_id = v_product_id
    ), '{}'::jsonb)
    || item
    || jsonb_build_object(
      'product_id', v_product_id,
      'created_at', coalesce((
        select to_jsonb(m.created_at)
        from public.product_media m
        where m.id = (item ->> 'id')::uuid
      ), to_jsonb(clock_timestamp())),
      'updated_at', coalesce((
        select to_jsonb(m.updated_at)
        from public.product_media m
        where m.id = (item ->> 'id')::uuid
      ), to_jsonb(clock_timestamp())),
      'archived_at', null
    )
    order by ordinality
  ), '[]'::jsonb)
  into v_media
  from jsonb_array_elements(p_document -> 'media')
    with ordinality as entries(item, ordinality);

  select coalesce(jsonb_agg(
    coalesce((
      select to_jsonb(r)
      from public.product_relationships r
      where r.product_id = v_product_id
        and r.related_product_id = (item ->> 'related_product_id')::uuid
        and r.relationship_type = item ->> 'relationship_type'
    ), '{}'::jsonb)
    || item
    || jsonb_build_object(
      'product_id', v_product_id,
      'created_at', coalesce((
        select to_jsonb(r.created_at)
        from public.product_relationships r
        where r.product_id = v_product_id
          and r.related_product_id = (item ->> 'related_product_id')::uuid
          and r.relationship_type = item ->> 'relationship_type'
      ), to_jsonb(clock_timestamp())),
      'archived_at', null
    )
    order by ordinality
  ), '[]'::jsonb)
  into v_relationships
  from jsonb_array_elements(p_document -> 'relationships')
    with ordinality as entries(item, ordinality);

  return jsonb_build_object(
    'schemaVersion', 3,
    'productId', v_product_id,
    'product', v_product,
    'productPdpContent', v_pdp,
    'variants', v_variants,
    'media', v_media,
    'relationships', v_relationships,
    'productSource', v_current -> 'productSource'
  );
end;
$$;

revoke all on function private.catalog_editor_upgrade_v2_to_v3(jsonb)
  from public, anon, authenticated, service_role;

create or replace function private.catalog_editor_upgrade_to_v3(
  p_document jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return case p_document ->> 'schemaVersion'
    when '1' then private.catalog_editor_upgrade_v2_to_v3(
      private.catalog_editor_upgrade_v1_to_v2(p_document)
    )
    when '2' then private.catalog_editor_upgrade_v2_to_v3(p_document)
    when '3' then p_document
    else null
  end;
end;
$$;

revoke all on function private.catalog_editor_upgrade_to_v3(jsonb)
  from public, anon, authenticated, service_role;

alter table public.product_content_drafts
  drop constraint if exists product_content_drafts_schema_version_check,
  drop constraint if exists product_content_drafts_document_check;

update public.product_content_drafts
set
  document = private.catalog_editor_upgrade_to_v3(document),
  schema_version = 3
where status in ('draft', 'ready')
  and schema_version in (1, 2);

alter table public.product_content_drafts
  alter column schema_version set default 3,
  add constraint product_content_drafts_schema_version_check
  check (schema_version in (1, 2, 3)),
  add constraint product_content_drafts_document_check
  check (
    jsonb_typeof(document) = 'object'
    and (document ->> 'schemaVersion')::smallint = schema_version
    and schema_version in (1, 2, 3)
  );

alter table public.catalog_product_revisions
  drop constraint if exists catalog_product_revisions_schema_version_check,
  drop constraint if exists catalog_product_revisions_document_check;

alter table public.catalog_product_revisions
  alter column schema_version set default 3,
  add constraint catalog_product_revisions_schema_version_check
  check (schema_version in (1, 2, 3)),
  add constraint catalog_product_revisions_document_check
  check (
    jsonb_typeof(document) = 'object'
    and (document ->> 'schemaVersion')::smallint = schema_version
    and schema_version in (1, 2, 3)
  );

create or replace function public.get_catalog_editor_document(
  p_product_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.catalog_editor_document_v3(p_product_id);
$$;

revoke all on function public.get_catalog_editor_document(uuid)
  from public, anon, authenticated;
grant execute on function public.get_catalog_editor_document(uuid)
  to service_role;

create or replace function public.create_catalog_product_draft(
  p_product_id uuid,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.product_content_drafts%rowtype;
  v_created public.product_content_drafts%rowtype;
  v_document jsonb;
  v_base_revision integer;
begin
  perform 1 from public.products where id = p_product_id for update;
  if not found then
    raise exception 'catalog product not found' using errcode = 'P0002';
  end if;

  select * into v_existing
  from public.product_content_drafts
  where product_id = p_product_id and status in ('draft', 'ready')
  for update;
  if found then
    return jsonb_build_object('created', false, 'draft', to_jsonb(v_existing));
  end if;

  v_document := private.catalog_editor_document_v3(p_product_id);
  select coalesce(max(revision_number), 0) into v_base_revision
  from public.catalog_product_revisions where product_id = p_product_id;

  insert into public.product_content_drafts (
    product_id, schema_version, base_revision, version, document, status,
    validation_errors, created_by, updated_by
  ) values (
    p_product_id, 3, v_base_revision, 1, v_document, 'draft', '[]'::jsonb,
    p_actor_id, p_actor_id
  ) returning * into v_created;

  insert into public.catalog_editor_audit_log (
    action, actor_id, product_id, draft_id, metadata
  ) values (
    'draft.created', p_actor_id, p_product_id, v_created.id,
    jsonb_build_object('baseRevision', v_base_revision, 'schemaVersion', 3)
  );

  return jsonb_build_object('created', true, 'draft', to_jsonb(v_created));
end;
$$;

revoke all on function public.create_catalog_product_draft(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.create_catalog_product_draft(uuid, uuid)
  to service_role;

drop function if exists public.save_catalog_product_draft(uuid, bigint, jsonb, uuid);

create function public.save_catalog_product_draft(
  p_draft_id uuid,
  p_expected_version bigint,
  p_document jsonb,
  p_actor_id uuid,
  p_actor_role text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_draft public.product_content_drafts%rowtype;
  v_role text;
  v_canonical jsonb;
begin
  select role into v_role
  from public.admin_memberships
  where user_id = p_actor_id and active;
  if v_role is null or v_role <> p_actor_role
     or v_role not in ('catalog_editor', 'catalog_publisher', 'admin')
  then
    raise exception 'catalog actor role is not authorized'
      using errcode = '42501';
  end if;

  select * into v_draft
  from public.product_content_drafts
  where id = p_draft_id
  for update;
  if not found then
    raise exception 'catalog draft not found' using errcode = 'P0002';
  end if;
  if v_draft.status not in ('draft', 'ready') then
    return jsonb_build_object(
      'ok', false, 'code', 'draft_closed',
      'stored', jsonb_build_object(
        'id', v_draft.id, 'version', v_draft.version,
        'status', v_draft.status, 'updatedAt', v_draft.updated_at,
        'updatedBy', v_draft.updated_by
      )
    );
  end if;
  if v_draft.version <> p_expected_version then
    return jsonb_build_object(
      'ok', false, 'code', 'version_conflict',
      'stored', jsonb_build_object(
        'id', v_draft.id, 'version', v_draft.version,
        'status', v_draft.status, 'updatedAt', v_draft.updated_at,
        'updatedBy', v_draft.updated_by
      )
    );
  end if;
  if jsonb_typeof(p_document) <> 'object'
     or p_document ->> 'schemaVersion' <> '3'
     or p_document ->> 'productId' <> v_draft.product_id::text
     or jsonb_typeof(p_document -> 'product') <> 'object'
     or coalesce(jsonb_typeof(p_document -> 'productPdpContent'), 'null') not in ('object', 'null')
     or jsonb_typeof(p_document -> 'variants') <> 'array'
     or jsonb_typeof(p_document -> 'media') <> 'array'
     or jsonb_typeof(p_document -> 'relationships') <> 'array'
     or coalesce(jsonb_typeof(p_document -> 'productSource'), 'null') not in ('object', 'null')
  then
    raise exception 'invalid catalog editor V3 document' using errcode = '22023';
  end if;

  v_canonical := private.catalog_editor_document_v3(v_draft.product_id);
  if p_actor_role <> 'admin' and (
    (p_document -> 'product') - array[
      'display_name', 'formal_title', 'card_tagline', 'product_type',
      'editorial_description', 'editorial_how_to_use', 'benefits',
      'made_for', 'good_for', 'badge', 'formula_notes', 'search_keywords',
      'seo_title', 'seo_description'
    ]::text[]
    is distinct from
    (v_canonical -> 'product') - array[
      'display_name', 'formal_title', 'card_tagline', 'product_type',
      'editorial_description', 'editorial_how_to_use', 'benefits',
      'made_for', 'good_for', 'badge', 'formula_notes', 'search_keywords',
      'seo_title', 'seo_description'
    ]::text[]
    or p_document -> 'variants' is distinct from v_canonical -> 'variants'
    or p_document -> 'productSource' is distinct from v_canonical -> 'productSource'
  ) then
    raise exception 'catalog actor cannot save admin-only fields'
      using errcode = '42501';
  end if;

  update public.product_content_drafts
  set schema_version = 3,
      document = p_document,
      version = version + 1,
      status = 'draft',
      validation_errors = '[]'::jsonb,
      updated_by = p_actor_id,
      updated_at = now(),
      ready_at = null
  where id = p_draft_id
  returning * into v_draft;

  insert into public.catalog_editor_audit_log (
    action, actor_id, product_id, draft_id, metadata
  ) values (
    'draft.saved', p_actor_id, v_draft.product_id, v_draft.id,
    jsonb_build_object('version', v_draft.version, 'schemaVersion', 3)
  );

  return jsonb_build_object('ok', true, 'draft', to_jsonb(v_draft));
end;
$$;

revoke all on function public.save_catalog_product_draft(
  uuid, bigint, jsonb, uuid, text
) from public, anon, authenticated;
grant execute on function public.save_catalog_product_draft(
  uuid, bigint, jsonb, uuid, text
) to service_role;

create or replace function public.restore_catalog_product_revision(
  p_revision_id uuid,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_revision public.catalog_product_revisions%rowtype;
  v_existing public.product_content_drafts%rowtype;
  v_created public.product_content_drafts%rowtype;
  v_document jsonb;
  v_base_revision integer;
begin
  select * into v_revision
  from public.catalog_product_revisions where id = p_revision_id;
  if not found then
    raise exception 'catalog revision not found' using errcode = 'P0002';
  end if;

  perform 1 from public.products where id = v_revision.product_id for update;
  select * into v_existing
  from public.product_content_drafts
  where product_id = v_revision.product_id and status in ('draft', 'ready')
  for update;
  if found then
    return jsonb_build_object(
      'ok', false, 'code', 'active_draft_exists',
      'stored', jsonb_build_object(
        'id', v_existing.id, 'version', v_existing.version,
        'status', v_existing.status, 'updatedAt', v_existing.updated_at,
        'updatedBy', v_existing.updated_by
      )
    );
  end if;

  v_document := private.catalog_editor_upgrade_to_v3(v_revision.document);
  if v_document is null then
    raise exception 'unsupported catalog revision schema version %', v_revision.schema_version
      using errcode = '22023';
  end if;
  select coalesce(max(revision_number), 0) into v_base_revision
  from public.catalog_product_revisions
  where product_id = v_revision.product_id;

  insert into public.product_content_drafts (
    product_id, schema_version, base_revision, version, document, status,
    validation_errors, created_by, updated_by
  ) values (
    v_revision.product_id, 3, v_base_revision, 1, v_document, 'draft',
    '[]'::jsonb, p_actor_id, p_actor_id
  ) returning * into v_created;

  insert into public.catalog_editor_audit_log (
    action, actor_id, product_id, draft_id, revision_id, metadata
  ) values (
    'draft.restored', p_actor_id, v_revision.product_id, v_created.id,
    v_revision.id, jsonb_build_object(
      'restoredRevision', v_revision.revision_number,
      'restoredSchemaVersion', v_revision.schema_version,
      'draftSchemaVersion', 3,
      'baseRevision', v_base_revision
    )
  );
  return jsonb_build_object('ok', true, 'draft', to_jsonb(v_created));
end;
$$;

revoke all on function public.restore_catalog_product_revision(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.restore_catalog_product_revision(uuid, uuid)
  to service_role;

drop function if exists public.publish_catalog_product_draft(uuid, bigint, uuid);

create function public.publish_catalog_product_draft(
  p_draft_id uuid,
  p_expected_version bigint,
  p_actor_id uuid,
  p_actor_role text,
  p_change_audit jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_draft public.product_content_drafts%rowtype;
  v_document jsonb;
  v_before jsonb;
  v_after jsonb;
  v_product public.products%rowtype;
  v_pdp public.product_pdp_content%rowtype;
  v_source public.product_sources%rowtype;
  v_latest_revision integer;
  v_revision public.catalog_product_revisions%rowtype;
  v_now timestamptz := clock_timestamp();
  v_role text;
  v_products_changed boolean;
  v_pdp_changed boolean;
  v_variants_changed boolean;
  v_media_changed boolean;
  v_relationships_changed boolean;
  v_source_changed boolean;
begin
  select role into v_role
  from public.admin_memberships
  where user_id = p_actor_id and active;
  if v_role is null or v_role <> p_actor_role
     or v_role not in ('catalog_publisher', 'admin')
  then
    raise exception 'catalog actor cannot publish' using errcode = '42501';
  end if;
  if jsonb_typeof(p_change_audit) <> 'array' then
    raise exception 'catalog change audit must be an array' using errcode = '22023';
  end if;

  select * into v_draft
  from public.product_content_drafts where id = p_draft_id for update;
  if not found then
    raise exception 'catalog draft not found' using errcode = 'P0002';
  end if;
  if v_draft.status <> 'ready' then
    return jsonb_build_object(
      'ok', false, 'code', 'draft_not_ready',
      'stored', jsonb_build_object(
        'version', v_draft.version, 'status', v_draft.status,
        'updatedAt', v_draft.updated_at, 'updatedBy', v_draft.updated_by
      )
    );
  end if;
  if v_draft.version <> p_expected_version then
    return jsonb_build_object(
      'ok', false, 'code', 'version_conflict',
      'stored', jsonb_build_object(
        'version', v_draft.version, 'status', v_draft.status,
        'updatedAt', v_draft.updated_at, 'updatedBy', v_draft.updated_by
      )
    );
  end if;

  perform 1 from public.products where id = v_draft.product_id for update;
  if not found then
    raise exception 'catalog product not found' using errcode = 'P0002';
  end if;
  select coalesce(max(revision_number), 0) into v_latest_revision
  from public.catalog_product_revisions
  where product_id = v_draft.product_id;
  if v_draft.base_revision <> v_latest_revision then
    return jsonb_build_object(
      'ok', false, 'code', 'revision_conflict',
      'baseRevision', v_draft.base_revision,
      'latestRevision', v_latest_revision
    );
  end if;

  v_document := v_draft.document;
  if v_draft.schema_version <> 3
     or v_document ->> 'schemaVersion' <> '3'
     or v_document ->> 'productId' <> v_draft.product_id::text
     or jsonb_typeof(v_document -> 'product') <> 'object'
     or coalesce(jsonb_typeof(v_document -> 'productPdpContent'), 'null') not in ('object', 'null')
     or jsonb_typeof(v_document -> 'variants') <> 'array'
     or jsonb_typeof(v_document -> 'media') <> 'array'
     or jsonb_typeof(v_document -> 'relationships') <> 'array'
     or coalesce(jsonb_typeof(v_document -> 'productSource'), 'null') not in ('object', 'null')
  then
    raise exception 'invalid catalog editor V3 document' using errcode = '22023';
  end if;

  v_before := private.catalog_editor_document_v3(v_draft.product_id);
  if p_actor_role <> 'admin' and (
    (v_document -> 'product') - array[
      'display_name', 'formal_title', 'card_tagline', 'product_type',
      'editorial_description', 'editorial_how_to_use', 'benefits',
      'made_for', 'good_for', 'badge', 'formula_notes', 'search_keywords',
      'seo_title', 'seo_description'
    ]::text[]
    is distinct from
    (v_before -> 'product') - array[
      'display_name', 'formal_title', 'card_tagline', 'product_type',
      'editorial_description', 'editorial_how_to_use', 'benefits',
      'made_for', 'good_for', 'badge', 'formula_notes', 'search_keywords',
      'seo_title', 'seo_description'
    ]::text[]
    or v_document -> 'variants' is distinct from v_before -> 'variants'
    or v_document -> 'productSource' is distinct from v_before -> 'productSource'
  ) then
    raise exception 'catalog actor cannot publish admin-only fields'
      using errcode = '42501';
  end if;

  select * into v_product
  from jsonb_populate_record(null::public.products, v_document -> 'product');
  if v_product.id <> v_draft.product_id
     or v_product.slug <> v_before #>> '{product,slug}'
     or v_product.currency <> 'USD'
     or nullif(btrim(v_product.display_name), '') is null
     or nullif(btrim(v_product.formal_title), '') is null
     or nullif(btrim(v_product.card_tagline), '') is null
     or nullif(btrim(v_product.product_type), '') is null
     or nullif(btrim(v_product.editorial_description), '') is null
     or nullif(btrim(v_product.editorial_how_to_use), '') is null
     or v_product.sort_order < 0
     or v_product.routine_sort < 0
     or v_product.routine_group not in ('core', 'beyond_core')
     or v_product.catalog_status not in ('draft', 'active', 'archived')
     or v_product.status not in ('available', 'coming_soon', 'sold_out')
     or (v_product.seo_title is not null and char_length(v_product.seo_title) > 70)
     or (v_product.seo_description is not null and char_length(v_product.seo_description) > 400)
  then
    raise exception 'invalid canonical product fields' using errcode = '22023';
  end if;
  if (v_product.routine_group = 'core' and (
        upper(v_product.display_name) not in ('CLEANSE', 'TREAT', 'SEAL')
        or v_product.routine_step_number is null
        or v_product.routine_step_number <= 0
        or nullif(btrim(v_product.routine_step_name), '') is null
      )) or (v_product.routine_group = 'beyond_core' and (
        v_product.routine_step_number is not null
        or v_product.routine_step_name is not null
      ))
  then
    raise exception 'invalid canonical routine contract' using errcode = '22023';
  end if;

  if exists (
    select 1 from jsonb_array_elements(v_document -> 'variants') item
    where item ->> 'product_id' <> v_draft.product_id::text
       or item ->> 'archived_at' is not null
  ) or exists (
    select 1 from jsonb_array_elements(v_document -> 'media') item
    where item ->> 'product_id' <> v_draft.product_id::text
       or item ->> 'archived_at' is not null
  ) or exists (
    select 1 from jsonb_array_elements(v_document -> 'relationships') item
    where item ->> 'product_id' <> v_draft.product_id::text
       or item ->> 'archived_at' is not null
  ) or exists (
    select 1 from jsonb_array_elements(v_document -> 'media') item
    where item ->> 'variant_id' is not null
      and not exists (
        select 1 from jsonb_array_elements(v_document -> 'variants') variant
        where variant ->> 'id' = item ->> 'variant_id'
      )
  ) then
    raise exception 'child row product identity is invalid' using errcode = '23503';
  end if;

  if exists (
    select 1 from jsonb_array_elements(v_document -> 'variants') item
    group by item ->> 'variant_key' having count(*) > 1
  ) or exists (
    select 1 from jsonb_array_elements(v_document -> 'media') item
    group by item ->> 'role', item ->> 'sort_order' having count(*) > 1
  ) or exists (
    select 1 from jsonb_array_elements(v_document -> 'relationships') item
    group by item ->> 'related_product_id', item ->> 'relationship_type'
    having count(*) > 1
  ) then
    raise exception 'duplicate catalog child identity' using errcode = '23505';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_document -> 'variants') item
    join public.product_variants existing
      on existing.id = (item ->> 'id')::uuid
    where existing.product_id <> v_draft.product_id
  ) or exists (
    select 1
    from jsonb_array_elements(v_document -> 'media') item
    join public.product_media existing
      on existing.id = (item ->> 'id')::uuid
    where existing.product_id <> v_draft.product_id
  ) then
    raise exception 'child row belongs to another product' using errcode = '23503';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_document -> 'relationships') item
    where (item ->> 'related_product_id')::uuid = v_draft.product_id
       or item ->> 'relationship_type' not in (
         'complete_the_routine', 'related', 'routine_next'
       )
       or (item ->> 'sort_order')::integer < 0
       or not exists (
         select 1 from public.products p
         where p.id = (item ->> 'related_product_id')::uuid
       )
  ) then
    raise exception 'invalid product relationship' using errcode = '22023';
  end if;

  update public.products p set
    display_name = v_product.display_name,
    formal_title = v_product.formal_title,
    card_tagline = v_product.card_tagline,
    product_type = v_product.product_type,
    catalog_status = v_product.catalog_status,
    badge = v_product.badge,
    sort_order = v_product.sort_order,
    editorial_description = v_product.editorial_description,
    benefits = v_product.benefits,
    editorial_how_to_use = v_product.editorial_how_to_use,
    formula_notes = v_product.formula_notes,
    swatch_from = v_product.swatch_from,
    swatch_to = v_product.swatch_to,
    status = v_product.status,
    made_for = v_product.made_for,
    good_for = v_product.good_for,
    texture = v_product.texture,
    key_ingredients = v_product.key_ingredients,
    ingredients = v_product.ingredients,
    cautions = v_product.cautions,
    finish = v_product.finish,
    volume = v_product.volume,
    skin_types = v_product.skin_types,
    concerns = v_product.concerns,
    usage_time = v_product.usage_time,
    seo_title = v_product.seo_title,
    seo_description = v_product.seo_description,
    search_keywords = v_product.search_keywords,
    routine_group = v_product.routine_group,
    routine_step_number = v_product.routine_step_number,
    routine_step_name = v_product.routine_step_name,
    routine_sort = v_product.routine_sort,
    published_at = v_now
  where p.id = v_draft.product_id
    and (to_jsonb(p) - array['id', 'slug', 'currency', 'created_at', 'published_at', 'updated_at']::text[])
      is distinct from
      ((v_document -> 'product') - array['id', 'slug', 'currency', 'created_at', 'published_at', 'updated_at']::text[]);

  if coalesce(jsonb_typeof(v_document -> 'productPdpContent'), 'null') = 'null' then
    delete from public.product_pdp_content where product_id = v_draft.product_id;
  else
    select * into v_pdp from jsonb_populate_record(
      null::public.product_pdp_content, v_document -> 'productPdpContent'
    );
    if v_pdp.product_id <> v_draft.product_id or v_pdp.schema_version <> 1 then
      raise exception 'invalid PDP content identity' using errcode = '22023';
    end if;
    insert into public.product_pdp_content (
      product_id, schema_version, profile_title_tokens, routine_overlay,
      outcome_heading, outcome_labels, how_to_use_steps, application_steps,
      ingredient_cards, ingredient_story, routine_guidance
    ) values (
      v_draft.product_id, v_pdp.schema_version, v_pdp.profile_title_tokens,
      v_pdp.routine_overlay, v_pdp.outcome_heading, v_pdp.outcome_labels,
      v_pdp.how_to_use_steps, v_pdp.application_steps, v_pdp.ingredient_cards,
      v_pdp.ingredient_story, v_pdp.routine_guidance
    ) on conflict (product_id) do update set
      schema_version = excluded.schema_version,
      profile_title_tokens = excluded.profile_title_tokens,
      routine_overlay = excluded.routine_overlay,
      outcome_heading = excluded.outcome_heading,
      outcome_labels = excluded.outcome_labels,
      how_to_use_steps = excluded.how_to_use_steps,
      application_steps = excluded.application_steps,
      ingredient_cards = excluded.ingredient_cards,
      ingredient_story = excluded.ingredient_story,
      routine_guidance = excluded.routine_guidance
    where (to_jsonb(product_pdp_content) - array['product_id', 'created_at', 'updated_at']::text[])
      is distinct from
      (to_jsonb(excluded) - array['product_id', 'created_at', 'updated_at']::text[]);
  end if;

  update public.product_variants v set
    archived_at = v_now, available = false, inventory_status = 'unavailable'
  where v.product_id = v_draft.product_id
    and v.archived_at is null
    and not exists (
      select 1 from jsonb_array_elements(v_document -> 'variants') item
      where item ->> 'id' = v.id::text
    );

  insert into public.product_variants (
    id, product_id, variant_key, label, price_cents, sku,
    supplier_variant_id, option_values, compare_at_price_cents, available,
    inventory_status, volume, pack_count, sort_order, archived_at
  )
  select
    x.id, v_draft.product_id, x.variant_key, x.label, x.price_cents, x.sku,
    x.supplier_variant_id, coalesce(x.option_values, '{}'::jsonb),
    x.compare_at_price_cents, x.available, x.inventory_status, x.volume,
    x.pack_count, x.sort_order, null
  from jsonb_to_recordset(v_document -> 'variants') as x(
    id uuid, variant_key text, label text, price_cents integer, sku text,
    supplier_variant_id text, option_values jsonb,
    compare_at_price_cents integer, available boolean,
    inventory_status text, volume text, pack_count integer, sort_order integer
  )
  on conflict (id) do update set
    variant_key = excluded.variant_key,
    label = excluded.label,
    price_cents = excluded.price_cents,
    sku = excluded.sku,
    supplier_variant_id = excluded.supplier_variant_id,
    option_values = excluded.option_values,
    compare_at_price_cents = excluded.compare_at_price_cents,
    available = excluded.available,
    inventory_status = excluded.inventory_status,
    volume = excluded.volume,
    pack_count = excluded.pack_count,
    sort_order = excluded.sort_order,
    archived_at = null
  where (to_jsonb(product_variants) - array['product_id', 'updated_at']::text[])
    is distinct from
    (to_jsonb(excluded) - array['product_id', 'updated_at']::text[]);

  update public.product_media m set archived_at = v_now
  where m.product_id = v_draft.product_id
    and m.archived_at is null
    and not exists (
      select 1 from jsonb_array_elements(v_document -> 'media') item
      where item ->> 'id' = m.id::text
    );

  insert into public.product_media (
    id, product_id, variant_id, media_type, url, alt, width, height, role,
    sort_order, original_source_url, source_filename, palette_id,
    placeholder_palette, archived_at
  )
  select
    x.id, v_draft.product_id, x.variant_id, x.media_type, x.url, x.alt,
    x.width, x.height, x.role, x.sort_order, x.original_source_url,
    x.source_filename, x.palette_id, coalesce(x.placeholder_palette, '{}'::jsonb), null
  from jsonb_to_recordset(v_document -> 'media') as x(
    id uuid, variant_id uuid, media_type text, url text, alt text,
    width integer, height integer, role text, sort_order integer,
    original_source_url text, source_filename text, palette_id text,
    placeholder_palette jsonb
  )
  on conflict (id) do update set
    variant_id = excluded.variant_id,
    media_type = excluded.media_type,
    url = excluded.url,
    alt = excluded.alt,
    width = excluded.width,
    height = excluded.height,
    role = excluded.role,
    sort_order = excluded.sort_order,
    original_source_url = excluded.original_source_url,
    source_filename = excluded.source_filename,
    palette_id = excluded.palette_id,
    placeholder_palette = excluded.placeholder_palette,
    archived_at = null
  where (to_jsonb(product_media) - array['product_id', 'created_at', 'updated_at']::text[])
    is distinct from
    (to_jsonb(excluded) - array['product_id', 'created_at', 'updated_at']::text[]);

  update public.product_relationships r set archived_at = v_now
  where r.product_id = v_draft.product_id
    and r.archived_at is null
    and not exists (
      select 1 from jsonb_array_elements(v_document -> 'relationships') item
      where item ->> 'related_product_id' = r.related_product_id::text
        and item ->> 'relationship_type' = r.relationship_type
    );

  insert into public.product_relationships (
    product_id, related_product_id, relationship_type, sort_order, archived_at
  )
  select v_draft.product_id, x.related_product_id, x.relationship_type, x.sort_order, null
  from jsonb_to_recordset(v_document -> 'relationships') as x(
    related_product_id uuid, relationship_type text, sort_order integer
  )
  where x.related_product_id <> v_draft.product_id
    and exists (select 1 from public.products p where p.id = x.related_product_id)
  on conflict (product_id, related_product_id, relationship_type) do update set
    sort_order = excluded.sort_order,
    archived_at = null
  where row(product_relationships.sort_order, product_relationships.archived_at)
    is distinct from row(excluded.sort_order, null::timestamptz);

  if jsonb_typeof(v_document -> 'productSource') = 'object' then
    select * into v_source from jsonb_populate_record(
      null::public.product_sources, v_document -> 'productSource'
    );
    if v_source.product_id <> v_draft.product_id then
      raise exception 'invalid product source identity' using errcode = '23503';
    end if;
    update public.product_sources s set
      supplier_title = v_source.supplier_title,
      supplier_url = v_source.supplier_url,
      original_source_price_cents = v_source.original_source_price_cents,
      formulation_version_notes = v_source.formulation_version_notes
    where s.product_id = v_draft.product_id
      and row(
        s.supplier_title, s.supplier_url, s.original_source_price_cents,
        s.formulation_version_notes
      ) is distinct from row(
        v_source.supplier_title, v_source.supplier_url,
        v_source.original_source_price_cents,
        v_source.formulation_version_notes
      );
  end if;

  v_after := private.catalog_editor_document_v3(v_draft.product_id);
  v_products_changed := v_before -> 'product' is distinct from v_after -> 'product';
  v_pdp_changed := v_before -> 'productPdpContent' is distinct from v_after -> 'productPdpContent';
  v_variants_changed := v_before -> 'variants' is distinct from v_after -> 'variants';
  v_media_changed := v_before -> 'media' is distinct from v_after -> 'media';
  v_relationships_changed := v_before -> 'relationships' is distinct from v_after -> 'relationships';
  v_source_changed := v_before -> 'productSource' is distinct from v_after -> 'productSource';

  insert into public.catalog_product_revisions (
    product_id, revision_number, schema_version, document, source_draft_id,
    published_by, published_at
  ) values (
    v_draft.product_id, v_latest_revision + 1, 3, v_after, v_draft.id,
    p_actor_id, v_now
  ) returning * into v_revision;

  update public.product_content_drafts set
    schema_version = 3,
    document = v_after,
    status = 'published',
    version = version + 1,
    validation_errors = '[]'::jsonb,
    updated_by = p_actor_id,
    updated_at = v_now,
    published_at = v_now
  where id = v_draft.id
  returning * into v_draft;

  insert into public.catalog_editor_audit_log (
    action, actor_id, product_id, draft_id, revision_id, metadata
  ) values (
    'draft.published', p_actor_id, v_draft.product_id, v_draft.id,
    v_revision.id, jsonb_build_object(
      'revision', v_revision.revision_number,
      'schemaVersion', 3,
      'advancedChanges', p_change_audit,
      'changedTables', jsonb_build_object(
        'products', v_products_changed,
        'product_pdp_content', v_pdp_changed,
        'product_variants', v_variants_changed,
        'product_media', v_media_changed,
        'product_relationships', v_relationships_changed,
        'product_sources', v_source_changed
      )
    )
  );

  return jsonb_build_object(
    'ok', true,
    'draft', to_jsonb(v_draft),
    'revision', to_jsonb(v_revision),
    'changedTables', jsonb_build_object(
      'products', v_products_changed,
      'productPdpContent', v_pdp_changed,
      'variants', v_variants_changed,
      'media', v_media_changed,
      'relationships', v_relationships_changed,
      'productSource', v_source_changed
    )
  );
end;
$$;

revoke all on function public.publish_catalog_product_draft(
  uuid, bigint, uuid, text, jsonb
) from public, anon, authenticated;
grant execute on function public.publish_catalog_product_draft(
  uuid, bigint, uuid, text, jsonb
) to service_role;

comment on function private.catalog_editor_document_v3(uuid) is
  'Builds the complete normalized product editor V3 aggregate.';
comment on function private.catalog_editor_upgrade_v2_to_v3(jsonb) is
  'Upgrades semantic V2 revision content while restoring current immutable row metadata.';
comment on function public.publish_catalog_product_draft(uuid, bigint, uuid, text, jsonb) is
  'Atomically publishes role-validated V3 catalog aggregates and immutable revisions.';
