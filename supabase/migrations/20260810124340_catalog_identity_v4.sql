set lock_timeout = '10s';
set statement_timeout = '120s';

create table public.system_steps (
  name text primary key,
  position smallint not null unique
    check (position between 1 and 7),
  routine_group text not null
    check (routine_group in ('core', 'beyond_core')),
  constraint system_steps_name_routine_group_key
    unique (name, routine_group),
  constraint system_steps_name_check
    check (name in (
      'CLEANSE',
      'REFINE',
      'TREAT',
      'FRAME',
      'SEAL',
      'PROTECT',
      'LIFT'
    ))
);

insert into public.system_steps (name, position, routine_group)
values
  ('CLEANSE', 1, 'core'),
  ('REFINE', 2, 'beyond_core'),
  ('TREAT', 3, 'core'),
  ('FRAME', 4, 'beyond_core'),
  ('SEAL', 5, 'core'),
  ('PROTECT', 6, 'beyond_core'),
  ('LIFT', 7, 'beyond_core');

revoke all on table public.system_steps
  from public, anon, authenticated, service_role;
grant select on table public.system_steps to anon, authenticated, service_role;

alter table public.system_steps enable row level security;

create policy "Public read System Steps"
on public.system_steps
for select
to anon, authenticated
using (true);

alter table public.products
  add column system_step_name text;

update public.products p
set system_step_name = coalesce(
  (
    select s.name
    from public.system_steps s
    where s.name = upper(nullif(btrim(p.routine_step_name), ''))
      and s.routine_group = p.routine_group
  ),
  (
    select s.name
    from public.system_steps s
    where s.name = upper(nullif(btrim(p.display_name), ''))
      and s.routine_group = p.routine_group
  )
);

do $catalog_identity_preconditions$
declare
  v_unassigned text[];
begin
  select array_agg(p.slug order by p.slug)
  into v_unassigned
  from public.products p
  where p.catalog_status = 'active'
    and p.system_step_name is null;

  if v_unassigned is not null then
    raise exception
      'Catalog identity V4 requires a System Step for active Products: %',
      v_unassigned
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.products p
    join public.system_steps s on s.name = p.system_step_name
    where p.routine_group <> s.routine_group
  ) then
    raise exception
      'Catalog identity V4 found a Product Routine Group mismatch'
      using errcode = '23514';
  end if;

  if to_regprocedure(
    'private.catalog_editor_upgrade_v1_to_v2(jsonb)'
  ) is null
     or to_regprocedure(
       'private.catalog_editor_upgrade_v2_to_v3(jsonb)'
     ) is null
  then
    raise exception
      'Catalog identity V4 requires the historical revision adapters';
  end if;
end;
$catalog_identity_preconditions$;

alter table public.products
  add constraint products_system_step_routine_group_fkey
    foreign key (system_step_name, routine_group)
    references public.system_steps (name, routine_group)
    on update restrict
    on delete restrict,
  add constraint products_active_system_step_check
    check (catalog_status <> 'active' or system_step_name is not null);

create index products_system_step_name_idx
  on public.products (system_step_name);

