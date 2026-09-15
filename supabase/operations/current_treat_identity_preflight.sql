-- Read-only. Save the result privately as the reviewed operation manifest;
-- verify the connection targets approved project erasogmsqpgiirovubjh first.
-- Run again for postflight and compare against the declared three-field diff.
with candidates as (
  select product.id, product.slug, product.display_name
  from public.products product
  left join public.product_sources source on source.product_id = product.id
  where product.slug in ('peptide-bounce', 'maxxing-serum', 'super-serum')
     or (source.supplier = 'Leaders Cosmetics USA'
         and source.supplier_product_id = '7465003057234')
), single_product as (
  select id from candidates where (select count(*) from candidates) = 1
), administrators as (
  select user_id from public.admin_memberships where role = 'admin' and active
), document as (
  select public.get_catalog_editor_document(id) as value from single_product
)
select jsonb_build_object(
  'capturedAt', statement_timestamp(),
  'postgresVersion', current_setting('server_version'),
  'candidateCount', (select count(*) from candidates),
  'candidates', (select coalesce(jsonb_agg(to_jsonb(candidates) order by id), '[]'::jsonb) from candidates),
  'administratorCount', (select count(*) from administrators),
  'administratorId', (select user_id from administrators where (select count(*) from administrators) = 1),
  'expectedRevision', (
    select coalesce(max(revision_number), 0) from public.catalog_product_revisions
    where product_id = (select id from single_product)
  ),
  'activeDrafts', (
    select coalesce(jsonb_agg(jsonb_build_object('id', id, 'version', version, 'status', status)), '[]'::jsonb)
    from public.product_content_drafts
    where product_id = (select id from single_product) and status in ('draft', 'ready')
  ),
  'targetReservation', (
    select to_jsonb(route) from public.product_slug_routes route where source_slug = 'super-serum'
  ),
  'expectedDocument', (select value from document),
  'documentHash', (select md5(value::text) from document),
  'mediaReferenceHash', (select md5((value -> 'media')::text) from document),
  'functionDefinitionHashes', (
    select jsonb_object_agg(signature, md5(pg_get_functiondef(to_regprocedure(signature))))
    from unnest(array[
      'public.get_catalog_editor_document(uuid)',
      'public.restore_catalog_product_revision(uuid,uuid)',
      'public.publish_catalog_product_draft(uuid,bigint,uuid,text,jsonb)',
      'private.sync_product_slug_route()'
    ]) signature
  )
) as manifest;
