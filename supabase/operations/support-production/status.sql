-- Ticket #530 / Spec #527. Manual extension AFTER install.sql and media.sql.
-- Read-only capability-bound receipts. No installation of identity, grants beyond
-- the existing service-only status boundary, controls, scheduler or provider work.
BEGIN;
DO $$ BEGIN
 IF current_user IN ('anon','authenticated','service_role','authenticator')
 OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND (rolsuper OR rolbypassrls)) THEN
  RAISE EXCEPTION 'support_install_requires_trusted_operator';
 END IF;
END $$;
CREATE FUNCTION support_production_private.public_handoff(state text,attempted boolean,accepted boolean) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT CASE WHEN state='accepted' AND accepted THEN 'provider_accepted'
 WHEN state='reconciliation' OR state IS NULL OR state='accepted' THEN 'needs_review'
 WHEN state='unknown' OR (state IN ('queued','leased') AND attempted) THEN 'unconfirmed'
 WHEN state IN ('queued','leased') THEN 'queued' ELSE 'needs_review' END
$$;
REVOKE ALL ON FUNCTION support_production_private.public_handoff(text,boolean,boolean) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.read_support_prod_photos(p_input jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c support_production_private.contract%ROWTYPE; i support_production_private.inquiries%ROWTYPE;
 result jsonb; primary_handoff text;
BEGIN
 PERFORM support_production_private.validate_input(p_input,ARRAY['projectRef','contractId','submissionId','capabilityHash'],ARRAY['projectRef','contractId','submissionId','capabilityHash']);
 -- Snapshot reads only: polling holds neither the global admission row nor a job
 -- lease. Admission/worker pause does not erase an already saved receipt.
 SELECT * INTO c FROM support_production_private.contract WHERE singleton;
 IF NOT FOUND OR c.project_ref IS DISTINCT FROM p_input->>'projectRef' OR c.contract_id IS DISTINCT FROM p_input->>'contractId'
 OR c.project_ref IS NULL OR c.contract_id IS NULL THEN RAISE EXCEPTION 'support_wrong_contract'; END IF;
 IF c.photo_bucket IS NULL OR NOT(c.full_media_qualified AND c.isolation_qualified AND c.operations_qualified) THEN
  RAISE EXCEPTION 'support_media_unavailable'; END IF;
 IF NOT support_production_private.valid_uuid(p_input->'submissionId') OR jsonb_typeof(p_input->'capabilityHash')<>'string'
 OR coalesce(p_input->>'capabilityHash','') !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'support_invalid_input'; END IF;
 SELECT * INTO i FROM support_production_private.inquiries WHERE submission_id=(p_input->>'submissionId')::uuid AND capability_hash=p_input->>'capabilityHash';
 IF NOT FOUND THEN RAISE EXCEPTION 'support_photo_unavailable'; END IF;
 SELECT support_production_private.public_handoff(o.state,o.first_attempt_at IS NOT NULL,o.provider_email_id IS NOT NULL) INTO primary_handoff
 FROM support_production_private.outbox o WHERE o.inquiry_id=i.id AND o.kind='primary';
 SELECT coalesce(jsonb_agg(jsonb_build_object('uploadId',s.upload_id,'status',CASE
 WHEN l.state IN ('declared','uploading') THEN 'pending_upload' WHEN l.state IN ('pending','leased') THEN 'processing'
 WHEN l.state='reconciliation' THEN 'needs_review' ELSE l.state END,
 'handoff',CASE WHEN l.state<>'ready' THEN 'not_ready'
 WHEN m.photo_id IS NULL OR o.id IS NULL THEN 'queued'
 ELSE support_production_private.public_handoff(o.state,o.first_attempt_at IS NOT NULL,o.provider_email_id IS NOT NULL) END) ORDER BY s.ordinal),'[]'::jsonb) INTO result
 FROM support_production_private.photo_slots s JOIN support_production_private.photo_ledger l ON l.photo_id=s.id
 LEFT JOIN support_production_private.media_members m ON m.photo_id=s.id
 LEFT JOIN support_production_private.outbox o ON o.id=m.batch_id AND o.kind='media'
 WHERE s.inquiry_id=i.id;
 IF jsonb_array_length(result)<>i.declared_photo_count THEN RAISE EXCEPTION 'support_photo_unavailable'; END IF;
 -- "provider_accepted" is transport evidence only, never Inbox arrival/read or an operator reply.
 RETURN jsonb_build_object('submissionId',i.submission_id,'primaryHandoff',coalesce(primary_handoff,'needs_review'),'photos',result);
END $$;
REVOKE ALL ON FUNCTION public.read_support_prod_photos(jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.read_support_prod_photos(jsonb) TO service_role;
COMMIT;
