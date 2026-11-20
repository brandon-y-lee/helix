-- Synthetic only: the runner binds both placeholders before execution.
begin;
do $proof$
declare
  product_id constant uuid := '10000000-0000-4000-8000-000000000101';
  manifest jsonb;
  prior_state jsonb;
  suffix text := '/storage/v1/object/public/helix-catalog/products/' || product_id || '/gallery/' || repeat('a',64) || '.webp';
begin
  manifest := pg_temp.seed_media();
  prior_state := pg_temp.catalog_identity_state();
  perform pg_temp.expect_media_failure(format('select public.cutover_catalog_product_media(%L::jsonb)',jsonb_set(manifest,'{projectRef}','"<other-ref>"'::jsonb)), 'approved project');
  perform pg_temp.expect_media_failure(format('update public.product_media set url = %L where id = %L', 'https://<other-ref>.supabase.co' || suffix, manifest #>> '{products,0,media,0,mediaId}'), 'owning');
  perform pg_temp.expect_media_failure(format('update public.product_media set url = %L where id = %L',
    'https://<own-ref>.supabase.co/storage/v1/object/public/helix-catalog/products/%252e%252e/access',
    manifest #>> '{products,0,media,0,mediaId}'), 'owning');
  perform pg_temp.assert_media(pg_temp.catalog_identity_state() = prior_state, 'wrong target writes rejected with original Catalog state unchanged');
  perform pg_temp.assert_media(private.is_current_product_media_url('https://<own-ref>.supabase.co' || suffix, product_id), 'owning project accepts current media');
  perform pg_temp.assert_media(not private.is_current_product_media_url('https://<other-ref>.supabase.co' || suffix, product_id), 'swapped project refuses current media');
  perform pg_temp.assert_media(not has_function_privilege('anon','public.read_helix_environment()', 'EXECUTE')
    and not has_function_privilege('authenticated','public.read_helix_environment()', 'EXECUTE')
    and has_function_privilege('service_role','public.read_helix_environment()', 'EXECUTE'), 'only service role can read marker through RPC');
  perform pg_temp.assert_media(not has_table_privilege('service_role','private.helix_environment','SELECT, INSERT, UPDATE, DELETE, TRUNCATE')
    and not has_table_privilege('anon','private.helix_environment','SELECT, INSERT, UPDATE, DELETE, TRUNCATE')
    and not has_table_privilege('authenticated','private.helix_environment','SELECT, INSERT, UPDATE, DELETE, TRUNCATE'), 'API roles have no direct marker access');
  perform pg_temp.expect_media_failure('update private.helix_environment set project_ref = project_ref', 'immutable');
  perform pg_temp.expect_media_failure('truncate private.helix_environment', 'immutable');
end;
$proof$;
set local role service_role;
select pg_temp.assert_media((select project_ref = '<own-ref>' from public.read_helix_environment()), 'service reader receives exact target');
rollback;
