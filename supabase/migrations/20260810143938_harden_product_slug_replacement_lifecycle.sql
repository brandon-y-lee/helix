set lock_timeout = '10s';
set statement_timeout = '120s';

alter function public.replace_catalog_product_slug(uuid, uuid, uuid)
  rename to replace_catalog_product_slug_v1;

revoke all on function public.replace_catalog_product_slug_v1(
  uuid, uuid, uuid
) from public, anon, authenticated, service_role;

create function public.replace_catalog_product_slug(
  p_source_product_id uuid,
  p_target_product_id uuid,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_role text;
begin
  select role into v_actor_role
  from public.admin_memberships
  where user_id = p_actor_id and active;

  if v_actor_role is null or v_actor_role <> 'admin' then
    raise exception 'Only a Catalog Administrator can publish a replacement'
      using errcode = '42501';
  end if;

  return public.replace_catalog_product_slug_v1(
    p_source_product_id,
    p_target_product_id,
    p_actor_id
  );
end;
$$;

revoke all on function public.replace_catalog_product_slug(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.replace_catalog_product_slug(uuid, uuid, uuid)
  to service_role;

create or replace function private.enforce_replaced_product_archival()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.catalog_status = 'active'
     and old.catalog_status is distinct from new.catalog_status
     and exists (
       select 1
       from public.product_slug_routes route
       where route.source_product_id = new.id
         and route.route_kind = 'replacement'
     )
  then
    raise exception 'A replaced Product must remain Archived'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_replaced_product_archival()
  from public, anon, authenticated, service_role;

create trigger enforce_replaced_product_archival
before update of catalog_status on public.products
for each row
when (old.catalog_status is distinct from new.catalog_status)
execute function private.enforce_replaced_product_archival();

comment on function public.replace_catalog_product_slug(uuid, uuid, uuid) is
  'Fails closed on actor membership before publishing an explicit Product replacement.';
comment on function private.enforce_replaced_product_archival() is
  'Prevents a replaced Product from becoming an active canonical storefront record.';
