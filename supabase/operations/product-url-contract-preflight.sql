\set ON_ERROR_STOP on
-- Historical, separately reviewed parent contraction only.
do $$
begin
  if not exists (select 1 from public.read_helix_environment()
      where environment = 'production' and project_ref = 'erasogmsqpgiirovubjh') then
    raise exception 'A verified production Catalog connection is required';
  end if;
end;
$$;
\ir product-url-inventory.sql
-- The historical contraction accepts a zero-argument session-local inventory.
create or replace function pg_temp.product_url_inventory()
returns jsonb language sql set search_path = '' as $$
  select pg_temp.product_url_inventory('production');
$$;
select pg_temp.product_url_inventory();
