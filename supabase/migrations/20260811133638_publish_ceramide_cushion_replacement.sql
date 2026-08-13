set lock_timeout = '10s';
set statement_timeout = '120s';

do $publish_ceramide_cushion_replacement$
declare
  v_now constant timestamptz := statement_timestamp();
  v_green_id uuid;
  v_ceramide_id uuid;
  v_ceramide_revision integer;
  v_ceramide_revision_id uuid;
  v_changed integer;
  v_green_history_before jsonb;
  v_green_history_after jsonb;
  v_expected_inbound_relationships constant jsonb := jsonb_build_array(
    jsonb_build_object('slug', 'balancing-prep', 'sort', 3),
    jsonb_build_object('slug', 'peptide-eye-cream', 'sort', 3),
    jsonb_build_object('slug', 'peptide-nourish-mask', 'sort', 3)
  );
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('mei-pelle-product-slug-routes', 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('mei-pelle-ceramide-replacement-169', 0)
  );

  select product.id into strict v_green_id
  from public.products product
  join public.product_sources source on source.product_id = product.id
  where product.slug = 'seal-05-green-collagen-cream'
    and product.display_name = 'SEAL'
    and product.system_step_name = 'SEAL'
    and product.routine_group = 'core'
    and product.catalog_status = 'active'
    and product.status = 'available'
    and source.supplier_title = 'Green Collagen Hydrate Boosting Cream';

  select product.id into strict v_ceramide_id
  from public.products product
  join public.product_sources source on source.product_id = product.id
  where product.slug = 'ceramide-cushion'
    and product.display_name = 'Ceramide Cushion'
    and product.product_type = 'Intensive moisture cream'
    and product.system_step_name = 'SEAL'
    and product.routine_group = 'core'
    and product.catalog_status = 'draft'
    and product.status = 'coming_soon'
    and source.supplier_handle = 'leaders-calming-biotics-intensive-cream';

  perform 1
  from public.products
  where id in (v_green_id, v_ceramide_id)
  order by id
  for update;

  lock table public.product_relationships,
    public.product_slug_routes,
    public.catalog_product_revisions,
    public.catalog_editor_audit_log
    in share row exclusive mode;

  if exists (
    select 1
    from public.product_content_drafts draft
    where draft.product_id in (v_green_id, v_ceramide_id)
      and draft.status in ('draft', 'ready')
  ) then
    raise exception 'Ceramide replacement cannot bypass an open Catalog Draft'
      using errcode = '55000';
  end if;

  if (
    select count(*)
    from public.product_pdp_content content
    where content.product_id = v_ceramide_id
  ) <> 1 or (
    select count(*)
    from public.product_media media
    where media.product_id = v_ceramide_id
      and media.archived_at is null
      and media.variant_id is null
      and nullif(btrim(media.url), '') is not null
  ) <> 12 then
    raise exception 'Ceramide Cushion lacks its governed content or media'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.product_variants variant
    where variant.product_id = v_ceramide_id
  ) then
    raise exception 'Ceramide Cushion must remain without Product Variants'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.product_pdp_content content
    where content.product_id = v_ceramide_id
      and to_jsonb(content)::text ~*
        '(3:1:1|100[- ]hour|barrier repair|penetrat|clinically|all skin types|hypoallergenic|dermatologist|vegan|cruelty[- ]free)'
  ) then
    raise exception 'Unsupported Ceramide Cushion claim entered PDP content'
      using errcode = '23514';
  end if;

  if (
    select jsonb_agg(
      jsonb_build_object('slug', source.slug, 'sort', relationship.sort_order)
      order by source.slug
    )
    from public.product_relationships relationship
    join public.products source on source.id = relationship.product_id
    where relationship.related_product_id = v_green_id
      and relationship.relationship_type = 'complete_the_routine'
      and relationship.archived_at is null
      and source.catalog_status = 'active'
  ) is distinct from v_expected_inbound_relationships then
    raise exception 'Active Green Collagen inbound Routine Complements drifted'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.product_relationships green_relationship
    join public.products source on source.id = green_relationship.product_id
    join public.product_relationships ceramide_relationship
      on ceramide_relationship.product_id = green_relationship.product_id
     and ceramide_relationship.related_product_id = v_ceramide_id
     and ceramide_relationship.relationship_type = green_relationship.relationship_type
     and ceramide_relationship.archived_at is null
    where green_relationship.related_product_id = v_green_id
      and green_relationship.relationship_type = 'complete_the_routine'
      and green_relationship.archived_at is null
      and source.catalog_status = 'active'
  ) then
    raise exception 'Ceramide replacement would duplicate a live Routine Complement'
      using errcode = '23505';
  end if;

  select jsonb_build_object(
    'product', to_jsonb(product) - 'catalog_status' - 'updated_at',
    'sources', (
      select coalesce(jsonb_agg(to_jsonb(source) order by source.product_id), '[]'::jsonb)
      from public.product_sources source where source.product_id = v_green_id
    ),
    'content', (
      select coalesce(jsonb_agg(to_jsonb(content) order by content.product_id), '[]'::jsonb)
      from public.product_pdp_content content where content.product_id = v_green_id
    ),
    'media', (
      select coalesce(jsonb_agg(to_jsonb(media) order by media.id), '[]'::jsonb)
      from public.product_media media where media.product_id = v_green_id
    ),
    'variants', (
      select coalesce(jsonb_agg(to_jsonb(variant) order by variant.id), '[]'::jsonb)
      from public.product_variants variant where variant.product_id = v_green_id
    ),
    'revisions', (
      select coalesce(jsonb_agg(to_jsonb(revision) order by revision.id), '[]'::jsonb)
      from public.catalog_product_revisions revision where revision.product_id = v_green_id
    ),
    'audit', (
      select coalesce(jsonb_agg(to_jsonb(audit) order by audit.id), '[]'::jsonb)
      from public.catalog_editor_audit_log audit where audit.product_id = v_green_id
    )
  ) into strict v_green_history_before
  from public.products product
  where product.id = v_green_id;

  update public.products
  set catalog_status = 'active'
  where id = v_ceramide_id
    and catalog_status = 'draft'
    and status = 'coming_soon';
  get diagnostics v_changed = row_count;
  if v_changed <> 1 then
    raise exception 'Ceramide Cushion activation did not affect exactly one Product';
  end if;

  update public.products
  set catalog_status = 'archived'
  where id = v_green_id
    and catalog_status = 'active';
  get diagnostics v_changed = row_count;
  if v_changed <> 1 then
    raise exception 'Green Collagen archival did not affect exactly one Product';
  end if;

  update public.product_relationships relationship
  set archived_at = v_now
  from public.products source
  where relationship.product_id = source.id
    and relationship.related_product_id = v_green_id
    and relationship.relationship_type = 'complete_the_routine'
    and relationship.archived_at is null
    and source.catalog_status = 'active';
  get diagnostics v_changed = row_count;
  if v_changed <> jsonb_array_length(v_expected_inbound_relationships) then
    raise exception 'Green Collagen inbound Routine Complement archival drifted';
  end if;

  insert into public.product_relationships (
    product_id,
    related_product_id,
    relationship_type,
    sort_order
  )
  select
    relationship.product_id,
    v_ceramide_id,
    relationship.relationship_type,
    relationship.sort_order
  from public.product_relationships relationship
  where relationship.related_product_id = v_green_id
    and relationship.relationship_type = 'complete_the_routine'
    and relationship.archived_at = v_now;
  get diagnostics v_changed = row_count;
  if v_changed <> jsonb_array_length(v_expected_inbound_relationships) then
    raise exception 'Ceramide Cushion Routine Complement insertion drifted';
  end if;

  update public.product_slug_routes
  set
    target_product_id = v_ceramide_id,
    route_kind = 'replacement'
  where source_slug = 'seal-05-green-collagen-cream'
    and source_product_id = v_green_id
    and target_product_id = v_green_id
    and route_kind = 'canonical';
  get diagnostics v_changed = row_count;
  if v_changed <> 1 then
    raise exception 'Green Collagen replacement route did not affect exactly one row';
  end if;

  select coalesce(max(revision.revision_number), 0) + 1
  into v_ceramide_revision
  from public.catalog_product_revisions revision
  where revision.product_id = v_ceramide_id;

  insert into public.catalog_product_revisions (
    product_id,
    revision_number,
    schema_version,
    document,
    source_draft_id,
    published_by
  ) values (
    v_ceramide_id,
    v_ceramide_revision,
    4,
    private.catalog_editor_document_v4(v_ceramide_id),
    null,
    null
  ) returning id into v_ceramide_revision_id;

  insert into public.catalog_editor_audit_log (
    action,
    actor_id,
    product_id,
    revision_id,
    metadata
  ) values (
    'slug.replacement.published',
    null,
    v_ceramide_id,
    v_ceramide_revision_id,
    jsonb_build_object(
      'source', 'migration-169',
      'sourceProductId', v_green_id,
      'sourceSlug', 'seal-05-green-collagen-cream',
      'targetProductId', v_ceramide_id,
      'targetSlug', 'ceramide-cushion',
      'routeKind', 'replacement',
      'revision', v_ceramide_revision,
      'relationshipsRepointed', jsonb_array_length(v_expected_inbound_relationships),
      'offerCount', 0
    )
  );

  if exists (
    select 1
    from public.product_relationships relationship
    join public.products source on source.id = relationship.product_id
    where relationship.related_product_id = v_green_id
      and relationship.archived_at is null
      and source.catalog_status = 'active'
  ) then
    raise exception 'No Active Product may point to archived Green Collagen'
      using errcode = '23514';
  end if;

  if (
    select route.route_kind || ':' || route.target_slug
    from public.resolve_product_slug('seal-05-green-collagen-cream') route
  ) is distinct from 'replacement:ceramide-cushion' then
    raise exception 'Green Collagen slug does not resolve directly to Ceramide Cushion'
      using errcode = '23514';
  end if;

  if not exists (
    select 1 from public.products product
    where product.id = v_ceramide_id
      and product.catalog_status = 'active'
      and product.status = 'coming_soon'
  ) or exists (
    select 1 from public.product_variants variant
    where variant.product_id = v_ceramide_id
  ) then
    raise exception 'Ceramide Cushion publication or zero-commerce state drifted'
      using errcode = '23514';
  end if;

  select jsonb_build_object(
    'product', to_jsonb(product) - 'catalog_status' - 'updated_at',
    'sources', (
      select coalesce(jsonb_agg(to_jsonb(source) order by source.product_id), '[]'::jsonb)
      from public.product_sources source where source.product_id = v_green_id
    ),
    'content', (
      select coalesce(jsonb_agg(to_jsonb(content) order by content.product_id), '[]'::jsonb)
      from public.product_pdp_content content where content.product_id = v_green_id
    ),
    'media', (
      select coalesce(jsonb_agg(to_jsonb(media) order by media.id), '[]'::jsonb)
      from public.product_media media where media.product_id = v_green_id
    ),
    'variants', (
      select coalesce(jsonb_agg(to_jsonb(variant) order by variant.id), '[]'::jsonb)
      from public.product_variants variant where variant.product_id = v_green_id
    ),
    'revisions', (
      select coalesce(jsonb_agg(to_jsonb(revision) order by revision.id), '[]'::jsonb)
      from public.catalog_product_revisions revision where revision.product_id = v_green_id
    ),
    'audit', (
      select coalesce(jsonb_agg(to_jsonb(audit) order by audit.id), '[]'::jsonb)
      from public.catalog_editor_audit_log audit where audit.product_id = v_green_id
    )
  ) into strict v_green_history_after
  from public.products product
  where product.id = v_green_id;

  if v_green_history_after is distinct from v_green_history_before then
    raise exception 'Green Collagen history changed during replacement'
      using errcode = '23514';
  end if;
end
$publish_ceramide_cushion_replacement$;
