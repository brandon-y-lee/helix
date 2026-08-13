-- Run read-only against the verified approved non-production project after the
-- Ceramide Cushion content migration has been applied.

begin;

set local lock_timeout = '10s';
set local statement_timeout = '120s';

do $ceramide_cushion_content_verification$
declare
  expected_media_count constant integer := 12;
  ceramide_id uuid;
  green_id uuid;
  expected_content jsonb;
  actual_content jsonb;
begin
  select id into strict ceramide_id
  from public.products
  where slug = 'ceramide-cushion'
    and display_name = 'Ceramide Cushion'
    and product_type = 'Intensive moisture cream'
    and system_step_name = 'SEAL'
    and routine_group = 'core'
    and catalog_status = 'draft'
    and status = 'coming_soon';

  select id into strict green_id
  from public.products
  where slug = 'seal-05-green-collagen-cream'
    and catalog_status = 'active';

  expected_content := jsonb_build_object(
    'schema_version', 1,
    'profile_title_tokens', jsonb_build_array(
      jsonb_build_object('text', 'A '),
      jsonb_build_object('text', 'RICH MOISTURE CREAM', 'emphasis', true),
      jsonb_build_object('text', ' that gives lighter layers a '),
      jsonb_build_object('text', 'COMFORTING', 'emphasis', true),
      jsonb_build_object('text', ' final cushion with a soft, '),
      jsonb_build_object('text', 'COMPOSED', 'emphasis', true),
      jsonb_build_object('text', ' finish.')
    ),
    'routine_overlay', 'See how SEAL works in your skin routine.',
    'outcome_heading', 'YOUR DAILY CREAM THAT:',
    'outcome_labels', to_jsonb(array['cushions', 'comforts', 'finishes the routine']::text[]),
    'how_to_use_steps', to_jsonb(array[
      'After treatment, smooth a thin layer over face and neck.',
      'Use a little more at night or where skin feels dry.',
      'In the morning, follow with sunscreen.'
    ]::text[]),
    'application_steps', to_jsonb(array[
      'After TREAT, smooth a thin layer over face and neck.',
      'Press in gently, using a little more where skin feels dry or tight.',
      'Use as the final Mei Pelle cream step at night. In the morning, follow with sunscreen.'
    ]::text[]),
    'ingredient_cards', jsonb_build_array(
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
    'ingredient_story', jsonb_build_object(
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
    'routine_guidance', 'Use after TREAT as the final Mei Pelle cream step. In the morning, follow with sunscreen.'
  );

  select to_jsonb(content) - 'product_id' - 'created_at' - 'updated_at'
  into strict actual_content
  from public.product_pdp_content content
  where content.product_id = ceramide_id;

  if actual_content is distinct from expected_content then
    raise exception 'Ceramide Cushion PDP content drifted';
  end if;

  if actual_content::text ~* '(3:1:1|100[- ]hour|barrier repair|penetrat|clinically|all skin types|hypoallergenic|dermatologist|vegan|cruelty[- ]free)' then
    raise exception 'unsupported Ceramide Cushion claim entered PDP content';
  end if;

  if (
    select count(*)
    from public.product_media media
    where media.product_id = ceramide_id
      and media.archived_at is null
      and nullif(btrim(media.url), '') is not null
      and media.variant_id is null
  ) <> expected_media_count or exists (
    select 1
    from public.product_media media
    where media.product_id = ceramide_id
      and (
        media.archived_at is not null
        or nullif(btrim(media.url), '') is null
        or media.variant_id is not null
      )
  ) then
    raise exception 'Ceramide Cushion media eligibility drifted';
  end if;

  if exists (
    select 1
    from public.product_media ceramide_media
    left join public.product_media green_media
      on green_media.product_id = green_id
     and green_media.archived_at is null
     and green_media.url = ceramide_media.url
     and green_media.media_type = ceramide_media.media_type
     and green_media.role = ceramide_media.role
     and green_media.sort_order = ceramide_media.sort_order
     and green_media.width is not distinct from ceramide_media.width
     and green_media.height is not distinct from ceramide_media.height
    where ceramide_media.product_id = ceramide_id
      and (
        green_media.id is null
        or green_media.id = ceramide_media.id
      )
  ) then
    raise exception 'Ceramide Cushion media reuse contract drifted';
  end if;

  if (
    select count(*)
    from public.product_media media
    where media.product_id = green_id
      and media.archived_at is null
      and nullif(btrim(media.url), '') is not null
  ) <> expected_media_count then
    raise exception 'Green Collagen media history drifted';
  end if;

  if exists (
    select 1 from public.product_variants variant
    where variant.product_id = ceramide_id
  ) or (
    select count(*) from public.product_sources source
    where source.product_id = ceramide_id
      and source.supplier_handle = 'leaders-calming-biotics-intensive-cream'
  ) <> 1 then
    raise exception 'Ceramide Cushion commerce isolation drifted';
  end if;
end
$ceramide_cushion_content_verification$;

rollback;
