-- Run read-only against the verified approved non-production project after the
-- Ceramide Cushion replacement migration and search/cache reconciliation.

begin;

set local lock_timeout = '10s';
set local statement_timeout = '120s';

do $ceramide_cushion_replacement_verification$
declare
  expected_green_history_hash constant text := 'd3ca56a60d5fc4ac34d8cffdfa761316';
  green_id uuid;
  ceramide_id uuid;
  green_history_hash text;
begin
  select id into strict green_id
  from public.products
  where slug = 'seal-05-green-collagen-cream'
    and display_name = 'SEAL'
    and catalog_status = 'archived'
    and status = 'available';

  select id into strict ceramide_id
  from public.products
  where slug = 'ceramide-cushion'
    and display_name = 'Ceramide Cushion'
    and product_type = 'Intensive moisture cream'
    and system_step_name = 'SEAL'
    and routine_group = 'core'
    and catalog_status = 'active'
    and status = 'coming_soon';

  if exists (
    select 1 from public.product_variants variant
    where variant.product_id = ceramide_id
  ) or (
    select count(*) from public.product_pdp_content content
    where content.product_id = ceramide_id
  ) <> 1 or (
    select count(*) from public.product_media media
    where media.product_id = ceramide_id
      and media.archived_at is null
      and media.variant_id is null
      and nullif(btrim(media.url), '') is not null
  ) <> 12 or (
    select count(*) from public.product_sources source
    where source.product_id = ceramide_id
      and source.supplier_handle = 'leaders-calming-biotics-intensive-cream'
  ) <> 1 then
    raise exception 'Ceramide Cushion publication facts or zero-commerce state drifted';
  end if;

  if exists (
    select 1 from public.product_pdp_content content
    where content.product_id = ceramide_id
      and to_jsonb(content)::text ~*
        '(3:1:1|100[- ]hour|barrier repair|penetrat|clinically|all skin types|hypoallergenic|dermatologist|vegan|cruelty[- ]free)'
  ) then
    raise exception 'unsupported claim entered published Ceramide Cushion content';
  end if;

  if (
    select count(*)
    from public.product_slug_routes route
    where route.source_slug = 'seal-05-green-collagen-cream'
      and route.source_product_id = green_id
      and route.target_product_id = ceramide_id
      and route.route_kind = 'replacement'
  ) <> 1 or (
    select route.route_kind || ':' || route.target_slug
    from public.resolve_product_slug('seal-05-green-collagen-cream') route
  ) is distinct from 'replacement:ceramide-cushion' then
    raise exception 'Green Collagen replacement route is missing or chained';
  end if;

  if exists (
    select 1
    from public.product_relationships relationship
    join public.products source on source.id = relationship.product_id
    where relationship.related_product_id = green_id
      and relationship.archived_at is null
      and source.catalog_status = 'active'
  ) then
    raise exception 'an Active Product still points to archived Green Collagen';
  end if;

  if (
    select jsonb_agg(
      jsonb_build_object('source', source.slug, 'sort', relationship.sort_order)
      order by source.slug
    )
    from public.product_relationships relationship
    join public.products source on source.id = relationship.product_id
    where relationship.related_product_id = ceramide_id
      and relationship.relationship_type = 'complete_the_routine'
      and relationship.archived_at is null
      and source.catalog_status = 'active'
  ) is distinct from jsonb_build_array(
    jsonb_build_object('source', 'balancing-prep', 'sort', 3),
    jsonb_build_object('source', 'biotic-reset', 'sort', 2),
    jsonb_build_object('source', 'peptide-bounce', 'sort', 2),
    jsonb_build_object('source', 'peptide-eye-cream', 'sort', 3),
    jsonb_build_object('source', 'peptide-nourish-mask', 'sort', 3)
  ) then
    raise exception 'Ceramide Cushion inbound Routine Complement graph drifted';
  end if;

  if (
    select jsonb_agg(target.slug order by relationship.sort_order)
    from public.product_relationships relationship
    join public.products target on target.id = relationship.related_product_id
    where relationship.product_id = ceramide_id
      and relationship.relationship_type = 'complete_the_routine'
      and relationship.archived_at is null
  ) is distinct from jsonb_build_array('biotic-reset', 'peptide-bounce') then
    raise exception 'Ceramide Cushion Core Routine Complement graph drifted';
  end if;

  if (
    select count(*)
    from public.catalog_product_revisions revision
    where revision.product_id = ceramide_id
      and revision.schema_version = 4
      and revision.document #>> '{product,catalog_status}' = 'active'
      and revision.document #>> '{product,status}' = 'coming_soon'
  ) <> 1 or (
    select count(*)
    from public.catalog_editor_audit_log audit
    where audit.product_id = ceramide_id
      and audit.action = 'slug.replacement.published'
      and audit.metadata #>> '{sourceSlug}' = 'seal-05-green-collagen-cream'
      and audit.metadata #>> '{targetSlug}' = 'ceramide-cushion'
      and audit.metadata #>> '{offerCount}' = '0'
  ) <> 1 then
    raise exception 'Ceramide Cushion revision or replacement audit drifted';
  end if;

  select md5(jsonb_build_object(
    'product', to_jsonb(product) - 'catalog_status' - 'updated_at',
    'sources', (
      select coalesce(jsonb_agg(to_jsonb(source) order by source.product_id), '[]'::jsonb)
      from public.product_sources source where source.product_id = product.id
    ),
    'content', (
      select coalesce(jsonb_agg(to_jsonb(content) order by content.product_id), '[]'::jsonb)
      from public.product_pdp_content content where content.product_id = product.id
    ),
    'media', (
      select coalesce(jsonb_agg(to_jsonb(media) order by media.id), '[]'::jsonb)
      from public.product_media media where media.product_id = product.id
    ),
    'variants', (
      select coalesce(jsonb_agg(to_jsonb(variant) order by variant.id), '[]'::jsonb)
      from public.product_variants variant where variant.product_id = product.id
    ),
    'revisions', (
      select coalesce(jsonb_agg(to_jsonb(revision) order by revision.id), '[]'::jsonb)
      from public.catalog_product_revisions revision where revision.product_id = product.id
    ),
    'audit', (
      select coalesce(jsonb_agg(to_jsonb(audit) order by audit.id), '[]'::jsonb)
      from public.catalog_editor_audit_log audit where audit.product_id = product.id
    )
  )::text) into strict green_history_hash
  from public.products product
  where product.id = green_id;

  if green_history_hash is distinct from expected_green_history_hash then
    raise exception 'Green Collagen historical Product facts drifted';
  end if;
end
$ceramide_cushion_replacement_verification$;

rollback;
