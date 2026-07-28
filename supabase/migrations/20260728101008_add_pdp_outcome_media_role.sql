-- Reserve one ordered, product-level image role for PDP outcome states.
-- The existing (product_id, role, sort_order) unique constraint keeps each
-- position deterministic without coupling media records to visible copy.

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
      'core_routine_texture',
      'pdp_outcome'
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
      'core_routine_texture',
      'pdp_outcome'
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
            'core_routine_texture',
            'pdp_outcome'
          )
          and media_type = 'image'
        )
      )
    )
  );
