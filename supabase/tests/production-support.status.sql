-- Synthetic only. No bodies, addresses or provider identifiers returned by status.
UPDATE support_production_private.contract SET project_ref='synthetic-support-project',contract_id='synthetic-support-contract-v1',
 admission_enabled=true,worker_enabled=true,full_media_qualified=true,isolation_qualified=true,operations_qualified=true,
 photo_bucket='support-prod-synthetic',photo_worker_limit=2,capacity_bytes=1073741824,source_hour_limit=10000,email_hour_limit=10000,global_hour_limit=10000;
SELECT production_support_test.submit(530,'{"photos":[]}');
CREATE FUNCTION production_support_test.status_input(n integer DEFAULT 530) RETURNS jsonb LANGUAGE sql AS $$
 SELECT production_support_test.context(jsonb_build_object('submissionId',md5('submission'||n)::uuid,'capabilityHash',repeat('b',64)))
$$;
GRANT EXECUTE ON FUNCTION production_support_test.status_input(integer) TO service_role;
SELECT production_support_test.assert(public.read_support_prod_photos(production_support_test.status_input())->>'primaryHandoff'='queued','zero-photo receipt includes truthful primary queued status');
SELECT production_support_test.assert((SELECT provolatile='s' AND prosecdef AND proconfig=ARRAY['search_path=pg_catalog'] FROM pg_proc WHERE oid='public.read_support_prod_photos(jsonb)'::regprocedure),'fixed stable definer status');
CREATE FUNCTION production_support_test.try_status(v jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$ BEGIN
 RETURN public.read_support_prod_photos(v); EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('error',SQLERRM); END $$;
GRANT EXECUTE ON FUNCTION production_support_test.try_status(jsonb) TO service_role;
SELECT production_support_test.assert(production_support_test.try_status(production_support_test.status_input()||jsonb_build_object('capabilityHash',repeat('c',64)))->>'error'='support_photo_unavailable','wrong capability cannot read receipt');
SELECT production_support_test.assert(production_support_test.try_status(production_support_test.status_input()||'{"projectRef":"wrong"}')->>'error'='support_wrong_contract','wrong project cannot read receipt');
SELECT production_support_test.assert(production_support_test.try_status(production_support_test.status_input()||'{"unexpected":true}')->>'error'='support_invalid_input','unexpected input rejected');
SELECT production_support_test.assert(production_support_test.try_status(production_support_test.status_input()||jsonb_build_object('submissionId',gen_random_uuid()))->>'error'='support_photo_unavailable','missing inquiry indistinguishable from capability denial');
DO $$ DECLARE actor text; denied boolean; BEGIN
 FOREACH actor IN ARRAY ARRAY['anon','authenticated'] LOOP
  denied:=false; EXECUTE format('SET LOCAL ROLE %I',actor);
  BEGIN PERFORM public.read_support_prod_photos('{}'::jsonb); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  RESET ROLE; PERFORM production_support_test.assert(denied,'actual untrusted status execution denied');
 END LOOP;
END $$;
UPDATE support_production_private.contract SET admission_enabled=false,worker_enabled=false,photo_worker_limit=0;
SELECT production_support_test.assert(public.read_support_prod_photos(production_support_test.status_input())=jsonb_build_object('submissionId',md5('submission530')::uuid,'primaryHandoff','queued','photos','[]'::jsonb),'paused admission and worker preserve zero-photo status without extra fields');
BEGIN READ ONLY;
SET LOCAL ROLE service_role;
SELECT production_support_test.assert(public.read_support_prod_photos(production_support_test.status_input())->>'primaryHandoff'='queued','status succeeds in actual read-only transaction');
ROLLBACK;
UPDATE support_production_private.contract SET isolation_qualified=false;
SELECT production_support_test.assert(production_support_test.try_status(production_support_test.status_input())->>'error'='support_media_unavailable','isolation qualification still required');
UPDATE support_production_private.contract SET isolation_qualified=true,operations_qualified=false;
SELECT production_support_test.assert(production_support_test.try_status(production_support_test.status_input())->>'error'='support_media_unavailable','operational qualification still required');
UPDATE support_production_private.contract SET operations_qualified=true,full_media_qualified=false;
SELECT production_support_test.assert(production_support_test.try_status(production_support_test.status_input())->>'error'='support_media_unavailable','media qualification still required');
UPDATE support_production_private.contract SET full_media_qualified=true,photo_bucket=NULL;
SELECT production_support_test.assert(production_support_test.try_status(production_support_test.status_input())->>'error'='support_media_unavailable','missing bucket still required');
UPDATE support_production_private.contract SET photo_bucket='support-prod-synthetic',admission_enabled=true,worker_enabled=true,photo_worker_limit=2;
-- Exact primary state mappings, including an unknown handoff leased for retry.
DO $$ DECLARE oid uuid; response jsonb; BEGIN
 SELECT o.id INTO oid FROM support_production_private.outbox o JOIN support_production_private.inquiries i ON i.id=o.inquiry_id WHERE i.submission_id=md5('submission530')::uuid;
 UPDATE support_production_private.outbox SET state='leased',lease_id=gen_random_uuid(),lease_until=clock_timestamp()+interval '1 minute' WHERE outbox.id=oid;
 PERFORM production_support_test.assert(public.read_support_prod_photos(production_support_test.status_input())->>'primaryHandoff'='queued','first lease without attempt still queued');
 UPDATE support_production_private.outbox SET state='unknown',first_attempt_at=clock_timestamp(),attempt_count=1 WHERE outbox.id=oid;
 PERFORM production_support_test.assert(public.read_support_prod_photos(production_support_test.status_input())->>'primaryHandoff'='unconfirmed','unknown handoff not called delivered');
 UPDATE support_production_private.outbox SET state='leased' WHERE outbox.id=oid;
 PERFORM production_support_test.assert(public.read_support_prod_photos(production_support_test.status_input())->>'primaryHandoff'='unconfirmed','retry lease does not regress to queued');
 UPDATE support_production_private.outbox SET state='reconciliation',lease_id=NULL,lease_until=NULL WHERE outbox.id=oid;
 PERFORM production_support_test.assert(public.read_support_prod_photos(production_support_test.status_input())->>'primaryHandoff'='needs_review','reconciliation needs review');
 UPDATE support_production_private.outbox SET state='accepted',provider_email_id=gen_random_uuid() WHERE outbox.id=oid;
 response:=public.read_support_prod_photos(production_support_test.status_input());
 PERFORM production_support_test.assert(response=jsonb_build_object('submissionId',md5('submission530')::uuid,'primaryHandoff','provider_accepted','photos','[]'::jsonb),'accepted provider id is not exposed or called Inbox receipt');
END $$;
-- Photo processing and transport remain distinct; exact allowlisted JSON contains no private metadata.
DO $$ DECLARE r jsonb; photos jsonb; result jsonb; target uuid; bid uuid:=gen_random_uuid(); iid uuid; BEGIN
 SELECT jsonb_agg(jsonb_build_object('uploadId',md5('statusphoto'||n)::uuid,'contentType','image/png','byteSize',1) ORDER BY n) INTO photos FROM generate_series(0,4) n;
 r:=production_support_test.submit(531,jsonb_build_object('photos',photos)); iid:=(r->>'inquiryId')::uuid;
 UPDATE support_production_private.photo_ledger SET state='pending' WHERE photo_id=(SELECT id FROM support_production_private.photo_slots WHERE inquiry_id=iid AND ordinal=1);
 UPDATE support_production_private.photo_ledger SET state='ready',raw_bytes=1,raw_hash=repeat('a',64),raw_content_type='image/png',raw_accepted=true,
 clean_bytes=1,clean_hash=repeat('c',64),width=1,height=1 WHERE photo_id=(SELECT id FROM support_production_private.photo_slots WHERE inquiry_id=iid AND ordinal=2);
 UPDATE support_production_private.photo_ledger SET state='rejected' WHERE photo_id=(SELECT id FROM support_production_private.photo_slots WHERE inquiry_id=iid AND ordinal=3);
 UPDATE support_production_private.photo_ledger SET state='reconciliation' WHERE photo_id=(SELECT id FROM support_production_private.photo_slots WHERE inquiry_id=iid AND ordinal=4);
 result:=public.read_support_prod_photos(production_support_test.status_input(531));
 PERFORM production_support_test.assert(result=jsonb_build_object('submissionId',md5('submission531')::uuid,'primaryHandoff','queued','photos',jsonb_build_array(
 jsonb_build_object('uploadId',md5('statusphoto0')::uuid,'status','pending_upload','handoff','not_ready'),
 jsonb_build_object('uploadId',md5('statusphoto1')::uuid,'status','processing','handoff','not_ready'),
 jsonb_build_object('uploadId',md5('statusphoto2')::uuid,'status','ready','handoff','queued'),
 jsonb_build_object('uploadId',md5('statusphoto3')::uuid,'status','rejected','handoff','not_ready'),
 jsonb_build_object('uploadId',md5('statusphoto4')::uuid,'status','needs_review','handoff','not_ready'))),'photo state mapping exact, ready with missing primary parent remains queued');
 SELECT id INTO target FROM support_production_private.photo_slots WHERE inquiry_id=iid AND ordinal=2;
 -- Synthetic staged batch metadata: this proof exercises only receipt projection,
 -- while the separate media suite proves real recipe construction/finalization.
 INSERT INTO support_production_private.media_batches(id,inquiry_id,recipe) VALUES(bid,iid,'{"synthetic":"projection-only"}');
 INSERT INTO support_production_private.media_members(photo_id,batch_id) VALUES(target,bid);
 PERFORM production_support_test.assert(public.read_support_prod_photos(production_support_test.status_input(531))->'photos'->2->>'handoff'='queued','staged media without sendable outbox still queued');
 INSERT INTO support_production_private.outbox(id,inquiry_id,contract_id,delivery_token,request_text,request_hash,idempotency_key,kind)
 VALUES(bid,iid,'synthetic-support-contract-v1',repeat('e',64),'',repeat('d',64),'synthetic-status-media','media');
 PERFORM production_support_test.assert(public.read_support_prod_photos(production_support_test.status_input(531))->'photos'->2->>'handoff'='queued','unattempted media queued');
 UPDATE support_production_private.outbox SET state='unknown',first_attempt_at=clock_timestamp(),attempt_count=1 WHERE id=bid;
 PERFORM production_support_test.assert(public.read_support_prod_photos(production_support_test.status_input(531))->'photos'->2->>'handoff'='unconfirmed','unknown media not called delivered');
 UPDATE support_production_private.outbox SET state='leased',lease_id=gen_random_uuid(),lease_until=clock_timestamp()+interval '1 minute' WHERE id=bid;
 PERFORM production_support_test.assert(public.read_support_prod_photos(production_support_test.status_input(531))->'photos'->2->>'handoff'='unconfirmed','media retry lease remains unconfirmed');
 UPDATE support_production_private.outbox SET state='reconciliation',lease_id=NULL,lease_until=NULL WHERE id=bid;
 PERFORM production_support_test.assert(public.read_support_prod_photos(production_support_test.status_input(531))->'photos'->2->>'handoff'='needs_review','media reconciliation needs review');
 UPDATE support_production_private.outbox SET state='accepted' WHERE id=bid;
 PERFORM production_support_test.assert(public.read_support_prod_photos(production_support_test.status_input(531))->'photos'->2->>'handoff'='needs_review','accepted label without provider evidence not asserted');
 UPDATE support_production_private.outbox SET provider_email_id=gen_random_uuid(),rfc_message_id='<private-status-projection@example.invalid>' WHERE id=bid;
 result:=public.read_support_prod_photos(production_support_test.status_input(531));
 PERFORM production_support_test.assert(result->'photos'->2=jsonb_build_object('uploadId',md5('statusphoto2')::uuid,'status','ready','handoff','provider_accepted'),'media provider evidence exposes only bounded status, never IDs');
 PERFORM production_support_test.assert(result->>'primaryHandoff'='queued','media projection never overwrites separate primary handoff');
END $$;
