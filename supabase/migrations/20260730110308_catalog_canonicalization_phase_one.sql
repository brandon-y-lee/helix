-- Phase 1 catalog canonicalization.
--
-- This migration deliberately does not drop columns. It preserves the
-- supplier/source representation before removing application dependencies,
-- fills the only missing canonical INCI values, and introduces the narrow V2
-- editor document used before the Phase 2 column removal.

do $$
declare
  v_conflicts text;
begin
  select string_agg(slug, ', ' order by slug)
  into v_conflicts
  from public.products
  where nullif(btrim(display_name), '') is null
     or nullif(btrim(formal_title), '') is null
     or nullif(btrim(card_tagline), '') is null
     or nullif(btrim(editorial_description), '') is null
     or nullif(btrim(editorial_how_to_use), '') is null
     or nullif(btrim(product_type), '') is null
     or sort_order is null
     or routine_group not in ('core', 'beyond_core')
     or routine_sort is null;

  if v_conflicts is not null then
    raise exception
      'catalog canonicalization requires complete canonical fields for: %',
      v_conflicts
      using errcode = '23514';
  end if;

  select string_agg(p.slug, ', ' order by p.slug)
  into v_conflicts
  from public.products p
  where nullif(btrim(p.ingredients), '') is not null
    and nullif(btrim(p.product_details ->> 'sourceFullInci'), '') is not null
    and regexp_replace(p.ingredients, '\s+', ' ', 'g')
      <> regexp_replace(p.product_details ->> 'sourceFullInci', '\s+', ' ', 'g');

  if v_conflicts is not null then
    raise exception
      'catalog canonicalization found conflicting full INCI values for: %',
      v_conflicts
      using errcode = '23514';
  end if;

  select string_agg(p.slug, ', ' order by p.slug)
  into v_conflicts
  from public.products p
  left join public.product_sources s on s.product_id = p.id
  where s.product_id is null;

  if v_conflicts is not null then
    raise exception
      'catalog canonicalization requires a product_sources row for: %',
      v_conflicts
      using errcode = '23503';
  end if;
end;
$$;

with source_snapshots as (
  select
    p.id as product_id,
    jsonb_build_object(
      'name', p.name,
      'tagline', p.tagline,
      'subtitle', p.subtitle,
      'descriptor', p.descriptor,
      'blurb', p.blurb,
      'description', p.description,
      'howToUse', p.how_to_use,
      'productType', p.product_type,
      'texture', p.texture,
      'keyIngredients', p.key_ingredients,
      'ingredients', p.ingredients,
      'productDetails', p.product_details,
      'cautions', p.cautions,
      'finish', p.finish,
      'volume', p.volume,
      'skinTypes', p.skin_types,
      'concerns', p.concerns,
      'usageTime', p.usage_time
    ) as snapshot
  from public.products p
)
update public.product_sources s
set raw_source = jsonb_set(
  s.raw_source,
  '{catalogProduct}',
  planned.snapshot,
  true
)
from source_snapshots planned
where s.product_id = planned.product_id
  and not (s.raw_source ? 'catalogProduct');

update public.products
set ingredients = btrim(product_details ->> 'sourceFullInci')
where nullif(btrim(ingredients), '') is null
  and nullif(btrim(product_details ->> 'sourceFullInci'), '') is not null
  and product_details ->> 'sourceFullInci' !~*
    '(unavailable|not (publicly )?(available|provided)|source highlights?|check (the )?(carton|packaging|label))'
  and array_length(
    regexp_split_to_array(product_details ->> 'sourceFullInci', ','),
    1
  ) >= 5;

alter table public.products
  alter column name drop not null,
  alter column tagline drop not null,
  alter column collection drop not null,
  alter column blurb drop not null,
  alter column description drop not null,
  alter column how_to_use drop not null,
  alter column position drop not null,
  alter column display_name set not null,
  alter column formal_title set not null,
  alter column card_tagline set not null,
  alter column product_type set not null,
  alter column editorial_description set not null,
  alter column editorial_how_to_use set not null,
  alter column sort_order set not null,
  alter column routine_group set not null,
  alter column routine_sort set not null;

update public.product_variants
set sort_order = position
where sort_order is null;

alter table public.product_variants
  alter column position drop not null,
  alter column sort_order set not null;

