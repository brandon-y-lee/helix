-- Read-only. Verify the actual connection targets erasogmsqpgiirovubjh through
-- the provider before running. requiredProjectRef below is a requirement, not
-- proof of the endpoint. Save the complete result privately for review.
with targets(slug, display_name) as (
  values ('mineral-guard', 'Mineral Guard'), ('biotic-reset', 'Biotic Reset')
), candidates as (
  select targets.slug as target_slug, product.id, product.slug, product.display_name
  from targets left join public.products product
    on product.slug = targets.slug or product.display_name = targets.display_name
), single_products as (
  select target_slug, min(id::text)::uuid as id from candidates
  group by target_slug having count(id) = 1
), administrators as (
  select user_id from public.admin_memberships where role = 'admin' and active
), documents as (
  select target_slug, id, public.get_catalog_editor_document(id) as document
  from single_products
)
select jsonb_build_object(
  'requiredProjectRef', 'erasogmsqpgiirovubjh',
  'capturedAt', statement_timestamp(),
  'postgresVersion', current_setting('server_version'),
  'administratorCount', (select count(*) from administrators),
  'administratorId', (select user_id from administrators where (select count(*) from administrators) = 1),
  'candidates', (select jsonb_agg(to_jsonb(candidates) order by target_slug, id) from candidates),
  'products', (select coalesce(jsonb_agg(jsonb_build_object(
    'targetSlug', target_slug,
    'productId', id,
    'expectedDocument', document,
    'documentHash', md5(document::text),
    'mediaReferenceHash', md5((document -> 'media')::text),
    'expectedRevision', (select coalesce(max(revision_number), 0)
      from public.catalog_product_revisions where product_id = documents.id),
    'publishedRevisionHashes', (select coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'revision', revision_number, 'rowHash', md5(to_jsonb(revision)::text)
    ) order by revision_number), '[]'::jsonb)
      from public.catalog_product_revisions revision where product_id = documents.id),
    'auditEntryHashes', (select coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'rowHash', md5(to_jsonb(audit)::text)
    ) order by id), '[]'::jsonb)
      from public.catalog_editor_audit_log audit where product_id = documents.id),
    'activeDrafts', (select coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'status', status, 'version', version) order by id), '[]'::jsonb)
      from public.product_content_drafts
      where product_id = documents.id and status in ('draft', 'ready'))
  ) order by target_slug), '[]'::jsonb) from documents),
  'activeGuidanceInventory', (select coalesce(jsonb_agg(jsonb_build_object(
    'productId', product.id, 'slug', product.slug,
    'merchandisingStatus', product.status,
    'hasPdpRow', content.product_id is not null,
    'hasStructuredSteps', content.how_to_use_steps is not null,
    'guidanceIssues', private.catalog_guidance_validation_errors(
      jsonb_build_object('productPdpContent', to_jsonb(content))),
    'stepCount', cardinality(content.how_to_use_steps),
    'activeDraftCount', (select count(*) from public.product_content_drafts draft
      where draft.product_id = product.id and draft.status in ('draft', 'ready'))
  ) order by product.id), '[]'::jsonb)
    from public.products product left join public.product_pdp_content content on content.product_id = product.id
    where product.catalog_status = 'active'),
  'openDraftGuidanceInventory', (select coalesce(jsonb_agg(jsonb_build_object(
    'draftId', draft.id, 'productId', draft.product_id, 'schemaVersion', draft.schema_version,
    'status', draft.status, 'version', draft.version,
    'guidanceType', jsonb_typeof(draft.document #> '{productPdpContent,how_to_use_steps}'),
    'guidanceIssues', private.catalog_guidance_validation_errors(draft.document)
  ) order by draft.id), '[]'::jsonb)
    from public.product_content_drafts draft where draft.status in ('draft', 'ready')),
  'functionDefinitionHashes', (select jsonb_object_agg(signature,
    md5(pg_get_functiondef(to_regprocedure(signature))))
    from unnest(array[
      'public.get_catalog_editor_document(uuid)',
      'private.catalog_guidance_validation_errors(jsonb)',
      'public.restore_catalog_product_revision(uuid,uuid)',
      'public.publish_catalog_product_draft(uuid,bigint,uuid,text,jsonb)'
    ]) signature)
) as manifest;
