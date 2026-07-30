set lock_timeout = '10s';
set statement_timeout = '120s';

do $phase_two_preconditions$
declare
  v_missing text[];
begin
  if to_regclass('public.products') is null
     or to_regclass('public.product_variants') is null
     or to_regclass('public.product_media') is null
     or to_regclass('public.collections') is null
  then
    raise exception 'Phase 2 requires the audited catalog tables';
  end if;

  select array_agg(candidate order by candidate)
  into v_missing
  from unnest(array[
    'name',
    'tagline',
    'collection',
    'blurb',
    'description',
    'how_to_use',
    'position',
    'action_name',
    'routine_number',
    'subtitle',
    'descriptor',
    'featured_rank',
    'product_details',
    'routine_step',
    'routine_order',
    'routine_group_label',
    'routine_display_label',
    'legacy_routine_group_label',
    'legacy_routine_display_label'
  ]::text[]) candidate
  where not exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'products'
      and c.column_name = candidate
  );

  if v_missing is not null then
    raise exception 'Phase 2 products columns are missing: %', v_missing;
  end if;

  select array_agg(candidate order by candidate)
  into v_missing
  from (
    values
      ('product_variants', 'position'),
      ('product_media', 'media_kind')
  ) expected(table_name, candidate)
  where not exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = expected.table_name
      and c.column_name = expected.candidate
  );

  if v_missing is not null then
    raise exception 'Phase 2 child columns are missing: %', v_missing;
  end if;

  if exists (
    select 1
    from public.products p
    where p.display_name is null
       or p.formal_title is null
       or p.card_tagline is null
       or p.editorial_description is null
       or p.editorial_how_to_use is null
       or p.product_type is null
       or p.sort_order is null
       or p.routine_group is null
       or p.routine_sort is null
  ) then
    raise exception 'Phase 2 requires complete canonical product fields';
  end if;

  if exists (
    select 1
    from public.products p
    where p.name is distinct from p.display_name
       or p.tagline is distinct from p.card_tagline
       or p.blurb is distinct from p.card_tagline
       or p.subtitle is distinct from p.card_tagline
       or p.description is distinct from p.editorial_description
       or p.descriptor is distinct from p.editorial_description
       or p.how_to_use is distinct from p.editorial_how_to_use
       or p.position is distinct from p.sort_order
       or p.featured_rank is distinct from p.sort_order
       or p.action_name is distinct from p.display_name
       or p.routine_step is distinct from p.routine_step_name
       or (
         p.routine_number is not null
         and p.routine_number
           is distinct from lpad(p.routine_step_number::text, 2, '0')
       )
  ) then
    raise exception
      'Phase 2 found legacy values that differ from canonical replacements';
  end if;

  if exists (
    select 1
    from public.product_variants v
    where v.sort_order is null
       or v.sort_order is distinct from v.position
  ) then
    raise exception 'Phase 2 requires canonical variant ordering';
  end if;

  if exists (
    select 1
    from public.product_media m
    where m.role = 'campaign'
       or m.media_type not in ('image', 'video')
       or (
         m.media_type = 'video'
         and nullif(m.url, '') is null
       )
       or (
         m.media_type = 'image'
         and nullif(m.url, '') is null
         and m.placeholder_palette = '{}'::jsonb
       )
  ) then
    raise exception 'Phase 2 found noncanonical media rows';
  end if;

  if exists (
    select 1
    from public.products p
    left join public.product_sources s on s.product_id = p.id
    where s.product_id is null
       or not (s.raw_source ? 'catalogProduct')
  ) then
    raise exception 'Phase 2 requires a source snapshot for every product';
  end if;

  if exists (
    select 1
    from public.product_content_drafts d
    where d.status in ('draft', 'ready')
      and d.schema_version <> 2
  ) then
    raise exception 'Phase 2 cannot run with an active V1 catalog draft';
  end if;

  if exists (
    select 1
    from public.product_content_drafts d
    where d.schema_version = 2
      and (
        (d.document -> 'product') ?| array[
          'name',
          'tagline',
          'collection',
          'blurb',
          'description',
          'how_to_use',
          'position',
          'action_name',
          'routine_number',
          'subtitle',
          'descriptor',
          'featured_rank',
          'product_details',
          'routine_step',
          'routine_order',
          'routine_group_label',
          'routine_display_label',
          'legacy_routine_group_label',
          'legacy_routine_display_label'
        ]
        or exists (
          select 1
          from jsonb_array_elements(d.document -> 'variants') item
          where item ? 'position'
        )
        or exists (
          select 1
          from jsonb_array_elements(d.document -> 'media') item
          where item ? 'media_kind'
             or item ->> 'role' = 'campaign'
        )
      )
  ) then
    raise exception 'Phase 2 found retired keys in a V2 draft';
  end if;

  if exists (
    select 1
    from public.catalog_product_revisions r
    where r.schema_version = 2
      and (
        (r.document -> 'product') ?| array[
          'name',
          'tagline',
          'collection',
          'blurb',
          'description',
          'how_to_use',
          'position',
          'action_name',
          'routine_number',
          'subtitle',
          'descriptor',
          'featured_rank',
          'product_details',
          'routine_step',
          'routine_order',
          'routine_group_label',
          'routine_display_label',
          'legacy_routine_group_label',
          'legacy_routine_display_label'
        ]
        or exists (
          select 1
          from jsonb_array_elements(r.document -> 'variants') item
          where item ? 'position'
        )
        or exists (
          select 1
          from jsonb_array_elements(r.document -> 'media') item
          where item ? 'media_kind'
             or item ->> 'role' = 'campaign'
        )
      )
  ) then
    raise exception 'Phase 2 found retired keys in a V2 revision';
  end if;

  if to_regprocedure(
    'private.catalog_editor_upgrade_v1_to_v2(jsonb)'
  ) is null then
    raise exception 'Phase 2 requires the historical V1 revision adapter';
  end if;

  if to_regprocedure(
    'private.catalog_editor_document_v1(uuid)'
  ) is null then
    raise exception 'Phase 2 expected the retired V1 document builder';
  end if;

  if to_regprocedure(
    'public.publish_catalog_product_draft(uuid,bigint,uuid)'
  ) is null then
    raise exception 'Phase 2 requires the canonical publish function';
  end if;

  if has_function_privilege(
       'anon',
       'public.publish_catalog_product_draft(uuid,bigint,uuid)',
       'execute'
     )
     or has_function_privilege(
       'authenticated',
       'public.publish_catalog_product_draft(uuid,bigint,uuid)',
       'execute'
     )
     or not has_function_privilege(
       'service_role',
       'public.publish_catalog_product_draft(uuid,bigint,uuid)',
       'execute'
     )
  then
    raise exception 'Phase 2 found unexpected publish function grants';
  end if;

  if exists (
    select 1
    from pg_constraint con
    where con.confrelid = 'public.collections'::regclass
      and con.conrelid <> 'public.collections'::regclass
  ) then
    raise exception 'Phase 2 found a foreign key to public.collections';
  end if;

  if exists (
    select 1
    from pg_depend d
    join pg_rewrite r on r.oid = d.objid
    join pg_class v on v.oid = r.ev_class
    join pg_namespace n on n.oid = v.relnamespace
    where d.refobjid in (
      'public.products'::regclass,
      'public.product_variants'::regclass,
      'public.product_media'::regclass,
      'public.collections'::regclass
    )
      and n.nspname not in ('pg_catalog', 'information_schema')
  ) then
    raise exception 'Phase 2 found a view dependency on a pruned table';
  end if;

  if to_regclass('public.product_media_kind_role_idx') is null
     or to_regclass('public.product_variants_active_product_idx') is null
     or to_regclass('public.products_catalog_status_sort_idx') is null
     or to_regclass('public.products_routine_order_idx') is null
     or to_regclass('public.products_routine_sort_idx') is null
  then
    raise exception 'Phase 2 expected the audited legacy indexes';
  end if;
