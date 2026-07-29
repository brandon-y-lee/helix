-- Canonical structured PDP merchandising and editorial content.
-- Commerce facts, catalog descriptions, routine placement, variants, prices,
-- availability, and media remain on their existing first-class tables.

create table if not exists public.product_pdp_content (
  product_id uuid primary key references public.products(id) on delete cascade,
  schema_version smallint not null default 1
    check (schema_version = 1),
  profile_title_tokens jsonb,
  routine_overlay text,
  outcome_heading text,
  outcome_labels text[],
  how_to_use_steps text[],
  application_steps text[],
  ingredient_cards jsonb,
  ingredient_story jsonb,
  routine_guidance text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_pdp_content_profile_title_tokens_check
    check (
      profile_title_tokens is null
      or (
        jsonb_typeof(profile_title_tokens) = 'array'
        and jsonb_array_length(profile_title_tokens) > 0
      )
    ),
  constraint product_pdp_content_outcome_labels_check
    check (outcome_labels is null or cardinality(outcome_labels) = 3),
  constraint product_pdp_content_ingredient_cards_check
    check (
      ingredient_cards is null
      or jsonb_typeof(ingredient_cards) = 'array'
    ),
  constraint product_pdp_content_ingredient_story_check
    check (
      ingredient_story is null
      or jsonb_typeof(ingredient_story) = 'object'
    )
);

comment on table public.product_pdp_content is
  'Product-specific PDP merchandising/editorial content. Commerce and media remain on products, product_variants, and product_media.';
comment on column public.product_pdp_content.schema_version is
  'Structured JSON schema version. Version 1 is validated by lib/catalog/product-content.ts.';
comment on column public.product_pdp_content.profile_title_tokens is
  'Version 1 array of {text: string, emphasis?: boolean}.';
comment on column public.product_pdp_content.ingredient_cards is
  'Version 1 array of {name: string, label: string, copy: string}.';
comment on column public.product_pdp_content.ingredient_story is
  'Version 1 object with heading, intro, exactly two {name, description} highlights, and supportingIngredients.';

drop trigger if exists product_pdp_content_set_updated_at
  on public.product_pdp_content;
create trigger product_pdp_content_set_updated_at
  before update on public.product_pdp_content
  for each row execute function public.set_updated_at();

alter table public.product_pdp_content enable row level security;

drop policy if exists "Public read active product PDP content"
  on public.product_pdp_content;
create policy "Public read active product PDP content"
  on public.product_pdp_content for select to anon, authenticated
  using (
    exists (
      select 1
      from public.products
      where products.id = product_pdp_content.product_id
        and products.catalog_status = 'active'
        and products.published_at <= now()
    )
  );

revoke all on table public.product_pdp_content
  from public, anon, authenticated;
grant select on table public.product_pdp_content
  to anon, authenticated;
grant select, insert, update, delete on table public.product_pdp_content
  to service_role;

