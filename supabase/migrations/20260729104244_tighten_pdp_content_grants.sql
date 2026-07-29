-- Default privileges may grant service_role table capabilities that the
-- application does not need. Keep this canonical editorial table CRUD-only.

revoke all on table public.product_pdp_content from service_role;
grant select, insert, update, delete
  on table public.product_pdp_content
  to service_role;
