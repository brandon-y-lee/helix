-- Synthetic Catalog data for the isolated current-schema checkpoint only.
-- The source facts exercise the declared predecessor contract; no live rows,
-- Product IDs, customer data or remote media operations are used.
create function pg_temp.catalog_identity_state()
returns jsonb language plpgsql as $$
declare
  table_name text;
  rows jsonb;
  result jsonb := '{}'::jsonb;
begin
  foreach table_name in array array[
    'admin_memberships', 'catalog_editor_audit_log',
    'catalog_product_revisions', 'product_content_drafts',
    'product_families', 'product_family_memberships', 'product_media',
    'product_pdp_content', 'product_relationships', 'product_slug_routes',
    'product_sources', 'product_variants', 'products', 'system_steps'
  ] loop
    execute format(
      'select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text), ''[]''::jsonb) from public.%I t',
      table_name
    ) into rows;
    result := result || jsonb_build_object(table_name, rows);
  end loop;
  return result;
end;
$$;

create function pg_temp.historical_catalog_identity_document(
  p_current jsonb, p_schema integer
)
returns jsonb language plpgsql as $$
declare
  historical jsonb;
  product jsonb;
begin
  product := (p_current -> 'product') || jsonb_build_object(
    'slug', 'peptide-bounce', 'display_name', 'Peptide Bounce',
    'seo_title', 'Historical title', 'seo_description', 'Historical description',
    'search_keywords', jsonb_build_array('peptide bounce'),
    'editorial_description', 'Historical editorial content for review.',
    'editorial_how_to_use', 'Historical application instructions for review.'
  );
  if p_schema < 4 then
    product := (product - 'system_step_name') || jsonb_build_object(
      'formal_title', 'Historical formal title',
      'card_tagline', 'Historical tagline',
      'routine_step_number', 3, 'routine_step_name', 'TREAT'
    );
  end if;
  if p_schema = 1 then
    product := (product - array[
      'display_name', 'editorial_description', 'editorial_how_to_use', 'sort_order'
    ]) || jsonb_build_object(
      'name', 'Peptide Bounce', 'description', 'Historical editorial content for review.',
      'how_to_use', 'Historical application instructions for review.', 'position', 2
    );
  end if;
  historical := p_current || jsonb_build_object(
    'schemaVersion', p_schema, 'product', product,
    'productFamily', jsonb_build_object('family', null, 'memberships', '[]'::jsonb)
  );
  if p_schema < 3 then
    historical := historical - 'productSource';
  end if;
  return historical;
end;
$$;

create function pg_temp.seed_catalog_identity(p_slug text, p_name text)
returns uuid language plpgsql as $$
declare
  product_id constant uuid := '10000000-0000-4000-8000-000000000101';
  related_id constant uuid := '10000000-0000-4000-8000-000000000102';
  actor_id constant uuid := '10000000-0000-4000-8000-000000000901';
  inci constant text := 'Water, Dipropylene Glycol, Butylene Glycol, Glycerin, Propanediol, Sodium DNA (50,000 ppm), 1,2-Hexanediol, Niacinamide, Trehalose, Polyglyceryl-10 Laurate, Xanthan Gum, Allantoin, Caprylyl Glycol, Ethylhexylglycerin, Adenosine, Disodium EDTA, Copper Tripeptide-1, Tripeptide-1, Palmitoyl Tripeptide-1, Palmitoyl Pentapeptide-4, Hexapeptide-11, Hexapeptide-9.';
  source_hash constant text := '03843cc7f6ab3d184e625c3b14211e3e4667e64644f1a5ee16091382eb61c69b';
