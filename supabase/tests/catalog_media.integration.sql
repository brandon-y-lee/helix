-- Actual PostgreSQL behavior against a schema-only current Catalog checkpoint.
-- Storage metadata is synthetic; bytes are attested by the separately tested tool.
create schema storage;
create table storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text not null,
  name text not null, metadata jsonb, version text not null default gen_random_uuid()::text,
  unique(bucket_id, name)
);

create function pg_temp.assert_media(p_test boolean, p_message text)
returns void language plpgsql as $$ begin
  if p_test is not true then raise exception 'FAIL %', p_message; end if;
  raise notice 'PASS %', p_message;
end $$;

create function pg_temp.expect_media_failure(p_sql text, p_pattern text)
returns void language plpgsql as $$ begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm not like '%' || p_pattern || '%' then raise; end if;
    raise notice 'PASS rejected: %', p_pattern;
    return;
  end;
  raise exception 'FAIL expected rejection: %', p_pattern;
end $$;

create function pg_temp.seed_media()
returns jsonb language plpgsql as $$
declare
  p uuid := pg_temp.seed_catalog_identity('super-serum', 'Super Serum');
  source text := 'https://erasogmsqpgiirovubjh.supabase.co/storage/v1/object/public/helix-catalog/products/synthetic-serum/primary/' || repeat('a',64) || '.webp';
  target text := 'https://erasogmsqpgiirovubjh.supabase.co/storage/v1/object/public/helix-catalog/products/' || p || '/primary/' || repeat('a',64) || '.webp';
begin
  insert into storage.objects(bucket_id, name, metadata) values
    ('helix-catalog', 'products/synthetic-serum/primary/' || repeat('a',64) || '.webp', '{"size":123,"mimetype":"image/webp"}'),
    ('helix-catalog', 'products/' || p || '/primary/' || repeat('a',64) || '.webp', '{"size":123,"mimetype":"image/webp"}');
  return jsonb_build_object('version',1,'projectRef','erasogmsqpgiirovubjh',
    'operationId','10000000-0000-4000-8000-000000000701',
    'actorId','10000000-0000-4000-8000-000000000901',
    'products',jsonb_build_array(jsonb_build_object('productId',p,
      'expectedRevision',1,'expectedDocument',public.get_catalog_editor_document(p),
      'media',jsonb_build_array(jsonb_build_object(
        'mediaId','10000000-0000-4000-8000-000000000301','sourceUrl',source,
        'targetUrl',target,'sha256',repeat('a',64),'byteSize',123,
        'mimeType','image/webp','width',100,'height',100,
        'sourceObject',(select jsonb_build_object('id',id,'version',version) from storage.objects where name like 'products/synthetic-serum/%'),
        'targetObject',(select jsonb_build_object('id',id,'version',version) from storage.objects where name like 'products/' || p || '/%'))))));
end $$;

begin;
select pg_temp.assert_media(not (select enabled from private.catalog_media_policy), 'preparation leaves media policy disabled');
select pg_temp.assert_media(not has_function_privilege('anon','public.cutover_catalog_product_media(jsonb)','execute')
  and not has_function_privilege('authenticated','public.activate_catalog_product_media_policy(uuid,uuid)','execute')
  and has_function_privilege('service_role','public.cutover_catalog_product_media(jsonb)','execute'), 'only service role has operational RPC access');