create or replace function private.catalog_editor_document_v4(
  p_product_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'schemaVersion', 4,
    'productId', p.id,
    'product',
      to_jsonb(p)
      - array[
          'formal_title',
          'card_tagline',
          'routine_step_number',
          'routine_step_name'
        ]::text[],
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

revoke all on function private.catalog_editor_document_v4(uuid)
  from public, anon, authenticated, service_role;

create or replace function private.catalog_editor_upgrade_v3_to_v4(
  p_document jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_product_id uuid;
  v_current jsonb;
  v_product jsonb;
  v_step_name text;
  v_routine_group text;
begin
  if jsonb_typeof(p_document) <> 'object'
     or p_document ->> 'schemaVersion' <> '3'
     or (p_document ->> 'productId') is null
     or jsonb_typeof(p_document -> 'product') <> 'object'
  then
    raise exception 'invalid catalog editor V3 document'
      using errcode = '22023';
  end if;

  v_product_id := (p_document ->> 'productId')::uuid;
  v_current := private.catalog_editor_document_v4(v_product_id);
  if v_current is null then
    raise exception 'catalog product not found'
      using errcode = 'P0002';
  end if;

  v_step_name := upper(coalesce(
    nullif(btrim(p_document #>> '{product,system_step_name}'), ''),
    nullif(btrim(p_document #>> '{product,routine_step_name}'), ''),
    case
      when upper(p_document #>> '{product,display_name}') in (
        'CLEANSE',
        'REFINE',
        'TREAT',
        'FRAME',
        'SEAL',
        'PROTECT',
        'LIFT'
      )
      then p_document #>> '{product,display_name}'
    end,
    v_current #>> '{product,system_step_name}'
  ));

  select s.routine_group
  into v_routine_group
  from public.system_steps s
  where s.name = v_step_name;

  v_product :=
    (v_current -> 'product')
    || (
      (p_document -> 'product')
      - array[
          'formal_title',
          'card_tagline',
          'routine_step_number',
          'routine_step_name'
        ]::text[]
    )
    || jsonb_build_object(
      'id', v_product_id,
      'slug', v_current #> '{product,slug}',
      'currency', v_current #> '{product,currency}',
      'created_at', v_current #> '{product,created_at}',
      'published_at', v_current #> '{product,published_at}',
      'updated_at', v_current #> '{product,updated_at}',
      'system_step_name', to_jsonb(v_step_name),
      'routine_group', to_jsonb(coalesce(
        v_routine_group,
        v_current #>> '{product,routine_group}'
      ))
    );

  return jsonb_build_object(
    'schemaVersion', 4,
    'productId', v_product_id,
    'product', v_product,
    'productPdpContent', p_document -> 'productPdpContent',
    'variants', p_document -> 'variants',
    'media', p_document -> 'media',
    'relationships', p_document -> 'relationships',
    'productSource', coalesce(
      p_document -> 'productSource',
      v_current -> 'productSource'
    )
  );
end;
$$;

revoke all on function private.catalog_editor_upgrade_v3_to_v4(jsonb)
  from public, anon, authenticated, service_role;

create or replace function private.catalog_editor_upgrade_to_v4(
  p_document jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  return case p_document ->> 'schemaVersion'
    when '1' then private.catalog_editor_upgrade_v3_to_v4(
      private.catalog_editor_upgrade_v2_to_v3(
        private.catalog_editor_upgrade_v1_to_v2(p_document)
      )
    )
    when '2' then private.catalog_editor_upgrade_v3_to_v4(
      private.catalog_editor_upgrade_v2_to_v3(p_document)
    )
    when '3' then private.catalog_editor_upgrade_v3_to_v4(p_document)
    when '4' then p_document
    else null
  end;
end;
$$;

revoke all on function private.catalog_editor_upgrade_to_v4(jsonb)
  from public, anon, authenticated, service_role;

alter table public.product_content_drafts
  drop constraint if exists product_content_drafts_schema_version_check,
  drop constraint if exists product_content_drafts_document_check,
  drop constraint if exists product_content_drafts_current_schema_check;

update public.product_content_drafts
set
  document = private.catalog_editor_upgrade_to_v4(document),
  schema_version = 4
where status in ('draft', 'ready')
  and schema_version in (1, 2, 3);

alter table public.product_content_drafts
  alter column schema_version set default 4,
  add constraint product_content_drafts_schema_version_check
  check (schema_version in (1, 2, 3, 4)),
  add constraint product_content_drafts_document_check
  check (
    jsonb_typeof(document) = 'object'
    and (document ->> 'schemaVersion')::smallint = schema_version
    and schema_version in (1, 2, 3, 4)
    and (
      schema_version <> 4
      or not (
        (document -> 'product') ?| array[
          'formal_title',
          'card_tagline',
          'routine_step_number',
          'routine_step_name'
        ]
      )
    )
  ),
  add constraint product_content_drafts_current_schema_check
  check (status not in ('draft', 'ready') or schema_version = 4);

alter table public.catalog_product_revisions
  drop constraint if exists catalog_product_revisions_schema_version_check,
  drop constraint if exists catalog_product_revisions_document_check;

alter table public.catalog_product_revisions
  alter column schema_version set default 4,
  add constraint catalog_product_revisions_schema_version_check
  check (schema_version in (1, 2, 3, 4)),
  add constraint catalog_product_revisions_document_check
  check (
    jsonb_typeof(document) = 'object'
    and (document ->> 'schemaVersion')::smallint = schema_version
    and schema_version in (1, 2, 3, 4)
    and (
      schema_version <> 4
      or not (
        (document -> 'product') ?| array[
          'formal_title',
          'card_tagline',
          'routine_step_number',
          'routine_step_name'
        ]
      )
    )
  );

drop function private.catalog_editor_document_v2(uuid);

alter table public.products
  drop column formal_title,
  drop column card_tagline,
  drop column routine_step_number,
  drop column routine_step_name;

create or replace function public.get_catalog_editor_document(
  p_product_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.catalog_editor_document_v4(p_product_id);
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

  v_document := private.catalog_editor_document_v4(p_product_id);
  select coalesce(max(revision_number), 0) into v_base_revision
  from public.catalog_product_revisions where product_id = p_product_id;

  insert into public.product_content_drafts (
    product_id, schema_version, base_revision, version, document, status,
    validation_errors, created_by, updated_by
  ) values (
    p_product_id, 4, v_base_revision, 1, v_document, 'draft', '[]'::jsonb,
    p_actor_id, p_actor_id
  ) returning * into v_created;

  insert into public.catalog_editor_audit_log (
    action, actor_id, product_id, draft_id, metadata
  ) values (
    'draft.created', p_actor_id, p_product_id, v_created.id,
    jsonb_build_object('baseRevision', v_base_revision, 'schemaVersion', 4)
  );

  return jsonb_build_object('created', true, 'draft', to_jsonb(v_created));
end;
$$;

revoke all on function public.create_catalog_product_draft(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.create_catalog_product_draft(uuid, uuid)
  to service_role;

create or replace function public.save_catalog_product_draft(
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
     or p_document ->> 'schemaVersion' <> '4'
     or p_document ->> 'productId' <> v_draft.product_id::text
     or jsonb_typeof(p_document -> 'product') <> 'object'
     or (p_document -> 'product') ?| array[
       'formal_title',
       'card_tagline',
       'routine_step_number',
       'routine_step_name'
     ]
     or coalesce(
       jsonb_typeof(p_document -> 'productPdpContent'),
       'null'
     ) not in ('object', 'null')
     or jsonb_typeof(p_document -> 'variants') <> 'array'
     or jsonb_typeof(p_document -> 'media') <> 'array'
     or jsonb_typeof(p_document -> 'relationships') <> 'array'
     or coalesce(
       jsonb_typeof(p_document -> 'productSource'),
       'null'
     ) not in ('object', 'null')
  then
    raise exception 'invalid catalog editor V4 document' using errcode = '22023';
  end if;

  v_canonical := private.catalog_editor_document_v4(v_draft.product_id);
  if p_actor_role <> 'admin' and (
    (p_document -> 'product') - array[
      'display_name', 'product_type', 'editorial_description',
      'editorial_how_to_use', 'benefits', 'made_for', 'good_for', 'badge',
      'formula_notes', 'search_keywords', 'seo_title', 'seo_description'
    ]::text[]
    is distinct from
    (v_canonical -> 'product') - array[
      'display_name', 'product_type', 'editorial_description',
      'editorial_how_to_use', 'benefits', 'made_for', 'good_for', 'badge',
      'formula_notes', 'search_keywords', 'seo_title', 'seo_description'
    ]::text[]
    or p_document -> 'variants' is distinct from v_canonical -> 'variants'
    or p_document -> 'productSource'
      is distinct from v_canonical -> 'productSource'
  ) then
    raise exception 'catalog actor cannot save admin-only fields'
      using errcode = '42501';
  end if;

  update public.product_content_drafts
  set schema_version = 4,
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
    jsonb_build_object('version', v_draft.version, 'schemaVersion', 4)
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

  v_document := private.catalog_editor_upgrade_to_v4(v_revision.document);
  if v_document is null then
    raise exception 'unsupported catalog revision schema version %',
      v_revision.schema_version
      using errcode = '22023';
  end if;
  select coalesce(max(revision_number), 0) into v_base_revision
  from public.catalog_product_revisions
  where product_id = v_revision.product_id;

  insert into public.product_content_drafts (
    product_id, schema_version, base_revision, version, document, status,
    validation_errors, created_by, updated_by
  ) values (
    v_revision.product_id, 4, v_base_revision, 1, v_document, 'draft',
    '[]'::jsonb, p_actor_id, p_actor_id
  ) returning * into v_created;

  insert into public.catalog_editor_audit_log (
    action, actor_id, product_id, draft_id, revision_id, metadata
  ) values (
    'draft.restored', p_actor_id, v_revision.product_id, v_created.id,
    v_revision.id, jsonb_build_object(
      'restoredRevision', v_revision.revision_number,
      'restoredSchemaVersion', v_revision.schema_version,
      'draftSchemaVersion', 4,
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

create or replace function public.publish_catalog_product_draft(
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
    raise exception 'catalog change audit must be an array'
      using errcode = '22023';
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
  if v_draft.schema_version <> 4
     or v_document ->> 'schemaVersion' <> '4'
     or v_document ->> 'productId' <> v_draft.product_id::text
     or jsonb_typeof(v_document -> 'product') <> 'object'
     or (v_document -> 'product') ?| array[
       'formal_title',
       'card_tagline',
       'routine_step_number',
       'routine_step_name'
     ]
     or coalesce(
       jsonb_typeof(v_document -> 'productPdpContent'),
       'null'
     ) not in ('object', 'null')
     or jsonb_typeof(v_document -> 'variants') <> 'array'
     or jsonb_typeof(v_document -> 'media') <> 'array'
     or jsonb_typeof(v_document -> 'relationships') <> 'array'
     or coalesce(
       jsonb_typeof(v_document -> 'productSource'),
       'null'
     ) not in ('object', 'null')
  then
    raise exception 'invalid catalog editor V4 document' using errcode = '22023';
  end if;

  v_before := private.catalog_editor_document_v4(v_draft.product_id);
  if p_actor_role <> 'admin' and (
    (v_document -> 'product') - array[
      'display_name', 'product_type', 'editorial_description',
      'editorial_how_to_use', 'benefits', 'made_for', 'good_for', 'badge',
      'formula_notes', 'search_keywords', 'seo_title', 'seo_description'
    ]::text[]
    is distinct from
    (v_before -> 'product') - array[
      'display_name', 'product_type', 'editorial_description',
      'editorial_how_to_use', 'benefits', 'made_for', 'good_for', 'badge',
      'formula_notes', 'search_keywords', 'seo_title', 'seo_description'
    ]::text[]
    or v_document -> 'variants' is distinct from v_before -> 'variants'
    or v_document -> 'productSource'
      is distinct from v_before -> 'productSource'
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
     or nullif(btrim(v_product.product_type), '') is null
     or nullif(btrim(v_product.editorial_description), '') is null
     or nullif(btrim(v_product.editorial_how_to_use), '') is null
     or v_product.sort_order < 0
     or v_product.routine_sort < 0
     or v_product.routine_group not in ('core', 'beyond_core')
     or v_product.catalog_status not in ('draft', 'active', 'archived')
     or v_product.status not in ('available', 'coming_soon', 'sold_out')
     or (
       v_product.seo_title is not null
       and char_length(v_product.seo_title) > 70
     )
     or (
       v_product.seo_description is not null
       and char_length(v_product.seo_description) > 400
     )
  then
    raise exception 'invalid canonical product fields' using errcode = '22023';
  end if;

  if (
    v_product.catalog_status = 'active'
    and v_product.system_step_name is null
  ) or (
    v_product.system_step_name is not null
    and not exists (
      select 1
      from public.system_steps s
      where s.name = v_product.system_step_name
        and s.routine_group = v_product.routine_group
    )
  ) then
    raise exception 'invalid canonical System Step contract'
      using errcode = '22023';
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
    raise exception 'child row product identity is invalid'
      using errcode = '23503';
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
    raise exception 'child row belongs to another product'
      using errcode = '23503';
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
    system_step_name = v_product.system_step_name,
    routine_sort = v_product.routine_sort,
    published_at = v_now
  where p.id = v_draft.product_id
    and (
      to_jsonb(p)
      - array[
          'id', 'slug', 'currency', 'created_at', 'published_at', 'updated_at'
        ]::text[]
    ) is distinct from (
      (v_document -> 'product')
      - array[
          'id', 'slug', 'currency', 'created_at', 'published_at', 'updated_at'
        ]::text[]
    );

  if coalesce(
    jsonb_typeof(v_document -> 'productPdpContent'),
    'null'
  ) = 'null' then
    delete from public.product_pdp_content
    where product_id = v_draft.product_id;
  else
    select * into v_pdp from jsonb_populate_record(
      null::public.product_pdp_content,
      v_document -> 'productPdpContent'
    );
    if v_pdp.product_id <> v_draft.product_id
       or v_pdp.schema_version <> 1
    then
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
    where (
      to_jsonb(product_pdp_content)
      - array['product_id', 'created_at', 'updated_at']::text[]
    ) is distinct from (
      to_jsonb(excluded)
      - array['product_id', 'created_at', 'updated_at']::text[]
    );
  end if;

  update public.product_variants v set
    archived_at = v_now,
    available = false,
    inventory_status = 'unavailable'
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
  where (
    to_jsonb(product_variants)
    - array['product_id', 'updated_at']::text[]
  ) is distinct from (
    to_jsonb(excluded)
    - array['product_id', 'updated_at']::text[]
  );

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
    x.source_filename, x.palette_id,
    coalesce(x.placeholder_palette, '{}'::jsonb), null
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
  where (
    to_jsonb(product_media)
    - array['product_id', 'created_at', 'updated_at']::text[]
  ) is distinct from (
    to_jsonb(excluded)
    - array['product_id', 'created_at', 'updated_at']::text[]
  );

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
  select
    v_draft.product_id,
    x.related_product_id,
    x.relationship_type,
    x.sort_order,
    null
  from jsonb_to_recordset(v_document -> 'relationships') as x(
    related_product_id uuid, relationship_type text, sort_order integer
  )
  where x.related_product_id <> v_draft.product_id
    and exists (
      select 1
      from public.products p
      where p.id = x.related_product_id
    )
  on conflict (product_id, related_product_id, relationship_type) do update set
    sort_order = excluded.sort_order,
    archived_at = null
  where row(
    product_relationships.sort_order,
    product_relationships.archived_at
  ) is distinct from row(excluded.sort_order, null::timestamptz);

  if jsonb_typeof(v_document -> 'productSource') = 'object' then
    select * into v_source from jsonb_populate_record(
      null::public.product_sources,
      v_document -> 'productSource'
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

  v_after := private.catalog_editor_document_v4(v_draft.product_id);
  v_products_changed :=
    v_before -> 'product' is distinct from v_after -> 'product';
  v_pdp_changed :=
    v_before -> 'productPdpContent'
      is distinct from v_after -> 'productPdpContent';
  v_variants_changed :=
    v_before -> 'variants' is distinct from v_after -> 'variants';
  v_media_changed :=
    v_before -> 'media' is distinct from v_after -> 'media';
  v_relationships_changed :=
    v_before -> 'relationships' is distinct from v_after -> 'relationships';
  v_source_changed :=
    v_before -> 'productSource' is distinct from v_after -> 'productSource';

  insert into public.catalog_product_revisions (
    product_id, revision_number, schema_version, document, source_draft_id,
    published_by, published_at
  ) values (
    v_draft.product_id, v_latest_revision + 1, 4, v_after, v_draft.id,
    p_actor_id, v_now
  ) returning * into v_revision;

  update public.product_content_drafts set
    schema_version = 4,
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
      'schemaVersion', 4,
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

comment on table public.system_steps is
  'The governed seven-role skincare System and fixed System Positions.';
comment on column public.products.system_step_name is
  'The governed System Step fulfilled by this Product.';
comment on function private.catalog_editor_document_v4(uuid) is
  'Builds the current Product editor V4 aggregate.';
comment on function private.catalog_editor_upgrade_v3_to_v4(jsonb) is
  'Adapts a historical V3 aggregate to the current Product identity contract.';
comment on function public.publish_catalog_product_draft(
  uuid, bigint, uuid, text, jsonb
) is
  'Atomically publishes role-validated V4 Catalog aggregates and revisions.';
