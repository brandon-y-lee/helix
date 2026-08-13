set lock_timeout = '10s';
set statement_timeout = '120s';

create table public.product_families (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  display_name text not null,
  system_step_name text not null
    references public.system_steps (name) on update restrict on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_families_slug_check check (
    slug = btrim(slug)
    and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  ),
  constraint product_families_display_name_check check (
    nullif(btrim(display_name), '') is not null
  )
);

create table public.product_family_memberships (
  family_id uuid not null
    references public.product_families (id) on update restrict on delete restrict,
  product_id uuid not null
    references public.products (id) on update restrict on delete restrict,
  option_label text not null,
  sort_order smallint not null check (sort_order >= 0),
  is_entry boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (family_id, product_id),
  unique (product_id),
  unique (family_id, sort_order),
  constraint product_family_memberships_option_label_check check (
    nullif(btrim(option_label), '') is not null
  )
);

create unique index product_family_single_entry_uidx
  on public.product_family_memberships (family_id)
  where is_entry;

comment on table public.product_families is
  'Governed storefront families whose Products share one System Step.';
comment on column public.product_families.slug is
  'Stable family identity used by catalog tooling, cache tags, and search.';
comment on column public.product_families.display_name is
  'Customer-facing family label rendered by the PDP purchase island.';
comment on column public.product_families.system_step_name is
  'System Step that every Product in the family must share.';

comment on table public.product_family_memberships is
  'Ordered Product options for one family, with exactly one entry Product.';
comment on column public.product_family_memberships.option_label is
  'Customer-facing selector label such as General or Exfoliating.';
comment on column public.product_family_memberships.sort_order is
  'Zero-based selector order, unique within the family.';
comment on column public.product_family_memberships.is_entry is
  'True only for the family Product shown on generic collection surfaces.';

create trigger product_families_set_updated_at
before update on public.product_families
for each row execute function public.set_updated_at();

create trigger product_family_memberships_set_updated_at
before update on public.product_family_memberships
for each row execute function public.set_updated_at();

revoke all on table public.product_families from public, anon, authenticated, service_role;
revoke all on table public.product_family_memberships from public, anon, authenticated, service_role;

grant select on table public.product_families to anon, authenticated, service_role;
grant select on table public.product_family_memberships to anon, authenticated, service_role;
grant insert, update, delete on table public.product_families to service_role;
grant insert, update, delete on table public.product_family_memberships to service_role;

alter table public.catalog_editor_audit_log
  drop constraint catalog_editor_audit_log_action_check;

alter table public.catalog_editor_audit_log
  add constraint catalog_editor_audit_log_action_check
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
      'membership.updated',
      'slug.rename.published',
      'slug.replacement.published',
      'family.published'
    )
  );

alter table public.product_families enable row level security;
alter table public.product_family_memberships enable row level security;

create policy "Public read eligible Product Families"
on public.product_families
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.product_family_memberships membership
    join public.products product on product.id = membership.product_id
    where membership.family_id = product_families.id
      and product.catalog_status = 'active'
      and (
        product.published_at is null
        or product.published_at <= statement_timestamp()
      )
  )
);

create policy "Public read eligible Product Family Memberships"
on public.product_family_memberships
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.products product
    where product.id = product_family_memberships.product_id
      and product.catalog_status = 'active'
      and (
        product.published_at is null
        or product.published_at <= statement_timestamp()
      )
  )
);

create function private.enforce_product_family_invariants()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_family_id uuid;
  v_family_ids uuid[];
begin
  if tg_table_name = 'product_families' then
    v_family_ids := array[coalesce(new.id, old.id)];
  elsif tg_table_name = 'product_family_memberships' then
    v_family_ids := case tg_op
      when 'INSERT' then array[new.family_id]
      when 'DELETE' then array[old.family_id]
      else array[old.family_id, new.family_id]
    end;
  elsif tg_table_name = 'products' then
    select coalesce(array_agg(membership.family_id), array[]::uuid[])
    into v_family_ids
    from public.product_family_memberships membership
    where membership.product_id = coalesce(new.id, old.id);
  else
    return null;
  end if;

  for v_family_id in
    select distinct family_id
    from unnest(v_family_ids) as family_id
    where family_id is not null
  loop
    if not exists (
      select 1 from public.product_families where id = v_family_id
    ) then
      continue;
    end if;

    if (
      select count(*) filter (where membership.is_entry)
      from public.product_family_memberships membership
      where membership.family_id = v_family_id
    ) <> 1 then
      raise exception 'Product Family requires exactly one entry Product'
        using errcode = '23514';
    end if;

    if exists (
      select 1
      from public.product_family_memberships membership
      join public.product_families family on family.id = membership.family_id
      join public.products product on product.id = membership.product_id
      where membership.family_id = v_family_id
        and product.system_step_name is distinct from family.system_step_name
    ) then
      raise exception 'Product Family members must share one System Step'
        using errcode = '23514';
    end if;
  end loop;

  return null;
end;
$$;

