-- Populate parity v1 metadata with original, neutral, non-claim placeholder copy.
-- Stagger created_at so "Newest first" is deterministic (higher position = newer).
update public.products set
  status = v.status,
  made_for = v.made_for,
  good_for = v.good_for,
  texture = v.texture,
  created_at = now() - ((5 - position) || ' days')::interval
from (values
  ('groundwork-gel-cleanser', 'available',   'All skin types',            'Everyday AM + PM',   'Cushioned gel'),
  ('meridian-daily-moisturizer','available', 'Normal to combination',     'Daytime layering',   'Weightless lotion'),
  ('northpoint-renewal-serum', 'available',   'Uneven texture or tone',    'Nighttime routine',  'Silky serum'),
  ('summit-mineral-spf',       'coming_soon', 'All skin types',            'Daily morning finish','Soft cream'),
  ('lowtide-recovery-cream',   'available',   'Dry or stressed skin',      'Overnight recovery', 'Rich balm-cream'),
  ('clearview-eye-concentrate','sold_out',    'All skin types',            'AM + PM eye step',   'Cooling fluid')
) as v(slug, status, made_for, good_for, texture)
where public.products.slug = v.slug;;
