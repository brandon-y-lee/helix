\set ON_ERROR_STOP on
-- Read-only psql entry. Load product-url-preflight.sql in this development session first.
-- A missing or swapped marker stops the inventory before any Catalog read.
do $$
begin
  if not exists (select 1 from public.read_helix_environment()
      where environment = 'development' and project_ref = 'zyfkunnpnlmgvrojmrbg') then
    raise exception 'A verified development Catalog connection is required';
  end if;
end;
$$;
select jsonb_build_object(
  'projectRef', e.project_ref,
  'capturedAt', statement_timestamp(),
  'activeProducts', inventory -> 'activeProducts',
  'reservations', inventory -> 'reservations'
)
from public.read_helix_environment() e
cross join lateral (select pg_temp.product_url_inventory(e.environment) as inventory) captured
where e.environment = 'development' and e.project_ref = 'zyfkunnpnlmgvrojmrbg';
