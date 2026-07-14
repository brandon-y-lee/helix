with seed_slugs(slug) as (
  values
    ('groundwork-gel-cleanser'),
    ('meridian-daily-moisturizer'),
    ('northpoint-renewal-serum'),
    ('summit-mineral-spf'),
    ('lowtide-recovery-cream'),
    ('clearview-eye-concentrate')
),
candidates as (
  select p.*
  from public.products p
  join seed_slugs s on s.slug = p.slug
)
select jsonb_pretty(
  jsonb_build_object(
    'generated_at', now(),
    'reason', 'pre-cleanup snapshot for archived original development seed catalog rows',
    'products', coalesce(
      (
        select jsonb_agg(to_jsonb(p) order by p.slug)
        from candidates p
      ),
      '[]'::jsonb
    ),
    'product_variants', coalesce(
      (
        select jsonb_agg(to_jsonb(v) order by p.slug, v.variant_key)
        from public.product_variants v
        join candidates p on p.id = v.product_id
      ),
      '[]'::jsonb
    ),
    'reference_counts', jsonb_build_object(
      'product_variants', (
        select count(*)
        from public.product_variants v
        join candidates p on p.id = v.product_id
      ),
      'product_media', (
        select count(*)
        from public.product_media m
        join candidates p on p.id = m.product_id
      ),
      'product_sources', (
        select count(*)
        from public.product_sources s
        join candidates p on p.id = s.product_id
      ),
      'product_relationships', (
        select count(*)
        from public.product_relationships r
        join candidates p on p.id = r.product_id or p.id = r.related_product_id
      ),
      'cart_items', (
        select count(*)
        from public.cart_items c
        join candidates p on p.id = c.product_id
      ),
      'order_items', (
        select count(*)
        from public.order_items o
        join candidates p on p.id = o.product_id
      )
    )
  )
) as catalog_cleanup_snapshot;