begin
  insert into auth.users(id) values (actor_id);
  insert into public.admin_memberships(user_id, role) values (actor_id, 'admin');
  insert into public.system_steps(name, position, routine_group) values
    ('CLEANSE', 1, 'core'), ('REFINE', 2, 'beyond_core'),
    ('TREAT', 3, 'core'), ('FRAME', 4, 'beyond_core'),
    ('SEAL', 5, 'core'), ('PROTECT', 6, 'beyond_core'),
    ('LIFT', 7, 'beyond_core');
  insert into public.products(
    id, slug, display_name, swatch_from, swatch_to, product_type,
    sort_order, editorial_description, editorial_how_to_use,
    routine_group, routine_sort, system_step_name, status, ingredients,
    seo_title, seo_description, search_keywords
  ) values
    (product_id, p_slug, p_name, '#ddeeff', '#8899aa', 'PDRN serum', 2,
      'Current governed description, retained across identity publication.',
      'Apply reviewed current instructions.', 'core', 20, 'TREAT',
      'coming_soon', inci, p_name || ' — PDRN serum | helix',
      'Current governed SEO description.', array['PDRN serum', 'hydration']),
    (related_id, 'synthetic-cleanser', 'Synthetic Cleanser', '#eeeeee',
      '#aaaaaa', 'Cleanser', 1, 'Synthetic related Product.', 'Rinse.',
      'core', 10, 'CLEANSE', 'coming_soon', 'Water',
      null, null, '{}'::text[]);
  insert into public.product_sources(
    product_id, supplier, supplier_title, supplier_url, supplier_handle,
    supplier_product_id, source_inspected_at, source_content_hash,
    original_source_price_cents, raw_source
  ) values (
    product_id, 'Leaders Cosmetics USA', 'PDRN 5% Active Ampoule',
    'https://www.leaderscosmeticsusa.com/products/pdrn-5-active-ampoule',
    'pdrn-5-active-ampoule', '7465003057234',
    '2026-06-18T13:39:04.293Z', source_hash, 2500,
    jsonb_build_object(
      'catalogProduct', jsonb_build_object('ingredients', inci),
      'source', jsonb_build_object(
        'supplier', 'Leaders Cosmetics USA',
        'supplierTitle', 'PDRN 5% Active Ampoule',
        'supplierHandle', 'pdrn-5-active-ampoule',
        'supplierProductId', '7465003057234',
        'supplierUrl', 'https://www.leaderscosmeticsusa.com/products/pdrn-5-active-ampoule',
        'sourceContentHash', source_hash,
        'sourceInspectedAt', '2026-06-18T13:39:04.293Z'
      )
    )
  );
  insert into public.product_variants(
    id, product_id, variant_key, label, price_cents, sku,
    supplier_variant_id, available, inventory_status, sort_order
  ) values (
    '10000000-0000-4000-8000-000000000201', product_id, '30ml', '30 mL',
    2500, '8809672285263', '42072641208402', false, 'unavailable', 0
  );
  insert into public.product_media(
    id, product_id, media_type, url, alt, width, height, role, sort_order,
    source_filename, archived_at
  ) values
    ('10000000-0000-4000-8000-000000000301', product_id, 'image',
      'https://erasogmsqpgiirovubjh.supabase.co/storage/v1/object/public/helix-catalog/products/synthetic-serum/current.webp',
      'Synthetic approved current image', 100, 100, 'card_default', 0,
      'current.webp', null),
    ('10000000-0000-4000-8000-000000000302', product_id, 'image',
      'https://erasogmsqpgiirovubjh.supabase.co/storage/v1/object/public/helix-catalog/products/synthetic-serum/historical.webp',
      'Synthetic archived image', 100, 100, 'card_default', 0,
      'historical.webp', '2026-01-01T00:00:00Z');
  insert into public.product_pdp_content(product_id, how_to_use_steps)
  values (product_id, array['First current step.', 'Second current step.']);
  insert into public.product_relationships(
    product_id, related_product_id, relationship_type, sort_order
  ) values (product_id, related_id, 'complete_the_routine', 1);
  insert into public.product_families(id, slug, display_name, system_step_name)
  values ('10000000-0000-4000-8000-000000000401', 'synthetic-treatment-family',
    'Current Treatment Family', 'TREAT');
  insert into public.product_family_memberships(
    family_id, product_id, option_label, sort_order, is_entry
  ) values ('10000000-0000-4000-8000-000000000401', product_id,
    'Current serum option', 0, true);
  insert into public.catalog_product_revisions(
    id, product_id, revision_number, schema_version, document, published_by
  ) values ('10000000-0000-4000-8000-000000000501', product_id, 1, 4,
    public.get_catalog_editor_document(product_id), actor_id);
  insert into public.catalog_editor_audit_log(
    action, actor_id, product_id, revision_id, metadata
  ) values ('draft.published', actor_id, product_id,
    '10000000-0000-4000-8000-000000000501',
    '{"source":"synthetic historical publication"}'::jsonb);
  return product_id;
end;
$$;
