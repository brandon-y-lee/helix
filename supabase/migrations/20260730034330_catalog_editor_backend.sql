-- Server-owned catalog editor foundation.
-- Drafts and history are never exposed to browser roles. Canonical storefront
-- rows remain publicly readable only through their existing RLS policies.

create schema if not exists private;
revoke all on schema private from public;

alter table public.product_variants
  add column if not exists archived_at timestamptz;

alter table public.product_media
  add column if not exists archived_at timestamptz;

alter table public.product_relationships
  add column if not exists archived_at timestamptz;

alter table public.product_variants
  drop constraint if exists product_variants_product_id_variant_key_key;

create unique index if not exists product_variants_active_key_idx
  on public.product_variants (product_id, variant_key)
  where archived_at is null;

alter table public.product_media
  drop constraint if exists product_media_product_id_role_sort_order_key;

create unique index if not exists product_media_active_role_order_idx
  on public.product_media (product_id, role, sort_order)
  where archived_at is null;

create index if not exists product_variants_active_product_idx
  on public.product_variants (product_id, sort_order, position)
  where archived_at is null;

create index if not exists product_media_active_product_idx
  on public.product_media (product_id, role, sort_order)
  where archived_at is null;

create index if not exists product_relationships_active_product_idx
  on public.product_relationships (product_id, relationship_type, sort_order)
  where archived_at is null;

drop policy if exists "Public read active product variants"
  on public.product_variants;
create policy "Public read active product variants"
  on public.product_variants for select to anon, authenticated
  using (
    archived_at is null
    and exists (
      select 1
      from public.products
      where products.id = product_variants.product_id
        and products.catalog_status = 'active'
        and products.published_at <= now()
    )
  );

drop policy if exists "Public read active product media"
  on public.product_media;
create policy "Public read active product media"
  on public.product_media for select to anon, authenticated
  using (
    archived_at is null
    and exists (
      select 1
      from public.products
      where products.id = product_media.product_id
        and products.catalog_status = 'active'
        and products.published_at <= now()
    )
  );

drop policy if exists "Public read active product relationships"
  on public.product_relationships;
create policy "Public read active product relationships"
  on public.product_relationships for select to anon, authenticated
  using (
    archived_at is null
    and exists (
      select 1
      from public.products p
      where p.id = product_relationships.product_id
        and p.catalog_status = 'active'
        and p.published_at <= now()
    )
    and exists (
      select 1
      from public.products p
      where p.id = product_relationships.related_product_id
        and p.catalog_status = 'active'
        and p.published_at <= now()
    )
  );