do $$ declare m jsonb := pg_temp.seed_media(); before jsonb; result jsonb; restored jsonb; mismatch jsonb; begin
  before := (select document from public.catalog_product_revisions where revision_number=1);
  result := public.cutover_catalog_product_media(m);
  perform pg_temp.assert_media(result->>'outcome'='published', 'cutover publishes approved pointers');
  perform pg_temp.assert_media((select count(*)=2 from public.catalog_product_revisions), 'cutover appends exactly one revision');
  perform pg_temp.assert_media((select document=before from public.catalog_product_revisions where revision_number=1), 'historical revision stays byte-for-byte JSON equal');
  perform pg_temp.assert_media((select url like '%/synthetic-serum/historical.webp' from public.product_media where archived_at is not null), 'archived media pointers remain untouched');
  perform pg_temp.assert_media((public.cutover_catalog_product_media(m)->>'outcome')='no-op' and (select count(*)=2 from public.catalog_product_revisions), 'same manifest retry does not republish');
  perform pg_temp.expect_media_failure(format('select public.cutover_catalog_product_media(%L::jsonb)', jsonb_set(m,'{products,0,media,0,sha256}',to_jsonb(repeat('b',64)))), 'operation identity');
  restored := public.restore_catalog_product_revision('10000000-0000-4000-8000-000000000501','10000000-0000-4000-8000-000000000901');
  perform pg_temp.assert_media(restored #>> '{draft,document,media,0,url}'=m #>> '{products,0,media,0,targetUrl}', 'Restore maps only verified identical media');
  perform pg_temp.assert_media(restored->'retainedFields' ? 'display_name', 'Restore current identity response survives trigger composition');
  perform pg_temp.assert_media(restored #>> '{draft,document,product,display_name}'='Super Serum', 'Restore current name survives media remapping');
  perform pg_temp.expect_media_failure('select public.activate_catalog_product_media_policy(''10000000-0000-4000-8000-000000000701'',''10000000-0000-4000-8000-000000000901'')', 'active Catalog Draft');
  update public.product_content_drafts set status='discarded';
  insert into public.product_content_drafts(product_id,document,created_by,updated_by)
    values('10000000-0000-4000-8000-000000000101',jsonb_set(before,'{media,0,width}','101'),
      '10000000-0000-4000-8000-000000000901','10000000-0000-4000-8000-000000000901') returning to_jsonb(product_content_drafts) into mismatch;
  perform pg_temp.assert_media(mismatch #>> '{document,media,0,url}'=m #>> '{products,0,media,0,sourceUrl}'
    and mismatch->'validation_errors' @> '[{"code":"retired_media_reference"}]', 'Restore evidence refuses mismatched dimensions');
  update public.product_content_drafts set status='discarded' where status='draft';
  update storage.objects set version=gen_random_uuid()::text where name like '%000000000101/%';
  restored := public.restore_catalog_product_revision('10000000-0000-4000-8000-000000000501','10000000-0000-4000-8000-000000000901');
  perform pg_temp.assert_media(restored #> '{draft,validation_errors}' @> '[{"code":"retired_media_reference"}]', 'Restore refuses a destination overwritten after copy verification');
end $$;
rollback;

begin;
do $$ declare m jsonb := pg_temp.seed_media(); begin
  update public.products set catalog_status='archived' where id='10000000-0000-4000-8000-000000000102';
  insert into public.product_media(product_id,media_type,url,alt,width,height,role,sort_order)
    values('10000000-0000-4000-8000-000000000102','image',
      'https://erasogmsqpgiirovubjh.supabase.co/storage/v1/object/public/helix-catalog/products/historical-cleanser/primary/' || repeat('c',64) || '.webp',
      'Preserved Archived Product media',100,100,'card_default',0);
  perform public.cutover_catalog_product_media(m);
  perform public.activate_catalog_product_media_policy('10000000-0000-4000-8000-000000000701','10000000-0000-4000-8000-000000000901');
  perform pg_temp.assert_media((select url like '%/historical-cleanser/%' from public.product_media where product_id='10000000-0000-4000-8000-000000000102'), 'activation preserves non-archived associations of Archived Products');
  perform pg_temp.expect_media_failure('update public.products set catalog_status=''draft'' where id=''10000000-0000-4000-8000-000000000102''; set constraints products_current_media_on_reactivation immediate;', 'reactivated Product media');
  update public.products set catalog_status='draft' where id='10000000-0000-4000-8000-000000000102';
  update public.product_media set url='https://erasogmsqpgiirovubjh.supabase.co/storage/v1/object/public/helix-catalog/products/10000000-0000-4000-8000-000000000102/primary/' || repeat('c',64) || '.webp' where product_id='10000000-0000-4000-8000-000000000102';
  set constraints products_current_media_on_reactivation immediate;
  perform pg_temp.assert_media((select catalog_status='draft' from public.products where id='10000000-0000-4000-8000-000000000102'), 'reactivation permits reviewed media replacement in the same transaction');
end $$;
rollback;

begin;
do $$ declare m jsonb := pg_temp.seed_media(); begin
  perform pg_temp.expect_media_failure(format('select public.cutover_catalog_product_media(%L::jsonb)', jsonb_set(m,'{products,0,expectedRevision}','0')), 'revision advanced');
  perform pg_temp.expect_media_failure(format('select public.cutover_catalog_product_media(%L::jsonb)', jsonb_set(m,'{products,0,expectedDocument,product,display_name}','"Changed"')), 'facts advanced');
  perform pg_temp.expect_media_failure(format('select public.cutover_catalog_product_media(%L::jsonb)', jsonb_set(m,'{products,0,media}','[]')), 'complete active media');
  perform pg_temp.expect_media_failure(format('select public.cutover_catalog_product_media(%L::jsonb)', jsonb_set(m,'{products,0,media,0,targetUrl}','"https://erasogmsqpgiirovubjh.supabase.co/storage/v1/object/public/helix-catalog/products/10000000-0000-4000-8000-000000000102/current.webp"')), 'owning Product');
  update public.product_media set width=null where archived_at is null;
  perform pg_temp.expect_media_failure(format('select public.cutover_catalog_product_media(%L::jsonb)',
    jsonb_set(jsonb_set(m,'{products,0,media,0,width}','null'),'{products,0,expectedDocument}',public.get_catalog_editor_document('10000000-0000-4000-8000-000000000101'))), 'copy evidence');
  update public.product_media set width=100 where archived_at is null;
  m := jsonb_set(m,'{products,0,expectedDocument}',public.get_catalog_editor_document('10000000-0000-4000-8000-000000000101'));
  update storage.objects set version=gen_random_uuid()::text where name like '%000000000101/%';
  perform pg_temp.expect_media_failure(format('select public.cutover_catalog_product_media(%L::jsonb)',m), 'verified object identity advanced');
  delete from storage.objects where name like '%000000000101/%';
  perform pg_temp.expect_media_failure(format('select public.cutover_catalog_product_media(%L::jsonb)',m), 'Storage metadata');
  perform pg_temp.assert_media((select count(*)=1 from public.catalog_product_revisions) and (select count(*)=0 from private.verified_media_copies), 'failed cutovers are atomic');
end $$;
rollback;

begin;
do $$ declare m jsonb := pg_temp.seed_media(); doc jsonb; d uuid; begin
  perform public.cutover_catalog_product_media(m);
  perform public.activate_catalog_product_media_policy('10000000-0000-4000-8000-000000000701','10000000-0000-4000-8000-000000000901');
  perform pg_temp.assert_media((select enabled from private.catalog_media_policy), 'separate activation enables guard');
  perform pg_temp.expect_media_failure('update public.product_media set archived_at=null,sort_order=8 where id=''10000000-0000-4000-8000-000000000302''', 'owning Product');
  perform pg_temp.expect_media_failure('update public.product_media set url=''https://example.com/image.webp'' where archived_at is null', 'owning Product');
  doc := jsonb_set(public.get_catalog_editor_document('10000000-0000-4000-8000-000000000101'),'{media,0,url}','"https://erasogmsqpgiirovubjh.supabase.co/storage/v1/object/public/helix-catalog/products/synthetic-serum/unmapped.webp"');
  doc := jsonb_set(doc,'{productPdpContent,how_to_use_steps}','null');
  insert into public.product_content_drafts(product_id,document,created_by,updated_by,validation_errors)
    values('10000000-0000-4000-8000-000000000101',doc,'10000000-0000-4000-8000-000000000901','10000000-0000-4000-8000-000000000901','[{"code":"guidance_review_required","path":"productPdpContent.how_to_use_steps","message":"Review guidance"}]') returning id into d;
  perform pg_temp.assert_media((select validation_errors @> '[{"code":"retired_media_reference"}]' and validation_errors @> '[{"code":"guidance_review_required"}]' from public.product_content_drafts where id=d), 'unmapped draft has reviewable media error and retains guidance error');
  update public.product_content_drafts set validation_errors='[]' where id=d;
  perform pg_temp.assert_media((select validation_errors @> '[{"code":"retired_media_reference"}]' from public.product_content_drafts where id=d), 'clearing errors cannot hide invalid media');
  perform pg_temp.expect_media_failure(format('update public.product_content_drafts set status=''ready'',validation_errors=''[]'' where id=%L', d), 'retired_media_reference');
  perform pg_temp.expect_media_failure(format('select public.transition_catalog_product_draft(%L,1,''ready'',''[]'',''10000000-0000-4000-8000-000000000901'')',d), 'retired_media_reference');
  perform pg_temp.expect_media_failure(format('update public.product_content_drafts set status=''published'',validation_errors=''[]'' where id=%L', d), 'retired_media_reference');
  update public.product_content_drafts set status='discarded' where id=d;
  perform pg_temp.assert_media((select status='discarded' from public.product_content_drafts where id=d), 'invalid media draft remains discardable');
  perform pg_temp.expect_media_failure('update private.verified_media_copies set sha256=repeat(''b'',64)', 'immutable');
  perform pg_temp.expect_media_failure('delete from private.verified_media_copies', 'immutable');
  perform pg_temp.assert_media(not has_table_privilege('service_role','private.verified_media_copies','insert'), 'service callers cannot forge map rows directly');
end $$;
rollback;

-- An already Ready document from a pre-activation snapshot cannot erase its
-- invalid source through publisher normalization. The late trigger aborts all
-- work from that attempted publication, not just the draft row write.
begin;
do $$ declare m jsonb := pg_temp.seed_media(); doc jsonb; d uuid; before jsonb; begin
  perform public.cutover_catalog_product_media(m);
  doc := jsonb_set(public.get_catalog_editor_document('10000000-0000-4000-8000-000000000101'),'{media,0,url}','"https://example.com/unreviewed.webp"');
  insert into public.product_content_drafts(product_id,document,status,base_revision,created_by,updated_by)
    values('10000000-0000-4000-8000-000000000101',doc,'ready',2,'10000000-0000-4000-8000-000000000901','10000000-0000-4000-8000-000000000901') returning id into d;
  -- Synthetic fault injection models a Ready row loaded before activation. The
  -- real activation RPC refuses active drafts; this bypass is postgres-only.
  update private.catalog_media_policy set enabled=true,operation_id='10000000-0000-4000-8000-000000000701',activated_at=now(),activated_by='10000000-0000-4000-8000-000000000901';
  before := pg_temp.catalog_identity_state();
  perform pg_temp.expect_media_failure(format('select public.publish_catalog_product_draft(%L,1,''10000000-0000-4000-8000-000000000901'',''admin'',''[]'')',d), 'owning Product');
  perform pg_temp.assert_media(pg_temp.catalog_identity_state()=before, 'actual Publish media rejection rolls back every Catalog side effect');
  perform pg_temp.expect_media_failure(format('update public.product_content_drafts set status=''published'',document=public.get_catalog_editor_document(product_id),validation_errors=''[]'' where id=%L',d), 'original Ready media');
  perform pg_temp.assert_media((select status='ready' and document=doc from public.product_content_drafts where id=d), 'normalization cannot erase original Ready media validation');
end $$;
rollback;
