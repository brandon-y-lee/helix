-- Remove legacy-adjacent "reset" language from visible LIFT merchandising copy.

update public.products
set
  tagline = 'The weekly intensive',
  card_tagline = 'The weekly intensive',
  description = replace(description, 'sheet-mask reset', 'sheet-mask intensive'),
  editorial_description = 'A weekly sheet-mask intensive for a replenished, smoother-looking finish.',
  search_keywords = array[
    'lift',
    'mask',
    'sheet mask',
    'weekly',
    'pdrn',
    'intensive'
  ],
  updated_at = now()
where slug = 'lift-06-pdrn-mask-system';
