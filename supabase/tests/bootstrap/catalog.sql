-- Run in a transaction after the seed, and again after a repeat application.
-- These are the storefront's anonymous relations, filters and projections.
set local role anon;
do $verify$
declare
  core_steps text[];
  cold_product text;
  rich_roles integer;
begin
  select array_agg(s.name order by s.position) into core_steps
    from public.products p join public.system_steps s on s.name=p.system_step_name
      and s.routine_group=p.routine_group
    join public.product_media m on m.product_id=p.id and m.role='core_routine_texture'
      and m.archived_at is null and m.media_type='image' and m.width=64 and m.height=48
    where p.catalog_status='active' and p.routine_group='core' and m.url like
      'https://zyfkunnpnlmgvrojmrbg.supabase.co/storage/v1/object/public/helix-catalog/products/' || p.id || '/%';
  if core_steps is distinct from array['CLEANSE','TREAT','SEAL'] then
    raise exception 'Incorrect anonymous Core products, System Steps or child media';
  end if;
  select p.slug into strict cold_product
    from public.product_families f join public.product_family_memberships member on member.family_id=f.id
    join public.products p on p.id=member.product_id
    join public.product_variants v on v.product_id=p.id and v.archived_at is null
    join public.product_pdp_content content on content.product_id=p.id
    where f.slug='dev-preparation' and not member.is_entry and p.catalog_status='active'
      and content.how_to_use_steps='{}'::text[] and not v.available;
  if cold_product <> 'dev-preparation-pads' then raise exception 'Cold family PDP is unavailable'; end if;
  select count(distinct m.role) into rich_roles
    from public.products p join public.product_media m on p.id=m.product_id
    where p.slug='dev-serum' and p.catalog_status='active' and m.archived_at is null
      and m.role in ('gallery', 'routine_video', 'routine_video_poster')
      and m.url like 'https://zyfkunnpnlmgvrojmrbg.supabase.co/storage/v1/object/public/helix-catalog/products/' || p.id || '/%';
  if rich_roles <> 3 then raise exception 'Rich PDP media unavailable'; end if;
  if (select count(*) from public.products where id::text like '55900000-0000-4000-8000-%'
        and catalog_status='active') <> 5
    or (select count(*) from public.product_media where product_id::text like '55900000-0000-4000-8000-%') <> 11
    or (select count(*) from public.product_variants where product_id::text like '55900000-0000-4000-8000-%') <> 5
    or (select count(*) from public.product_relationships where product_id='55900000-0000-4000-8000-000000000002'
        and related_product_id='55900000-0000-4000-8000-000000000003'
        and relationship_type='complete_the_routine' and archived_at is null) <> 1 then
    raise exception 'Development Catalog fixture coverage or retry counts incorrect';
  end if;
  begin
    update public.products set slug='unexpected-write' where id='55900000-0000-4000-8000-000000000001';
    raise exception 'Anonymous Catalog write was permitted';
  exception when insufficient_privilege then null;
  end;
end
$verify$;
reset role;