create table public.admin_memberships (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null
    check (role in ('admin', 'catalog_publisher', 'catalog_editor')),
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger admin_memberships_set_updated_at
  before update on public.admin_memberships
  for each row execute function public.set_updated_at();

create table public.product_content_drafts (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  schema_version smallint not null default 1
    check (schema_version = 1),
  base_revision integer not null default 0
    check (base_revision >= 0),
  version bigint not null default 1
    check (version > 0),
  document jsonb not null
    check (
      jsonb_typeof(document) = 'object'
      and document ->> 'schemaVersion' = '1'
    ),
  status text not null default 'draft'
    check (status in ('draft', 'ready', 'published', 'discarded')),
  validation_errors jsonb not null default '[]'::jsonb
    check (jsonb_typeof(validation_errors) = 'array'),
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ready_at timestamptz,
  published_at timestamptz,
  discarded_at timestamptz
);

create unique index product_content_drafts_one_open_per_product_idx
  on public.product_content_drafts (product_id)
  where status in ('draft', 'ready');

create index product_content_drafts_product_history_idx
  on public.product_content_drafts (product_id, updated_at desc);

create table public.catalog_product_revisions (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  revision_number integer not null
    check (revision_number > 0),
  schema_version smallint not null default 1
    check (schema_version = 1),
  document jsonb not null
    check (
      jsonb_typeof(document) = 'object'
      and document ->> 'schemaVersion' = '1'
    ),
  source_draft_id uuid references public.product_content_drafts(id)
    on delete restrict,
  published_by uuid references auth.users(id) on delete set null,
  published_at timestamptz not null default now(),
  unique (product_id, revision_number)
);

create index catalog_product_revisions_product_history_idx
  on public.catalog_product_revisions (product_id, revision_number desc);

create table public.catalog_editor_audit_log (
  id uuid primary key default gen_random_uuid(),
  action text not null
    check (
      action in (
        'draft.created',
        'draft.saved',
        'draft.validated',
        'draft.ready',
        'draft.discarded',
        'draft.restored',
        'draft.published',
        'media.uploaded',
        'membership.created',
        'membership.updated'
      )
    ),
  actor_id uuid references auth.users(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  draft_id uuid references public.product_content_drafts(id) on delete set null,
  revision_id uuid references public.catalog_product_revisions(id)
    on delete set null,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create index catalog_editor_audit_product_idx
  on public.catalog_editor_audit_log (product_id, created_at desc);

create or replace function private.reject_catalog_history_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% is append-only', tg_table_name
    using errcode = '55000';
end;
$$;

create trigger catalog_product_revisions_append_only
  before update or delete on public.catalog_product_revisions
  for each row execute function private.reject_catalog_history_mutation();

create trigger catalog_editor_audit_log_append_only
  before update or delete on public.catalog_editor_audit_log
  for each row execute function private.reject_catalog_history_mutation();

alter table public.admin_memberships enable row level security;
alter table public.product_content_drafts enable row level security;
alter table public.catalog_product_revisions enable row level security;
alter table public.catalog_editor_audit_log enable row level security;

revoke all on table public.admin_memberships
  from public, anon, authenticated, service_role;
revoke all on table public.product_content_drafts
  from public, anon, authenticated, service_role;
revoke all on table public.catalog_product_revisions
  from public, anon, authenticated, service_role;
revoke all on table public.catalog_editor_audit_log
  from public, anon, authenticated, service_role;

grant select, insert, update
  on table public.admin_memberships to service_role;
grant select, insert, update
  on table public.product_content_drafts to service_role;
grant select, insert
  on table public.catalog_product_revisions to service_role;
grant select, insert
  on table public.catalog_editor_audit_log to service_role;

comment on table public.admin_memberships is
  'Server-resolved Mei Pelle admin role memberships. No browser access.';
comment on table public.product_content_drafts is
  'Versioned product editor working copies with optimistic concurrency.';
comment on table public.catalog_product_revisions is
  'Append-only normalized catalog snapshots created by atomic publication.';
comment on table public.catalog_editor_audit_log is
  'Append-only security and content audit events for catalog editor operations.';

create or replace function private.catalog_editor_document_v1(
  p_product_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'schemaVersion', 1,
    'productId', p.id,
    'product',
      to_jsonb(p)
      - array['id', 'created_at', 'updated_at', 'published_at']::text[],
    'productPdpContent',
      (
        select
          to_jsonb(pc)
          - array['product_id', 'created_at', 'updated_at']::text[]
        from public.product_pdp_content pc
        where pc.product_id = p.id
      ),
    'variants',
      coalesce(
        (
          select jsonb_agg(
            to_jsonb(v)
            - array['product_id', 'updated_at', 'archived_at']::text[]
            order by coalesce(v.sort_order, v.position), v.variant_key
          )
          from public.product_variants v
          where v.product_id = p.id
            and v.archived_at is null
        ),
        '[]'::jsonb
      ),
    'media',
      coalesce(
        (
          select jsonb_agg(
            to_jsonb(m)
            - array[
                'product_id',
                'created_at',
                'updated_at',
                'archived_at'
              ]::text[]
            order by m.role, m.sort_order, m.id
          )
          from public.product_media m
          where m.product_id = p.id
            and m.archived_at is null
        ),
        '[]'::jsonb
      ),
    'relationships',
      coalesce(
        (
          select jsonb_agg(
            to_jsonb(r)
            - array['product_id', 'created_at', 'archived_at']::text[]
            order by r.relationship_type, r.sort_order, r.related_product_id
          )
          from public.product_relationships r
          where r.product_id = p.id
            and r.archived_at is null
        ),
        '[]'::jsonb
      )
  )
  from public.products p
  where p.id = p_product_id;
$$;

revoke all on function private.catalog_editor_document_v1(uuid)
  from public, anon, authenticated, service_role;

create or replace function public.get_catalog_editor_document(
  p_product_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.catalog_editor_document_v1(p_product_id);
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
  perform 1
  from public.products
  where id = p_product_id
  for update;

  if not found then
    raise exception 'catalog product not found'
      using errcode = 'P0002';
  end if;

  select *
  into v_existing
  from public.product_content_drafts
  where product_id = p_product_id
    and status in ('draft', 'ready')
  for update;

  if found then
    return jsonb_build_object(
      'created', false,
      'draft', to_jsonb(v_existing)
    );
  end if;

  v_document := private.catalog_editor_document_v1(p_product_id);
  if v_document is null then
    raise exception 'catalog product document not found'
      using errcode = 'P0002';
  end if;

  select coalesce(max(revision_number), 0)
  into v_base_revision
  from public.catalog_product_revisions
  where product_id = p_product_id;

  insert into public.product_content_drafts (
    product_id,
    schema_version,
    base_revision,
    version,
    document,
    status,
    validation_errors,
    created_by,
    updated_by
  )
  values (
    p_product_id,
    1,
    v_base_revision,
    1,
    v_document,
    'draft',
    '[]'::jsonb,
    p_actor_id,
    p_actor_id
  )
  returning * into v_created;

  insert into public.catalog_editor_audit_log (
    action,
    actor_id,
    product_id,
    draft_id,
    metadata
  )
  values (
    'draft.created',
    p_actor_id,
    p_product_id,
    v_created.id,
    jsonb_build_object('baseRevision', v_base_revision)
  );

  return jsonb_build_object(
    'created', true,
    'draft', to_jsonb(v_created)
  );
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
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_draft public.product_content_drafts%rowtype;
begin
  select *
  into v_draft
  from public.product_content_drafts
  where id = p_draft_id
  for update;

  if not found then
    raise exception 'catalog draft not found'
      using errcode = 'P0002';
  end if;

  if v_draft.status not in ('draft', 'ready') then
    return jsonb_build_object(
      'ok', false,
      'code', 'draft_closed',
      'stored', jsonb_build_object(
        'id', v_draft.id,
        'version', v_draft.version,
        'status', v_draft.status,
        'updatedAt', v_draft.updated_at,
        'updatedBy', v_draft.updated_by
      )
    );
  end if;

  if v_draft.version <> p_expected_version then
    return jsonb_build_object(
      'ok', false,
      'code', 'version_conflict',
      'stored', jsonb_build_object(
        'id', v_draft.id,
        'version', v_draft.version,
        'status', v_draft.status,
        'updatedAt', v_draft.updated_at,
        'updatedBy', v_draft.updated_by
      )
    );
  end if;

  if jsonb_typeof(p_document) <> 'object'
     or p_document ->> 'schemaVersion' <> '1'
     or p_document ->> 'productId' <> v_draft.product_id::text
     or jsonb_typeof(p_document -> 'product') <> 'object'
     or jsonb_typeof(p_document -> 'variants') <> 'array'
     or jsonb_typeof(p_document -> 'media') <> 'array'
     or jsonb_typeof(p_document -> 'relationships') <> 'array'
  then
    raise exception 'invalid catalog editor document'
      using errcode = '22023';
  end if;

  update public.product_content_drafts
  set
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
    action,
    actor_id,
    product_id,
    draft_id,
    metadata
  )
  values (
    'draft.saved',
    p_actor_id,
    v_draft.product_id,
    v_draft.id,
    jsonb_build_object('version', v_draft.version)
  );

  return jsonb_build_object(
    'ok', true,
    'draft', to_jsonb(v_draft)
  );
end;
$$;

revoke all on function public.save_catalog_product_draft(
  uuid,
  bigint,
  jsonb,
  uuid
) from public, anon, authenticated;
grant execute on function public.save_catalog_product_draft(
  uuid,
  bigint,
  jsonb,
  uuid
) to service_role;

create or replace function public.transition_catalog_product_draft(
  p_draft_id uuid,
  p_expected_version bigint,
  p_action text,
  p_validation_errors jsonb,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_draft public.product_content_drafts%rowtype;
  v_audit_action text;
begin
  if p_action not in ('validate', 'ready', 'discard') then
    raise exception 'unsupported draft transition'
      using errcode = '22023';
  end if;

  if jsonb_typeof(p_validation_errors) <> 'array' then
    raise exception 'validation errors must be an array'
      using errcode = '22023';
  end if;

  select *
  into v_draft
  from public.product_content_drafts
  where id = p_draft_id
  for update;

  if not found then
    raise exception 'catalog draft not found'
      using errcode = 'P0002';
  end if;

  if v_draft.status not in ('draft', 'ready') then
    return jsonb_build_object(
      'ok', false,
      'code', 'draft_closed',
      'stored', jsonb_build_object(
        'version', v_draft.version,
        'status', v_draft.status,
        'updatedAt', v_draft.updated_at,
        'updatedBy', v_draft.updated_by
      )
    );
  end if;

  if v_draft.version <> p_expected_version then
    return jsonb_build_object(
      'ok', false,
      'code', 'version_conflict',
      'stored', jsonb_build_object(
        'version', v_draft.version,
        'status', v_draft.status,
        'updatedAt', v_draft.updated_at,
        'updatedBy', v_draft.updated_by
      )
    );
  end if;

  if p_action = 'ready' and jsonb_array_length(p_validation_errors) > 0 then
    return jsonb_build_object(
      'ok', false,
      'code', 'validation_failed',
      'validationErrors', p_validation_errors
    );
  end if;

  update public.product_content_drafts
  set
    status = case
      when p_action = 'ready' then 'ready'
      when p_action = 'discard' then 'discarded'
      else status
    end,
    validation_errors = p_validation_errors,
    version = version + 1,
    updated_by = p_actor_id,
    updated_at = now(),
    ready_at = case
      when p_action = 'ready' then now()
      when p_action = 'validate' and status = 'ready' then ready_at
      else null
    end,
    discarded_at = case
      when p_action = 'discard' then now()
      else discarded_at
    end
  where id = p_draft_id
  returning * into v_draft;

  v_audit_action := case p_action
    when 'validate' then 'draft.validated'
    when 'ready' then 'draft.ready'
    else 'draft.discarded'
  end;

  insert into public.catalog_editor_audit_log (
    action,
    actor_id,
    product_id,
    draft_id,
    metadata
  )
  values (
    v_audit_action,
    p_actor_id,
    v_draft.product_id,
    v_draft.id,
    jsonb_build_object(
      'version', v_draft.version,
      'validationErrorCount', jsonb_array_length(p_validation_errors)
    )
  );

  return jsonb_build_object(
    'ok', true,
    'draft', to_jsonb(v_draft)
  );
end;
$$;

revoke all on function public.transition_catalog_product_draft(
  uuid,
  bigint,
  text,
  jsonb,
  uuid
) from public, anon, authenticated;
grant execute on function public.transition_catalog_product_draft(
  uuid,
  bigint,
  text,
  jsonb,
  uuid
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
  v_base_revision integer;
begin
  select *
  into v_revision
  from public.catalog_product_revisions
  where id = p_revision_id;

  if not found then
    raise exception 'catalog revision not found'
      using errcode = 'P0002';
  end if;

  perform 1
  from public.products
  where id = v_revision.product_id
  for update;

  select *
  into v_existing
  from public.product_content_drafts
  where product_id = v_revision.product_id
    and status in ('draft', 'ready')
  for update;

  if found then
    return jsonb_build_object(
      'ok', false,
      'code', 'active_draft_exists',
      'stored', jsonb_build_object(
        'id', v_existing.id,
        'version', v_existing.version,
        'status', v_existing.status,
        'updatedAt', v_existing.updated_at,
        'updatedBy', v_existing.updated_by
      )
    );
  end if;

  select coalesce(max(revision_number), 0)
  into v_base_revision
  from public.catalog_product_revisions
  where product_id = v_revision.product_id;

  insert into public.product_content_drafts (
    product_id,
    schema_version,
    base_revision,
    version,
    document,
    status,
    validation_errors,
    created_by,
    updated_by
  )
  values (
    v_revision.product_id,
    v_revision.schema_version,
    v_base_revision,
    1,
    v_revision.document,
    'draft',
    '[]'::jsonb,
    p_actor_id,
    p_actor_id
  )
  returning * into v_created;

  insert into public.catalog_editor_audit_log (
    action,
    actor_id,
    product_id,
    draft_id,
    revision_id,
    metadata
  )
  values (
    'draft.restored',
    p_actor_id,
    v_revision.product_id,
    v_created.id,
    v_revision.id,
    jsonb_build_object(
      'restoredRevision', v_revision.revision_number,
      'baseRevision', v_base_revision
    )
  );

  return jsonb_build_object(
    'ok', true,
    'draft', to_jsonb(v_created)
  );
end;
$$;

revoke all on function public.restore_catalog_product_revision(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.restore_catalog_product_revision(uuid, uuid)
  to service_role;

create or replace function public.publish_catalog_product_draft(
  p_draft_id uuid,
  p_expected_version bigint,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_draft public.product_content_drafts%rowtype;
  v_document jsonb;
  v_product public.products%rowtype;
  v_pdp public.product_pdp_content%rowtype;
  v_item jsonb;
  v_latest_revision integer;
  v_revision public.catalog_product_revisions%rowtype;
  v_snapshot jsonb;
  v_now timestamptz := clock_timestamp();
  v_row_count integer;
  v_products_changed boolean := false;
  v_pdp_changed boolean := false;
  v_variants_changed boolean := false;
  v_media_changed boolean := false;
  v_relationships_changed boolean := false;
begin
  select *
  into v_draft
  from public.product_content_drafts
  where id = p_draft_id
  for update;

  if not found then
    raise exception 'catalog draft not found'
      using errcode = 'P0002';
  end if;

  if v_draft.status <> 'ready' then
    return jsonb_build_object(
      'ok', false,
      'code', 'draft_not_ready',
      'stored', jsonb_build_object(
        'version', v_draft.version,
        'status', v_draft.status,
        'updatedAt', v_draft.updated_at,
        'updatedBy', v_draft.updated_by
      )
    );
  end if;

  if v_draft.version <> p_expected_version then
    return jsonb_build_object(
      'ok', false,
      'code', 'version_conflict',
      'stored', jsonb_build_object(
        'version', v_draft.version,
        'status', v_draft.status,
        'updatedAt', v_draft.updated_at,
        'updatedBy', v_draft.updated_by
      )
    );
  end if;

  perform 1
  from public.products
  where id = v_draft.product_id
  for update;

  if not found then
    raise exception 'catalog product not found'
      using errcode = 'P0002';
  end if;

  select coalesce(max(revision_number), 0)
  into v_latest_revision
  from public.catalog_product_revisions
  where product_id = v_draft.product_id;

  if v_draft.base_revision <> v_latest_revision then
    return jsonb_build_object(
      'ok', false,
      'code', 'revision_conflict',
      'baseRevision', v_draft.base_revision,
      'latestRevision', v_latest_revision
    );
  end if;

  v_document := v_draft.document;
  if jsonb_typeof(v_document) <> 'object'
     or v_document ->> 'schemaVersion' <> '1'
     or v_document ->> 'productId' <> v_draft.product_id::text
     or jsonb_typeof(v_document -> 'product') <> 'object'
     or coalesce(jsonb_typeof(v_document -> 'productPdpContent'), 'null')
        not in ('object', 'null')
     or jsonb_typeof(v_document -> 'variants') <> 'array'
     or jsonb_typeof(v_document -> 'media') <> 'array'
     or jsonb_typeof(v_document -> 'relationships') <> 'array'
  then
    raise exception 'invalid catalog editor document'
      using errcode = '22023';
  end if;

  select *
  into v_product
  from jsonb_populate_record(
    null::public.products,
    v_document -> 'product'
  );

  if v_product.slug is null
     or v_product.slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
     or nullif(btrim(v_product.name), '') is null
     or nullif(btrim(v_product.tagline), '') is null
     or nullif(btrim(v_product.collection), '') is null
     or nullif(btrim(v_product.blurb), '') is null
     or nullif(btrim(v_product.description), '') is null
     or nullif(btrim(v_product.how_to_use), '') is null
     or nullif(btrim(v_product.swatch_from), '') is null
     or nullif(btrim(v_product.swatch_to), '') is null
     or v_product.currency <> 'USD'
     or v_product.catalog_status not in ('draft', 'active', 'archived')
     or v_product.status not in ('available', 'coming_soon', 'sold_out')
     or (
       v_product.seo_title is not null
       and char_length(v_product.seo_title) > 70
     )
     or (
       v_product.seo_description is not null
       and char_length(v_product.seo_description) > 170
     )
  then
    raise exception 'invalid editable product fields'
      using errcode = '22023';
  end if;

  if v_product.routine_group = 'core'
     and (
       upper(coalesce(v_product.display_name, v_product.name))
         not in ('CLEANSE', 'TREAT', 'SEAL')
       or v_product.routine_step_number is null
       or v_product.routine_step_number <= 0
     )
  then
    raise exception 'invalid Core product contract'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_document -> 'variants') item
    group by item ->> 'variant_key'
    having count(*) > 1
  ) then
    raise exception 'duplicate product variant keys'
      using errcode = '23505';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_document -> 'media') item
    group by item ->> 'role', item ->> 'sort_order'
    having count(*) > 1
  ) then
    raise exception 'duplicate product media role and order'
      using errcode = '23505';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_document -> 'relationships') item
    group by item ->> 'related_product_id', item ->> 'relationship_type'
    having count(*) > 1
  ) then
    raise exception 'duplicate product relationships'
      using errcode = '23505';
  end if;

  update public.products p
  set
    action_name = v_product.action_name,
    badge = v_product.badge,
    benefits = v_product.benefits,
    blurb = v_product.blurb,
    card_tagline = v_product.card_tagline,
    catalog_status = v_product.catalog_status,
    cautions = v_product.cautions,
    collection = v_product.collection,
    concerns = v_product.concerns,
    currency = v_product.currency,
    description = v_product.description,
    descriptor = v_product.descriptor,
    display_name = v_product.display_name,
    editorial_description = v_product.editorial_description,
    editorial_how_to_use = v_product.editorial_how_to_use,
    featured_rank = v_product.featured_rank,
    finish = v_product.finish,
    formal_title = v_product.formal_title,
    formula_notes = v_product.formula_notes,
    good_for = v_product.good_for,
    how_to_use = v_product.how_to_use,
    ingredients = v_product.ingredients,
    key_ingredients = v_product.key_ingredients,
    legacy_routine_display_label = v_product.legacy_routine_display_label,
    legacy_routine_group_label = v_product.legacy_routine_group_label,
    made_for = v_product.made_for,
    name = v_product.name,
    position = v_product.position,
    product_details = v_product.product_details,
    product_type = v_product.product_type,
    routine_display_label = v_product.routine_display_label,
    routine_group = v_product.routine_group,
    routine_group_label = v_product.routine_group_label,
    routine_number = v_product.routine_number,
    routine_order = v_product.routine_order,
    routine_sort = v_product.routine_sort,
    routine_step = v_product.routine_step,
    routine_step_name = v_product.routine_step_name,
    routine_step_number = v_product.routine_step_number,
    search_keywords = v_product.search_keywords,
    seo_description = v_product.seo_description,
    seo_title = v_product.seo_title,
    skin_types = v_product.skin_types,
    slug = v_product.slug,
    sort_order = v_product.sort_order,
    status = v_product.status,
    subtitle = v_product.subtitle,
    swatch_from = v_product.swatch_from,
    swatch_to = v_product.swatch_to,
    tagline = v_product.tagline,
    texture = v_product.texture,
    usage_time = v_product.usage_time,
    volume = v_product.volume,
    published_at = v_now
  where p.id = v_draft.product_id
    and row(
      p.action_name,
      p.badge,
      p.benefits,
      p.blurb,
      p.card_tagline,
      p.catalog_status,
      p.cautions,
      p.collection,
      p.concerns,
      p.currency,
      p.description,
      p.descriptor,
      p.display_name,
      p.editorial_description,
      p.editorial_how_to_use,
      p.featured_rank,
      p.finish,
      p.formal_title,
      p.formula_notes,
      p.good_for,
      p.how_to_use,
      p.ingredients,
      p.key_ingredients,
      p.legacy_routine_display_label,
      p.legacy_routine_group_label,
      p.made_for,
      p.name,
      p.position,
      p.product_details,
      p.product_type,
      p.routine_display_label,
      p.routine_group,
      p.routine_group_label,
      p.routine_number,
      p.routine_order,
      p.routine_sort,
      p.routine_step,
      p.routine_step_name,
      p.routine_step_number,
      p.search_keywords,
      p.seo_description,
      p.seo_title,
      p.skin_types,
      p.slug,
      p.sort_order,
      p.status,
      p.subtitle,
      p.swatch_from,
      p.swatch_to,
      p.tagline,
      p.texture,
      p.usage_time,
      p.volume
    ) is distinct from row(
      v_product.action_name,
      v_product.badge,
      v_product.benefits,
      v_product.blurb,
      v_product.card_tagline,
      v_product.catalog_status,
      v_product.cautions,
      v_product.collection,
      v_product.concerns,
      v_product.currency,
      v_product.description,
      v_product.descriptor,
      v_product.display_name,
      v_product.editorial_description,
      v_product.editorial_how_to_use,
      v_product.featured_rank,
      v_product.finish,
      v_product.formal_title,
      v_product.formula_notes,
      v_product.good_for,
      v_product.how_to_use,
      v_product.ingredients,
      v_product.key_ingredients,
      v_product.legacy_routine_display_label,
      v_product.legacy_routine_group_label,
      v_product.made_for,
      v_product.name,
      v_product.position,
      v_product.product_details,
      v_product.product_type,
      v_product.routine_display_label,
      v_product.routine_group,
      v_product.routine_group_label,
      v_product.routine_number,
      v_product.routine_order,
      v_product.routine_sort,
      v_product.routine_step,
      v_product.routine_step_name,
      v_product.routine_step_number,
      v_product.search_keywords,
      v_product.seo_description,
      v_product.seo_title,
      v_product.skin_types,
      v_product.slug,
      v_product.sort_order,
      v_product.status,
      v_product.subtitle,
      v_product.swatch_from,
      v_product.swatch_to,
      v_product.tagline,
      v_product.texture,
      v_product.usage_time,
      v_product.volume
    );

  get diagnostics v_row_count = row_count;
  v_products_changed := v_row_count > 0;

  if jsonb_typeof(v_document -> 'productPdpContent') = 'null'
     or v_document -> 'productPdpContent' is null
  then
    delete from public.product_pdp_content
    where product_id = v_draft.product_id;
    get diagnostics v_row_count = row_count;
    v_pdp_changed := v_row_count > 0;
  else
    select *
    into v_pdp
    from jsonb_populate_record(
      null::public.product_pdp_content,
      v_document -> 'productPdpContent'
    );

    if v_pdp.schema_version is distinct from 1 then
      raise exception 'invalid PDP content schema version'
        using errcode = '22023';
    end if;

    insert into public.product_pdp_content (
      product_id,
      schema_version,
      profile_title_tokens,
      routine_overlay,
      outcome_heading,
      outcome_labels,
      how_to_use_steps,
      application_steps,
      ingredient_cards,
      ingredient_story,
      routine_guidance
    )
    values (
      v_draft.product_id,
      v_pdp.schema_version,
      v_pdp.profile_title_tokens,
      v_pdp.routine_overlay,
      v_pdp.outcome_heading,
      v_pdp.outcome_labels,
      v_pdp.how_to_use_steps,
      v_pdp.application_steps,
      v_pdp.ingredient_cards,
      v_pdp.ingredient_story,
      v_pdp.routine_guidance
    )
    on conflict (product_id) do update
    set
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
    where row(
      product_pdp_content.schema_version,
      product_pdp_content.profile_title_tokens,
      product_pdp_content.routine_overlay,
      product_pdp_content.outcome_heading,
      product_pdp_content.outcome_labels,
      product_pdp_content.how_to_use_steps,
      product_pdp_content.application_steps,
      product_pdp_content.ingredient_cards,
      product_pdp_content.ingredient_story,
      product_pdp_content.routine_guidance
    ) is distinct from row(
      excluded.schema_version,
      excluded.profile_title_tokens,
      excluded.routine_overlay,
      excluded.outcome_heading,
      excluded.outcome_labels,
      excluded.how_to_use_steps,
      excluded.application_steps,
      excluded.ingredient_cards,
      excluded.ingredient_story,
      excluded.routine_guidance
    );

    get diagnostics v_row_count = row_count;
    v_pdp_changed := v_row_count > 0;
  end if;

  update public.product_variants v
  set
    archived_at = v_now,
    available = false,
    inventory_status = 'unavailable'
  where v.product_id = v_draft.product_id
    and v.archived_at is null
    and not exists (
      select 1
      from jsonb_array_elements(v_document -> 'variants') item
      where item ->> 'id' = v.id::text
    );
  get diagnostics v_row_count = row_count;
  v_variants_changed := v_row_count > 0;

  for v_item in
    select value
    from jsonb_array_elements(v_document -> 'variants')
  loop
    if v_item ->> 'id' is null
       or v_item ->> 'variant_key' is null
       or nullif(btrim(v_item ->> 'label'), '') is null
       or (v_item ->> 'price_cents')::integer < 0
       or (v_item ->> 'position')::integer < 0
       or (v_item ->> 'inventory_status')
          not in ('in_stock', 'low_stock', 'out_of_stock', 'unavailable')
    then
      raise exception 'invalid product variant'
        using errcode = '22023';
    end if;

    if exists (
      select 1
      from public.product_variants
      where id = (v_item ->> 'id')::uuid
        and product_id <> v_draft.product_id
    ) then
      raise exception 'variant belongs to another product'
        using errcode = '23503';
    end if;

    update public.product_variants v
    set
      variant_key = v_item ->> 'variant_key',
      label = v_item ->> 'label',
      price_cents = (v_item ->> 'price_cents')::integer,
      position = (v_item ->> 'position')::integer,
      sku = v_item ->> 'sku',
      supplier_variant_id = v_item ->> 'supplier_variant_id',
      option_values = coalesce(v_item -> 'option_values', '{}'::jsonb),
      compare_at_price_cents =
        nullif(v_item ->> 'compare_at_price_cents', '')::integer,
      available = coalesce((v_item ->> 'available')::boolean, true),
      inventory_status = v_item ->> 'inventory_status',
      volume = v_item ->> 'volume',
      pack_count = nullif(v_item ->> 'pack_count', '')::integer,
      sort_order = nullif(v_item ->> 'sort_order', '')::integer,
      archived_at = null
    where v.id = (v_item ->> 'id')::uuid
      and v.product_id = v_draft.product_id
      and row(
        v.variant_key,
        v.label,
        v.price_cents,
        v.position,
        v.sku,
        v.supplier_variant_id,
        v.option_values,
        v.compare_at_price_cents,
        v.available,
        v.inventory_status,
        v.volume,
        v.pack_count,
        v.sort_order,
        v.archived_at
      ) is distinct from row(
        v_item ->> 'variant_key',
        v_item ->> 'label',
        (v_item ->> 'price_cents')::integer,
        (v_item ->> 'position')::integer,
        v_item ->> 'sku',
        v_item ->> 'supplier_variant_id',
        coalesce(v_item -> 'option_values', '{}'::jsonb),
        nullif(v_item ->> 'compare_at_price_cents', '')::integer,
        coalesce((v_item ->> 'available')::boolean, true),
        v_item ->> 'inventory_status',
        v_item ->> 'volume',
        nullif(v_item ->> 'pack_count', '')::integer,
        nullif(v_item ->> 'sort_order', '')::integer,
        null::timestamptz
      );
    get diagnostics v_row_count = row_count;

    if v_row_count > 0 then
      v_variants_changed := true;
    elsif not exists (
      select 1
      from public.product_variants
      where id = (v_item ->> 'id')::uuid
        and product_id = v_draft.product_id
    ) then
      insert into public.product_variants (
        id,
        product_id,
        variant_key,
        label,
        price_cents,
        position,
        sku,
        supplier_variant_id,
        option_values,
        compare_at_price_cents,
        available,
        inventory_status,
        volume,
        pack_count,
        sort_order
      )
      values (
        (v_item ->> 'id')::uuid,
        v_draft.product_id,
        v_item ->> 'variant_key',
        v_item ->> 'label',
        (v_item ->> 'price_cents')::integer,
        (v_item ->> 'position')::integer,
        v_item ->> 'sku',
        v_item ->> 'supplier_variant_id',
        coalesce(v_item -> 'option_values', '{}'::jsonb),
        nullif(v_item ->> 'compare_at_price_cents', '')::integer,
        coalesce((v_item ->> 'available')::boolean, true),
        v_item ->> 'inventory_status',
        v_item ->> 'volume',
        nullif(v_item ->> 'pack_count', '')::integer,
        nullif(v_item ->> 'sort_order', '')::integer
      );
      v_variants_changed := true;
    end if;
  end loop;

  update public.product_media m
  set archived_at = v_now
  where m.product_id = v_draft.product_id
    and m.archived_at is null
    and not exists (
      select 1
      from jsonb_array_elements(v_document -> 'media') item
      where item ->> 'id' = m.id::text
    );
  get diagnostics v_row_count = row_count;
  v_media_changed := v_row_count > 0;

  for v_item in
    select value
    from jsonb_array_elements(v_document -> 'media')
  loop
    if v_item ->> 'id' is null
       or v_item ->> 'media_type' not in ('image', 'video')
       or v_item ->> 'media_kind' not in ('image', 'video', 'placeholder')
       or nullif(btrim(v_item ->> 'alt'), '') is null
       or (v_item ->> 'sort_order')::integer < 0
    then
      raise exception 'invalid product media'
        using errcode = '22023';
    end if;

    if exists (
      select 1
      from public.product_media
      where id = (v_item ->> 'id')::uuid
        and product_id <> v_draft.product_id
    ) then
      raise exception 'media belongs to another product'
        using errcode = '23503';
    end if;

    if v_item ->> 'variant_id' is not null
       and not exists (
         select 1
         from public.product_variants
         where id = (v_item ->> 'variant_id')::uuid
           and product_id = v_draft.product_id
           and archived_at is null
       )
    then
      raise exception 'media references an inactive product variant'
        using errcode = '23503';
    end if;

    update public.product_media m
    set
      variant_id = nullif(v_item ->> 'variant_id', '')::uuid,
      media_type = v_item ->> 'media_type',
      media_kind = v_item ->> 'media_kind',
      url = v_item ->> 'url',
      alt = v_item ->> 'alt',
      width = nullif(v_item ->> 'width', '')::integer,
      height = nullif(v_item ->> 'height', '')::integer,
      role = v_item ->> 'role',
      sort_order = (v_item ->> 'sort_order')::integer,
      palette_id = v_item ->> 'palette_id',
      placeholder_palette =
        coalesce(v_item -> 'placeholder_palette', '{}'::jsonb),
      original_source_url = v_item ->> 'original_source_url',
      source_filename = v_item ->> 'source_filename',
      archived_at = null
    where m.id = (v_item ->> 'id')::uuid
      and m.product_id = v_draft.product_id
      and row(
        m.variant_id,
        m.media_type,
        m.media_kind,
        m.url,
        m.alt,
        m.width,
        m.height,
        m.role,
        m.sort_order,
        m.palette_id,
        m.placeholder_palette,
        m.original_source_url,
        m.source_filename,
        m.archived_at
      ) is distinct from row(
        nullif(v_item ->> 'variant_id', '')::uuid,
        v_item ->> 'media_type',
        v_item ->> 'media_kind',
        v_item ->> 'url',
        v_item ->> 'alt',
        nullif(v_item ->> 'width', '')::integer,
        nullif(v_item ->> 'height', '')::integer,
        v_item ->> 'role',
        (v_item ->> 'sort_order')::integer,
        v_item ->> 'palette_id',
        coalesce(v_item -> 'placeholder_palette', '{}'::jsonb),
        v_item ->> 'original_source_url',
        v_item ->> 'source_filename',
        null::timestamptz
      );
    get diagnostics v_row_count = row_count;

    if v_row_count > 0 then
      v_media_changed := true;
    elsif not exists (
      select 1
      from public.product_media
      where id = (v_item ->> 'id')::uuid
        and product_id = v_draft.product_id
    ) then
      insert into public.product_media (
        id,
        product_id,
        variant_id,
        media_type,
        media_kind,
        url,
        alt,
        width,
        height,
        role,
        sort_order,
        palette_id,
        placeholder_palette,
        original_source_url,
        source_filename
      )
      values (
        (v_item ->> 'id')::uuid,
        v_draft.product_id,
        nullif(v_item ->> 'variant_id', '')::uuid,
        v_item ->> 'media_type',
        v_item ->> 'media_kind',
        v_item ->> 'url',
        v_item ->> 'alt',
        nullif(v_item ->> 'width', '')::integer,
        nullif(v_item ->> 'height', '')::integer,
        v_item ->> 'role',
        (v_item ->> 'sort_order')::integer,
        v_item ->> 'palette_id',
        coalesce(v_item -> 'placeholder_palette', '{}'::jsonb),
        v_item ->> 'original_source_url',
        v_item ->> 'source_filename'
      );
      v_media_changed := true;
    end if;
  end loop;

  update public.product_relationships r
  set archived_at = v_now
  where r.product_id = v_draft.product_id
    and r.archived_at is null
    and not exists (
      select 1
      from jsonb_array_elements(v_document -> 'relationships') item
      where item ->> 'related_product_id' = r.related_product_id::text
        and item ->> 'relationship_type' = r.relationship_type
    );
  get diagnostics v_row_count = row_count;
  v_relationships_changed := v_row_count > 0;

  for v_item in
    select value
    from jsonb_array_elements(v_document -> 'relationships')
  loop
    if v_item ->> 'related_product_id' is null
       or v_item ->> 'relationship_type'
          not in ('complete_the_routine', 'related', 'routine_next')
       or (v_item ->> 'sort_order')::integer < 0
       or (v_item ->> 'related_product_id')::uuid = v_draft.product_id
       or not exists (
         select 1
         from public.products
         where id = (v_item ->> 'related_product_id')::uuid
       )
    then
      raise exception 'invalid product relationship'
        using errcode = '22023';
    end if;

    insert into public.product_relationships (
      product_id,
      related_product_id,
      relationship_type,
      sort_order,
      archived_at
    )
    values (
      v_draft.product_id,
      (v_item ->> 'related_product_id')::uuid,
      v_item ->> 'relationship_type',
      (v_item ->> 'sort_order')::integer,
      null
    )
    on conflict (product_id, related_product_id, relationship_type) do update
    set
      sort_order = excluded.sort_order,
      archived_at = null
    where row(
      product_relationships.sort_order,
      product_relationships.archived_at
    ) is distinct from row(
      excluded.sort_order,
      null::timestamptz
    );
    get diagnostics v_row_count = row_count;
    if v_row_count > 0 then
      v_relationships_changed := true;
    end if;
  end loop;

  v_snapshot := private.catalog_editor_document_v1(v_draft.product_id);

  insert into public.catalog_product_revisions (
    product_id,
    revision_number,
    schema_version,
    document,
    source_draft_id,
    published_by,
    published_at
  )
  values (
    v_draft.product_id,
    v_latest_revision + 1,
    1,
    v_snapshot,
    v_draft.id,
    p_actor_id,
    v_now
  )
  returning * into v_revision;

  update public.product_content_drafts
  set
    document = v_snapshot,
    status = 'published',
    version = version + 1,
    validation_errors = '[]'::jsonb,
    updated_by = p_actor_id,
    updated_at = v_now,
    published_at = v_now
  where id = v_draft.id
  returning * into v_draft;

  insert into public.catalog_editor_audit_log (
    action,
    actor_id,
    product_id,
    draft_id,
    revision_id,
    metadata
  )
  values (
    'draft.published',
    p_actor_id,
    v_draft.product_id,
    v_draft.id,
    v_revision.id,
    jsonb_build_object(
      'revision', v_revision.revision_number,
      'changedTables', jsonb_build_object(
        'products', v_products_changed,
        'product_pdp_content', v_pdp_changed,
        'product_variants', v_variants_changed,
        'product_media', v_media_changed,
        'product_relationships', v_relationships_changed
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
      'relationships', v_relationships_changed
    )
  );
end;
$$;

revoke all on function public.publish_catalog_product_draft(
  uuid,
  bigint,
  uuid
) from public, anon, authenticated;
grant execute on function public.publish_catalog_product_draft(
  uuid,
  bigint,
  uuid
) to service_role;
