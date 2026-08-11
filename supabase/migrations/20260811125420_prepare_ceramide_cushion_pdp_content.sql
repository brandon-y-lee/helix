set lock_timeout = '10s';
set statement_timeout = '120s';

do $prepare_ceramide_cushion_pdp_content$
declare
  v_expected_media_count constant integer := 12;
  v_ceramide_id uuid;
  v_green_id uuid;
  v_changed integer;
  v_green_media_before jsonb;
  v_ceramide_source_before jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('mei-pelle-ceramide-content-168', 0)
  );

  select product.id into strict v_ceramide_id
  from public.products product
  where product.slug = 'ceramide-cushion'
    and product.display_name = 'Ceramide Cushion'
    and product.product_type = 'Intensive moisture cream'
    and product.system_step_name = 'SEAL'
    and product.routine_group = 'core'
    and product.catalog_status = 'draft'
    and product.status = 'coming_soon';

  select product.id into strict v_green_id
  from public.products product
  where product.slug = 'seal-05-green-collagen-cream'
    and product.display_name = 'SEAL'
    and product.system_step_name = 'SEAL'
    and product.routine_group = 'core'
    and product.catalog_status = 'active';

  perform 1
  from public.products
  where id in (v_ceramide_id, v_green_id)
  order by id
  for update;

  lock table public.product_pdp_content, public.product_media
    in share row exclusive mode;

  if exists (
    select 1 from public.product_pdp_content content
    where content.product_id = v_ceramide_id
  ) then
    raise exception 'Ceramide Cushion already has PDP content'
      using errcode = '23505';
  end if;

  if exists (
    select 1 from public.product_media media
    where media.product_id = v_ceramide_id
  ) then
    raise exception 'Ceramide Cushion already has Product Media'
      using errcode = '23505';
  end if;

  if exists (
    select 1 from public.product_variants variant
    where variant.product_id = v_ceramide_id
  ) then
    raise exception 'Ceramide Cushion must remain without Product Variants'
      using errcode = '23514';
  end if;

  select to_jsonb(source) into strict v_ceramide_source_before
  from public.product_sources source
  where source.product_id = v_ceramide_id
    and source.supplier_handle = 'leaders-calming-biotics-intensive-cream';

  select jsonb_agg(to_jsonb(green_media) order by green_media.id)
  into strict v_green_media_before
  from public.product_media green_media
  where green_media.product_id = v_green_id;

  if (
    select count(*)
    from public.product_media green_media
    where green_media.product_id = v_green_id
      and green_media.archived_at is null
      and nullif(btrim(green_media.url), '') is not null
  ) <> v_expected_media_count or (
    select jsonb_agg(green_media.role order by green_media.role)
    from public.product_media green_media
    where green_media.product_id = v_green_id
      and green_media.archived_at is null
      and nullif(btrim(green_media.url), '') is not null
  ) is distinct from jsonb_build_array(
    'card_default',
    'card_hover',
    'cart',
    'core_routine_editorial',
    'core_routine_texture',
    'detail',
    'gallery',
    'ingredients_texture',
    'profile_editorial',
    'routine_video',
    'routine_video_poster',
    'search'
  ) then
    raise exception 'Green Collagen media is not the approved twelve-role set'
      using errcode = '23514';
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
  ) values (
    v_ceramide_id,
    1,
    jsonb_build_array(
      jsonb_build_object('text', 'A '),
      jsonb_build_object('text', 'RICH MOISTURE CREAM', 'emphasis', true),
      jsonb_build_object('text', ' that gives lighter layers a '),
      jsonb_build_object('text', 'COMFORTING', 'emphasis', true),
      jsonb_build_object('text', ' final cushion with a soft, '),
      jsonb_build_object('text', 'COMPOSED', 'emphasis', true),
      jsonb_build_object('text', ' finish.')
    ),
    'See how SEAL works in your skin routine.',
    'YOUR DAILY CREAM THAT:',
    array['cushions', 'comforts', 'finishes the routine']::text[],
    array[
      'After treatment, smooth a thin layer over face and neck.',
      'Use a little more at night or where skin feels dry.',
      'In the morning, follow with sunscreen.'
    ]::text[],
    array[
      'After TREAT, smooth a thin layer over face and neck.',
      'Press in gently, using a little more where skin feels dry or tight.',
      'Use as the final Mei Pelle cream step at night. In the morning, follow with sunscreen.'
    ]::text[],
    jsonb_build_array(
      jsonb_build_object(
        'name', 'Glycerin',
        'label', 'Humectant support',
        'copy', 'A humectant used in the rich cream base for a conditioned, comfortable skin feel.'
      ),
      jsonb_build_object(
        'name', 'Oat kernel extract',
        'label', 'Comforting botanical',
        'copy', 'A skin-conditioning botanical included in the Calming Biotics ingredient declaration.'
      ),
      jsonb_build_object(
        'name', 'Centella asiatica',
        'label', 'Conditioning support',
        'copy', 'Centella leaf and plant extracts round out the cream with a composed, conditioned feel.'
      ),
      jsonb_build_object(
        'name', 'Ceramide AP',
        'label', 'Cushioning support',
        'copy', 'A ceramide included in the rich cream base for a cushioned final-layer feel.'
      ),
      jsonb_build_object(
        'name', 'Peptides',
        'label', 'Conditioned finish',
        'copy', 'Palmitoyl pentapeptide-4 and acetyl hexapeptide-8 appear in the recorded ingredient declaration as conditioning ingredients.'
      )
    ),
    jsonb_build_object(
      'heading', 'what’s inside',
      'intro', 'A rich moisture cream with a straightforward ingredient story and a composed final-layer feel.',
      'highlights', jsonb_build_array(
        jsonb_build_object(
          'name', 'GLYCERIN',
          'description', 'a humectant used in the cream base for a comfortable, conditioned skin feel'
        ),
        jsonb_build_object(
          'name', 'CERAMIDE AP',
          'description', 'a ceramide used here as part of the rich, cushioning final layer'
        )
      ),
      'supportingIngredients', 'also made with OAT KERNEL EXTRACT, CENTELLA ASIATICA, PEPTIDES'
    ),
    'Use after TREAT as the final Mei Pelle cream step. In the morning, follow with sunscreen.'
  );
  get diagnostics v_changed = row_count;
  if v_changed <> 1 then
    raise exception 'Ceramide Cushion PDP content insert did not affect exactly one row';
  end if;

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
    original_source_url,
    source_filename,
    palette_id,
    placeholder_palette,
    archived_at
  )
  select
    gen_random_uuid(),
    v_ceramide_id,
    null::uuid,
    green_media.media_type,
    green_media.url,
    case green_media.role
      when 'card_default' then 'White SEAL cream jar against a neutral background.'
      when 'cart' then 'White SEAL cream jar against a neutral background.'
      when 'detail' then 'White SEAL cream jar against a neutral background.'
      when 'search' then 'White SEAL cream jar against a neutral background.'
      when 'card_hover' then 'Portrait of a man holding a white skincare cream jar.'
      when 'gallery' then 'Portrait of a man holding a white skincare cream jar.'
      when 'core_routine_editorial' then 'Man applying cream during the final skincare step.'
      when 'core_routine_texture' then 'White cream texture on a clean background.'
      when 'ingredients_texture' then 'White cream texture on a clean background.'
      when 'profile_editorial' then 'White SEAL cream jar on a muted green surface.'
      when 'routine_video' then 'Cream being applied as the final skincare step.'
      when 'routine_video_poster' then 'Man applying cream as the final skincare step.'
      else 'SEAL skincare media.'
    end,
    green_media.width,
    green_media.height,
    green_media.role,
    green_media.sort_order,
    green_media.original_source_url,
    green_media.source_filename,
    green_media.palette_id,
    green_media.placeholder_palette,
    null::timestamptz
  from public.product_media green_media
  where green_media.product_id = v_green_id
    and green_media.archived_at is null
    and nullif(btrim(green_media.url), '') is not null
  order by green_media.role, green_media.sort_order, green_media.id;
  get diagnostics v_changed = row_count;
  if v_changed <> v_expected_media_count then
    raise exception 'Ceramide Cushion media insert did not affect exactly twelve rows';
  end if;

  if (
    select jsonb_agg(to_jsonb(green_media) order by green_media.id)
    from public.product_media green_media
    where green_media.product_id = v_green_id
  ) is distinct from v_green_media_before then
    raise exception 'Green Collagen media changed during Ceramide preparation'
      using errcode = '23514';
  end if;

  if (
    select to_jsonb(source)
    from public.product_sources source
    where source.product_id = v_ceramide_id
      and source.supplier_handle = 'leaders-calming-biotics-intensive-cream'
  ) is distinct from v_ceramide_source_before then
    raise exception 'Ceramide Cushion Product Source changed during PDP preparation'
      using errcode = '23514';
  end if;

  if exists (
    select 1 from public.product_variants variant
    where variant.product_id = v_ceramide_id
  ) then
    raise exception 'Ceramide Cushion must remain without Product Variants'
      using errcode = '23514';
  end if;

  if not exists (
    select 1 from public.products product
    where product.id = v_ceramide_id
      and product.catalog_status = 'draft'
      and product.status = 'coming_soon'
  ) then
    raise exception 'Ceramide Cushion publication state changed during PDP preparation'
      using errcode = '23514';
  end if;
end
$prepare_ceramide_cushion_pdp_content$;
