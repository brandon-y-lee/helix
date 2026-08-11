-- Run against the verified approved non-production project after every Catalog
-- Strategy migration and publication has completed. This is a read-only release
-- reconciliation; the transaction is rolled back as an additional safeguard.

begin;

set local lock_timeout = '10s';
set local statement_timeout = '120s';

do $staging_catalog_reconciliation$
declare
  v_expected_selected_count constant integer := 10;
begin
  if (
    select jsonb_agg(
      jsonb_build_object('position', step.position, 'name', step.name)
      order by step.position
    )
    from public.system_steps step
  ) is distinct from jsonb_build_array(
    jsonb_build_object('position', 1, 'name', 'CLEANSE'),
    jsonb_build_object('position', 2, 'name', 'REFINE'),
    jsonb_build_object('position', 3, 'name', 'TREAT'),
    jsonb_build_object('position', 4, 'name', 'FRAME'),
    jsonb_build_object('position', 5, 'name', 'SEAL'),
    jsonb_build_object('position', 6, 'name', 'PROTECT'),
    jsonb_build_object('position', 7, 'name', 'LIFT')
  ) then
    raise exception 'fixed System Step contract drifted';
  end if;

  if (
    with expected(
      display_name, product_type, slug, system_step_name, routine_group,
      catalog_status, merchandising_status
    ) as (values
      ('Biotic Reset', 'Daily gel cleanser', 'biotic-reset',
        'CLEANSE', 'core', 'active', 'coming_soon'),
      ('Peptide Bounce', 'PDRN serum', 'peptide-bounce',
        'TREAT', 'core', 'active', 'coming_soon'),
      ('Ceramide Cushion', 'Intensive moisture cream', 'ceramide-cushion',
        'SEAL', 'core', 'draft', 'coming_soon'),
      ('Mineral Guard', 'Mineral facial sunscreen', 'mineral-guard',
        'PROTECT', 'beyond_core', 'active', 'waitlist'),
      ('Balancing Prep', 'Daily toner pads', 'balancing-prep',
        'REFINE', 'beyond_core', 'active', 'coming_soon'),
      ('Polishing Prep', 'PHA + LHA exfoliating pads', 'polishing-prep',
        'REFINE', 'beyond_core', 'active', 'waitlist'),
      ('Beaming Prep', 'Niacinamide brightening pads', 'beaming-prep',
        'REFINE', 'beyond_core', 'active', 'waitlist'),
      ('Chilling Prep', 'TECA cooling pads', 'chilling-prep',
        'REFINE', 'beyond_core', 'active', 'waitlist'),
      ('Peptide Eye Cream', 'PDRN eye cream', 'peptide-eye-cream',
        'FRAME', 'beyond_core', 'active', 'coming_soon'),
      ('Peptide Nourish Mask', 'PDRN sheet mask', 'peptide-nourish-mask',
        'LIFT', 'beyond_core', 'active', 'coming_soon')
    )
    select count(*)
    from expected
    left join public.products product
      on product.display_name = expected.display_name
     and product.product_type = expected.product_type
     and product.slug = expected.slug
     and product.system_step_name = expected.system_step_name
     and product.routine_group = expected.routine_group
     and product.catalog_status = expected.catalog_status
     and product.status = expected.merchandising_status
    where product.id is null
  ) <> 0 or (
    select count(*)
    from public.products
    where slug in (
      'biotic-reset', 'peptide-bounce', 'ceramide-cushion', 'mineral-guard',
      'balancing-prep', 'polishing-prep', 'beaming-prep', 'chilling-prep',
      'peptide-eye-cream', 'peptide-nourish-mask'
    )
  ) <> v_expected_selected_count then
    raise exception 'selected ten-Product identity or status matrix drifted';
  end if;

  if exists (
    select 1
    from public.products product
    where product.slug in (
      'biotic-reset', 'peptide-bounce', 'ceramide-cushion', 'mineral-guard',
      'balancing-prep', 'polishing-prep', 'beaming-prep', 'chilling-prep',
      'peptide-eye-cream', 'peptide-nourish-mask'
    )
      and product.seo_title is distinct from
        product.display_name || ' — ' || product.product_type || ' | Mei Pelle'
  ) then
    raise exception 'selected Product title composition or metadata drifted';
  end if;

  if (
    select count(*)
    from public.products product
    where product.catalog_status = 'active'
      and product.status = 'waitlist'
      and product.slug in (
        'mineral-guard', 'polishing-prep', 'beaming-prep', 'chilling-prep'
      )
  ) <> 4 or exists (
    select 1
    from public.product_variants offer
    join public.products product on product.id = offer.product_id
    where product.slug in (
      'mineral-guard', 'polishing-prep', 'beaming-prep', 'chilling-prep'
    )
      and offer.archived_at is null
  ) then
    raise exception 'waitlist Product visibility or zero-Offer contract drifted';
  end if;

  if exists (
    select 1
    from public.product_variants offer
    join public.products product on product.id = offer.product_id
    where product.slug in (
      'biotic-reset', 'peptide-bounce', 'ceramide-cushion', 'mineral-guard',
      'balancing-prep', 'polishing-prep', 'beaming-prep', 'chilling-prep',
      'peptide-eye-cream', 'peptide-nourish-mask'
    )
      and offer.archived_at is null
      and offer.available
  ) then
    raise exception 'a selected Product exposes an unverified purchasable Offer';
  end if;

  if exists (
    select 1
    from public.products product
    where product.slug in (
      'biotic-reset', 'peptide-bounce', 'ceramide-cushion', 'mineral-guard',
      'balancing-prep', 'polishing-prep', 'beaming-prep', 'chilling-prep',
      'peptide-eye-cream', 'peptide-nourish-mask'
    )
      and (
        nullif(btrim(product.ingredients), '') is null
        or not exists (
          select 1 from public.product_sources source
          where source.product_id = product.id
        )
        or not exists (
          select 1 from public.product_media media
          where media.product_id = product.id
        )
      )
      and (
        product.status = 'available'
        or exists (
          select 1 from public.product_variants offer
          where offer.product_id = product.id
            and offer.archived_at is null
            and offer.available
        )
      )
  ) then
    raise exception 'missing Formula or media evidence did not fail closed';
  end if;

  if (
    select jsonb_agg(
      jsonb_build_object(
        'option', membership.option_label,
        'slug', product.slug,
        'entry', membership.is_entry
      ) order by membership.sort_order
    )
    from public.product_family_memberships membership
    join public.product_families family on family.id = membership.family_id
    join public.products product on product.id = membership.product_id
    where family.slug = 'refine'
  ) is distinct from jsonb_build_array(
    jsonb_build_object('option', 'General', 'slug', 'balancing-prep', 'entry', true),
    jsonb_build_object('option', 'Exfoliating', 'slug', 'polishing-prep', 'entry', false),
    jsonb_build_object('option', 'Brightening', 'slug', 'beaming-prep', 'entry', false),
    jsonb_build_object('option', 'Cooling', 'slug', 'chilling-prep', 'entry', false)
  ) then
    raise exception 'REFINE Product Family identity, order, or entry drifted';
  end if;

  if not exists (
    select 1
    from public.products green
    join public.product_sources source on source.product_id = green.id
    where green.slug = 'seal-05-green-collagen-cream'
      and source.supplier_title = 'Green Collagen Hydrate Boosting Cream'
  ) then
    raise exception 'historical Green Collagen Product identity is not preserved';
  end if;

  if exists (
    select 1
    from public.products green
    join public.products replacement on replacement.slug = 'ceramide-cushion'
    where green.slug = 'seal-05-green-collagen-cream'
      and green.catalog_status = 'active'
      and replacement.catalog_status = 'draft'
      and exists (
        select 1 from public.product_slug_routes route
        where route.source_product_id = green.id
          and route.target_product_id = replacement.id
          and route.route_kind = 'replacement'
      )
  ) then
    raise exception 'Green Collagen was replaced before Ceramide Cushion eligibility';
  end if;

  if exists (
    select 1
    from public.products green
    join public.products replacement on replacement.slug = 'ceramide-cushion'
    where green.slug = 'seal-05-green-collagen-cream'
      and green.catalog_status = 'archived'
      and replacement.catalog_status = 'active'
      and (
        select count(*)
        from public.product_slug_routes route
        where route.source_product_id = green.id
          and route.target_product_id = replacement.id
          and route.route_kind = 'replacement'
      ) <> 1
  ) then
    raise exception 'eligible Green Collagen replacement lacks one durable route';
  end if;

  if (
    with expected(source_slug, target_slug) as (values
      ('reset-01-calming-gel-cleanser', 'biotic-reset'),
      ('cleanse-01-calming-gel-cleanser', 'biotic-reset'),
      ('recode-03-pdrn-5-ampoule', 'peptide-bounce'),
      ('treat-03-pdrn-5-ampoule', 'peptide-bounce'),
      ('refine-02-pore-treatment-pads', 'balancing-prep'),
      ('frame-04-pdrn-eye-cream', 'peptide-eye-cream'),
      ('lift-06-pdrn-mask-system', 'peptide-nourish-mask')
    )
    select count(*)
    from expected
    left join public.product_slug_routes route
      on route.source_slug = expected.source_slug
     and route.route_kind = 'rename'
    left join public.products target
      on target.id = route.target_product_id
     and target.slug = expected.target_slug
    where target.id is null
  ) <> 0 or (
    select count(*)
    from public.product_slug_routes route
    where route.route_kind = 'canonical'
  ) <> (select count(*) from public.products) or exists (
    select 1
    from public.product_slug_routes route
    join public.product_slug_routes next_route
      on next_route.source_slug = (
        select target.slug
        from public.products target
        where target.id = route.target_product_id
      )
    where route.route_kind <> 'canonical'
      and next_route.route_kind <> 'canonical'
  ) then
    raise exception 'canonical Product routes are incomplete, chained, or drifted';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'products'
      and column_name in (
        'formal_title', 'card_tagline',
        'routine_step_name', 'routine_step_number'
      )
  ) then
    raise exception 'retired Product identity columns remain live';
  end if;

  if exists (
    select 1
    from public.product_content_drafts
    where status in ('draft', 'ready')
  ) or exists (
    select required.action
    from unnest(array[
      'draft.created', 'draft.saved', 'draft.validated', 'draft.ready',
      'draft.published', 'draft.restored', 'draft.discarded'
    ]) as required(action)
    where not exists (
      select 1 from public.catalog_editor_audit_log audit
      where audit.action = required.action
    )
  ) then
    raise exception 'Catalog Editor lifecycle or active-draft reconciliation drifted';
  end if;

  if exists (
    select 1
    from public.products product
    where product.slug in (
      'biotic-reset', 'peptide-bounce', 'mineral-guard', 'balancing-prep',
      'polishing-prep', 'beaming-prep', 'chilling-prep',
      'peptide-eye-cream', 'peptide-nourish-mask'
    )
      and not exists (
        select 1
        from public.catalog_product_revisions revision
        where revision.product_id = product.id
          and revision.schema_version = 4
      )
  ) then
    raise exception 'published selected Products lack immutable v4 revisions';
  end if;

  if has_table_privilege('anon', 'public.products', 'insert')
     or has_table_privilege('authenticated', 'public.products', 'update')
     or has_table_privilege('anon', 'public.product_variants', 'delete')
     or has_table_privilege('authenticated', 'public.product_media', 'truncate')
     or not has_table_privilege('anon', 'public.products', 'select')
     or not has_table_privilege('authenticated', 'public.product_media', 'select')
  then
    raise exception 'public Catalog grants are not read-only';
  end if;

  if has_schema_privilege('anon', 'private', 'usage')
     or has_schema_privilege('authenticated', 'private', 'usage')
     or has_function_privilege(
       'anon',
       'public.enroll_product_waitlist(uuid,text,boolean,text,text,text)',
       'execute'
     )
     or has_function_privilege(
       'authenticated',
       'public.enroll_product_waitlist(uuid,text,boolean,text,text,text)',
       'execute'
     )
     or not has_function_privilege(
       'service_role',
       'public.enroll_product_waitlist(uuid,text,boolean,text,text,text)',
       'execute'
     )
  then
    raise exception 'Product waitlist privacy or server-only execution drifted';
  end if;

  if exists (
    select 1
    from pg_proc function
    join pg_namespace namespace on namespace.oid = function.pronamespace
    where namespace.nspname = 'public'
      and function.proname = 'enroll_product_waitlist'
      and (
        not function.prosecdef
        or function.proconfig is distinct from array['search_path=""']::text[]
      )
  ) then
    raise exception 'Product waitlist function security boundary drifted';
  end if;
end;
$staging_catalog_reconciliation$;

rollback;
