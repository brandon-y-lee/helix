-- Catalog reads remain public through RLS-filtered SELECT policies. The
-- browser roles must not retain legacy table-level mutation privileges even
-- though RLS also denies those writes.

revoke all privileges on table public.products from anon, authenticated;
revoke all privileges on table public.product_variants from anon, authenticated;
revoke all privileges on table public.product_media from anon, authenticated;

grant select on table public.products to anon, authenticated;
grant select on table public.product_variants to anon, authenticated;
grant select on table public.product_media to anon, authenticated;

grant select, insert, update, delete on table public.products to service_role;
grant select, insert, update, delete on table public.product_variants to service_role;
grant select, insert, update, delete on table public.product_media to service_role;