end;
$phase_two_preconditions$;

drop function private.catalog_editor_document_v1(uuid);

drop policy "Public read active collections" on public.collections;
drop trigger collections_set_updated_at on public.collections;
drop table public.collections;

drop index public.product_media_kind_role_idx;

alter table public.product_media
  drop constraint product_media_role_check;

alter table public.product_media
  add constraint product_media_role_check
  check (
    role in (
      'card',
      'hero',
      'gallery',
      'detail',
      'card_default',
      'card_hover',
      'cart',
      'search',
      'routine_video',
      'routine_video_poster',
      'profile_editorial',
      'ingredients_texture',
      'core_routine_texture',
      'pdp_outcome',
      'pdp_application'
    )
  );

alter table public.product_media
  drop column media_kind;

drop index public.product_variants_active_product_idx;

create index product_variants_active_product_idx
  on public.product_variants (product_id, sort_order)
  where archived_at is null;

alter table public.product_variants
  drop column position;

drop index public.products_catalog_status_sort_idx;
drop index public.products_routine_order_idx;
drop index public.products_routine_sort_idx;

create index products_catalog_status_sort_idx
  on public.products (catalog_status, sort_order);

create index products_routine_sort_idx
  on public.products (routine_sort, sort_order)
  where catalog_status = 'active';

