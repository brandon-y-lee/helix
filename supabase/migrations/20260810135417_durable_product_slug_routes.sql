set lock_timeout = '10s';
set statement_timeout = '120s';

create table public.product_slug_routes (
  source_slug text primary key,
  source_product_id uuid not null
    references public.products (id) on update restrict on delete restrict,
  target_product_id uuid not null
    references public.products (id) on update restrict on delete restrict,
  route_kind text not null
    check (route_kind in ('canonical', 'rename', 'replacement')),
  created_at timestamptz not null default now(),
  constraint product_slug_routes_source_slug_check
    check (
      source_slug = btrim(source_slug)
      and source_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    ),
  constraint product_slug_routes_identity_check
    check (
      (
        route_kind in ('canonical', 'rename')
        and source_product_id = target_product_id
      ) or (
        route_kind = 'replacement'
        and source_product_id <> target_product_id
      )
    )
);

create index product_slug_routes_source_product_id_idx
  on public.product_slug_routes (source_product_id);
create index product_slug_routes_target_product_id_idx
  on public.product_slug_routes (target_product_id);
create unique index product_slug_routes_canonical_product_uidx
  on public.product_slug_routes (source_product_id)
  where route_kind = 'canonical';

revoke all on table public.product_slug_routes
  from public, anon, authenticated, service_role;
grant select on table public.product_slug_routes
  to anon, authenticated, service_role;

alter table public.product_slug_routes enable row level security;

create policy "Public read active Product slug routes"
on public.product_slug_routes
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.products target
    where target.id = target_product_id
      and target.catalog_status = 'active'
      and (
        target.published_at is null
        or target.published_at <= statement_timestamp()
      )
  )
);

insert into public.product_slug_routes (
  source_slug,
  source_product_id,
  target_product_id,
  route_kind
)
select p.slug, p.id, p.id, 'canonical'
from public.products p;

do $backfill_static_product_redirects$
declare
  v_cleanse_id uuid;
  v_treat_id uuid;
begin
  select id into v_cleanse_id
  from public.products
  where slug = 'cleanse-01-calming-gel-cleanser';

  select id into v_treat_id
  from public.products
  where slug = 'treat-03-pdrn-5-ampoule';

  if v_cleanse_id is null or v_treat_id is null then
    raise exception
      'Durable Product slug routes require every static redirect target'
      using errcode = '23503';
  end if;

  insert into public.product_slug_routes (
    source_slug,
    source_product_id,
    target_product_id,
    route_kind
  ) values
    (
      'reset-01-calming-gel-cleanser',
      v_cleanse_id,
      v_cleanse_id,
      'rename'
    ),
    (
      'recode-03-pdrn-5-ampoule',
      v_treat_id,
      v_treat_id,
      'rename'
    );
end;
$backfill_static_product_redirects$;

create or replace function private.validate_product_slug_route_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source public.products%rowtype;
  v_target public.products%rowtype;
begin
  if tg_op = 'UPDATE' and (
    new.source_slug <> old.source_slug
    or new.source_product_id <> old.source_product_id
    or new.created_at <> old.created_at
  ) then
    raise exception 'Product slug route provenance is immutable'
      using errcode = '55000';
  end if;

  if tg_op = 'UPDATE'
     and old.route_kind = 'replacement'
     and new.route_kind <> 'replacement'
  then
    raise exception 'Product replacement routes cannot be restored or renamed'
      using errcode = '55000';
  end if;

  select * into v_source
  from public.products
  where id = new.source_product_id;
  if not found then
    raise exception 'Product slug route source Product does not exist'
      using errcode = '23503';
  end if;

  select * into v_target
  from public.products
  where id = new.target_product_id;
  if not found then
    raise exception 'Product slug route target Product does not exist'
      using errcode = '23503';
  end if;

  if new.route_kind = 'canonical' and (
    new.source_product_id <> new.target_product_id
    or new.source_slug <> v_source.slug
  ) then
    raise exception 'Canonical Product slug route does not match its Product'
      using errcode = '23514';
  end if;

  if new.route_kind = 'rename' and (
    new.source_product_id <> new.target_product_id
    or new.source_slug = v_source.slug
  ) then
    raise exception 'Historical Product rename route is not historical'
      using errcode = '23514';
  end if;

  if new.route_kind = 'replacement' and (
    new.source_product_id = new.target_product_id
    or v_source.catalog_status <> 'archived'
    or v_target.catalog_status <> 'active'
  ) then
    raise exception
      'Product replacement requires an Archived source and Active target'
      using errcode = '23514';
  end if;

  if new.route_kind <> 'canonical' and exists (
    select 1
    from public.products p
    where p.slug = new.source_slug
      and p.catalog_status = 'active'
  ) then
    raise exception 'Historical Product slug collides with an active canonical slug'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function private.validate_product_slug_route_row()
  from public, anon, authenticated, service_role;

