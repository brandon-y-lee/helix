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
        'SEAL', 'core', 'active', 'coming_soon'),
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

  -- These fingerprints pin the exact approved staging projection without
  -- duplicating long public copy or media URLs in release tooling. Missing
  -- evidence is intentional and explicit (for example Mineral Guard has no
  -- source/INCI/media dossier yet), so any later change must be reconciled and
  -- re-approved instead of silently appearing stronger.
  if (
    with expected(
      slug, supplier_title, source_present, pdp_present,
      provenance_hash, education_hash, claims_hash, presentation_hash, inci_hash,
      cautions_hash, media_hash, relationships_hash, offers_hash
    ) as (values
      ('balancing-prep', 'Pore Tightening Pad', true, true,
        'b8d2171bd80c6aef57ea2dbba3f6e070', '60f3388ba7f5f9df7574ba181a0454ad',
        '03fd41764448c3e017b6c72fc3f0a794', '3e62d3e910bfa7978d0b96f156e5a1f0',
        '48d14ca463e79a6e779c325a56309293', 'cc27c5b51a79ce2b61a47d7d47708fc9',
        '9fdb3c9a2243246cd0dc0a867e2f2866',
        'd6092fe292497dc8287ea977d1c22f0e', 'c7eb0df0b4ee6c60974dadc85469f5f0'),
      ('beaming-prep', 'Vita Blemish Pad', true, true,
        '053a4614d87d1e8fa6684a5f1e003646', 'b14cf6b41a18fa36fe18f93d36fb8f42',
        '5b2c93aa51a5b4aa7636e7256e056d09', 'b71fe1e4658df21deabe98b3c310c659',
        'd4bb77f4915900e5a3d87267b49cd344', 'cc27c5b51a79ce2b61a47d7d47708fc9',
        '6a1a5902b06a73ea3d0db06fdd1bffda',
        'd751713988987e9331980363e24189ce', 'd751713988987e9331980363e24189ce'),
      ('biotic-reset', 'Leaders Calming Biotics Gel Cleanser', true, true,
        'ca865138b45da7dca6deaf38ad24bdef', '22d63e18678118480f4da44c7065e02a',
        'ec1a80890fb1aea39bf359187f8d9d44', 'baedfc56a3b34c3838677fe2c43f77ad',
        'd41d8cd98f00b204e9800998ecf8427e', 'd751713988987e9331980363e24189ce',
        'eb9a38a03129b53c592acbd86b6bd0f7',
        'b66bb949b160e4f455175e7ad2743a1c', '94fa92f90f4ecaac89e9368e58c32635'),
      ('ceramide-cushion', 'Leaders Calming Biotics Intensive Cream', true, true,
        '04c2dcf2e00ad27952773c1534d0f313', '95639fbf0ca266628f67c98ad9bf7e1f',
        '745e1e9a29072ab4fb7363bf95660243', 'ec4015c69b7136a8704cb13a73f70e6f',
        '11ae6cef73a6b726f1bc651caf7422c9', '9b8cf0795b173c5fc5c7c493d7f9d7c6',
        '23a750a0bdcd8c50347a0dc7768edfb7',
        '98cd887203ea344dc82a227a0b861469', 'd751713988987e9331980363e24189ce'),
      ('chilling-prep', 'TECA Cooling Pad', true, true,
        'b7efc824e2406128ee82c5eac371e586', '401d6e96261df4732542e6da82cd47a4',
        '1b45e233ff6ee55bd7f12368b0d04d73', 'f551782973abb9da98eadd85d28530ef',
        '63024e3de0d25df409fa259aaa58c019', '80a16745bd0e6d51fdccb514ed361b70',
        'c7696bbd11ea1eb4d4797a5db8874e41',
        'd751713988987e9331980363e24189ce', 'd751713988987e9331980363e24189ce'),
      ('mineral-guard', null, false, false,
        'c97a317206ecd09ae08b734f344f8cc6', 'f151a65e95fafd9372c5a80278160854',
        '9be178d743767bf06a1d3521d68328aa', '05fdad0129db55169e87a127c03d18a9',
        'd41d8cd98f00b204e9800998ecf8427e', 'a1264baebb63b603d6639813a2dd919d',
        'd751713988987e9331980363e24189ce',
        'd751713988987e9331980363e24189ce', 'd751713988987e9331980363e24189ce'),
      ('peptide-bounce', 'PDRN 5% Active Ampoule', true, true,
        '68b115255c823a786ac53422b941db23', 'e083fe64edaf2a797538c5a56d356ae4',
        'e34c0080ab71a91010bf2c59d5ff6d0c', '85ef28063f6931786a4d4aadb62d0b94',
        '68ebef34672c1380287b36af293eacaf', 'd751713988987e9331980363e24189ce',
        '0825eb5775d7ca0c4aba3884548ff814',
        '190dbd89e61fbd886fac03045f98aa92', '7f548d8f5d8b1ccb2160b2b5fdaea369'),
      ('peptide-eye-cream', 'PDRN+ 2% Flat Eyebag Cream', true, true,
        'c8a562ea5967be4ec1e3598133b6bc3c', '58882de78b110e1fed75ef3e12451620',
        '56d258f74199425e324dea67c9a08c61', 'a2bf5cd4eaa952bff9c698a61b523702',
        'd87f5ef68722a333e0e055d027019274', 'a47ed5748f46594b330be9f875d076ed',
        '7e49b530d8496a6c1a89fc1c063a840d',
        '9ecd434ac7f15fe4833e66b66c35d041', '904150ecb2f258461d8bbfd0682a5944'),
      ('peptide-nourish-mask', 'PDRN 0.5% Lifting Mask', true, true,
        '30917866658feaacb46c1d0da6400c44', '35992928b6405f918e08b61325746824',
        '80938a018a01a5fab45af1605d1b399e', 'e5ab501af3efa84e5c971d0331a95f82',
        '4de7d92f9073a36c50e08d7e62d784c3', '2d8f77f1891a82258be676f48d22fc41',
        '17954927055f626db1c3ddb82d883eea',
        '44ab24ad7b46ea107c42f70e8038adbc', '34a076f6d583978d89d6ae244ea75bef'),
      ('polishing-prep', 'PEEL STEP PHA Deep Peeling Pad', true, true,
        'e53bc9c790d230cbb64ef193ada22b0f', '692a35ba42e305b436c3f5ed95a1205e',
        '51db33b40c13a419c4b57fa0de4ea264', '4863a3dd21bc6fb0a41dc7adb6f1b4d0',
        'd41d8cd98f00b204e9800998ecf8427e', 'bf50c8a7afc471b2f3390c4e3699b657',
        '60fd7fbbd3f30679262e3c7bb845ab5b',
        'd751713988987e9331980363e24189ce', 'd751713988987e9331980363e24189ce')
    ), actual as (
      select product.slug, source.supplier_title,
        source.product_id is not null as source_present,
        content.content is not null as pdp_present,
        md5(jsonb_build_object(
          'supplier', source.supplier, 'handle', source.supplier_handle,
          'title', source.supplier_title, 'url', source.supplier_url,
          'source_hash', source.source_content_hash,
          'version_notes', source.formulation_version_notes
        )::text) as provenance_hash,
        md5(jsonb_build_object(
          'description', product.editorial_description,
          'how_to_use', product.editorial_how_to_use,
          'seo_description', product.seo_description,
          'pdp', coalesce(content.content, '{}'::jsonb)
        )::text) as education_hash,
        md5(jsonb_build_object(
          'benefits', to_jsonb(product.benefits),
          'formula_notes', to_jsonb(product.formula_notes),
          'good_for', product.good_for, 'made_for', product.made_for,
          'concerns', to_jsonb(product.concerns),
          'skin_types', to_jsonb(product.skin_types),
          'key_ingredients', to_jsonb(product.key_ingredients)
        )::text) as claims_hash,
        md5(jsonb_build_object(
          'badge', product.badge, 'texture', product.texture,
          'finish', product.finish, 'volume', product.volume,
          'usage_time', to_jsonb(product.usage_time),
          'swatch_from', product.swatch_from, 'swatch_to', product.swatch_to,
          'sort_order', product.sort_order, 'routine_sort', product.routine_sort,
          'search_keywords', to_jsonb(product.search_keywords),
          'currency', product.currency, 'seo_title', product.seo_title
        )::text) as presentation_hash,
        md5(coalesce(product.ingredients, '')) as inci_hash,
        md5(to_jsonb(product.cautions)::text) as cautions_hash,
        md5(media.contract::text) as media_hash,
        md5(relationships.contract::text) as relationships_hash,
        md5(offers.contract::text) as offers_hash
      from public.products product
      left join public.product_sources source on source.product_id = product.id
      left join lateral (
        select to_jsonb(pdp) - 'created_at' - 'updated_at' - 'product_id' as content
        from public.product_pdp_content pdp where pdp.product_id = product.id
      ) content on true
      left join lateral (
        select coalesce(jsonb_agg(jsonb_build_object(
          'role', item.role, 'type', item.media_type, 'sort', item.sort_order,
          'alt', item.alt, 'url', item.url, 'palette', item.palette_id,
          'width', item.width, 'height', item.height,
          'placeholder_palette', item.placeholder_palette,
          'variant_id', item.variant_id
        ) order by item.role, item.sort_order, item.id), '[]'::jsonb) as contract
        from public.product_media item
        where item.product_id = product.id and item.archived_at is null
      ) media on true
      left join lateral (
        select coalesce(jsonb_agg(jsonb_build_object(
          'type', relation.relationship_type, 'slug', related.slug,
          'sort', relation.sort_order
        ) order by relation.relationship_type, relation.sort_order, related.slug),
          '[]'::jsonb) as contract
        from public.product_relationships relation
        join public.products related on related.id = relation.related_product_id
        where relation.product_id = product.id and relation.archived_at is null
      ) relationships on true
      left join lateral (
        select coalesce(jsonb_agg(jsonb_build_object(
          'variant_key', offer.variant_key, 'label', offer.label,
          'price_cents', offer.price_cents,
          'compare_at_price_cents', offer.compare_at_price_cents,
          'available', offer.available,
          'inventory_status', offer.inventory_status, 'sku', offer.sku,
          'supplier_variant_id', offer.supplier_variant_id,
          'volume', offer.volume, 'pack_count', offer.pack_count,
          'option_values', offer.option_values, 'sort_order', offer.sort_order,
          'archived', offer.archived_at is not null
        ) order by offer.sort_order, offer.id), '[]'::jsonb) as contract
        from public.product_variants offer where offer.product_id = product.id
      ) offers on true
      where product.slug in (
        'biotic-reset', 'peptide-bounce', 'ceramide-cushion', 'mineral-guard',
        'balancing-prep', 'polishing-prep', 'beaming-prep', 'chilling-prep',
        'peptide-eye-cream', 'peptide-nourish-mask'
      )
    )
    select count(*)
    from expected
    full join actual using (slug)
    where expected.slug is null or actual.slug is null
       or row(
         actual.supplier_title, actual.source_present, actual.pdp_present,
         actual.provenance_hash, actual.education_hash, actual.claims_hash,
         actual.presentation_hash, actual.inci_hash, actual.cautions_hash, actual.media_hash,
         actual.relationships_hash, actual.offers_hash
       ) is distinct from row(
         expected.supplier_title, expected.source_present, expected.pdp_present,
         expected.provenance_hash, expected.education_hash, expected.claims_hash,
         expected.presentation_hash, expected.inci_hash, expected.cautions_hash, expected.media_hash,
         expected.relationships_hash, expected.offers_hash
       )
  ) <> 0 then
    raise exception 'selected Product provenance/content evidence drifted';
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
        product.display_name || ' — ' || product.product_type || ' | helix'
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

  if not exists (
    select 1
    from public.products green
    join public.products replacement on replacement.slug = 'ceramide-cushion'
    where green.slug = 'seal-05-green-collagen-cream'
      and green.catalog_status = 'archived'
      and replacement.catalog_status = 'active'
      and replacement.status = 'coming_soon'
      and (
        select count(*)
        from public.product_slug_routes route
        where route.source_product_id = green.id
          and route.target_product_id = replacement.id
          and route.route_kind = 'replacement'
      ) = 1
  ) then
    raise exception 'Green Collagen replacement lifecycle drifted';
  end if;

  if exists (
    select 1
    from public.product_relationships relationship
    join public.products source on source.id = relationship.product_id
    join public.products green on green.id = relationship.related_product_id
    where green.slug = 'seal-05-green-collagen-cream'
      and relationship.archived_at is null
      and source.catalog_status = 'active'
  ) then
    raise exception 'an Active Product still points to archived Green Collagen';
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
  ) <> (
    select count(*)
    from public.products product
    where not exists (
      select 1
      from public.product_slug_routes route
      where route.source_product_id = product.id
        and route.route_kind = 'replacement'
    )
  ) or exists (
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
      'biotic-reset', 'peptide-bounce', 'ceramide-cushion',
      'mineral-guard', 'balancing-prep',
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
