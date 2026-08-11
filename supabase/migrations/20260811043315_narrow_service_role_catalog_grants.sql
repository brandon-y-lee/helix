-- service_role needs only the explicit Catalog CRUD boundary. Remove legacy
-- table-owner-like grants before restoring the narrow server capability.

revoke all privileges on table public.products from service_role;
revoke all privileges on table public.product_variants from service_role;
revoke all privileges on table public.product_media from service_role;

grant select, insert, update, delete on table public.products to service_role;
grant select, insert, update, delete on table public.product_variants to service_role;
grant select, insert, update, delete on table public.product_media to service_role;