create trigger validate_product_slug_route_row
before insert or update on public.product_slug_routes
for each row execute function private.validate_product_slug_route_row();

create or replace function private.forbid_product_slug_route_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'product_slug_routes is append-only'
    using errcode = '55000';
end;
$$;

revoke all on function private.forbid_product_slug_route_delete()
  from public, anon, authenticated, service_role;

create trigger product_slug_routes_append_only
before delete on public.product_slug_routes
for each row execute function private.forbid_product_slug_route_delete();

create or replace function private.sync_product_slug_route()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_changed integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('mei-pelle-product-slug-routes', 0)
  );

  if tg_op = 'INSERT' then
    insert into public.product_slug_routes (
      source_slug,
      source_product_id,
      target_product_id,
      route_kind
    ) values (
      new.slug,
      new.id,
      new.id,
      'canonical'
    );
    return new;
  end if;

  update public.product_slug_routes
  set route_kind = 'rename'
  where source_slug = old.slug
    and source_product_id = old.id
    and target_product_id = old.id
    and route_kind = 'canonical';
  get diagnostics v_changed = row_count;
  if v_changed <> 1 then
    raise exception 'Product is missing its canonical slug route'
      using errcode = '23514';
  end if;

  insert into public.product_slug_routes (
    source_slug,
    source_product_id,
    target_product_id,
    route_kind
  ) values (
    new.slug,
    new.id,
    new.id,
    'canonical'
  );

  return new;
end;
$$;

revoke all on function private.sync_product_slug_route()
  from public, anon, authenticated, service_role;

create trigger sync_inserted_product_slug_route
after insert on public.products
for each row execute function private.sync_product_slug_route();

create trigger sync_updated_product_slug_route
after update of slug on public.products
for each row
when (old.slug is distinct from new.slug)
execute function private.sync_product_slug_route();

