-- Seed the original placeholder catalog (development only).
insert into public.products
  (slug, name, tagline, collection, blurb, description, benefits, how_to_use, swatch_from, swatch_to, position)
values
  ('groundwork-gel-cleanser', 'Groundwork Gel Cleanser', 'Daily clarifying wash', 'Cleanse',
   'A low-foam gel that lifts grit and excess oil without stripping.',
   'Groundwork is the first step in the routine — a balanced gel cleanser formulated to clear away sweat, sunscreen, and the day without leaving skin tight. It rinses clean and leaves a calm, prepared surface for everything that follows.',
   array['Dissolves oil and daily buildup','Maintains the skin barrier','Leaves no residue or tightness'],
   'Massage a small amount onto damp skin morning and night. Rinse with lukewarm water and pat dry.',
   '#dfe7e2', '#b9c9bf', 0),
  ('meridian-daily-moisturizer', 'Meridian Daily Moisturizer', 'Lightweight all-day hydration', 'Hydrate',
   'A fast-absorbing lotion that hydrates without weight or shine.',
   'Meridian is a featherweight daily moisturizer built for skin that should never look greasy. It delivers lasting hydration, smooths texture, and settles in seconds so it disappears under sunscreen or a clean shave.',
   array['All-day, non-greasy hydration','Smooths and softens texture','Layers cleanly under SPF'],
   'Apply an even layer to clean skin morning and night. Follow with sunscreen during the day.',
   '#e7e2da', '#cabfa9', 1),
  ('northpoint-renewal-serum', 'Northpoint Renewal Serum', 'Overnight resurfacing concentrate', 'Treat',
   'A nightly serum that refines tone and softens fine lines.',
   'Northpoint is the workhorse of the routine — a concentrated overnight serum that supports cell turnover, evens tone, and gradually softens the look of fine lines. Skin wakes up smoother, clearer, and more even with consistent use.',
   array['Refines tone and texture overnight','Softens the look of fine lines','Supports a brighter, more even finish'],
   'Apply a few drops to clean, dry skin at night. Start every other night and build to nightly. Always wear SPF the next morning.',
   '#e3ddea', '#c2b5d6', 2),
  ('summit-mineral-spf', 'Summit Mineral Defense SPF 40', 'Invisible mineral sunscreen', 'Protect',
   'A weightless mineral SPF that leaves no white cast.',
   'Summit is broad-spectrum mineral protection engineered to vanish on skin. It shields against daily UV exposure without the chalky finish or heavy feel, making it easy to wear every single day.',
   array['Broad-spectrum SPF 40 protection','No white cast or heavy feel','Sits cleanly over moisturizer'],
   'Apply generously as the last step of your morning routine. Reapply every two hours with sun exposure.',
   '#eee6d6', '#d8c79e', 3),
  ('lowtide-recovery-cream', 'Lowtide Overnight Recovery Cream', 'Rich restorative night cream', 'Hydrate',
   'A cushioning night cream that restores while you sleep.',
   'Lowtide is a richer, more occlusive cream for the end of the day. It seals in moisture, supports overnight repair, and leaves dry or stressed skin feeling comfortable and replenished by morning.',
   array['Deep overnight replenishment','Comforts dry, stressed skin','Strengthens the moisture barrier'],
   'Smooth a generous layer over skin as the final step of your evening routine.',
   '#dee4ea', '#aebccb', 4),
  ('clearview-eye-concentrate', 'Clearview Eye Concentrate', 'De-puffing eye treatment', 'Treat',
   'A cooling concentrate that targets puffiness and fatigue.',
   'Clearview is a focused treatment for the eye area — a lightweight concentrate that helps reduce the look of puffiness, dark circles, and fatigue so you look more rested even when you aren''t.',
   array['Reduces the look of puffiness','Brightens tired-looking eyes','Absorbs fast, layers easily'],
   'Dab a small amount around the orbital bone morning and night. Pat gently until absorbed.',
   '#e2eae8', '#aecbc6', 5);

insert into public.product_variants (product_id, variant_key, label, price_cents, position)
select p.id, v.variant_key, v.label, v.price_cents, v.position
from (values
  ('groundwork-gel-cleanser','100ml','100 ml',2400,0),
  ('groundwork-gel-cleanser','200ml','200 ml',3800,1),
  ('meridian-daily-moisturizer','50ml','50 ml',3200,0),
  ('meridian-daily-moisturizer','75ml','75 ml',4400,1),
  ('northpoint-renewal-serum','30ml','30 ml',5400,0),
  ('northpoint-renewal-serum','50ml','50 ml',7800,1),
  ('summit-mineral-spf','50ml','50 ml',3600,0),
  ('lowtide-recovery-cream','50ml','50 ml',4200,0),
  ('lowtide-recovery-cream','75ml','75 ml',5600,1),
  ('clearview-eye-concentrate','15ml','15 ml',4800,0)
) as v(slug, variant_key, label, price_cents, position)
join public.products p on p.slug = v.slug;;
