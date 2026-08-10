set lock_timeout = '10s';
set statement_timeout = '120s';

do $core_portfolio_migration$
declare
  v_cleanse_id uuid;
  v_treat_id uuid;
  v_green_id uuid;
  v_ceramide_id uuid := gen_random_uuid();
  v_cleanse_revision_id uuid;
  v_treat_revision_id uuid;
  v_cleanse_revision integer;
  v_treat_revision integer;
  v_changed integer;
  v_green_before jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('mei-pelle-core-portfolio-140', 0)
  );

  if (
    select count(*)
    from public.products p
    join public.product_sources s on s.product_id = p.id
    where p.slug = 'cleanse-01-calming-gel-cleanser'
      and p.system_step_name = 'CLEANSE'
      and p.routine_group = 'core'
      and s.supplier_title = 'Leaders Calming Biotics Gel Cleanser'
      and s.supplier_handle = 'copy-of-leaders-calming-biotics-cream-mask-80ml'
  ) <> 1 then
    raise exception
      'Core portfolio migration requires exactly one verified Calming Biotics Gel Cleanser Product'
      using errcode = '23514';
  end if;

  if (
    select count(*)
    from public.products p
    join public.product_sources s on s.product_id = p.id
    where p.slug = 'treat-03-pdrn-5-ampoule'
      and p.system_step_name = 'TREAT'
      and p.routine_group = 'core'
      and s.supplier_title = 'PDRN 5% Active Ampoule'
      and s.supplier_handle = 'pdrn-5-active-ampoule'
  ) <> 1 then
    raise exception
      'Core portfolio migration requires exactly one verified PDRN five-percent Active Ampoule Product'
      using errcode = '23514';
  end if;

  if (
    select count(*)
    from public.products p
    join public.product_sources s on s.product_id = p.id
    where p.slug = 'seal-05-green-collagen-cream'
      and s.supplier_title = 'Green Collagen Hydrate Boosting Cream'
  ) <> 1 then
    raise exception
      'Core portfolio migration requires the historical Green Collagen Product'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.products p
    left join public.product_sources s on s.product_id = p.id
    where p.slug = 'ceramide-cushion'
       or s.supplier_handle = 'leaders-calming-biotics-intensive-cream'
  ) then
    raise exception
      'Core portfolio migration found a conflicting Ceramide Cushion Product'
      using errcode = '23505';
  end if;

  select p.id into strict v_cleanse_id
  from public.products p
  join public.product_sources s on s.product_id = p.id
  where p.slug = 'cleanse-01-calming-gel-cleanser'
    and s.supplier_title = 'Leaders Calming Biotics Gel Cleanser';

  select p.id into strict v_treat_id
  from public.products p
  join public.product_sources s on s.product_id = p.id
  where p.slug = 'treat-03-pdrn-5-ampoule'
    and s.supplier_title = 'PDRN 5% Active Ampoule';

  select p.id into strict v_green_id
  from public.products p
  join public.product_sources s on s.product_id = p.id
  where p.slug = 'seal-05-green-collagen-cream'
    and s.supplier_title = 'Green Collagen Hydrate Boosting Cream';

  perform 1
  from public.products
  where id in (v_cleanse_id, v_treat_id, v_green_id)
  order by id
  for update;

  if exists (
    select 1
    from public.product_content_drafts d
    where d.product_id in (v_cleanse_id, v_treat_id)
      and d.status in ('draft', 'ready')
  ) then
    raise exception
      'Core portfolio migration cannot bypass an open Catalog draft'
      using errcode = '55000';
  end if;

  if (
    select count(*)
    from public.product_variants v
    where v.product_id = v_cleanse_id
      and v.archived_at is null
      and v.variant_key = '200ml'
      and v.supplier_variant_id = '40767571558482'
      and v.price_cents = 2200
  ) <> 1 then
    raise exception
      'Biotic Reset commerce facts do not match the preserved Formula identity'
      using errcode = '23514';
  end if;

  if (
    select count(*)
    from public.product_variants v
    where v.product_id = v_treat_id
      and v.archived_at is null
      and v.variant_key = '30ml'
      and v.sku = '8809672285263'
      and v.supplier_variant_id = '42072641208402'
      and v.price_cents = 2500
  ) <> 1 then
    raise exception
      'Peptide Bounce commerce facts do not match the preserved Formula identity'
      using errcode = '23514';
  end if;

  if not exists (
    select 1
    from public.product_slug_routes r
    where r.source_slug = 'cleanse-01-calming-gel-cleanser'
      and r.source_product_id = v_cleanse_id
      and r.target_product_id = v_cleanse_id
      and r.route_kind = 'canonical'
  ) or not exists (
    select 1
    from public.product_slug_routes r
    where r.source_slug = 'treat-03-pdrn-5-ampoule'
      and r.source_product_id = v_treat_id
      and r.target_product_id = v_treat_id
      and r.route_kind = 'canonical'
  ) then
    raise exception
      'Core portfolio migration requires canonical historical slug routes'
      using errcode = '23514';
  end if;

  if (select catalog_status from public.products where id = v_green_id)
     <> 'active' then
    raise exception
      'Green Collagen catalog_status <> ''active''; replacement gate is not eligible'
      using errcode = '23514';
  end if;

  v_green_before := private.catalog_editor_document_v4(v_green_id);

  update public.products
  set
    slug = 'biotic-reset',
    display_name = 'Biotic Reset',
    product_type = 'Daily gel cleanser',
    benefits = array['CLEAN', 'BALANCE', 'RESET']::text[],
    editorial_description = 'A fresh reset, without the squeaky-clean finish. This daily gel cleanser lifts sunscreen, oil, sweat, and surface buildup in a soft foam, then rinses clean so treatment layers spread evenly. Used consistently, it keeps the routine feeling clear, comfortable, and easy to repeat.',
    editorial_how_to_use = 'Massage onto damp skin, then rinse thoroughly. Use at night; morning cleansing can be added when needed. Follow with Peptide Bounce, then Ceramide Cushion when available.',
    made_for = null,
    good_for = 'Daily cleansing, sunscreen removal, surface buildup',
    texture = 'Fresh gel-to-soft-foam cleanser',
    badge = null,
    skin_types = '{}'::text[],
    concerns = array['Surface buildup', 'Daily cleansing']::text[],
    usage_time = array['Morning', 'Night']::text[],
    seo_title = 'Biotic Reset — Daily gel cleanser | Mei Pelle',
    seo_description = 'A daily gel cleanser that lifts sunscreen, oil, sweat, and surface buildup without a squeaky-clean finish.',
    search_keywords = array['biotic reset', 'daily gel cleanser', 'cleanse', 'sunscreen removal']::text[],
    formula_notes = array[
      'Formula identity preserved: Leaders Calming Biotics Gel Cleanser.',
      'Complete signed INCI, current SKU authorization, and Mei Pelle inventory confirmation remain pending.',
      'No stronger supplier efficacy claims are published by this migration.'
    ]::text[],
    status = 'coming_soon'
  where id = v_cleanse_id;
  get diagnostics v_changed = row_count;
  if v_changed <> 1 then
    raise exception 'Biotic Reset Product update did not affect exactly one row';
  end if;

  update public.products
  set
    slug = 'peptide-bounce',
    display_name = 'Peptide Bounce',
    product_type = 'PDRN serum',
    benefits = array['HYDRATE', 'SMOOTH', 'BOUNCE']::text[],
    editorial_description = 'Bounce, bottled. This lightweight PDRN serum sinks in fast with humectants, niacinamide, peptides, and adenosine for an immediately hydrated, supple-looking finish. With consistent use, skin looks smoother, brighter, and more even.',
    editorial_how_to_use = 'After cleansing, apply 2-3 drops across face and neck and press in for 30-60 seconds. Follow with Ceramide Cushion when available; finish with sunscreen in the daytime.',
    made_for = null,
    good_for = 'Dehydration, dullness, uneven-looking texture',
    texture = 'Lightweight, fast-settling serum',
    badge = null,
    skin_types = '{}'::text[],
    concerns = array['Dehydration', 'Dullness', 'Uneven-looking texture']::text[],
    usage_time = array['Morning', 'Night']::text[],
    seo_title = 'Peptide Bounce — PDRN serum | Mei Pelle',
    seo_description = 'A lightweight PDRN serum with humectants, niacinamide, peptides, and adenosine for hydrated, smoother-looking skin.',
    search_keywords = array['peptide bounce', 'PDRN serum', 'peptides', 'niacinamide', 'hydration']::text[],
    formula_notes = array[
      'Formula identity and Complete INCI preserved: Leaders PDRN 5% Active Ampoule.',
      'Current Mei Pelle inventory confirmation remains pending.',
      'No PDRN origin, clinical, regenerative, or medical claim is made by this migration.'
    ]::text[],
    status = 'coming_soon'
  where id = v_treat_id;
  get diagnostics v_changed = row_count;
  if v_changed <> 1 then
    raise exception 'Peptide Bounce Product update did not affect exactly one row';
  end if;

  update public.product_variants
  set
    available = false,
    inventory_status = 'unavailable'
  where product_id in (v_cleanse_id, v_treat_id)
    and archived_at is null;
  get diagnostics v_changed = row_count;
  if v_changed <> 2 then
    raise exception
      'Core portfolio migration expected exactly two preserved Offers to become unavailable'
      using errcode = '23514';
  end if;

  insert into public.products (
    id,
    slug,
    benefits,
    swatch_from,
    swatch_to,
    status,
    made_for,
    good_for,
    texture,
    product_type,
    catalog_status,
    badge,
    sort_order,
    key_ingredients,
    ingredients,
    cautions,
    finish,
    volume,
    skin_types,
    concerns,
    usage_time,
    seo_title,
    seo_description,
    search_keywords,
    display_name,
    editorial_description,
    editorial_how_to_use,
    formula_notes,
    routine_group,
    routine_sort,
    system_step_name
  ) values (
    v_ceramide_id,
    'ceramide-cushion',
    array['CUSHION', 'COMFORT', 'HOLD']::text[],
    '#e4dfd5',
    '#a99b8a',
    'coming_soon',
    null,
    'Dryness, tight-feeling skin, final moisture layer',
    'Thick, rich cream with a non-greasy supplier-described finish',
    'Intensive moisture cream',
    'draft',
    null,
    4,
    array['Glycerin', 'Oat kernel extract', 'Centella asiatica', 'Ceramide AP', 'Peptides']::text[],
    'Water, Dipropylene Glycol, Glycerin, Coco-Caprylate/Caprate, Methyl Gluceth-20, Fusidium Coccineum Ferment Filtrate, Cetyl Ethylhexanoate, Cetearyl Alcohol, Glyceryl Stearate, Cetyl Alcohol, Betaine, Phenyl Trimethicone, Cyclohexasiloxane, Cetearyl Olivate, Sorbitan Olivate, 1,2-Hexanediol, Cetearyl Glucoside, Hydroxyethyl Acrylate/Sodium Acryloyldimethyl Taurate Copolymer, Butylene Glycol, Caprylic/Capric Triglyceride, Tromethamine, Acrylates/C10-30 Alkyl Acrylate Crosspolymer, Avena Sativa (Oat) Kernel Extract, Caprylyl Glycol, Ethylhexylglycerin, C12-15 Alkyl Benzoate, Adenosine, Centella Asiatica Leaf Extract, Disodium EDTA, Hydrogenated Lecithin, Lactobacillus Ferment, Centella Asiatica Extract, 2,3-Butanediol, Sorbitan Isostearate, Ceramide AP, Triethylhexanoin, Sucrose Distearate, Glucose, Polyglyceryl-10 Oleate, Madecassic Acid, Hibiscus Esculentus Fruit Extract, Corchorus Olitorius Leaf Extract, Phytosterols, Carum Petroselinum (Parsley) Extract, Sodium Benzoate, Asiatic Acid, Behenyl Alcohol, Palmitic Acid, Stearic Acid, Asiaticoside, Potassium Sorbate, Madecassoside, Tocopherol, Polyglyceryl-2 Dioleate, Palmitoyl Pentapeptide-4, Quercetin, Mannitol, Acetyl Hexapeptide-8.',
    array['Patch test before first use. Stop use if irritation occurs.']::text[],
    'Cushioned and comfortable, not greasy',
    null,
    '{}'::text[],
    array['Dryness', 'Tight-feeling skin', 'Moisture retention']::text[],
    array['Morning', 'Night']::text[],
    'Ceramide Cushion — Intensive moisture cream | Mei Pelle',
    'A rich moisture cream candidate with glycerin, oat, centella, Ceramide AP, and peptides. Not yet available for purchase.',
    array['ceramide cushion', 'intensive moisture cream', 'ceramide AP', 'oat', 'centella']::text[],
    'Ceramide Cushion',
    'Comfort that stays put. This intensive moisture cream is designed as the final cushion over lighter treatment layers, with a rich, non-greasy supplier-described texture and a soft, composed finish. Its exact Mei Pelle Formula, packaging, and claims remain gated before publication.',
    'After treatment, smooth a thin layer over face and neck. Use more at night or where skin feels dry. In the morning, finish with sunscreen.',
    array[
      'Draft Formula candidate: Leaders Calming Biotics Intensive Cream.',
      'The public ingredient declaration is recorded; the signed exact OEM dossier and production Formula remain pending.',
      'The public 3:1:1 lipid-ratio, 100-hour moisture, barrier-repair, and penetration claims are not approved.',
      'SKU, price, inventory, Mei Pelle media, packaging, compatibility, stability, and sensory evidence remain pending.'
    ]::text[],
    'core',
    30,
    'SEAL'
  );

  insert into public.product_sources (
    product_id,
    supplier,
    supplier_title,
    supplier_url,
    supplier_handle,
    supplier_product_id,
    source_inspected_at,
    source_content_hash,
    original_source_price_cents,
    formulation_version_notes,
    raw_source
  ) values (
    v_ceramide_id,
    'Leaders Cosmetics Korea',
    'Leaders Calming Biotics Intensive Cream',
    'https://www.leaderscosmetics.com/product/detail.html?product_no=1117',
    'leaders-calming-biotics-intensive-cream',
    '1117',
    '2026-08-09T00:00:00Z'::timestamptz,
    null,
    null,
    'Current official retail evidence only. Signed exact OEM Formula, lipid-claim reconciliation, commercial facts, packaging, and launch evidence remain pending.',
    jsonb_build_object(
      'evidenceStatus', 'public-retail-source-only',
      'researchDate', '2026-08-09',
      'completeInciSource', 'official-public-page',
      'offerEligible', false,
      'mediaEligible', false,
      'blockedClaims', jsonb_build_array(
        '3:1:1 lipid ratio',
        '100-hour moisture',
        'barrier repair',
        'enhanced penetration'
      )
    )
  );

  update public.product_relationships
  set archived_at = statement_timestamp()
  where product_id in (v_cleanse_id, v_treat_id)
    and related_product_id = v_green_id
    and relationship_type = 'complete_the_routine'
    and archived_at is null;
  get diagnostics v_changed = row_count;
  if v_changed <> 2 then
    raise exception
      'Core portfolio migration expected two Green Collagen inbound Core relationships'
      using errcode = '23514';
  end if;

  insert into public.product_relationships (
    product_id,
    related_product_id,
    relationship_type,
    sort_order
  ) values
    (v_cleanse_id, v_ceramide_id, 'complete_the_routine', 2),
    (v_treat_id, v_ceramide_id, 'complete_the_routine', 2),
    (v_ceramide_id, v_cleanse_id, 'complete_the_routine', 1),
    (v_ceramide_id, v_treat_id, 'complete_the_routine', 2);

  select coalesce(max(revision_number), 0) + 1
  into v_cleanse_revision
  from public.catalog_product_revisions
  where product_id = v_cleanse_id;

  insert into public.catalog_product_revisions (
    product_id,
    revision_number,
    schema_version,
    document,
    source_draft_id,
    published_by
  ) values (
    v_cleanse_id,
    v_cleanse_revision,
    4,
    private.catalog_editor_document_v4(v_cleanse_id),
    null,
    null
  ) returning id into v_cleanse_revision_id;

  select coalesce(max(revision_number), 0) + 1
  into v_treat_revision
  from public.catalog_product_revisions
  where product_id = v_treat_id;

  insert into public.catalog_product_revisions (
    product_id,
    revision_number,
    schema_version,
    document,
    source_draft_id,
    published_by
  ) values (
    v_treat_id,
    v_treat_revision,
    4,
    private.catalog_editor_document_v4(v_treat_id),
    null,
    null
  ) returning id into v_treat_revision_id;

  insert into public.catalog_editor_audit_log (
    action,
    actor_id,
    product_id,
    revision_id,
    metadata
  ) values
    (
      'slug.rename.published',
      null,
      v_cleanse_id,
      v_cleanse_revision_id,
      jsonb_build_object(
        'source', 'migration-140',
        'oldSlug', 'cleanse-01-calming-gel-cleanser',
        'newSlug', 'biotic-reset',
        'revision', v_cleanse_revision,
        'offerAvailable', false
      )
    ),
    (
      'slug.rename.published',
      null,
      v_treat_id,
      v_treat_revision_id,
      jsonb_build_object(
        'source', 'migration-140',
        'oldSlug', 'treat-03-pdrn-5-ampoule',
        'newSlug', 'peptide-bounce',
        'revision', v_treat_revision,
        'offerAvailable', false
      )
    );

  if private.catalog_editor_document_v4(v_green_id)
     is distinct from v_green_before then
    raise exception
      'Green Collagen history changed before an eligible replacement existed'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.product_variants v
    where v.product_id = v_ceramide_id
  ) or exists (
    select 1
    from public.product_media m
    where m.product_id = v_ceramide_id
  ) or (select catalog_status from public.products where id = v_ceramide_id)
       <> 'draft' then
    raise exception
      'Ceramide Cushion must remain a media-free Draft with no Offer'
      using errcode = '23514';
  end if;
end;
$core_portfolio_migration$;
