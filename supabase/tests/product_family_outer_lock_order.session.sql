-- Run this file concurrently in two independent sessions. Both sessions must
-- complete without 40P01 or lock_timeout. It exercises the exact outer
-- Product Family lock order without mutating canonical catalog data.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '15s';

select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended(
    'helix-product-family:' || family.id::text,
    0
  )
)
from public.product_families family
where family.slug = 'refine';

select product.id
from public.products product
join public.product_family_memberships membership
  on membership.product_id = product.id
join public.product_families family
  on family.id = membership.family_id
where family.slug = 'refine'
order by product.id
for update of product;

select pg_catalog.pg_sleep(1);
rollback;
