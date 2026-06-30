-- Core-three rename: RESET -> CLEANSE, RECODE -> TREAT.
-- Preserves product UUIDs and relationship rows by updating the existing
-- catalog rows in place. Old names remain only as hidden search aliases.

do $$
begin
  if exists (
    select 1 from public.products where slug = 'reset-01-calming-gel-cleanser'
  ) and exists (
    select 1 from public.products where slug = 'cleanse-01-calming-gel-cleanser'
  ) then
    raise exception 'Both legacy and canonical CLEANSE slugs exist; aborting to avoid duplicate catalog rows.';
  end if;

  if exists (
    select 1 from public.products where slug = 'recode-03-pdrn-5-ampoule'
  ) and exists (
    select 1 from public.products where slug = 'treat-03-pdrn-5-ampoule'
  ) then
    raise exception 'Both legacy and canonical TREAT slugs exist; aborting to avoid duplicate catalog rows.';
  end if;

  update public.products
  set slug = 'cleanse-01-calming-gel-cleanser'
  where slug = 'reset-01-calming-gel-cleanser';

  update public.products
  set slug = 'treat-03-pdrn-5-ampoule'
  where slug = 'recode-03-pdrn-5-ampoule';
end $$;

update public.products
set
  name = 'CLEANSE',
  display_name = 'CLEANSE',
  action_name = 'CLEANSE',
  formal_title = 'CLEANSE 01 Calming Gel Cleanser',
  seo_title = 'CLEANSE 01 Calming Gel Cleanser | Mei Pelle',
  editorial_how_to_use = 'Massage onto damp skin morning or night, then rinse thoroughly. Follow with REFINE or TREAT.',
  search_keywords = array[
    'cleanse',
    'cleanser',
    'daily',
    'gel',
    'balance',
    'low pH',
    'cica',
    'reset'
  ],
  updated_at = now()
where slug = 'cleanse-01-calming-gel-cleanser';

update public.products
set
  name = 'TREAT',
  display_name = 'TREAT',
  action_name = 'TREAT',
  formal_title = 'TREAT 03 PDRN 5% Ampoule',
  seo_title = 'TREAT 03 PDRN 5% Ampoule | Mei Pelle',
  search_keywords = array[
    'treat',
    'ampoule',
    'serum',
    'pdrn',
    'sodium dna',
    'niacinamide',
    'peptides',
    'glow',
    'hydration',
    'recode'
  ],
  updated_at = now()
where slug = 'treat-03-pdrn-5-ampoule';

update public.product_media
set
  alt = replace(replace(alt, 'RESET', 'CLEANSE'), 'RECODE', 'TREAT'),
  palette_id = replace(replace(palette_id, 'reset', 'cleanse'), 'recode', 'treat'),
  updated_at = now()
where product_id in (
  select id
  from public.products
  where slug in (
    'cleanse-01-calming-gel-cleanser',
    'treat-03-pdrn-5-ampoule'
  )
);
