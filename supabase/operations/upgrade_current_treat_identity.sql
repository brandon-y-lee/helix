-- Session-local governed operation, never an application compatibility function.
-- Load inside an explicit transaction after the target preflight in
-- docs/operations/current-product-identity.md. This file performs no publication
-- until the operator calls the temporary function with the reviewed snapshot.
create or replace function pg_temp.upgrade_current_treat_identity(
  p_expected_document jsonb,
  p_expected_revision integer,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $operation$
declare
  v_product_ids uuid[];
  v_product_id uuid;
  v_product public.products%rowtype;
  v_source public.product_sources%rowtype;
  v_family_id uuid;
  v_locked_family_id uuid;
  v_document jsonb;
  v_after jsonb;
  v_revision integer;
  v_published public.catalog_product_revisions%rowtype;
  v_affected integer;
begin
  -- Later row/table locks cannot refresh a snapshot established before a
  -- normal Create Draft commits. Refuse it before any read, lock or no-op.
  if current_setting('transaction_isolation') is distinct from 'read committed' then
    raise exception 'current identity operation requires READ COMMITTED isolation'
      using errcode = '25001';
  end if;

  if p_expected_document is null
     or p_expected_document ->> 'schemaVersion' is distinct from '4'
     or p_expected_revision is null or p_expected_revision < 0
     or not exists (
       select 1 from public.admin_memberships
       where user_id = p_actor_id and role = 'admin' and active
     )
  then
    raise exception 'current identity operation requires a reviewed V4 snapshot and active administrator'
      using errcode = '22023';
  end if;

  -- The reviewed input supplies an environment-specific lock target. Its
  -- identity is verified below; it is never a portable live UUID constant.
  v_product_id := (p_expected_document ->> 'productId')::uuid;

  -- Match the current publication wrapper: family advisory lock and family row,
  -- then all affected Product rows in UUID order. The slug trigger owns its
  -- existing reservation lock; this operation does not rename those lock keys.
  select family_id into v_family_id from public.product_family_memberships
  where product_id = v_product_id;
  if v_family_id is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('helix-product-family:' || v_family_id::text, 0)
    );
    perform 1 from public.product_families where id = v_family_id for update;
  end if;
  perform 1 from public.products product
  where product.id = v_product_id or product.id in (
    select product_id from public.product_family_memberships where family_id = v_family_id
  ) order by product.id for update;
  select family_id into v_locked_family_id from public.product_family_memberships
  where product_id = v_product_id;
  if v_locked_family_id is distinct from v_family_id then
    raise exception 'Product Family advanced during preflight' using errcode = '40001';
  end if;

  -- A row lock cannot protect a missing competing identity/provenance row.
  -- Briefly fence canonical writers, then resolve the whole candidate set.
  -- NOWAIT refuses an in-flight independent edit instead of waiting while
  -- holding Product locks. The operator must keep this transaction bounded.
  lock table public.products, public.product_sources
    in share row exclusive mode nowait;
  select array_agg(product.id order by product.id) into v_product_ids
  from public.products product
  left join public.product_sources source on source.product_id = product.id
  where product.slug in ('peptide-bounce', 'maxxing-serum', 'super-serum')
     or (source.supplier = 'Leaders Cosmetics USA'
         and source.supplier_product_id = '7465003057234');
  if coalesce(cardinality(v_product_ids), 0) <> 1 then
    raise exception 'current identity operation requires exactly one unambiguous Product'
      using errcode = '23514';
  end if;
  if v_product_id is distinct from v_product_ids[1] then
    raise exception 'reviewed snapshot identifies a different Product' using errcode = '23514';
  end if;

  select * into strict v_product from public.products where id = v_product_id;
  select * into v_source from public.product_sources where product_id = v_product_id for update;
  if not found
     or v_source.supplier is distinct from 'Leaders Cosmetics USA'
     or v_source.supplier_title is distinct from 'PDRN 5% Active Ampoule'
     or v_source.supplier_handle is distinct from 'pdrn-5-active-ampoule'
     or v_source.supplier_product_id is distinct from '7465003057234'
     or v_source.supplier_url is distinct from 'https://www.leaderscosmeticsusa.com/products/pdrn-5-active-ampoule'
     or v_source.source_content_hash is distinct from '03843cc7f6ab3d184e625c3b14211e3e4667e64644f1a5ee16091382eb61c69b'
     or v_source.source_inspected_at is distinct from '2026-06-18T13:39:04.293Z'::timestamptz
     or v_product.system_step_name is distinct from 'TREAT'
     or v_product.routine_group is distinct from 'core'
     or v_product.product_type is distinct from 'PDRN serum'
     or nullif(v_product.ingredients, '') is null
     or v_product.ingredients is distinct from v_source.raw_source #>> '{catalogProduct,ingredients}'
     or not exists (
       select 1 from public.product_variants
       where product_id = v_product_id and variant_key = '30ml'
         and sku = '8809672285263' and supplier_variant_id = '42072641208402'
     )
  then
    raise exception 'current identity Product provenance is not the approved formulation'
      using errcode = '23514';
  end if;
  if exists (
    select 1 from public.product_content_drafts
    where product_id = v_product_id and status in ('draft', 'ready')
  ) then
    raise exception 'current identity operation cannot replace an active Catalog Draft'
      using errcode = '23514';
  end if;
  select coalesce(max(revision_number), 0) into v_revision
  from public.catalog_product_revisions where product_id = v_product_id;

  -- Replays and environments already on the current identity never overwrite
  -- later governed editorial content, SEO, media, offers, or revision history.
  if v_product.slug = 'super-serum' and v_product.display_name = 'Super Serum' then
    return jsonb_build_object('ok', true, 'outcome', 'no-op',
      'productId', v_product_id, 'revision', v_revision);
  end if;
  if (
    (v_product.slug = 'peptide-bounce' and v_product.display_name = 'Peptide Bounce'
      and v_product.seo_title = 'Peptide Bounce — PDRN serum | helix')
    or (v_product.slug = 'maxxing-serum' and v_product.display_name = 'Maxxing Serum'
      and v_product.seo_title = 'Maxxing Serum — PDRN serum | helix')
  ) is not true then
    raise exception 'Product identity fields are not a declared predecessor'
      using errcode = '23514';
  end if;
  if v_revision <> p_expected_revision then
    raise exception 'Catalog revision advanced after preflight' using errcode = '40001';
  end if;
  v_document := public.get_catalog_editor_document(v_product_id);
  if v_document is distinct from p_expected_document then
    raise exception 'Catalog facts advanced after preflight' using errcode = '40001';
  end if;
  if exists (select 1 from public.product_slug_routes where source_slug = 'super-serum') then
    raise exception 'Super Serum URL is already reserved' using errcode = '23514';
  end if;

  update public.products set
    slug = 'super-serum', display_name = 'Super Serum',
    seo_title = 'Super Serum — PDRN serum | helix'
  where id = v_product_id;
  get diagnostics v_affected = row_count;
  if v_affected <> 1 then
    raise exception 'current identity operation expected exactly one Product update';
  end if;
  if not exists (
    select 1 from public.product_slug_routes
    where source_slug = 'super-serum' and source_product_id = v_product_id
      and target_product_id = v_product_id and route_kind = 'canonical'
  ) or not exists (
    select 1 from public.product_slug_routes
    where source_slug = v_product.slug and source_product_id = v_product_id
      and target_product_id = v_product_id and route_kind = 'rename'
  ) then
    raise exception 'current schema did not preserve governed slug history';
  end if;
  v_after := public.get_catalog_editor_document(v_product_id);
  if (v_after #- '{product,slug}' #- '{product,display_name}'
      #- '{product,seo_title}' #- '{product,updated_at}')
     is distinct from
     (v_document #- '{product,slug}' #- '{product,display_name}'
      #- '{product,seo_title}' #- '{product,updated_at}') then
    raise exception 'current identity operation changed unapproved Catalog facts';
  end if;
  insert into public.catalog_product_revisions (
    product_id, revision_number, schema_version, document, published_by
  ) values (v_product_id, v_revision + 1, 4, v_after, p_actor_id)
  returning * into v_published;
  insert into public.catalog_editor_audit_log (
    action, actor_id, product_id, revision_id, metadata
  ) values (
    'slug.rename.published', p_actor_id, v_product_id, v_published.id,
    jsonb_build_object('source', 'spec-358-current-treat-identity',
      'oldSlug', v_product.slug, 'newSlug', 'super-serum',
      'revision', v_published.revision_number,
      'changedFields', jsonb_build_array('slug', 'display_name', 'seo_title'))
  );
  return jsonb_build_object('ok', true, 'outcome', 'published',
    'productId', v_product_id, 'revision', v_published.revision_number);
end;
$operation$;

revoke all on function pg_temp.upgrade_current_treat_identity(jsonb, integer, uuid)
  from public, anon, authenticated, service_role;