revoke all on function private.enforce_product_family_invariants()
  from public, anon, authenticated, service_role;

create constraint trigger enforce_product_family_row_invariants
after insert or update on public.product_families
deferrable initially deferred
for each row execute function private.enforce_product_family_invariants();

create constraint trigger enforce_product_family_membership_invariants
after insert or update or delete on public.product_family_memberships
deferrable initially deferred
for each row execute function private.enforce_product_family_invariants();

create constraint trigger enforce_product_family_product_invariants
after update on public.products
deferrable initially deferred
for each row execute function private.enforce_product_family_invariants();

create function private.catalog_editor_product_family(p_product_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select (
    select jsonb_build_object(
      'family', to_jsonb(family),
      'memberships', coalesce((
        select jsonb_agg(
          to_jsonb(member)
          order by member.sort_order, member.product_id
        )
        from public.product_family_memberships member
        where member.family_id = family.id
      ), '[]'::jsonb)
    )
    from public.product_family_memberships current_member
    join public.product_families family
      on family.id = current_member.family_id
    where current_member.product_id = p_product_id
  );
$$;

revoke all on function private.catalog_editor_product_family(uuid)
  from public, anon, authenticated, service_role;

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
    ),
    'productFamily', private.catalog_editor_product_family(p.id)
  )
  from public.products p
  where p.id = p_product_id;
$$;

revoke all on function private.catalog_editor_document_v4(uuid)
  from public, anon, authenticated, service_role;

alter function private.catalog_editor_upgrade_to_v4(jsonb)
  rename to catalog_editor_upgrade_to_v4_without_family;

revoke all on function private.catalog_editor_upgrade_to_v4_without_family(jsonb)
  from public, anon, authenticated, service_role;

