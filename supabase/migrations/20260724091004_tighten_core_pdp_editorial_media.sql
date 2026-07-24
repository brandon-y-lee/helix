-- Require complete intrinsic metadata and one canonical row per dedicated PDP
-- editorial role. A separate migration is required because the initial role
-- extension was already applied to the linked non-production project.

alter table public.product_media
  drop constraint if exists product_media_editorial_role_type_check;

alter table public.product_media
  add constraint product_media_editorial_role_type_check
  check (
    role not in ('routine_video', 'routine_video_poster', 'profile_editorial')
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
          role in ('routine_video_poster', 'profile_editorial')
          and media_type = 'image'
        )
      )
    )
  );

create unique index if not exists product_media_editorial_role_unique
  on public.product_media (product_id, role)
  where role in (
    'routine_video',
    'routine_video_poster',
    'profile_editorial'
  );
