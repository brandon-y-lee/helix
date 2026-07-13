-- Commerce routine presentation: The Core + Beyond The Core.
-- Additive metadata plus targeted non-production catalog copy updates for the
-- six active commerce products. The /system editorial route remains canonical.

alter table public.products
  add column if not exists routine_group text,
  add column if not exists routine_group_label text,
  add column if not exists routine_step_number integer,
  add column if not exists routine_step_name text,
  add column if not exists routine_display_label text,
  add column if not exists routine_sort integer,
  add column if not exists legacy_routine_group_label text,
  add column if not exists legacy_routine_display_label text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'products_routine_group_check'
  ) then
    alter table public.products
      add constraint products_routine_group_check
      check (routine_group is null or routine_group in ('core', 'beyond_core'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'products_routine_step_number_check'
  ) then
    alter table public.products
      add constraint products_routine_step_number_check
      check (routine_step_number is null or routine_step_number > 0);
  end if;
end $$;

create index if not exists products_routine_sort_idx
  on public.products (routine_sort, sort_order, position)
  where catalog_status = 'active';

insert into public.collections (slug, name, description, sort_order, is_active)
values
  (
    'the-core',
    'The Core',
    'The daily commerce routine: cleanse, treat, seal.',
    10,
    true
  ),
  (
    'beyond-the-core',
    'Beyond The Core',
    'Focused additions for skin that already has a high baseline.',
    20,
    true
  )
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  sort_order = excluded.sort_order,
  is_active = true,
  updated_at = now();

update public.collections
set is_active = false, updated_at = now()
where slug in ('the-system', 'intensive')
   or name in ('THE SYSTEM', 'The System', 'INTENSIVE', 'Intensive');

update public.products
set
  name = 'CLEANSE',
  display_name = 'CLEANSE',
  action_name = 'CLEANSE',
  formal_title = 'CLEANSE 01 Calming Gel Cleanser',
  tagline = 'Clean skin. No tight finish.',
  card_tagline = 'Clean skin. No tight finish.',
  subtitle = 'Clean skin. No tight finish.',
  descriptor = 'A daily cleanser for oil, sweat, SPF, and city buildup - clean enough for treatment layers, balanced enough to keep the routine repeatable.',
  blurb = 'A daily cleanser for oil, sweat, SPF, and city buildup - clean enough for treatment layers, balanced enough to keep the routine repeatable.',
  description = 'The first step in The Core. CLEANSE clears the surface so the rest of the routine can work cleanly, without turning cleansing into a harsh stripping moment. Built for mornings, late nights, and daily SPF removal.',
  editorial_description = 'The first step in The Core. CLEANSE clears the surface so the rest of the routine can work cleanly, without turning cleansing into a harsh stripping moment. Built for mornings, late nights, and daily SPF removal.',
  how_to_use = 'Massage onto damp skin morning or night, then rinse thoroughly. Follow with TREAT or the next step your routine needs.',
  editorial_how_to_use = 'Massage onto damp skin morning or night, then rinse thoroughly. Follow with TREAT or the next step your routine needs.',
  product_type = 'Gel cleanser',
  collection = 'The Core',
  routine_number = '01',
  routine_step = 'Cleanse',
  routine_order = 1,
  routine_group = 'core',
  routine_group_label = 'The Core',
  routine_step_number = 1,
  routine_step_name = 'Cleanse',
  routine_display_label = '01 — The Core',
  routine_sort = 10,
  legacy_routine_group_label = 'The System',
  legacy_routine_display_label = '01 — The System',
  good_for = 'Daily cleansing, SPF removal, buildup',
  texture = 'Clean, fresh, non-stripping',
  finish = 'Balanced, not tight',
  usage_time = array['Morning', 'Night'],
  skin_types = array['All skin types'],
  concerns = array['Buildup', 'Daily cleansing'],
  benefits = array['CLEAR', 'BALANCE', 'PREP'],
  key_ingredients = array['Multi-biotics complex', '6-Type Cica Complex', 'LHA'],
  formula_notes = array[
    'Low-pH gel-to-foam cleanser source formulation.',
    'Centella and green tea are present in the supplier ingredient deck.',
    'Designed as the first daily step in The Core.'
  ],
  product_details = coalesce(product_details, '{}'::jsonb) || jsonb_build_object(
    'goodFor', 'Daily cleansing, SPF removal, buildup',
    'feelsLike', 'Clean, fresh, non-stripping',
    'finish', 'Balanced, not tight',
    'whenToUse', 'Morning and night',
    'whereItFits', 'Step 01 of The Core'
  ),
  search_keywords = array['cleanse', 'cleanser', 'daily', 'gel', 'balance', 'reset', 'spf removal', 'the core'],
  seo_title = 'CLEANSE 01 Calming Gel Cleanser | Mei Pelle',
  seo_description = 'Daily cleansing for a clean, balanced start to The Core - built to remove buildup without a tight finish.',
  updated_at = now()
where slug = 'cleanse-01-calming-gel-cleanser';

update public.products
set
  name = 'TREAT',
  display_name = 'TREAT',
  action_name = 'TREAT',
  formal_title = 'TREAT 02 PDRN 5% Ampoule',
  tagline = 'PDRN care for a steadier glow.',
  card_tagline = 'PDRN care for a steadier glow.',
  subtitle = 'PDRN care for a steadier glow.',
  descriptor = 'A fast-absorbing treatment serum built around PDRN, niacinamide, humectants, peptides, and adenosine for skin that looks smoother, more hydrated, and more awake - without a heavy finish.',
  blurb = 'A fast-absorbing treatment serum built around PDRN, niacinamide, humectants, peptides, and adenosine for skin that looks smoother, more hydrated, and more awake - without a heavy finish.',
  description = 'The treatment step in The Core. TREAT layers lightweight hydration with advanced appearance-focused conditioning: PDRN / Sodium DNA at 50,000 ppm, niacinamide for a more even-looking tone, trehalose and humectants for comfort, a peptide complex for a smoother-looking finish, and adenosine for fine-line appearance support. Use after cleansing, before sealing.',
  editorial_description = 'The treatment step in The Core. TREAT layers lightweight hydration with advanced appearance-focused conditioning: PDRN / Sodium DNA at 50,000 ppm, niacinamide for a more even-looking tone, trehalose and humectants for comfort, a peptide complex for a smoother-looking finish, and adenosine for fine-line appearance support. Use after cleansing, before sealing.',
  how_to_use = 'After cleansing and toner or essence, apply 2-3 drops and press into skin for 30-60 seconds. Follow with moisturizer. Use SPF in daytime. Use morning and night.',
  editorial_how_to_use = 'After cleansing and toner or essence, apply 2-3 drops and press into skin for 30-60 seconds. Follow with moisturizer. Use SPF in daytime. Use morning and night.',
  product_type = 'Ampoule / serum',
  collection = 'The Core',
  routine_number = '02',
  routine_step = 'Treat',
  routine_order = 2,
  routine_group = 'core',
  routine_group_label = 'The Core',
  routine_step_number = 2,
  routine_step_name = 'Treat',
  routine_display_label = '02 — The Core',
  routine_sort = 20,
  legacy_routine_group_label = 'The System',
  legacy_routine_display_label = '03 — The System',
  good_for = 'Dullness, dehydration, uneven-looking texture',
  texture = 'Lightweight concentrated serum',
  finish = 'Clean, hydrated, non-sticky',
  volume = coalesce(volume, '30 mL / 1.01 fl oz'),
  usage_time = array['Morning', 'Night'],
  skin_types = array['All skin types'],
  concerns = array['Dullness', 'Dehydration', 'Uneven-looking texture'],
  benefits = array['HYDRATE', 'SMOOTH', 'WAKE UP THE FINISH'],
  key_ingredients = array['PDRN / Sodium DNA 50,000 ppm', 'Niacinamide', 'Trehalose', 'Peptide complex', 'Adenosine'],
  ingredients = 'Water, Dipropylene Glycol, Butylene Glycol, Glycerin, Propanediol, Sodium DNA (50,000 ppm), 1,2-Hexanediol, Niacinamide, Trehalose, Polyglyceryl-10 Laurate, Xanthan Gum, Allantoin, Caprylyl Glycol, Ethylhexylglycerin, Adenosine, Disodium EDTA, Copper Tripeptide-1, Tripeptide-1, Palmitoyl Tripeptide-1, Palmitoyl Pentapeptide-4, Hexapeptide-11, Hexapeptide-9.',
  formula_notes = array[
    'Supplier reference: Leaders Cosmetics PDRN 5% Active Ampoule.',
    'Sodium DNA / PDRN present at 50,000 ppm in supplier facts.',
    'Lightweight concentrated ampoule texture for layering.'
  ],
  product_details = coalesce(product_details, '{}'::jsonb) || jsonb_build_object(
    'goodFor', 'Dullness, dehydration, uneven-looking texture',
    'feelsLike', 'Lightweight concentrated serum',
    'finish', 'Clean, hydrated, non-sticky',
    'whenToUse', 'Morning and night',
    'whereItFits', 'Step 02 of The Core',
    'sourceFullInci', 'Water, Dipropylene Glycol, Butylene Glycol, Glycerin, Propanediol, Sodium DNA (50,000 ppm), 1,2-Hexanediol, Niacinamide, Trehalose, Polyglyceryl-10 Laurate, Xanthan Gum, Allantoin, Caprylyl Glycol, Ethylhexylglycerin, Adenosine, Disodium EDTA, Copper Tripeptide-1, Tripeptide-1, Palmitoyl Tripeptide-1, Palmitoyl Pentapeptide-4, Hexapeptide-11, Hexapeptide-9.'
  ),
  search_keywords = array['treat', 'ampoule', 'serum', 'pdrn', 'sodium dna', 'niacinamide', 'peptides', 'glow', 'hydration', 'recode', 'the core'],
  seo_title = 'TREAT 02 PDRN 5% Ampoule | Mei Pelle',
  seo_description = 'A lightweight PDRN treatment serum with niacinamide, humectants, peptides, and adenosine for hydrated, smoother-looking skin.',
  updated_at = now()
where slug = 'treat-03-pdrn-5-ampoule';

update public.products
set
  name = 'SEAL',
  display_name = 'SEAL',
  action_name = 'SEAL',
  formal_title = 'SEAL 03 Green Collagen Cream',
  tagline = 'Lock in comfort. Keep the finish clean.',
  card_tagline = 'Lock in comfort. Keep the finish clean.',
  subtitle = 'Lock in comfort. Keep the finish clean.',
  descriptor = 'A final daily layer that helps hold hydration close, soften the look of texture, and leave skin composed - never overloaded.',
  blurb = 'A final daily layer that helps hold hydration close, soften the look of texture, and leave skin composed - never overloaded.',
  description = 'The finishing step in The Core. SEAL completes the routine by cushioning the treatment layer and leaving skin with a controlled, comfortable finish. Use it as the last Mei Pelle step at night, and before SPF in the morning.',
  editorial_description = 'The finishing step in The Core. SEAL completes the routine by cushioning the treatment layer and leaving skin with a controlled, comfortable finish. Use it as the last Mei Pelle step at night, and before SPF in the morning.',
  how_to_use = 'Smooth over face and neck as the final Mei Pelle step at night, and before SPF in the morning.',
  editorial_how_to_use = 'Smooth over face and neck as the final Mei Pelle step at night, and before SPF in the morning.',
  product_type = 'Cream',
  collection = 'The Core',
  routine_number = '03',
  routine_step = 'Seal',
  routine_order = 3,
  routine_group = 'core',
  routine_group_label = 'The Core',
  routine_step_number = 3,
  routine_step_name = 'Seal',
  routine_display_label = '03 — The Core',
  routine_sort = 30,
  legacy_routine_group_label = 'The System',
  legacy_routine_display_label = '05 — The System',
  good_for = 'Dryness, comfort, routine finish',
  texture = 'Cushioned, controlled',
  finish = 'Composed, not overloaded',
  usage_time = array['Morning', 'Night'],
  skin_types = array['All skin types'],
  concerns = array['Dryness', 'Comfort', 'Routine finish'],
  benefits = array['CUSHION', 'COMFORT', 'HOLD'],
  key_ingredients = array['Green collagen complex', 'Sodium hyaluronate', 'Panthenol', 'Niacinamide'],
  formula_notes = array[
    'Supplier formulation references green collagen and moisture-support ingredients.',
    'Daily cream texture for the final routine step.',
    'Layer over TREAT when skin wants added comfort.'
  ],
  product_details = coalesce(product_details, '{}'::jsonb) || jsonb_build_object(
    'goodFor', 'Dryness, comfort, routine finish',
    'feelsLike', 'Cushioned, controlled',
    'finish', 'Composed, not overloaded',
    'whenToUse', 'Morning and night',
    'whereItFits', 'Step 03 of The Core'
  ),
  search_keywords = array['seal', 'cream', 'moisturizer', 'collagen', 'hydration', 'the core'],
  seo_title = 'SEAL 03 Green Collagen Cream | Mei Pelle',
  seo_description = 'A daily sealing cream for comfort, hydration, and a clean finish - Step 03 of The Core.',
  updated_at = now()
where slug = 'seal-05-green-collagen-cream';

update public.products
set
  name = 'REFINE',
  display_name = 'REFINE',
  action_name = 'REFINE',
  formal_title = 'REFINE Pore Treatment Pads',
  tagline = 'Texture control, used deliberately.',
  card_tagline = 'Texture control, used deliberately.',
  subtitle = 'Texture control, used deliberately.',
  descriptor = 'A frequency-dependent step for skin that needs a smoother-looking surface. Keep it measured: start low, follow the supported cadence, and let The Core carry the daily routine.',
  blurb = 'A frequency-dependent step for skin that needs a smoother-looking surface. Keep it measured: start low, follow the supported cadence, and let The Core carry the daily routine.',
  description = 'REFINE sits beyond The Core for days when texture needs more attention. It should feel intentional, not automatic - a controlled step used at the product-supported frequency, then followed by The Core.',
  editorial_description = 'REFINE sits beyond The Core for days when texture needs more attention. It should feel intentional, not automatic - a controlled step used at the product-supported frequency, then followed by The Core.',
  how_to_use = 'Swipe one pad over clean, dry skin. Start a few times weekly, then build only as skin allows. Follow with hydration and use SPF in daytime.',
  editorial_how_to_use = 'Swipe one pad over clean, dry skin. Start a few times weekly, then build only as skin allows. Follow with hydration and use SPF in daytime.',
  product_type = 'Toner pad',
  collection = 'Beyond The Core',
  routine_number = null,
  routine_step = null,
  routine_order = 4,
  routine_group = 'beyond_core',
  routine_group_label = 'Beyond The Core',
  routine_step_number = null,
  routine_step_name = null,
  routine_display_label = 'Beyond The Core',
  routine_sort = 110,
  legacy_routine_group_label = 'The System',
  legacy_routine_display_label = '02 — The System',
  good_for = 'Uneven-looking texture',
  texture = 'Active, controlled',
  finish = 'Smoother-looking surface',
  usage_time = array['Follow product-supported cadence'],
  skin_types = array['All skin types'],
  concerns = array['Uneven-looking texture'],
  benefits = array['SMOOTH', 'CLARIFY', 'CONTROL'],
  key_ingredients = array['Panthenol', 'Betaine', 'Sodium hyaluronate', 'Plum extract'],
  formula_notes = array[
    'Use frequency should be built gradually.',
    'Follow with hydration and daytime SPF when using active texture steps.'
  ],
  product_details = coalesce(product_details, '{}'::jsonb) || jsonb_build_object(
    'goodFor', 'Uneven-looking texture',
    'feelsLike', 'Active, controlled',
    'finish', 'Smoother-looking surface',
    'whenToUse', 'Follow product-supported cadence',
    'whereItFits', 'Beyond The Core'
  ),
  search_keywords = array['refine', 'pads', 'texture', 'tone', 'treatment', 'beyond the core'],
  seo_title = 'REFINE Pore Treatment Pads | Mei Pelle',
  seo_description = 'A deliberate beyond-core step for smoother-looking texture, used at the product-supported cadence.',
  updated_at = now()
where slug = 'refine-02-pore-treatment-pads';

update public.products
set
  name = 'FRAME',
  display_name = 'FRAME',
  action_name = 'FRAME',
  formal_title = 'FRAME PDRN+ Eye Cream',
  tagline = 'A more awake-looking frame.',
  card_tagline = 'A more awake-looking frame.',
  subtitle = 'A more awake-looking frame.',
  descriptor = 'A targeted eye-area step for days when fatigue shows first. Built to support a cleaner, more rested-looking impression without adding another full-face layer.',
  blurb = 'A targeted eye-area step for days when fatigue shows first. Built to support a cleaner, more rested-looking impression without adding another full-face layer.',
  description = 'FRAME is the focused step outside The Core. Use it around the eye area when the routine needs a sharper, more awake-looking finish.',
  editorial_description = 'FRAME is the focused step outside The Core. Use it around the eye area when the routine needs a sharper, more awake-looking finish.',
  how_to_use = 'Tap a small amount around the orbital area with your ring finger. Keep product away from the lash line to avoid migration. Use before moisturizer when the eye area needs a focused step.',
  editorial_how_to_use = 'Tap a small amount around the orbital area with your ring finger. Keep product away from the lash line to avoid migration. Use before moisturizer when the eye area needs a focused step.',
  product_type = 'Eye contour cream',
  collection = 'Beyond The Core',
  routine_number = null,
  routine_step = null,
  routine_order = 5,
  routine_group = 'beyond_core',
  routine_group_label = 'Beyond The Core',
  routine_step_number = null,
  routine_step_name = null,
  routine_display_label = 'Beyond The Core',
  routine_sort = 120,
  legacy_routine_group_label = 'The System',
  legacy_routine_display_label = '04 — The System',
  good_for = 'Tired-looking eye area',
  texture = 'Targeted, lightweight',
  finish = 'Cleaner, more awake-looking',
  usage_time = array['As needed'],
  skin_types = array['All skin types'],
  concerns = array['Tired-looking eye area'],
  benefits = array['FOCUS', 'WAKE', 'SHARPEN'],
  key_ingredients = array['Sodium DNA', 'Niacinamide', 'Panthenol', 'Allantoin'],
  formula_notes = array[
    'Supplier formulation references PDRN+ and eye-area conditioning ingredients.',
    'Cream-balm texture made for targeted use.',
    'Use a small amount to avoid product migration near the eye.'
  ],
  product_details = coalesce(product_details, '{}'::jsonb) || jsonb_build_object(
    'goodFor', 'Tired-looking eye area',
    'feelsLike', 'Targeted, lightweight',
    'finish', 'Cleaner, more awake-looking',
    'whenToUse', 'As needed',
    'whereItFits', 'Beyond The Core'
  ),
  search_keywords = array['frame', 'eye', 'cream', 'pdrn', 'awake', 'contour', 'beyond the core'],
  seo_title = 'FRAME PDRN+ Eye Cream | Mei Pelle',
  seo_description = 'A targeted beyond-core eye-area step for a cleaner, more awake-looking finish.',
  updated_at = now()
where slug = 'frame-04-pdrn-eye-cream';

update public.products
set
  name = 'LIFT',
  display_name = 'LIFT',
  action_name = 'LIFT',
  formal_title = 'LIFT PDRN Sheet Mask',
  tagline = 'The scheduled intensive.',
  card_tagline = 'The scheduled intensive.',
  subtitle = 'The scheduled intensive.',
  descriptor = 'A weekly treatment moment for when skin needs more than the daily three steps. Use deliberately, then return to The Core.',
  blurb = 'A weekly treatment moment for when skin needs more than the daily three steps. Use deliberately, then return to The Core.',
  description = 'LIFT belongs beyond The Core: a scheduled intensive for the weekly refresh, not another daily requirement. Keep the ritual simple, controlled, and repeatable.',
  editorial_description = 'LIFT belongs beyond The Core: a scheduled intensive for the weekly refresh, not another daily requirement. Keep the ritual simple, controlled, and repeatable.',
  how_to_use = 'Apply to clean skin for the directed wear time, then remove and press in remaining essence. Return to The Core instead of adding another daily requirement.',
  editorial_how_to_use = 'Apply to clean skin for the directed wear time, then remove and press in remaining essence. Return to The Core instead of adding another daily requirement.',
  product_type = 'Sheet mask',
  collection = 'Beyond The Core',
  routine_number = null,
  routine_step = null,
  routine_order = 6,
  routine_group = 'beyond_core',
  routine_group_label = 'Beyond The Core',
  routine_step_number = null,
  routine_step_name = null,
  routine_display_label = 'Beyond The Core',
  routine_sort = 130,
  legacy_routine_group_label = 'Intensive',
  legacy_routine_display_label = '07 — The System',
  good_for = 'Weekly refresh, extra support',
  texture = 'Treatment moment',
  finish = 'Refreshed, composed',
  usage_time = array['Product-supported weekly cadence'],
  skin_types = array['All skin types'],
  concerns = array['Weekly extra support'],
  benefits = array['REFRESH', 'INTENSIFY', 'RETURN'],
  key_ingredients = array['Sodium DNA 5,000 ppm', 'Niacinamide', 'Hydrolyzed collagen', 'Adenosine'],
  formula_notes = array[
    'Supplier formulation highlights PDRN 0.5%.',
    'Weekly intensive format, separate from the daily core routine.',
    'Use source timing guidance for wear duration.'
  ],
  product_details = coalesce(product_details, '{}'::jsonb) || jsonb_build_object(
    'goodFor', 'Weekly refresh, extra support',
    'feelsLike', 'Treatment moment',
    'finish', 'Refreshed, composed',
    'whenToUse', 'Product-supported weekly cadence',
    'whereItFits', 'Beyond The Core'
  ),
  search_keywords = array['lift', 'mask', 'sheet mask', 'weekly', 'pdrn', 'intensive', 'beyond the core'],
  seo_title = 'LIFT PDRN Sheet Mask | Mei Pelle',
  seo_description = 'A scheduled beyond-core intensive for the weekly refresh, designed to complement The Core.',
  updated_at = now()
where slug = 'lift-06-pdrn-mask-system';

with active_commerce_products as (
  select id, slug, coalesce(routine_sort, sort_order, position) as sort_key
  from public.products
  where catalog_status = 'active'
    and slug in (
      'cleanse-01-calming-gel-cleanser',
      'treat-03-pdrn-5-ampoule',
      'seal-05-green-collagen-cream',
      'refine-02-pore-treatment-pads',
      'frame-04-pdrn-eye-cream',
      'lift-06-pdrn-mask-system'
    )
),
deleted as (
  delete from public.product_relationships rel
  using active_commerce_products p, active_commerce_products r
  where rel.relationship_type = 'complete_the_routine'
    and rel.product_id = p.id
    and rel.related_product_id = r.id
  returning rel.product_id
)
insert into public.product_relationships (
  product_id,
  related_product_id,
  relationship_type,
  sort_order
)
select
  p.id,
  r.id,
  'complete_the_routine',
  row_number() over (partition by p.id order by r.sort_key, r.slug)
from active_commerce_products p
cross join active_commerce_products r
where p.id <> r.id
on conflict (product_id, related_product_id, relationship_type) do update set
  sort_order = excluded.sort_order;