alter table public.product_media
  alter column media_kind drop not null,
  drop constraint if exists product_media_editorial_role_type_check,
  drop constraint if exists product_media_media_kind_check,
  drop constraint if exists product_media_payload_check,
  drop constraint if exists product_media_placeholder_palette_check,
  drop constraint if exists product_media_canonical_payload_check;

alter table public.product_media
  add constraint product_media_editorial_role_type_check
  check (
    role not in (
      'routine_video',
      'routine_video_poster',
      'profile_editorial',
      'ingredients_texture',
      'core_routine_texture',
      'pdp_outcome',
      'pdp_application'
    )
    or (
      nullif(url, '') is not null
      and width is not null
      and width > 0
      and height is not null
      and height > 0
      and (
        (role = 'routine_video' and media_type = 'video')
        or (
          role in (
            'routine_video_poster',
            'profile_editorial',
            'ingredients_texture',
            'core_routine_texture',
            'pdp_outcome',
            'pdp_application'
          )
          and media_type = 'image'
        )
      )
    )
  ),
  add constraint product_media_canonical_payload_check
  check (
    (
      media_type = 'video'
      and nullif(url, '') is not null
      and placeholder_palette = '{}'::jsonb
    )
    or (
      media_type = 'image'
      and (
        (
          nullif(url, '') is not null
          and placeholder_palette = '{}'::jsonb
        )
        or (
          url is null
          and jsonb_typeof(placeholder_palette) = 'object'
          and placeholder_palette ? 'start'
          and placeholder_palette ? 'end'
          and (placeholder_palette ->> 'start') ~* '^#[0-9a-f]{6}$'
          and (placeholder_palette ->> 'end') ~* '^#[0-9a-f]{6}$'
          and (
            not placeholder_palette ? 'accent'
            or (placeholder_palette ->> 'accent') ~* '^#[0-9a-f]{6}$'
          )
          and (
            not placeholder_palette ? 'surface'
            or (placeholder_palette ->> 'surface') ~* '^#[0-9a-f]{6}$'
          )
          and (
            not placeholder_palette ? 'ink'
            or (placeholder_palette ->> 'ink') ~* '^#[0-9a-f]{6}$'
          )
          and (
            not placeholder_palette ? 'highlight'
            or (placeholder_palette ->> 'highlight') ~* '^#[0-9a-f]{6}$'
          )
        )
      )
    )
  );

alter table public.product_content_drafts
  drop constraint if exists product_content_drafts_schema_version_check,
  drop constraint if exists product_content_drafts_document_check;

alter table public.product_content_drafts
  alter column schema_version set default 2,
  add constraint product_content_drafts_schema_version_check
  check (schema_version in (1, 2)),
  add constraint product_content_drafts_document_check
  check (
    jsonb_typeof(document) = 'object'
    and (document ->> 'schemaVersion')::smallint = schema_version
    and schema_version in (1, 2)
  );

alter table public.catalog_product_revisions
  drop constraint if exists catalog_product_revisions_schema_version_check,
  drop constraint if exists catalog_product_revisions_document_check;

alter table public.catalog_product_revisions
  alter column schema_version set default 2,
  add constraint catalog_product_revisions_schema_version_check
  check (schema_version in (1, 2)),
  add constraint catalog_product_revisions_document_check
  check (
    jsonb_typeof(document) = 'object'
    and (document ->> 'schemaVersion')::smallint = schema_version
    and schema_version in (1, 2)
  );

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
                'position',
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
                'media_kind',
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

create or replace function private.catalog_editor_upgrade_v1_to_v2(
  p_document jsonb
)
returns jsonb
language plpgsql
immutable
security definer
set search_path = ''
as $$
declare
  v_product jsonb;
  v_variants jsonb;
  v_media jsonb;
  v_ingredients text;