create function private.catalog_editor_upgrade_to_v4(p_document jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_document jsonb;
begin
  v_document := private.catalog_editor_upgrade_to_v4_without_family(p_document);
  if v_document is null then
    return null;
  end if;

  return v_document || jsonb_build_object(
    'productFamily',
    private.catalog_editor_product_family((v_document ->> 'productId')::uuid)
  );
end;
$$;

revoke all on function private.catalog_editor_upgrade_to_v4(jsonb)
  from public, anon, authenticated, service_role;

update public.product_content_drafts
set document = document || jsonb_build_object(
  'productFamily',
  private.catalog_editor_product_family(product_id)
)
where status in ('draft', 'ready')
  and schema_version = 4;

alter function public.save_catalog_product_draft(
  uuid, bigint, jsonb, uuid, text
) rename to save_catalog_product_draft_without_family;

revoke all on function public.save_catalog_product_draft_without_family(
  uuid, bigint, jsonb, uuid, text
) from public, anon, authenticated, service_role;

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
  v_current_family jsonb;
begin
  select * into v_draft
  from public.product_content_drafts
  where id = p_draft_id;
  if not found then
    raise exception 'catalog draft not found' using errcode = 'P0002';
  end if;

  if not (p_document ? 'productFamily')
     or coalesce(jsonb_typeof(p_document -> 'productFamily'), 'null')
       not in ('object', 'null')
  then
    raise exception 'invalid Product Family document' using errcode = '22023';
  end if;

  v_current_family := private.catalog_editor_product_family(
    v_draft.product_id
  );
  if p_document -> 'productFamily' is distinct from v_current_family
     and p_actor_role <> 'admin'
  then
    raise exception 'catalog actor cannot save Product Family fields'
      using errcode = '42501';
  end if;

  return public.save_catalog_product_draft_without_family(
    p_draft_id,
    p_expected_version,
    p_document,
    p_actor_id,
    p_actor_role
  );
end;
$$;

revoke all on function public.save_catalog_product_draft(
  uuid, bigint, jsonb, uuid, text
) from public, anon, authenticated, service_role;
grant execute on function public.save_catalog_product_draft(
  uuid, bigint, jsonb, uuid, text
) to service_role;

alter function public.publish_catalog_product_draft_v4(
  uuid, bigint, uuid, text, jsonb
) rename to publish_catalog_product_draft_v4_without_family;

revoke all on function public.publish_catalog_product_draft_v4_without_family(
  uuid, bigint, uuid, text, jsonb
) from public, anon, authenticated, service_role;

create function public.publish_catalog_product_draft_v4(
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
  v_actor_role text;
  v_latest_revision integer;
  v_requested_family jsonb;
  v_family_before jsonb;
  v_family_after jsonb;
  v_family public.product_families%rowtype;
  v_existing_family_id uuid;
  v_family_changed boolean;
  v_result jsonb;
  v_now timestamptz := clock_timestamp();
begin
  select role into v_actor_role
  from public.admin_memberships
  where user_id = p_actor_id and active;
  if v_actor_role is null
     or v_actor_role <> p_actor_role
     or v_actor_role not in ('catalog_publisher', 'admin')
  then
    raise exception 'catalog actor cannot publish' using errcode = '42501';
  end if;

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

  perform 1
  from public.products
  where id = v_draft.product_id
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

  if not (v_draft.document ? 'productFamily')
     or coalesce(
       jsonb_typeof(v_draft.document -> 'productFamily'),
       'null'
     ) not in ('object', 'null')
  then
    raise exception 'invalid Product Family document' using errcode = '22023';
  end if;

  v_requested_family := v_draft.document -> 'productFamily';
  v_family_before := private.catalog_editor_product_family(
    v_draft.product_id
  );
  v_family_changed := v_requested_family is distinct from v_family_before;
  if v_family_changed and p_actor_role <> 'admin' then
    raise exception 'catalog actor cannot publish Product Family fields'
      using errcode = '42501';
  end if;

  if v_family_changed and jsonb_typeof(v_requested_family) = 'null' then
    v_existing_family_id := (
      v_family_before #>> '{family,id}'
    )::uuid;
    if v_existing_family_id is not null then
      delete from public.product_family_memberships
      where family_id = v_existing_family_id;
      delete from public.product_families
      where id = v_existing_family_id;
    end if;
  elsif v_family_changed then
    if jsonb_typeof(v_requested_family -> 'family') <> 'object'
       or jsonb_typeof(v_requested_family -> 'memberships') <> 'array'
    then
      raise exception 'invalid Product Family aggregate' using errcode = '22023';
    end if;

    select * into v_family
    from jsonb_populate_record(
      null::public.product_families,
      v_requested_family -> 'family'
    );
    if v_family.id is null
       or v_family.slug is null
       or v_family.slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
       or nullif(btrim(v_family.display_name), '') is null
       or v_family.system_step_name is null
       or v_family.system_step_name
         <> v_draft.document #>> '{product,system_step_name}'
       or jsonb_array_length(v_requested_family -> 'memberships') = 0
    then
      raise exception 'invalid Product Family fields' using errcode = '22023';
    end if;

    if v_family_before is not null
       and v_family_before #>> '{family,id}' <> v_family.id::text
    then
      raise exception 'A Product cannot move between Product Families in one draft'
        using errcode = '23514';
    end if;

    if (
      select count(*)
      from jsonb_array_elements(v_requested_family -> 'memberships') member
      where (member ->> 'is_entry')::boolean
    ) <> 1
       or not exists (
         select 1
         from jsonb_array_elements(v_requested_family -> 'memberships') member
         where member ->> 'product_id' = v_draft.product_id::text
       )
       or exists (
         select 1
         from jsonb_array_elements(v_requested_family -> 'memberships') member
         where member ->> 'family_id' <> v_family.id::text
            or nullif(btrim(member ->> 'option_label'), '') is null
            or (member ->> 'sort_order')::integer < 0
       )
       or (
         select count(distinct member ->> 'product_id')
         from jsonb_array_elements(v_requested_family -> 'memberships') member
       ) <> jsonb_array_length(v_requested_family -> 'memberships')
       or (
         select count(distinct (member ->> 'sort_order')::integer)
         from jsonb_array_elements(v_requested_family -> 'memberships') member
       ) <> jsonb_array_length(v_requested_family -> 'memberships')
    then
      raise exception 'invalid Product Family memberships' using errcode = '23514';
    end if;

    if exists (
      select 1
      from jsonb_array_elements(v_requested_family -> 'memberships') member
      left join public.products product
        on product.id = (member ->> 'product_id')::uuid
      where product.id is null
         or (
           product.id <> v_draft.product_id
           and product.system_step_name is distinct from v_family.system_step_name
         )
    ) then
      raise exception 'Product Family members must share one System Step'
        using errcode = '23514';
    end if;

    perform 1
    from public.products product
    join jsonb_array_elements(
      v_requested_family -> 'memberships'
    ) member on product.id = (member ->> 'product_id')::uuid
    order by product.id
    for update;

    insert into public.product_families (
      id,
      slug,
      display_name,
      system_step_name,
      created_at,
      updated_at
    ) values (
      v_family.id,
      v_family.slug,
      v_family.display_name,
      v_family.system_step_name,
      v_now,
      v_now
    )
    on conflict (id) do update set
      slug = excluded.slug,
      display_name = excluded.display_name,
      system_step_name = excluded.system_step_name,
      updated_at = excluded.updated_at
    where row(
      product_families.slug,
      product_families.display_name,
      product_families.system_step_name
    ) is distinct from row(
      excluded.slug,
      excluded.display_name,
      excluded.system_step_name
    );

    delete from public.product_family_memberships
    where family_id = v_family.id;

    insert into public.product_family_memberships (
      family_id,
      product_id,
      option_label,
      sort_order,
      is_entry,
      created_at,
      updated_at
    )
    select
      v_family.id,
      member.product_id,
      member.option_label,
      member.sort_order,
      member.is_entry,
      v_now,
      v_now
    from jsonb_to_recordset(
      v_requested_family -> 'memberships'
    ) as member(
      family_id uuid,
      product_id uuid,
      option_label text,
      sort_order smallint,
      is_entry boolean,
      created_at timestamptz,
      updated_at timestamptz
    );
  end if;

  v_result := public.publish_catalog_product_draft_v4_without_family(
    p_draft_id,
    p_expected_version,
    p_actor_id,
    p_actor_role,
    p_change_audit
  );
  if v_result ->> 'ok' <> 'true' then
    raise exception 'canonical Product publish failed after family validation'
      using errcode = '40001';
  end if;

  v_family_after := private.catalog_editor_product_family(v_draft.product_id);
  v_result := jsonb_set(
    v_result,
    '{changedTables,productFamily}',
    to_jsonb(v_family_changed),
    true
  );

  if v_family_changed then
    insert into public.catalog_editor_audit_log (
      action,
      actor_id,
      product_id,
      draft_id,
      revision_id,
      metadata
    ) values (
      'family.published',
      p_actor_id,
      v_draft.product_id,
      p_draft_id,
      (v_result #>> '{revision,id}')::uuid,
      jsonb_build_object(
        'before', v_family_before,
        'after', v_family_after,
        'revision', (v_result #>> '{revision,revision_number}')::integer,
        'changedTables', jsonb_build_object(
          'product_families', true,
          'product_family_memberships', true
        )
      )
    );
  end if;

  return v_result;
end;
$$;

revoke all on function public.publish_catalog_product_draft_v4(
  uuid, bigint, uuid, text, jsonb
) from public, anon, authenticated, service_role;

do $refine_family_portfolio$
declare
  v_family_id uuid := gen_random_uuid();
  v_balancing_id uuid;
  v_polishing_id uuid := gen_random_uuid();
  v_beaming_id uuid := gen_random_uuid();
  v_chilling_id uuid := gen_random_uuid();
  v_balancing_sort integer;
  v_now timestamptz := statement_timestamp();
  v_changed integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('mei-pelle-refine-family-143', 0)
  );

  if (
    select count(*)
    from public.products product
    join public.product_sources source on source.product_id = product.id
    where product.slug = 'refine-02-pore-treatment-pads'
      and product.catalog_status = 'active'
      and product.system_step_name = 'REFINE'
      and product.routine_group = 'beyond_core'
      and source.supplier_title = 'Pore Tightening Pad'
      and source.supplier_handle =
        'leaders-pore-tightening-toner-pads-50-pads-170-ml'
  ) <> 1 then
    raise exception
      'REFINE family migration requires exactly one verified Pore Tightening Pad Product'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.products product
    left join public.product_sources source on source.product_id = product.id
    where product.slug in (
      'balancing-prep',
      'polishing-prep',
      'beaming-prep',
      'chilling-prep'
    )
       or source.supplier_handle in (
         'peel-step-pha-deep-peeling-pad',
         'leaders-vita-blemish-pad-80-pads-x-120ml',
         'leaders-teca-cooling-pad-80-pads-x-130ml'
       )
  ) or exists (
    select 1 from public.product_families where slug = 'refine'
  ) then
    raise exception 'REFINE family migration found conflicting Product identity'
      using errcode = '23505';
  end if;

  select product.id, product.sort_order
  into strict v_balancing_id, v_balancing_sort
  from public.products product
  join public.product_sources source on source.product_id = product.id
  where product.slug = 'refine-02-pore-treatment-pads'
    and source.supplier_title = 'Pore Tightening Pad';

  perform 1
  from public.products
  where id = v_balancing_id
  for update;

  if exists (
    select 1
    from public.product_content_drafts draft
    where draft.product_id = v_balancing_id
      and draft.status in ('draft', 'ready')
  ) then
    raise exception 'REFINE family migration cannot bypass an open Catalog draft'
      using errcode = '55000';
  end if;

  if (
    select count(*)
    from public.product_variants offer
    where offer.product_id = v_balancing_id
      and offer.archived_at is null
      and offer.variant_key = '50-pads'
      and offer.sku = '4440'
      and offer.supplier_variant_id = '40765424107602'
      and offer.price_cents = 1700
      and offer.volume = '150 mL / 5.07 fl. oz.'
      and offer.pack_count = 50
  ) <> 1 then
    raise exception
      'Balancing Prep historical Offer does not match the verified Formula identity'
      using errcode = '23514';
  end if;

  update public.products
  set
    slug = 'balancing-prep',
    display_name = 'Balancing Prep',
    product_type = 'Daily toner pads',
    benefits = array['BALANCE', 'PREP', 'REFRESH']::text[],
    editorial_description = 'A fresh first pass for skin that wants balance without an exfoliation routine. These daily toner pads sweep away the look of surface residue with a water-light essence, leaving skin comfortable, smooth-looking, and ready for the next layer.',
    editorial_how_to_use = 'After cleansing, sweep one pad gently across face and neck, avoiding the immediate eye area. Follow with serum and moisturizer. Use once daily or less often if skin feels sensitive.',
    made_for = null,
    good_for = 'Daily toning, surface residue, balanced-looking skin',
    texture = 'Water-light essence on an embossed pad',
    key_ingredients = array[
      'Betaine',
      'Panthenol',
      'Sodium Hyaluronate',
      'Plum Extract'
    ]::text[],
    cautions = array[
      'Patch test before first use. Stop use if irritation occurs.',
      'Avoid the immediate eye area.'
    ]::text[],
    finish = 'Fresh, comfortable, and prepared for the next layer',
    volume = '150 mL / 50 pads',
    skin_types = '{}'::text[],
    concerns = array['Surface residue', 'Uneven-looking texture']::text[],
    usage_time = array['Morning', 'Night']::text[],
    seo_title = 'Balancing Prep — Daily toner pads | Mei Pelle',
    seo_description = 'Daily toner pads with betaine and panthenol for a fresh, balanced-looking finish before serum and moisturizer.',
    search_keywords = array[
      'balancing prep',
      'general',
      'daily toner pads',
      'refine',
      'betaine',
      'panthenol'
    ]::text[],
    formula_notes = array[
      'Formula identity preserved: Leaders Pore Tightening Pad.',
      'The current official retail declaration contains no AHA, BHA, or PHA; no chemical-exfoliation claim is published.',
      'The official retail page supports 150 mL / 50 pads and daily use.',
      'Signed exact OEM Formula, current Mei Pelle inventory, and commercial authorization remain pending.'
    ]::text[],
    status = 'coming_soon',
    updated_at = v_now
  where id = v_balancing_id;
  get diagnostics v_changed = row_count;
  if v_changed <> 1 then
    raise exception 'Balancing Prep update did not affect exactly one Product';
  end if;

  update public.product_variants
  set
    available = false,
    inventory_status = 'unavailable',
    archived_at = v_now,
    updated_at = v_now
  where product_id = v_balancing_id
    and archived_at is null;
  get diagnostics v_changed = row_count;
  if v_changed <> 1 then
    raise exception
      'Balancing Prep expected exactly one historical Offer to fail closed'
      using errcode = '23514';
  end if;

  update public.product_sources
  set
    source_inspected_at = '2026-08-10T00:00:00Z'::timestamptz,
    formulation_version_notes =
      'Current official retail Formula evidence supports a separate daily non-acid toner-pad Product. Signed exact OEM Formula and current Mei Pelle inventory remain pending.',
    raw_source = raw_source || jsonb_build_object(
      'evidenceStatus', 'official-public-page-complete-inci',
      'researchDate', '2026-08-10',
      'familyOption', 'General',
      'offerEligible', false,
      'inventoryEvidence', 'not-reconciled'
    ),
    updated_at = v_now
  where product_id = v_balancing_id;

  insert into public.products (
    id, slug, benefits, swatch_from, swatch_to, status, made_for, good_for,
    texture, product_type, catalog_status, badge, sort_order, key_ingredients,
    ingredients, cautions, finish, volume, skin_types, concerns, usage_time,
    seo_title, seo_description, search_keywords, display_name,
    editorial_description, editorial_how_to_use, formula_notes,
    routine_group, routine_sort, system_step_name, published_at
  ) values
    (
      v_polishing_id,
      'polishing-prep',
      array['POLISH', 'SMOOTH', 'REFINE']::text[],
      '#d8e2d1', '#73856e', 'waitlist', null,
      'Dullness, rough-looking texture, pore-prone areas',
      'Water-light exfoliating essence on a dual-texture pad',
      'PHA + LHA exfoliating pads', 'active', null,
      v_balancing_sort + 1,
      array['PHA', 'LHA']::text[],
      null,
      array[
        'Use one to three times weekly as tolerated; do not overuse.',
        'Avoid irritated skin and the immediate eye area.',
        'Keep the rest of the routine simple and hydrating on exfoliation days.',
        'Use sunscreen in the daytime. Stop use if irritation occurs.'
      ]::text[],
      'Smoother-looking, clearer, and comfortably prepped',
      '215 mL / 70 pads',
      '{}'::text[],
      array['Dullness', 'Rough-looking texture', 'Pore visibility']::text[],
      array['Night', '1–3 times weekly']::text[],
      'Polishing Prep — PHA + LHA exfoliating pads | Mei Pelle',
      'Controlled PHA + LHA exfoliating pads for smoother-looking texture, used one to three times weekly as tolerated.',
      array[
        'polishing prep', 'exfoliating', 'PHA', 'LHA', 'toner pads', 'refine'
      ]::text[],
      'Polishing Prep',
      'A measured polish for the nights texture needs more attention. PHA- and LHA-led exfoliation support helps lift the look of buildup while a water-light pad format keeps application controlled. Skin looks smoother and fresher after use without turning exfoliation into an everyday default.',
      'After cleansing, sweep one pad across dry or lightly damp skin, focusing on texture-prone areas and avoiding the immediate eye area. Use one to three times weekly as tolerated, then follow with a hydrating serum and moisturizer.',
      array[
        'Formula candidate: Leaders PEEL STEP PHA Deep Peeling Pad.',
        'The official page supports PHA and LHA positioning, 215 mL / 70 pads, and one-to-three-times-weekly cadence.',
        'No acid percentage or pH is published or claimed.',
        'The official page explicitly does not publish a full INCI list; Complete INCI remains unavailable pending the signed exact OEM Formula.'
      ]::text[],
      'beyond_core', 111, 'REFINE', v_now
    ),
    (
      v_beaming_id,
      'beaming-prep',
      array['BRIGHTEN', 'EVEN', 'BEAM']::text[],
      '#f0dfad', '#a88335', 'waitlist', null,
      'Dullness and uneven-looking tone',
      'Silky water essence on a soft toner pad',
      'Niacinamide brightening pads', 'active', null,
      v_balancing_sort + 2,
      array['Niacinamide', 'Glycerin', 'Glutathione', 'Ascorbic Acid']::text[],
      'Water, Glycerin, Niacinamide, 1,2-Hexanediol, Butylene Glycol, Polyglyceryl-10 Laurate, Caprylyl Glycol, Ethylhexylglycerin, Buteth-3, Disodium EDTA, Xanthan Gum, Sodium Benzotriazolyl Butylphenol Sulfonate, Alcohol, Gardenia Florida Flower Extract, Tris(Tetramethylhydroxypiperidinol) Citrate, Tributyl Citrate, Candida Bombicola/Glucose/Methyl Rapeseedate Ferment, Dipropylene Glycol, Glutathione, Ascorbic Acid, Helianthus Annuus (Sunflower) Seed Oil.',
      array[
        'Patch test before first use. Stop use if irritation occurs.',
        'Avoid the immediate eye area.'
      ]::text[],
      'Fresh, supple, and brighter-looking',
      '120 mL / 80 pads',
      '{}'::text[],
      array['Dullness', 'Uneven-looking tone']::text[],
      array['Morning', 'Night']::text[],
      'Beaming Prep — Niacinamide brightening pads | Mei Pelle',
      'Daily niacinamide toner pads for a fresh, brighter-looking finish and more even-looking tone.',
      array[
        'beaming prep', 'brightening', 'niacinamide', 'toner pads', 'refine'
      ]::text[],
      'Beaming Prep',
      'A quick pass for skin that has lost its light. Niacinamide sits in a humectant-rich essence with glutathione and ascorbic acid, delivered on a soft pad that leaves skin supple rather than coated. The immediate finish looks fresh; with consistent use, tone looks brighter and more even.',
      'After cleansing, sweep one pad across face and neck, avoiding the immediate eye area. Follow with serum and moisturizer. Use morning or night; finish with sunscreen in the daytime.',
      array[
        'Formula candidate: Leaders Vita Blemish Pad.',
        'Complete ingredient declaration and 120 mL / 80 pad size are recorded from the current official page.',
        'No ingredient percentage, clinical, acne-drug, or all-skin-types claim is published.',
        'Signed exact OEM Formula, claim dossier, packaging, and commercial facts remain pending.'
      ]::text[],
      'beyond_core', 112, 'REFINE', v_now
    ),
    (
      v_chilling_id,
      'chilling-prep',
      array['COOL', 'COMFORT', 'RESET']::text[],
      '#d7e5df', '#62877c', 'waitlist', null,
      'Warm-feeling, dry, or stressed-looking skin',
      'Cooling water-gel essence on a soft toner pad',
      'TECA cooling pads', 'active', null,
      v_balancing_sort + 3,
      array['Centella Asiatica', 'Allantoin', 'Panthenol', 'Ceramide NP']::text[],
      'Water (Aqua), Dipropylene Glycol, Propanediol, Butylene Glycol, Betaine, 1,2-Hexanediol, Glycerin, Hydroxyethyl Acrylate/Sodium Acryloyldimethyl Taurate Copolymer, Ethylhexylglycerin, Caprylyl Glycol, Allantoin, Xanthan Gum, Canola Oil, Centella Asiatica Leaf Extract, Helianthus Annuus (Sunflower) Seed Oil, Disodium EDTA, Limnanthes Alba (Meadowfoam) Seed Oil, Buteth-3, Polyglyceryl-10 Stearate, Sorbitan Isostearate, Argania Spinosa Kernel Oil, Hibiscus Sabdariffa Flower Extract, Viola Odorata Flower Extract, Mentha (Peppermint) Extract, Dioscorea Japonica Root Extract, Sodium Benzoate, Guaiazulene, Lactobacillus Ferment Lysate, Lactococcus Ferment Lysate, Bifida Ferment Lysate, Ethanol, Tris(Tetramethylhydroxypiperidinol) Citrate, Tributyl Citrate, Panthenol, Hydrogenated Lecithin, Asiaticoside, Madecassic Acid, Asiatic Acid, Ceramide NP, Beta-Glucan.',
      array[
        'Patch test before first use. Stop use if irritation occurs.',
        'Contains peppermint extract and ethanol; avoid the immediate eye area.'
      ]::text[],
      'Cool-feeling, fresh, and comfortably hydrated',
      '130 mL / 80 pads',
      '{}'::text[],
      array['Dryness', 'Warm-feeling skin', 'Stressed-looking skin']::text[],
      array['Morning', 'Night']::text[],
      'Chilling Prep — TECA cooling pads | Mei Pelle',
      'Daily TECA cooling pads for a fresh, comfortably hydrated finish when skin feels warm or stressed.',
      array[
        'chilling prep', 'cooling', 'TECA', 'centella', 'toner pads', 'refine'
      ]::text[],
      'Chilling Prep',
      'A cool-down step for the days skin looks as stressed as it feels. A water-gel essence pairs centella-derived components with betaine, allantoin, panthenol, and Ceramide NP in a soft pad format. Skin feels fresh on contact and looks calm, supple, and comfortably hydrated after use.',
      'After cleansing, sweep one pad gently across face and neck or rest it briefly on warm-feeling areas, avoiding the immediate eye area. Follow with serum and moisturizer. Use morning or night as needed.',
      array[
        'Formula candidate: Leaders TECA Cooling Pad.',
        'Complete ingredient declaration and 130 mL / 80 pad size are recorded from the current official page.',
        'Cooling describes the immediate sensory format; no anti-inflammatory or medical claim is published.',
        'Signed exact OEM Formula, claim dossier, packaging, and commercial facts remain pending.'
      ]::text[],
      'beyond_core', 113, 'REFINE', v_now
    );

  insert into public.product_sources (
    product_id, supplier, supplier_title, supplier_url, supplier_handle,
    supplier_product_id, source_inspected_at, source_content_hash,
    original_source_price_cents, formulation_version_notes, raw_source
  ) values
    (
      v_polishing_id,
      'Leaders Cosmetics USA',
      'PEEL STEP PHA Deep Peeling Pad',
      'https://www.leaderscosmeticsusa.com/products/peel-step-pha-deep-peeling-pad',
      'peel-step-pha-deep-peeling-pad',
      null,
      '2026-08-10T00:00:00Z'::timestamptz,
      null,
      1800,
      'Current official retail evidence only. Signed exact OEM Formula, Complete INCI, acid identity/concentration, pH, tolerance, packaging, and commercial facts remain pending.',
      jsonb_build_object(
        'evidenceStatus', 'official-page-does-not-publish-complete-inci',
        'researchDate', '2026-08-10',
        'familyOption', 'Exfoliating',
        'offerEligible', false,
        'mediaEligible', false,
        'blockedClaims', jsonb_build_array(
          'acid percentage', 'pH', 'clinical', 'all skin types'
        )
      )
    ),
    (
      v_beaming_id,
      'Leaders Cosmetics USA',
      'Vita Blemish Pad',
      'https://www.leaderscosmeticsusa.com/products/leaders-vita-blemish-pad-80-pads-x-120ml',
      'leaders-vita-blemish-pad-80-pads-x-120ml',
      null,
      '2026-08-10T00:00:00Z'::timestamptz,
      null,
      1700,
      'Current official retail evidence only. Signed exact OEM Formula, claims dossier, packaging, and commercial facts remain pending.',
      jsonb_build_object(
        'evidenceStatus', 'official-public-page-complete-inci',
        'researchDate', '2026-08-10',
        'familyOption', 'Brightening',
        'offerEligible', false,
        'mediaEligible', false
      )
    ),
    (
      v_chilling_id,
      'Leaders Cosmetics USA',
      'TECA Cooling Pad',
      'https://www.leaderscosmeticsusa.com/products/leaders-teca-cooling-pad-80-pads-x-130ml',
      'leaders-teca-cooling-pad-80-pads-x-130ml',
      null,
      '2026-08-10T00:00:00Z'::timestamptz,
      null,
      1700,
      'Current official retail evidence only. Signed exact OEM Formula, claims dossier, packaging, and commercial facts remain pending.',
      jsonb_build_object(
        'evidenceStatus', 'official-public-page-complete-inci',
        'researchDate', '2026-08-10',
        'familyOption', 'Cooling',
        'offerEligible', false,
        'mediaEligible', false
      )
    );

  insert into public.product_media (
    product_id, media_type, url, alt, width, height, role, sort_order,
    original_source_url, source_filename, palette_id, placeholder_palette
  )
  select
    product_id,
    'image',
    null,
    alt,
    null,
    null,
    role,
    sort_order,
    null,
    null,
    palette_id,
    palette
  from (
    values
      (v_polishing_id, 'Polishing Prep project-controlled product swatch', 'card_default', 0, 'polishing-prep', jsonb_build_object('start', '#d8e2d1', 'end', '#73856e', 'accent', '#a6b99e')),
      (v_polishing_id, 'Polishing Prep project-controlled detail swatch', 'detail', 1, 'polishing-prep-detail', jsonb_build_object('start', '#e7eee2', 'end', '#8da087', 'accent', '#c2d1bb')),
      (v_polishing_id, 'Polishing Prep project-controlled cart swatch', 'cart', 2, 'polishing-prep-cart', jsonb_build_object('start', '#d8e2d1', 'end', '#73856e')),
      (v_beaming_id, 'Beaming Prep project-controlled product swatch', 'card_default', 0, 'beaming-prep', jsonb_build_object('start', '#f0dfad', 'end', '#a88335', 'accent', '#d5bb70')),
      (v_beaming_id, 'Beaming Prep project-controlled detail swatch', 'detail', 1, 'beaming-prep-detail', jsonb_build_object('start', '#f7eccb', 'end', '#bc9848', 'accent', '#e7d291')),
      (v_beaming_id, 'Beaming Prep project-controlled cart swatch', 'cart', 2, 'beaming-prep-cart', jsonb_build_object('start', '#f0dfad', 'end', '#a88335')),
      (v_chilling_id, 'Chilling Prep project-controlled product swatch', 'card_default', 0, 'chilling-prep', jsonb_build_object('start', '#d7e5df', 'end', '#62877c', 'accent', '#9bbab0')),
      (v_chilling_id, 'Chilling Prep project-controlled detail swatch', 'detail', 1, 'chilling-prep-detail', jsonb_build_object('start', '#e7f0ec', 'end', '#7d9f95', 'accent', '#b5ccc5')),
      (v_chilling_id, 'Chilling Prep project-controlled cart swatch', 'cart', 2, 'chilling-prep-cart', jsonb_build_object('start', '#d7e5df', 'end', '#62877c'))
  ) media(product_id, alt, role, sort_order, palette_id, palette);

  insert into public.product_pdp_content (
    product_id, schema_version, how_to_use_steps, routine_guidance
  ) values
    (
      v_balancing_id,
      1,
      array[
        'After cleansing, sweep one pad gently across face and neck.',
        'Avoid the immediate eye area and do not scrub.',
        'Follow with serum and moisturizer; use once daily or less often if skin feels sensitive.'
      ]::text[],
      'Use as the daily General REFINE option after CLEANSE and before serum.'
    ),
    (
      v_polishing_id,
      1,
      array[
        'After cleansing, sweep one pad over dry or lightly damp skin.',
        'Focus on texture-prone areas and avoid the immediate eye area.',
        'Use one to three times weekly as tolerated, then follow with hydrating layers.'
      ]::text[],
      'Use as the controlled Exfoliating REFINE option; do not make it a daily default.'
    ),
    (
      v_beaming_id,
      1,
      array[
        'After cleansing, sweep one pad across face and neck.',
        'Avoid the immediate eye area.',
        'Follow with serum and moisturizer; finish with sunscreen in the daytime.'
      ]::text[],
      'Use as the Brightening REFINE option before serum and moisturizer.'
    ),
    (
      v_chilling_id,
      1,
      array[
        'After cleansing, sweep one pad gently across face and neck.',
        'For a brief cool-down, rest the pad on warm-feeling areas, then remove.',
        'Avoid the immediate eye area and follow with serum and moisturizer.'
      ]::text[],
      'Use as the Cooling REFINE option when skin feels warm, dry, or stressed.'
    )
  on conflict (product_id) do update set
    how_to_use_steps = excluded.how_to_use_steps,
    routine_guidance = excluded.routine_guidance,
    updated_at = v_now;

  insert into public.product_families (
    id, slug, display_name, system_step_name
  ) values (
    v_family_id, 'refine', 'REFINE', 'REFINE'
  );

  insert into public.product_family_memberships (
    family_id, product_id, option_label, sort_order, is_entry
  ) values
    (v_family_id, v_balancing_id, 'General', 0, true),
    (v_family_id, v_polishing_id, 'Exfoliating', 1, false),
    (v_family_id, v_beaming_id, 'Brightening', 2, false),
    (v_family_id, v_chilling_id, 'Cooling', 3, false);

  insert into public.catalog_product_revisions (
    product_id,
    revision_number,
    schema_version,
    document,
    source_draft_id,
    published_by
  )
  select
    product.id,
    coalesce((
      select max(revision.revision_number)
      from public.catalog_product_revisions revision
      where revision.product_id = product.id
    ), 0) + 1,
    4,
    private.catalog_editor_document_v4(product.id),
    null,
    null
  from public.products product
  where product.id in (
    v_balancing_id,
    v_polishing_id,
    v_beaming_id,
    v_chilling_id
  );

  insert into public.catalog_editor_audit_log (
    action,
    actor_id,
    product_id,
    revision_id,
    metadata
  )
  select
    'family.published',
    null,
    product.id,
    revision.id,
    jsonb_build_object(
      'source', 'migration-143',
      'familyId', v_family_id,
      'familySlug', 'refine',
      'familyOption', membership.option_label,
      'familyOrder', membership.sort_order,
      'familyEntry', membership.is_entry,
      'revision', revision.revision_number,
      'offerEligible', false
    )
  from public.products product
  join public.product_family_memberships membership
    on membership.product_id = product.id
  join lateral (
    select history.id, history.revision_number
    from public.catalog_product_revisions history
    where history.product_id = product.id
    order by history.revision_number desc
    limit 1
  ) revision on true
  where membership.family_id = v_family_id;
end;
$refine_family_portfolio$;

set constraints all immediate;