create or replace function public.resolve_product_slug(
  p_source_slug text
)
returns table (
  source_slug text,
  target_slug text,
  target_product_id uuid,
  route_kind text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    route.source_slug,
    target.slug,
    target.id,
    route.route_kind
  from public.product_slug_routes route
  join public.products target on target.id = route.target_product_id
  where route.source_slug = p_source_slug
    and target.catalog_status = 'active'
    and (
      target.published_at is null
      or target.published_at <= statement_timestamp()
    );
$$;

revoke all on function public.resolve_product_slug(text)
  from public, anon, authenticated, service_role;
grant execute on function public.resolve_product_slug(text)
  to anon, authenticated, service_role;

create or replace function public.replace_catalog_product_slug(
  p_source_product_id uuid,
  p_target_product_id uuid,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source public.products%rowtype;
  v_target public.products%rowtype;
  v_actor_role text;
  v_changed integer;
begin
  if p_source_product_id = p_target_product_id then
    raise exception 'Product replacement cannot target itself'
      using errcode = '23514';
  end if;

  select role into v_actor_role
  from public.admin_memberships
  where user_id = p_actor_id and active;
  if v_actor_role <> 'admin' then
    raise exception 'Only a Catalog Administrator can publish a replacement'
      using errcode = '42501';
  end if;

  perform 1
  from public.products
  where id in (p_source_product_id, p_target_product_id)
  order by id
  for update;

  select * into v_source
  from public.products
  where id = p_source_product_id;
  if not found then
    raise exception 'Replacement source Product does not exist'
      using errcode = '23503';
  end if;

  select * into v_target
  from public.products
  where id = p_target_product_id;
  if not found then
    raise exception 'Replacement target Product does not exist'
      using errcode = '23503';
  end if;

  if v_source.catalog_status <> 'archived'
     or v_target.catalog_status <> 'active'
  then
    raise exception
      'Product replacement requires an Archived source and Active target'
      using errcode = '23514';
  end if;

  if not exists (
    select 1
    from public.product_slug_routes route
    where route.source_product_id = p_target_product_id
      and route.target_product_id = p_target_product_id
      and route.source_slug = v_target.slug
      and route.route_kind = 'canonical'
  ) then
    raise exception 'Replacement target is not canonical'
      using errcode = '23514';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('mei-pelle-product-slug-routes', 0)
  );

  update public.product_slug_routes
  set
    target_product_id = p_target_product_id,
    route_kind = 'replacement'
  where target_product_id = p_source_product_id;
  get diagnostics v_changed = row_count;
  if v_changed = 0 then
    raise exception 'Replacement source has no durable slug routes'
      using errcode = '23514';
  end if;

  insert into public.catalog_editor_audit_log (
    action,
    actor_id,
    product_id,
    metadata
  ) values (
    'slug.replacement.published',
    p_actor_id,
    p_target_product_id,
    jsonb_build_object(
      'sourceProductId', p_source_product_id,
      'sourceSlug', v_source.slug,
      'targetProductId', p_target_product_id,
      'targetSlug', v_target.slug,
      'flattenedRoutes', v_changed
    )
  );

  return jsonb_build_object(
    'ok', true,
    'sourceProductId', p_source_product_id,
    'sourceSlug', v_source.slug,
    'targetProductId', p_target_product_id,
    'targetSlug', v_target.slug,
    'flattenedRoutes', v_changed
  );
end;
$$;

revoke all on function public.replace_catalog_product_slug(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.replace_catalog_product_slug(uuid, uuid, uuid)
  to service_role;

alter function public.publish_catalog_product_draft(
  uuid, bigint, uuid, text, jsonb
) rename to publish_catalog_product_draft_v4;

revoke all on function public.publish_catalog_product_draft_v4(
  uuid, bigint, uuid, text, jsonb
) from public, anon, authenticated, service_role;

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
  v_current_slug text;
  v_requested_slug text;
  v_actor_role text;
  v_latest_revision integer;
  v_slug_changed boolean;
  v_result jsonb;
begin
  select * into v_draft
  from public.product_content_drafts
  where id = p_draft_id
  for update;
  if not found then
    raise exception 'catalog draft not found' using errcode = 'P0002';
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

  select role into v_actor_role
  from public.admin_memberships
  where user_id = p_actor_id and active;
  if v_actor_role is null
     or v_actor_role <> p_actor_role
     or v_actor_role not in ('catalog_publisher', 'admin')
  then
    raise exception 'catalog actor cannot publish' using errcode = '42501';
  end if;

  select p.slug into v_current_slug
  from public.products p
  where p.id = v_draft.product_id
  for update;
  if not found then
    raise exception 'catalog product not found' using errcode = 'P0002';
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

  v_requested_slug := v_draft.document #>> '{product,slug}';
  if v_requested_slug is null
     or v_requested_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  then
    raise exception 'invalid canonical Product slug' using errcode = '22023';
  end if;

  v_slug_changed := v_requested_slug <> v_current_slug;
  if v_slug_changed and p_actor_role <> 'admin' then
    raise exception 'Only a Catalog Administrator can change a Product slug'
      using errcode = '42501';
  end if;

  if v_slug_changed then
    perform pg_catalog.set_config(
      'mei_pelle.catalog_actor_id',
      p_actor_id::text,
      true
    );
    update public.products
    set slug = v_requested_slug
    where id = v_draft.product_id;
  end if;

  v_result := public.publish_catalog_product_draft_v4(
    p_draft_id,
    p_expected_version,
    p_actor_id,
    p_actor_role,
    p_change_audit
  );

  if v_slug_changed and v_result ->> 'ok' = 'true' then
    v_result := jsonb_set(
      jsonb_set(
        v_result,
        '{changedTables,products}',
        'true'::jsonb,
        true
      ),
      '{changedTables,productSlugRoutes}',
      'true'::jsonb,
      true
    );

    insert into public.catalog_editor_audit_log (
      action,
      actor_id,
      product_id,
      draft_id,
      revision_id,
      metadata
    ) values (
      'slug.rename.published',
      p_actor_id,
      v_draft.product_id,
      p_draft_id,
      (v_result #>> '{revision,id}')::uuid,
      jsonb_build_object(
        'sourceSlug', v_current_slug,
        'targetSlug', v_requested_slug,
        'routeKind', 'rename',
        'revision', (v_result #>> '{revision,revision_number}')::integer,
        'changedTables', jsonb_build_object(
          'products', true,
          'product_slug_routes', true
        )
      )
    );
  else
    v_result := jsonb_set(
      v_result,
      '{changedTables,productSlugRoutes}',
      'false'::jsonb,
      true
    );
  end if;

  return v_result;
end;
$$;

revoke all on function public.publish_catalog_product_draft(
  uuid, bigint, uuid, text, jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.publish_catalog_product_draft(
  uuid, bigint, uuid, text, jsonb
) to service_role;

comment on table public.product_slug_routes is
  'Append-only Product URL registry for canonical slugs, renames, and explicit replacements.';
comment on function public.resolve_product_slug(text) is
  'Resolves one public Product slug directly to its active canonical Product slug.';
comment on function public.replace_catalog_product_slug(uuid, uuid, uuid) is
  'Publishes an audited explicit replacement and flattens every prior source route.';
comment on function public.publish_catalog_product_draft(
  uuid, bigint, uuid, text, jsonb
) is
  'Atomically publishes V4 Catalog drafts and preserves prior Product slugs as durable routes.';