begin
  if jsonb_typeof(p_document) <> 'object'
     or p_document ->> 'schemaVersion' <> '1'
     or jsonb_typeof(p_document -> 'product') <> 'object'
     or jsonb_typeof(p_document -> 'variants') <> 'array'
     or jsonb_typeof(p_document -> 'media') <> 'array'
     or jsonb_typeof(p_document -> 'relationships') <> 'array'
  then
    raise exception 'invalid catalog editor V1 document'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_document -> 'media') item
    where item ->> 'role' = 'campaign'
  ) then
    raise exception
      'V1 document contains the unsupported campaign media role'
      using errcode = '22023';
  end if;

  v_product := p_document -> 'product';
  v_ingredients := nullif(btrim(v_product ->> 'ingredients'), '');
  if v_ingredients is not null
     and nullif(
       btrim(v_product #>> '{product_details,sourceFullInci}'),
       ''
     ) is not null
     and regexp_replace(v_ingredients, '\s+', ' ', 'g')
       <> regexp_replace(
         btrim(v_product #>> '{product_details,sourceFullInci}'),
         '\s+',
         ' ',
         'g'
       )
  then
    raise exception 'V1 document contains conflicting full INCI values'
      using errcode = '22023';
  end if;

  if v_ingredients is null then
    v_ingredients := nullif(
      btrim(v_product #>> '{product_details,sourceFullInci}'),
      ''
    );
  end if;

  v_product :=
    v_product
    - array[
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
      ]::text[]
    || jsonb_build_object(
      'display_name',
        coalesce(
          nullif(v_product ->> 'display_name', ''),
          nullif(v_product ->> 'name', '')
        ),
      'formal_title',
        coalesce(
          nullif(v_product ->> 'formal_title', ''),
          nullif(v_product ->> 'name', '')
        ),
      'card_tagline',
        coalesce(
          nullif(v_product ->> 'card_tagline', ''),
          nullif(v_product ->> 'tagline', '')
        ),
      'editorial_description',
        coalesce(
          nullif(v_product ->> 'editorial_description', ''),
          nullif(v_product ->> 'description', '')
        ),
      'editorial_how_to_use',
        coalesce(
          nullif(v_product ->> 'editorial_how_to_use', ''),
          nullif(v_product ->> 'how_to_use', '')
        ),
      'sort_order',
        coalesce(v_product -> 'sort_order', v_product -> 'position'),
      'ingredients',
        to_jsonb(v_ingredients)
    );

  select coalesce(
    jsonb_agg(
      item
      - 'position'
      || jsonb_build_object(
        'sort_order',
        coalesce(item -> 'sort_order', item -> 'position')
      )
      order by coalesce(
        (item ->> 'sort_order')::integer,
        (item ->> 'position')::integer
      ),
      item ->> 'variant_key'
    ),
    '[]'::jsonb
  )
  into v_variants
  from jsonb_array_elements(p_document -> 'variants') item;

  select coalesce(
    jsonb_agg(
      item
      - 'media_kind'
      || jsonb_build_object(
        'media_type',
        coalesce(
          nullif(item ->> 'media_type', ''),
          case
            when item ->> 'media_kind' = 'video' then 'video'
            else 'image'
          end
        )
      )
      order by item ->> 'role', (item ->> 'sort_order')::integer
    ),
    '[]'::jsonb
  )
  into v_media
  from jsonb_array_elements(p_document -> 'media') item;

  return jsonb_build_object(
    'schemaVersion', 2,
    'productId', p_document -> 'productId',
    'product', v_product,
    'productPdpContent', p_document -> 'productPdpContent',
    'variants', v_variants,
    'media', v_media,
    'relationships', p_document -> 'relationships'
  );
end;
$$;

revoke all on function private.catalog_editor_upgrade_v1_to_v2(jsonb)
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
  select private.catalog_editor_document_v2(p_product_id);
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

  v_document := private.catalog_editor_document_v2(p_product_id);
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
    2,
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
    jsonb_build_object(
      'baseRevision', v_base_revision,
      'schemaVersion', 2
    )
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
     or p_document ->> 'schemaVersion' <> '2'
     or p_document ->> 'productId' <> v_draft.product_id::text
     or jsonb_typeof(p_document -> 'product') <> 'object'
     or jsonb_typeof(p_document -> 'variants') <> 'array'
     or jsonb_typeof(p_document -> 'media') <> 'array'
     or jsonb_typeof(p_document -> 'relationships') <> 'array'
  then
    raise exception 'invalid catalog editor V2 document'
      using errcode = '22023';
  end if;

  update public.product_content_drafts
  set
    schema_version = 2,
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
    jsonb_build_object(
      'version', v_draft.version,
      'schemaVersion', 2
    )
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

  v_document := case v_revision.schema_version
    when 1 then private.catalog_editor_upgrade_v1_to_v2(v_revision.document)
    when 2 then v_revision.document
    else null
  end;

  if v_document is null then
    raise exception 'unsupported catalog revision schema version %',
      v_revision.schema_version
      using errcode = '22023';
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
    2,
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
      'restoredSchemaVersion', v_revision.schema_version,
      'draftSchemaVersion', 2,
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
     or v_document ->> 'schemaVersion' <> '2'
     or v_draft.schema_version <> 2
     or v_document ->> 'productId' <> v_draft.product_id::text
     or jsonb_typeof(v_document -> 'product') <> 'object'
     or coalesce(jsonb_typeof(v_document -> 'productPdpContent'), 'null')
        not in ('object', 'null')
     or jsonb_typeof(v_document -> 'variants') <> 'array'
     or jsonb_typeof(v_document -> 'media') <> 'array'
     or jsonb_typeof(v_document -> 'relationships') <> 'array'
     or (v_document -> 'product') ?| array[
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
       from jsonb_array_elements(v_document -> 'variants') item
       where item ? 'position'
     )
     or exists (
       select 1
       from jsonb_array_elements(v_document -> 'media') item
       where item ? 'media_kind'
          or item ->> 'role' = 'campaign'
     )
  then
    raise exception 'invalid catalog editor V2 document'
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
     or nullif(btrim(v_product.display_name), '') is null
     or nullif(btrim(v_product.formal_title), '') is null
     or nullif(btrim(v_product.card_tagline), '') is null
     or nullif(btrim(v_product.product_type), '') is null
     or nullif(btrim(v_product.editorial_description), '') is null
     or nullif(btrim(v_product.editorial_how_to_use), '') is null
     or v_product.sort_order is null
     or v_product.sort_order < 0
     or v_product.routine_sort is null
     or v_product.routine_sort < 0
     or v_product.routine_group not in ('core', 'beyond_core')
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
       and char_length(v_product.seo_description) > 400
     )
  then
    raise exception 'invalid canonical product fields'
      using errcode = '22023';
  end if;

  if (
       v_product.routine_group = 'core'
       and (
         upper(v_product.display_name) not in ('CLEANSE', 'TREAT', 'SEAL')
         or v_product.routine_step_number is null
         or v_product.routine_step_number <= 0
         or nullif(btrim(v_product.routine_step_name), '') is null
       )
     )
     or (
       v_product.routine_group = 'beyond_core'
       and (
         v_product.routine_step_number is not null
         or v_product.routine_step_name is not null
       )
     )
  then
    raise exception 'invalid canonical routine contract'
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
    badge = v_product.badge,
    benefits = v_product.benefits,
    card_tagline = v_product.card_tagline,
    catalog_status = v_product.catalog_status,
    cautions = v_product.cautions,
    concerns = v_product.concerns,
    currency = v_product.currency,
    display_name = v_product.display_name,
    editorial_description = v_product.editorial_description,
    editorial_how_to_use = v_product.editorial_how_to_use,
    finish = v_product.finish,
    formal_title = v_product.formal_title,
    formula_notes = v_product.formula_notes,
    good_for = v_product.good_for,
    ingredients = v_product.ingredients,
    key_ingredients = v_product.key_ingredients,
    made_for = v_product.made_for,
    product_type = v_product.product_type,
    routine_group = v_product.routine_group,
    routine_sort = v_product.routine_sort,
    routine_step_name = v_product.routine_step_name,
    routine_step_number = v_product.routine_step_number,
    search_keywords = v_product.search_keywords,
    seo_description = v_product.seo_description,
    seo_title = v_product.seo_title,
    skin_types = v_product.skin_types,
    slug = v_product.slug,
    sort_order = v_product.sort_order,
    status = v_product.status,
    swatch_from = v_product.swatch_from,
    swatch_to = v_product.swatch_to,
    texture = v_product.texture,
    usage_time = v_product.usage_time,
    volume = v_product.volume,
    published_at = v_now
  where p.id = v_draft.product_id
    and row(
      p.badge,
      p.benefits,
      p.card_tagline,
      p.catalog_status,
      p.cautions,
      p.concerns,
      p.currency,
      p.display_name,
      p.editorial_description,
      p.editorial_how_to_use,
      p.finish,
      p.formal_title,
      p.formula_notes,
      p.good_for,
      p.ingredients,
      p.key_ingredients,
      p.made_for,
      p.product_type,
      p.routine_group,
      p.routine_sort,
      p.routine_step_name,
      p.routine_step_number,
      p.search_keywords,
      p.seo_description,
      p.seo_title,
      p.skin_types,
      p.slug,
      p.sort_order,
      p.status,
      p.swatch_from,
      p.swatch_to,
      p.texture,
      p.usage_time,
      p.volume
    ) is distinct from row(
      v_product.badge,
      v_product.benefits,
      v_product.card_tagline,
      v_product.catalog_status,
      v_product.cautions,
      v_product.concerns,
      v_product.currency,
      v_product.display_name,
      v_product.editorial_description,
      v_product.editorial_how_to_use,
      v_product.finish,
      v_product.formal_title,
      v_product.formula_notes,
      v_product.good_for,
      v_product.ingredients,
      v_product.key_ingredients,
      v_product.made_for,
      v_product.product_type,
      v_product.routine_group,
      v_product.routine_sort,
      v_product.routine_step_name,
      v_product.routine_step_number,
      v_product.search_keywords,
      v_product.seo_description,
      v_product.seo_title,
      v_product.skin_types,
      v_product.slug,
      v_product.sort_order,
      v_product.status,
      v_product.swatch_from,
      v_product.swatch_to,
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
       or (v_item ->> 'sort_order')::integer < 0
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
      sku = v_item ->> 'sku',
      supplier_variant_id = v_item ->> 'supplier_variant_id',
      option_values = coalesce(v_item -> 'option_values', '{}'::jsonb),
      compare_at_price_cents =
        nullif(v_item ->> 'compare_at_price_cents', '')::integer,
      available = coalesce((v_item ->> 'available')::boolean, true),
      inventory_status = v_item ->> 'inventory_status',
      volume = v_item ->> 'volume',
      pack_count = nullif(v_item ->> 'pack_count', '')::integer,
      sort_order = (v_item ->> 'sort_order')::integer,
      archived_at = null
    where v.id = (v_item ->> 'id')::uuid
      and v.product_id = v_draft.product_id
      and row(
        v.variant_key,
        v.label,
        v.price_cents,
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
        v_item ->> 'sku',
        v_item ->> 'supplier_variant_id',
        coalesce(v_item -> 'option_values', '{}'::jsonb),
        nullif(v_item ->> 'compare_at_price_cents', '')::integer,
        coalesce((v_item ->> 'available')::boolean, true),
        v_item ->> 'inventory_status',
        v_item ->> 'volume',
        nullif(v_item ->> 'pack_count', '')::integer,
        (v_item ->> 'sort_order')::integer,
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
        v_item ->> 'sku',
        v_item ->> 'supplier_variant_id',
        coalesce(v_item -> 'option_values', '{}'::jsonb),
        nullif(v_item ->> 'compare_at_price_cents', '')::integer,
        coalesce((v_item ->> 'available')::boolean, true),
        v_item ->> 'inventory_status',
        v_item ->> 'volume',
        nullif(v_item ->> 'pack_count', '')::integer,
        (v_item ->> 'sort_order')::integer
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
       or v_item ->> 'role' = 'campaign'
       or nullif(btrim(v_item ->> 'alt'), '') is null
       or (v_item ->> 'sort_order')::integer < 0
       or (
         v_item ->> 'media_type' = 'video'
         and nullif(v_item ->> 'url', '') is null
       )
       or (
         v_item ->> 'media_type' = 'image'
         and nullif(v_item ->> 'url', '') is null
         and coalesce(v_item -> 'placeholder_palette', '{}'::jsonb)
           = '{}'::jsonb
       )
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

  v_snapshot := private.catalog_editor_document_v2(v_draft.product_id);

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
    2,
    v_snapshot,
    v_draft.id,
    p_actor_id,
    v_now
  )
  returning * into v_revision;

  update public.product_content_drafts
  set
    schema_version = 2,
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
      'schemaVersion', 2,
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
