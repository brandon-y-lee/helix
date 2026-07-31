alter table public.product_media
  drop constraint product_media_role_check;

alter table public.product_media
  add constraint product_media_role_check
  check (
    role in (
      'card',
      'hero',
      'gallery',
      'detail',
      'card_default',
      'card_hover',
      'cart',
      'search',
      'routine_video',
      'routine_video_poster',
      'profile_editorial',
      'ingredients_texture',
      'core_routine_texture',
      'core_routine_editorial',
      'pdp_outcome',
      'pdp_application'
    )
  );

alter table public.product_media
  drop constraint product_media_editorial_role_type_check;

alter table public.product_media
  add constraint product_media_editorial_role_type_check
  check (
    role not in (
      'routine_video',
      'routine_video_poster',
      'profile_editorial',
      'ingredients_texture',
      'core_routine_texture',
      'core_routine_editorial',
      'pdp_outcome',
      'pdp_application'
    )
    or (
      nullif(btrim(url), '') is not null
      and width is not null
      and width > 0
      and height is not null
      and height > 0
      and (
        (role = 'routine_video' and media_type = 'video')
        or (
          role in (
            'routine_video_poster',
            'profile_editorial',
            'ingredients_texture',
            'core_routine_texture',
            'core_routine_editorial',
            'pdp_outcome',
            'pdp_application'
          )
          and media_type = 'image'
        )
      )
    )
  );

alter table public.product_media
  add constraint product_media_core_routine_editorial_shape_check
  check (
    role <> 'core_routine_editorial'
    or (
      media_type = 'image'
      and nullif(btrim(url), '') is not null
      and url ~ '^https://erasogmsqpgiirovubjh[.]supabase[.]co/storage/v1/object/public/mei-pelle-catalog/products/[^[:space:]?#]+$'
      and width is not null
      and width > 0
      and height is not null
      and height > 0
      and variant_id is null
      and sort_order = 1
      and palette_id is null
      and placeholder_palette = '{}'::jsonb
    )
  );

create unique index product_media_core_routine_editorial_role_unique
  on public.product_media (product_id, role)
  where role = 'core_routine_editorial'
    and archived_at is null;

create or replace function private.enforce_core_routine_editorial_product()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role = 'core_routine_editorial'
    and not exists (
      select 1
      from public.products p
      where p.id = new.product_id
        and p.routine_group = 'core'
    )
  then
    raise exception using
      errcode = '23514',
      message = 'core_routine_editorial media requires a Core product';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_core_routine_editorial_product()
  from public, anon, authenticated;

create trigger product_media_enforce_core_routine_editorial_product
  before insert or update of product_id, role
  on public.product_media
  for each row
  execute function private.enforce_core_routine_editorial_product();
