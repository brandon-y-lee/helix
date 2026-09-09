-- Editorial media replacement retains the previous row as archived history.
-- Keep current-role uniqueness enforced while replacing the pre-archival index.
set local lock_timeout = '5s';
set local statement_timeout = '30s';

create unique index product_media_editorial_role_active_replacement
  on public.product_media (product_id, role)
  where archived_at is null
    and role in ('routine_video', 'routine_video_poster', 'profile_editorial');

drop index public.product_media_editorial_role_unique;

alter index public.product_media_editorial_role_active_replacement
  rename to product_media_editorial_role_unique;