with approved_content (
  slug,
  profile_title_tokens,
  routine_overlay,
  outcome_heading,
  outcome_labels,
  how_to_use_steps,
  application_steps,
  ingredient_cards,
  ingredient_story,
  routine_guidance
) as (
  values
    (
      'cleanse-01-calming-gel-cleanser',
      jsonb_build_array(
        jsonb_build_object('text', 'A daily '),
        jsonb_build_object('text', 'GEL CLEANSER', 'emphasis', true),
        jsonb_build_object('text', ' for a clean, '),
        jsonb_build_object('text', 'BALANCED', 'emphasis', true),
        jsonb_build_object('text', ' start.')
      ),
      'See how CLEANSE works in your skin routine.',
      'YOUR DAILY CLEANSER THAT:',
      array['cleanses', 'balances', 'preps']::text[],
      array[
        'Massage onto damp skin morning or night.',
        'Rinse thoroughly without chasing a tight finish.',
        'Follow with TREAT or the next step your routine needs.'
      ]::text[],
      array[
        'Morning and evening, wet your face and hands, then dispense a small amount.',
        'Massage over damp skin in light circles until the gel forms a soft lather. Rinse thoroughly and pat dry.',
        'Follow with TREAT, then SEAL. In the morning, finish with SPF.'
      ]::text[],
      jsonb_build_array(
        jsonb_build_object(
          'name', 'Multi-biotics complex',
          'label', 'Routine-friendly cleanse',
          'copy', 'Supports a balanced cleansing step that keeps the routine easy to repeat.'
        ),
        jsonb_build_object(
          'name', '6-Type Cica Complex',
          'label', 'Calm-looking skin support',
          'copy', 'A centella-led system used for a composed, comfortable-looking finish after rinsing.'
        ),
        jsonb_build_object(
          'name', 'LHA',
          'label', 'Surface polish',
          'copy', 'A gentle-feeling supporting ingredient used here for a cleaner-looking surface.'
        ),
        jsonb_build_object(
          'name', 'Green tea + centella notes',
          'label', 'Fresh finish',
          'copy', 'Plant-based cosmetic support for a clean, non-stripped first step.'
        )
      ),
      jsonb_build_object(
        'heading', 'what’s inside',
        'intro', 'Get to know the ingredients that help the first step feel clean, calm, and comfortable.',
        'highlights', jsonb_build_array(
          jsonb_build_object(
            'name', '6-TYPE CICA COMPLEX',
            'description', 'a centella-focused blend used to help skin feel soothed and balanced while you cleanse'
          ),
          jsonb_build_object(
            'name', 'LHA',
            'description', 'a lipophilic hydroxy acid used to help lift surface buildup and refine the feel of texture'
          )
        ),
        'supportingIngredients', 'also made with MULTI-BIOTICS COMPLEX, GREEN TEA'
      ),
      'Use first, then follow with TREAT and SEAL. In the morning, finish with SPF.'
    ),
    (
      'treat-03-pdrn-5-ampoule',
      jsonb_build_array(
        jsonb_build_object('text', 'A lightweight '),
        jsonb_build_object('text', 'PDRN SERUM', 'emphasis', true),
        jsonb_build_object('text', ' for '),
        jsonb_build_object('text', 'HYDRATION', 'emphasis', true),
        jsonb_build_object('text', ', smoother-looking texture, and a steadier '),
        jsonb_build_object('text', 'GLOW', 'emphasis', true),
        jsonb_build_object('text', '.')
      ),
      'See how TREAT works in your skin routine.',
      'YOUR DAILY TREATMENT THAT:',
      array['hydrates', 'smooths', 'wakes up the finish']::text[],
      array[
        'After cleansing and toner or essence, apply 2-3 drops.',
        'Press into skin for 30-60 seconds.',
        'Follow with moisturizer.',
        'Use SPF in daytime. Use morning and night.'
      ]::text[],
      array[
        'After CLEANSE—and toner or essence, if used—apply 2–3 drops across face and neck.',
        'Press into skin for 30–60 seconds, letting the lightweight serum settle before the next layer.',
        'Follow with SEAL. In the morning, finish with SPF.'
      ]::text[],
      jsonb_build_array(
        jsonb_build_object(
          'name', 'PDRN / Sodium DNA — 50,000 ppm',
          'label', 'High-focus conditioning signal',
          'copy', 'A concentrated cosmetic ingredient used here for hydration support, smoother-looking texture, and a more vital-looking finish.'
        ),
        jsonb_build_object(
          'name', 'Niacinamide',
          'label', 'Tone + radiance support',
          'copy', 'A routine staple for a more even-looking tone and refined radiance.'
        ),
        jsonb_build_object(
          'name', 'Trehalose + humectant base',
          'label', 'Water-binding comfort',
          'copy', 'Helps keep the serum comfortable, hydrated, and easy to layer.'
        ),
        jsonb_build_object(
          'name', 'Peptide complex',
          'label', 'Resilient-looking skin',
          'copy', 'A multi-peptide blend used for smoother, more conditioned-looking skin.'
        ),
        jsonb_build_object(
          'name', 'Adenosine',
          'label', 'Fine-line appearance support',
          'copy', 'A K-beauty familiar used here for a smoother-looking finish.'
        )
      ),
      jsonb_build_object(
        'heading', 'what’s inside',
        'intro', 'Get to know the ingredients behind lightweight hydration and a smoother, more awake-looking finish.',
        'highlights', jsonb_build_array(
          jsonb_build_object(
            'name', 'PDRN / SODIUM DNA 50,000 PPM',
            'description', 'a concentrated conditioning ingredient used to support hydrated, smoother-looking skin'
          ),
          jsonb_build_object(
            'name', 'NIACINAMIDE',
            'description', 'a form of vitamin B3 that helps refine the look of uneven tone and support visible radiance'
          )
        ),
        'supportingIngredients', 'also made with TREHALOSE, PEPTIDE COMPLEX, ADENOSINE'
      ),
      'Use after CLEANSE and before SEAL. In the morning, finish with SPF.'
    ),
    (
      'seal-05-green-collagen-cream',
      jsonb_build_array(
        jsonb_build_object('text', 'A '),
        jsonb_build_object('text', 'CUSHIONING CREAM', 'emphasis', true),
        jsonb_build_object('text', ' that holds '),
        jsonb_build_object('text', 'HYDRATION', 'emphasis', true),
        jsonb_build_object('text', ' close with a clean, '),
        jsonb_build_object('text', 'COMPOSED', 'emphasis', true),
        jsonb_build_object('text', ' finish.')
      ),
      'See how SEAL works in your skin routine.',
      'YOUR DAILY CREAM THAT:',
      array['cushions', 'comforts', 'holds hydration']::text[],
      array[
        'Smooth over face and neck as the final Mei Pelle step at night.',
        'Use before SPF in the morning.',
        'Layer over TREAT when skin wants added comfort.'
      ]::text[],
      array[
        'After TREAT, smooth a small amount over face and neck.',
        'Press into skin, giving extra attention to areas that feel dry or tight.',
        'Use as the final Mei Pelle step at night. In the morning, follow with SPF.'
      ]::text[],
      jsonb_build_array(
        jsonb_build_object(
          'name', 'Green collagen complex',
          'label', 'Cushioned cosmetic feel',
          'copy', 'Used for a plush skin feel and hydrated-looking finish; it does not become human dermal collagen.'
        ),
        jsonb_build_object(
          'name', 'Sodium hyaluronate',
          'label', 'Hydration support',
          'copy', 'A humectant used to help the cream leave skin feeling comfortable.'
        ),
        jsonb_build_object(
          'name', 'Panthenol',
          'label', 'Comfort support',
          'copy', 'A familiar conditioning ingredient for a calmer-feeling final layer.'
        ),
        jsonb_build_object(
          'name', 'Niacinamide',
          'label', 'Tone + finish support',
          'copy', 'Supports a more even-looking, composed finish in a daily moisturizer.'
        )
      ),
      jsonb_build_object(
        'heading', 'what’s inside',
        'intro', 'Get to know the ingredients that help hold hydration close and keep the final layer comfortable.',
        'highlights', jsonb_build_array(
          jsonb_build_object(
            'name', 'GREEN COLLAGEN COMPLEX',
            'description', 'a moisture-focused complex used to help skin feel cushioned and look smoother'
          ),
          jsonb_build_object(
            'name', 'PANTHENOL',
            'description', 'a form of provitamin B5 that helps skin feel calm and comfortable'
          )
        ),
        'supportingIngredients', 'also made with SODIUM HYALURONATE, NIACINAMIDE'
      ),
      'Use after TREAT as the final Mei Pelle step. In the morning, follow with SPF.'
    ),
    (
      'refine-02-pore-treatment-pads',
      null::jsonb,
      null::text,
      null::text,
      null::text[],
      array[
        'Swipe one pad over clean, dry skin.',
        'Start a few times weekly, then build only as skin allows.',
        'Follow with hydration and use SPF in daytime.'
      ]::text[],
      null::text[],
      jsonb_build_array(
        jsonb_build_object(
          'name', 'Panthenol + betaine',
          'label', 'Comfort-first base',
          'copy', 'Helps keep a deliberate texture step from feeling overly stripped.'
        ),
        jsonb_build_object(
          'name', 'Sodium hyaluronate',
          'label', 'Hydration support',
          'copy', 'Adds water-binding support so the finish stays more comfortable.'
        ),
        jsonb_build_object(
          'name', 'Plum + marine extracts',
          'label', 'Conditioning support',
          'copy', 'A botanical and marine complex used for a fresher-looking surface.'
        ),
        jsonb_build_object(
          'name', 'Dual-sided pad format',
          'label', 'Controlled application',
          'copy', 'A measured delivery format that keeps this beyond-core step intentional.'
        )
      ),
      null::jsonb,
      null::text
    ),
    (
      'frame-04-pdrn-eye-cream',
      null::jsonb,
      null::text,
      null::text,
      null::text[],
      array[
        'Tap a small amount around the orbital area with your ring finger.',
        'Keep product away from the lash line to avoid migration.',
        'Use before moisturizer when the eye area needs a focused step.'
      ]::text[],
      null::text[],
      jsonb_build_array(
        jsonb_build_object(
          'name', 'Sodium DNA',
          'label', 'Eye-area conditioning',
          'copy', 'A cosmetic conditioning ingredient used here for a smoother-looking eye area.'
        ),
        jsonb_build_object(
          'name', 'Niacinamide',
          'label', 'Brighter-looking frame',
          'copy', 'Supports a cleaner, more even-looking finish around the eye area.'
        ),
        jsonb_build_object(
          'name', 'Panthenol + allantoin',
          'label', 'Comfort support',
          'copy', 'Helps keep the targeted step comfortable for repeat use.'
        ),
        jsonb_build_object(
          'name', 'Peptide eye blend',
          'label', 'Conditioned-looking contour',
          'copy', 'A focused blend used for a smoother, more rested-looking impression.'
        )
      ),
      null::jsonb,
      null::text
    ),
    (
      'lift-06-pdrn-mask-system',
      null::jsonb,
      null::text,
      null::text,
      null::text[],
      array[
        'Apply to clean skin for the product-supported wear time.',
        'Remove the sheet and press in remaining essence.',
        'Return to The Core instead of adding another daily requirement.'
      ]::text[],
      null::text[],
      jsonb_build_array(
        jsonb_build_object(
          'name', 'Sodium DNA — 5,000 ppm',
          'label', 'Weekly conditioning signal',
          'copy', 'A cosmetic conditioning ingredient used for a hydrated, smoother-looking finish.'
        ),
        jsonb_build_object(
          'name', 'Niacinamide',
          'label', 'Radiance support',
          'copy', 'Supports a more even-looking tone after the weekly treatment moment.'
        ),
        jsonb_build_object(
          'name', 'Hydrolyzed collagen',
          'label', 'Cushioned sheet experience',
          'copy', 'A cosmetic ingredient used for skin feel and hydration support, not dermal collagen replacement.'
        ),
        jsonb_build_object(
          'name', 'Adenosine + allantoin',
          'label', 'Smooth comfort',
          'copy', 'Helps the intensive feel composed while supporting a smoother-looking finish.'
        )
      ),
      null::jsonb,
      null::text
    )
)
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
select
  products.id,
  1,
  approved_content.profile_title_tokens,
  approved_content.routine_overlay,
  approved_content.outcome_heading,
  approved_content.outcome_labels,
  approved_content.how_to_use_steps,
  approved_content.application_steps,
  approved_content.ingredient_cards,
  approved_content.ingredient_story,
  approved_content.routine_guidance
from approved_content
join public.products using (slug)
on conflict (product_id) do nothing;
