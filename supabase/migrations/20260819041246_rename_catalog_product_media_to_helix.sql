set lock_timeout = '10s';
set statement_timeout = '120s';

alter table public.product_media
  drop constraint product_media_core_routine_editorial_shape_check;

do $rename_catalog_product_media_to_helix$
declare
  v_source_prefix constant text :=
    'https://erasogmsqpgiirovubjh.supabase.co/storage/v1/object/public/mei-pelle-catalog/';
  v_target_prefix constant text :=
    'https://erasogmsqpgiirovubjh.supabase.co/storage/v1/object/public/helix-catalog/';
  v_expected_media_rows constant integer := 60;
  v_expected_object_rows constant integer := 69;
  v_changed integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('helix-catalog-product-media-188', 0)
  );

  if (
    select count(*)
    from public.product_media media
    where media.url is not null
  ) <> v_expected_media_rows or (
    select count(*)
    from public.product_media media
    where media.url like v_source_prefix || '%'
  ) <> v_expected_media_rows then
    raise exception 'Canonical Product Media inventory drifted before the helix cutover'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.product_content_drafts draft
    where draft.status in ('working', 'ready')
      and draft.document::text like '%mei-pelle-catalog%'
  ) then
    raise exception 'An open Catalog Draft still contains the old Product Media bucket'
      using errcode = '55000';
  end if;

  if not exists (
    select 1
    from storage.buckets bucket
    where bucket.id = 'mei-pelle-catalog'
      and bucket.name = 'mei-pelle-catalog'
      and bucket.public
      and bucket.file_size_limit = 16777216
      and bucket.allowed_mime_types @> array[
        'image/png', 'image/webp', 'image/jpeg', 'video/mp4'
      ]::text[]
      and bucket.allowed_mime_types <@ array[
        'image/png', 'image/webp', 'image/jpeg', 'video/mp4'
      ]::text[]
  ) or not exists (
    select 1
    from storage.buckets bucket
    where bucket.id = 'helix-catalog'
      and bucket.name = 'helix-catalog'
      and bucket.public
      and bucket.file_size_limit = 16777216
      and bucket.allowed_mime_types @> array[
        'image/png', 'image/webp', 'image/jpeg', 'video/mp4'
      ]::text[]
      and bucket.allowed_mime_types <@ array[
        'image/png', 'image/webp', 'image/jpeg', 'video/mp4'
      ]::text[]
  ) then
    raise exception 'The supported Storage copy has not preserved the bucket configuration'
      using errcode = '23514';
  end if;

  if (
    select count(*) from storage.objects object
    where object.bucket_id = 'mei-pelle-catalog'
  ) <> v_expected_object_rows or (
    select count(*) from storage.objects object
    where object.bucket_id = 'helix-catalog'
  ) <> v_expected_object_rows or exists (
    select source.name, source.metadata ->> 'size'
    from storage.objects source
    where source.bucket_id = 'mei-pelle-catalog'
    except
    select target.name, target.metadata ->> 'size'
    from storage.objects target
    where target.bucket_id = 'helix-catalog'
  ) or exists (
    select target.name, target.metadata ->> 'size'
    from storage.objects target
    where target.bucket_id = 'helix-catalog'
    except
    select source.name, source.metadata ->> 'size'
    from storage.objects source
    where source.bucket_id = 'mei-pelle-catalog'
  ) then
    raise exception 'The supported Storage copy has not preserved the object inventory'
      using errcode = '23514';
  end if;

  update public.product_media media
  set url = v_target_prefix || substr(media.url, length(v_source_prefix) + 1)
  where media.url like v_source_prefix || '%';
  get diagnostics v_changed = row_count;
  if v_changed <> v_expected_media_rows then
    raise exception 'The helix Product Media URL switch changed an unexpected row count'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.product_media media
    where media.url like '%/mei-pelle-catalog/%'
  ) then
    raise exception 'Canonical Product Media still references the old bucket'
      using errcode = '23514';
  end if;
end
$rename_catalog_product_media_to_helix$;

alter table public.product_media
  add constraint product_media_core_routine_editorial_shape_check
  check (
    role <> 'core_routine_editorial'
    or (
      media_type = 'image'
      and nullif(btrim(url), '') is not null
      and url ~ '^https://erasogmsqpgiirovubjh[.]supabase[.]co/storage/v1/object/public/helix-catalog/products/[^[:space:]?#]+$'
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

drop policy if exists "Public read Mei-Pelle catalog assets" on storage.objects;
drop policy if exists "Service role manages Mei-Pelle catalog assets" on storage.objects;
drop policy if exists "Public read helix catalog assets" on storage.objects;
drop policy if exists "Service role manages helix catalog assets" on storage.objects;

create policy "Public read helix catalog assets"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'helix-catalog');

create policy "Service role manages helix catalog assets"
  on storage.objects for all to service_role
  using (bucket_id = 'helix-catalog')
  with check (bucket_id = 'helix-catalog');
