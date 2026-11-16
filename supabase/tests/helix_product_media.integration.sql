-- Run read-only against the approved non-production project after the
-- supported Storage copy, URL/policy migration, verification, and old-bucket
-- removal have completed.

begin;

set local lock_timeout = '10s';
set local statement_timeout = '120s';

do $helix_product_media_verification$
begin
  if (
    select count(*)
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
  ) <> 1 then
    raise exception 'helix-catalog configuration drifted';
  end if;

  if exists (
    select 1 from storage.buckets bucket
    where bucket.id = 'mei' || '-pelle-catalog'
       or bucket.name = 'mei' || '-pelle-catalog'
  ) then
    raise exception 'The old active Product Media bucket still exists';
  end if;

  if not exists (
    select 1 from storage.objects object
    where object.bucket_id = 'helix-catalog'
  ) or exists (
    select 1
    from public.product_media media
    where media.url is not null
      and (
        media.url not like
          'https://erasogmsqpgiirovubjh.supabase.co/storage/v1/object/public/helix-catalog/%'
        or not exists (
          select 1
          from storage.objects object
          where object.bucket_id = 'helix-catalog'
            and object.name = split_part(
              media.url,
              '/storage/v1/object/public/helix-catalog/',
              2
            )
        )
      )
  ) then
    raise exception 'Product Media URL does not resolve to a stored object';
  end if;

  if exists (
    select 1
    from pg_policies policy
    where policy.schemaname = 'storage'
      and policy.tablename = 'objects'
      and policy.policyname like '%' || 'Mei' || '-Pelle%'
  ) or exists (
    select 1
    from pg_policies policy
    where policy.schemaname = 'storage'
      and policy.tablename = 'objects'
      and (
        coalesce(policy.qual, '') like '%helix-catalog%'
        or coalesce(policy.with_check, '') like '%helix-catalog%'
      )
      and policy.policyname not in (
        'Public read helix catalog assets',
        'Service role manages helix catalog assets'
      )
  ) or not exists (
    select 1
    from pg_policies policy
    where policy.schemaname = 'storage'
      and policy.tablename = 'objects'
      and policy.policyname = 'Public read helix catalog assets'
      and policy.cmd = 'SELECT'
      and cardinality(policy.roles) = 2
      and 'anon' = any(policy.roles)
      and 'authenticated' = any(policy.roles)
      and policy.qual = '(bucket_id = ''helix-catalog''::text)'
      and policy.with_check is null
  ) or not exists (
    select 1
    from pg_policies policy
    where policy.schemaname = 'storage'
      and policy.tablename = 'objects'
      and policy.policyname = 'Service role manages helix catalog assets'
      and policy.cmd = 'ALL'
      and cardinality(policy.roles) = 1
      and 'service_role' = any(policy.roles)
      and policy.qual = '(bucket_id = ''helix-catalog''::text)'
      and policy.with_check = '(bucket_id = ''helix-catalog''::text)'
  ) then
    raise exception 'helix catalog Storage policies drifted';
  end if;

  if (
    select pg_get_constraintdef(constraint_record.oid, true)
    from pg_constraint constraint_record
    where constraint_record.conrelid = 'public.product_media'::regclass
      and constraint_record.conname =
        'product_media_core_routine_editorial_shape_check'
  ) not like '%/helix-catalog/products/%' then
    raise exception 'Product Media shape constraint still uses an old bucket';
  end if;

end
$helix_product_media_verification$;

set local role anon;
select count(*) from storage.objects where bucket_id = 'helix-catalog';
do $anon_product_media_write_denial$
begin
  begin
    insert into storage.objects (bucket_id, name)
    values ('helix-catalog', 'unauthorized-anon-write');
    raise exception 'anon Product Media write unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;
end
$anon_product_media_write_denial$;
reset role;

set local role authenticated;
select count(*) from storage.objects where bucket_id = 'helix-catalog';
do $authenticated_product_media_write_denial$
begin
  begin
    insert into storage.objects (bucket_id, name)
    values ('helix-catalog', 'unauthorized-authenticated-write');
    raise exception 'authenticated Product Media write unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;
end
$authenticated_product_media_write_denial$;
reset role;

rollback;
