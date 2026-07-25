-- Add one dedicated texture image for the interactive Core routine module.
-- This editorial role is intentionally separate from card, cart, search, hero,
-- and other utility media roles.

alter table public.product_media
  drop constraint if exists product_media_role_check;

alter table public.product_media
  add constraint product_media_role_check
  check (
    role in (
      'card',
      'hero',
      'gallery',
      'detail',
      'campaign',
      'card_default',
      'card_hover',
      'cart',
      'search',
      'routine_video',
      'routine_video_poster',
      'profile_editorial',
      'ingredients_texture',
      'core_routine_texture'
    )
  );

alter table public.product_media
  drop constraint if exists product_media_editorial_role_type_check;

alter table public.product_media
  add constraint product_media_editorial_role_type_check
  check (
    role not in (
      'routine_video',
      'routine_video_poster',
      'profile_editorial',
      'ingredients_texture',
      'core_routine_texture'
    )
    or (
      media_kind = 'image'
      and nullif(url, '') is not null
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
            'core_routine_texture'
          )
          and media_type = 'image'
        )
      )
    )
  );

create unique index if not exists product_media_core_routine_texture_role_unique
  on public.product_media (product_id, role)
  where role = 'core_routine_texture';
