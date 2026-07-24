-- Canonical PDP editorial media for the Core routine.
--
-- The existing `media_kind` column distinguishes concrete assets from
-- presentation placeholders. `media_type` remains the MIME-level image/video
-- discriminator, so routine video rows use media_kind=image + media_type=video.

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
      'profile_editorial'
    )
  );

alter table public.product_media
  drop constraint if exists product_media_editorial_role_type_check;

alter table public.product_media
  add constraint product_media_editorial_role_type_check
  check (
    role not in ('routine_video', 'routine_video_poster', 'profile_editorial')
    or (
      media_kind = 'image'
      and nullif(url, '') is not null
      and width > 0
      and height > 0
      and (
        (role = 'routine_video' and media_type = 'video')
        or (
          role in ('routine_video_poster', 'profile_editorial')
          and media_type = 'image'
        )
      )
    )
  );

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'mei-pelle-catalog',
  'mei-pelle-catalog',
  true,
  16777216,
  array['image/jpeg', 'image/png', 'image/webp', 'video/mp4']::text[]
)
on conflict (id) do nothing;

update storage.buckets
set
  file_size_limit = greatest(coalesce(file_size_limit, 0), 16777216),
  allowed_mime_types = array(
    select distinct mime
    from unnest(
      coalesce(allowed_mime_types, '{}'::text[])
      || array['image/jpeg', 'image/png', 'image/webp', 'video/mp4']::text[]
    ) as mime
  )
where id = 'mei-pelle-catalog';