alter table public.products
  drop column name,
  drop column tagline,
  drop column collection,
  drop column blurb,
  drop column description,
  drop column how_to_use,
  drop column position,
  drop column action_name,
  drop column routine_number,
  drop column subtitle,
  drop column descriptor,
  drop column featured_rank,
  drop column product_details,
  drop column routine_step,
  drop column routine_order,
  drop column routine_group_label,
  drop column routine_display_label,
  drop column legacy_routine_group_label,
  drop column legacy_routine_display_label;

create or replace function private.catalog_editor_document_v2(
  p_product_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'schemaVersion', 2,
    'productId', p.id,
    'product', jsonb_build_object(
      'slug', p.slug,
      'display_name', p.display_name,
      'formal_title', p.formal_title,
      'card_tagline', p.card_tagline,
      'product_type', p.product_type,
      'catalog_status', p.catalog_status,
      'badge', p.badge,
      'currency', p.currency,
      'sort_order', p.sort_order,
      'editorial_description', p.editorial_description,
      'benefits', p.benefits,
      'editorial_how_to_use', p.editorial_how_to_use,
      'formula_notes', p.formula_notes,
      'swatch_from', p.swatch_from,
      'swatch_to', p.swatch_to,
      'status', p.status,
      'made_for', p.made_for,
      'good_for', p.good_for,
      'texture', p.texture,
      'key_ingredients', p.key_ingredients,
      'ingredients', p.ingredients,
      'cautions', p.cautions,
      'finish', p.finish,
      'volume', p.volume,
      'skin_types', p.skin_types,
      'concerns', p.concerns,
      'usage_time', p.usage_time,
      'seo_title', p.seo_title,
      'seo_description', p.seo_description,
      'search_keywords', p.search_keywords,
      'routine_group', p.routine_group,
      'routine_step_number', p.routine_step_number,
      'routine_step_name', p.routine_step_name,
      'routine_sort', p.routine_sort
    ),
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
            - array[
                'product_id',
                'updated_at',
                'archived_at'
              ]::text[]
            order by v.sort_order, v.variant_key
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

revoke all on function private.catalog_editor_document_v2(uuid)
  from public, anon, authenticated, service_role;

alter function public.publish_catalog_product_draft(uuid, bigint, uuid)
  set search_path = '';

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

comment on function public.publish_catalog_product_draft(
  uuid,
  bigint,
  uuid
) is
  'Publishes canonical V2 catalog documents after Phase 2 schema pruning.';
