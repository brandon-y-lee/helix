set lock_timeout = '10s';
set statement_timeout = '120s';

alter table public.products
  add constraint products_slug_length_check
  check (char_length(slug) <= 120);

alter table public.product_slug_routes
  drop constraint product_slug_routes_source_slug_check;

alter table public.product_slug_routes
  add constraint product_slug_routes_source_slug_check
  check (
    source_slug = btrim(source_slug)
    and source_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    and char_length(source_slug) <= 120
  );

comment on constraint products_slug_length_check on public.products is
  'Bounds canonical Product paths and their derived cache tags.';
comment on constraint product_slug_routes_source_slug_check
  on public.product_slug_routes is
  'Bounds and validates every canonical or historical Product URL slug.';
