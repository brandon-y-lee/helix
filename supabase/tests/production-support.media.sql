-- SYNTHETIC ONLY: no provider, real visitor, image or credential data.
SELECT production_support_test.assert(to_regclass('support_production_private.photo_slots') IS NOT NULL,'immutable photo slots exist');
SELECT production_support_test.assert((SELECT bool_and(relrowsecurity AND relforcerowsecurity) FROM pg_class
 WHERE relnamespace='support_production_private'::regnamespace AND relkind='r'),'all media tables force RLS');
SELECT production_support_test.assert(NOT has_schema_privilege('service_role','support_production_private','USAGE'),'bypass role has no private schema access');
SELECT production_support_test.assert((SELECT bool_and(NOT has_table_privilege('service_role',oid,'SELECT,INSERT,UPDATE,DELETE')) FROM pg_class
 WHERE relnamespace='support_production_private'::regnamespace AND relkind='r'),'bypass role denied direct media access');
SELECT production_support_test.assert((public.read_support_prod_contract()->>'photoBucket') IS NULL,'no installed bucket identity');
SELECT production_support_test.assert(public.read_support_prod_contract()->>'photoWorkerLimit'='0','photo fleet defaults closed');
DO $$ DECLARE n text; actor text; BEGIN
 FOREACH n IN ARRAY ARRAY['reserve_support_prod_photo','complete_support_prod_photo','read_support_prod_photos','claim_support_prod_photo','record_support_prod_photo_raw','finish_support_prod_photo','prepare_support_prod_media','finalize_support_prod_media','reconcile_support_prod_media'] LOOP
  FOREACH actor IN ARRAY ARRAY['anon','authenticated'] LOOP
   PERFORM production_support_test.assert(NOT has_function_privilege(actor,'public.'||n||'(jsonb)','EXECUTE'),'media RPC anonymous execution denied');
  END LOOP;
  PERFORM production_support_test.assert((SELECT prosecdef AND proconfig=ARRAY['search_path=pg_catalog'] FROM pg_proc WHERE oid=('public.'||n||'(jsonb)')::regprocedure),'media RPC fixed definer search path');
 END LOOP;
END $$;
CREATE FUNCTION production_support_test.media_input(n integer, extra jsonb DEFAULT '{}'::jsonb) RETURNS jsonb LANGUAGE sql AS $$
 SELECT production_support_test.context(jsonb_build_object('submissionId',md5('submission'||n)::uuid,'capabilityHash',repeat('b',64)))||extra
$$;
CREATE FUNCTION production_support_test.try_rpc(n text, input jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$ DECLARE result jsonb; BEGIN
 EXECUTE format('SELECT to_jsonb(public.%I($1))',n) INTO result USING input; RETURN result;
 EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('error',SQLERRM); END $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA production_support_test TO service_role;
CREATE FUNCTION production_support_test.denied_media(statement text,actor text) RETURNS boolean LANGUAGE plpgsql AS $$ DECLARE denied boolean:=false; BEGIN
 EXECUTE format('SET LOCAL ROLE %I',actor); BEGIN EXECUTE statement; EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 RESET ROLE; RETURN denied;
END $$;
DO $$ DECLARE actor text; t text; BEGIN
 FOREACH actor IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
  FOREACH t IN ARRAY ARRAY['photo_slots','photo_ledger','photo_leases','media_batches','media_members','media_leases'] LOOP
   PERFORM production_support_test.assert(production_support_test.denied_media('SELECT * FROM support_production_private.'||t,actor),'actual role media private read denied');
   PERFORM production_support_test.assert(production_support_test.denied_media('DELETE FROM support_production_private.'||t,actor),'actual role media private delete denied');
  END LOOP;
 END LOOP;
 FOREACH actor IN ARRAY ARRAY['anon','authenticated'] LOOP
  PERFORM production_support_test.assert(production_support_test.denied_media('SELECT public.reserve_support_prod_photo(''{}''::jsonb)',actor),'actual untrusted role RPC denied');
 END LOOP;
END $$;
SELECT production_support_test.assert((public.read_support_prod_contract()-ARRAY['projectRef','contractId','photoBucket','photoWorkerLimit'])=
 '{"admissionEnabled":false,"workerEnabled":false,"fullMediaQualified":false,"isolationQualified":false,"operationsQualified":false}'::jsonb,'extension leaves every live gate off');
UPDATE support_production_private.contract SET project_ref='synthetic-support-project',contract_id='synthetic-support-contract-v1',
 admission_enabled=true,worker_enabled=true,full_media_qualified=true,isolation_qualified=true,operations_qualified=true,
 capacity_bytes=1073741824,source_hour_limit=10000,email_hour_limit=10000,global_hour_limit=10000;
SELECT production_support_test.assert(production_support_test.try_rpc('claim_support_prod_photo',production_support_test.context(jsonb_build_object('leaseId',gen_random_uuid())))->>'error'='support_media_unavailable','missing bucket closes media');
UPDATE support_production_private.contract SET photo_bucket='support-prod-synthetic',photo_worker_limit=2;
DO $$ DECLARE blocked boolean:=false; BEGIN
 BEGIN UPDATE support_production_private.contract SET photo_bucket='helix-support-photos'; EXCEPTION WHEN check_violation THEN blocked:=true; END;
 PERFORM production_support_test.assert(blocked,'legacy bucket contract forbidden');
END $$;
DO $$ DECLARE receipt jsonb; before_capacity bigint; reserve jsonb; identity jsonb; claimed jsonb; stale jsonb; state jsonb; blocked boolean:=false; BEGIN
 receipt:=production_support_test.submit(100);
 identity:=production_support_test.media_input(100,jsonb_build_object('uploadId',md5('photo100')::uuid));
 PERFORM production_support_test.assert((SELECT count(*)=1 FROM support_production_private.photo_slots WHERE inquiry_id=(receipt->>'inquiryId')::uuid),'slot seeded inside text transaction');
 SELECT reserved_bytes INTO before_capacity FROM support_production_private.contract;
 PERFORM production_support_test.assert(NOT public.complete_support_prod_photo(identity),'completion before mint cannot queue job');
 PERFORM production_support_test.assert(production_support_test.try_rpc('reserve_support_prod_photo',identity||jsonb_build_object('capabilityHash',repeat('c',64)))->>'error'='support_photo_unavailable','capability mismatch cannot mint');
 PERFORM production_support_test.assert(production_support_test.try_rpc('reserve_support_prod_photo',identity||'{"projectRef":"wrong"}')->>'error'='support_wrong_contract','wrong project cannot mint');
 reserve:=public.reserve_support_prod_photo(identity);
 PERFORM production_support_test.assert(reserve->>'rawPath'='raw/'||(receipt->>'inquiryId')||'/'||md5('photo100')::uuid,'server selected immutable raw path');
 PERFORM production_support_test.assert((reserve->>'tokenExpiresCeilingAt')::timestamptz>clock_timestamp()+interval '2 hours','mint ceiling persisted before external call');
 PERFORM public.reserve_support_prod_photo(identity); PERFORM public.reserve_support_prod_photo(identity);
 PERFORM production_support_test.assert(production_support_test.try_rpc('reserve_support_prod_photo',identity)->>'error'='support_upload_closed','mint count bounded');
 PERFORM production_support_test.assert(public.complete_support_prod_photo(identity) AND public.complete_support_prod_photo(identity),'completion retries idempotent');
 PERFORM production_support_test.assert((SELECT reserved_bytes=before_capacity FROM support_production_private.contract),'mint and completion do not charge reservation twice');
 state:=public.read_support_prod_photos(identity-'uploadId');
 PERFORM production_support_test.assert(state->'photos'=jsonb_build_array(jsonb_build_object('uploadId',md5('photo100')::uuid,'status','processing')),'public status bounded to identities and states');
 claimed:=public.claim_support_prod_photo(production_support_test.context(jsonb_build_object('leaseId',gen_random_uuid())));
 stale:=production_support_test.context(claimed-ARRAY['inquiryId','uploadId','leaseUntil','rawPath','cleanPath','declaredBytes','contentType']);
 PERFORM production_support_test.assert(NOT public.finish_support_prod_photo(stale||jsonb_build_object('outcome','ready','cleanBytes',1,'cleanHash',repeat('c',64),'width',1,'height',1)),'clean cannot precede actual original acceptance');
 PERFORM production_support_test.assert(NOT public.record_support_prod_photo_raw(stale||jsonb_build_object('leaseId',gen_random_uuid(),'rawBytes',1,'rawHash',repeat('a',64),'contentType','image/jpeg')),'stale raw completion fenced');
 PERFORM production_support_test.assert(public.record_support_prod_photo_raw(stale||jsonb_build_object('rawBytes',1,'rawHash',repeat('a',64),'contentType','image/jpeg')),'actual original metadata accepted');
 PERFORM production_support_test.assert(NOT public.record_support_prod_photo_raw(stale||jsonb_build_object('rawBytes',1,'rawHash',repeat('d',64),'contentType','image/jpeg')),'original hash cannot change on retry');
 PERFORM production_support_test.assert(public.finish_support_prod_photo(stale||jsonb_build_object('outcome','ready','cleanBytes',4194304,'cleanHash',repeat('c',64),'width',2560,'height',2560)),'maximum clean accepted');
 PERFORM production_support_test.assert(public.prepare_support_prod_media(production_support_test.context(jsonb_build_object('leaseId',gen_random_uuid()))) IS NULL,'media held until signed primary RFC exists');
 BEGIN DELETE FROM support_production_private.photo_ledger WHERE photo_id=(reserve->>'photoId')::uuid; EXCEPTION WHEN OTHERS THEN blocked:=SQLERRM='support_record_preserved'; END;
 PERFORM production_support_test.assert(blocked,'ready original ledger preserved');
END $$;
-- Under-declared originals are preserved but never accepted; reservation never shrinks.
DO $$ DECLARE receipt jsonb; id jsonb; claim jsonb; c bigint; BEGIN
 receipt:=production_support_test.submit(101); id:=production_support_test.media_input(101,jsonb_build_object('uploadId',md5('photo101')::uuid));
 PERFORM public.reserve_support_prod_photo(id); PERFORM public.complete_support_prod_photo(id);
 claim:=public.claim_support_prod_photo(production_support_test.context(jsonb_build_object('leaseId',gen_random_uuid())));
 SELECT reserved_bytes INTO c FROM support_production_private.contract;
 PERFORM production_support_test.assert(NOT public.record_support_prod_photo_raw(production_support_test.context(jsonb_build_object('photoId',claim->>'photoId','leaseId',claim->>'leaseId','rawBytes',10485760,'rawHash',repeat('d',64),'contentType','image/jpeg'))),'signed token under-declared actual bytes rejected');
 PERFORM production_support_test.assert((SELECT state='rejected' AND raw_bytes=10485760 AND NOT raw_accepted FROM support_production_private.photo_ledger WHERE photo_id=(claim->>'photoId')::uuid),'rejected actual original still recorded');
 PERFORM production_support_test.assert((SELECT reserved_bytes=c FROM support_production_private.contract),'rejected raw retains full reservation');
END $$;
-- Primary frozen bytes, callback ownership and repeated receipt survive multi-outbox extension.
DO $$ DECLARE receipt jsonb; claim jsonb; work jsonb; p support_production_private.outbox%ROWTYPE; event jsonb; batch jsonb; replacement jsonb; bytes_before text; ready boolean; BEGIN
 SELECT * INTO p FROM support_production_private.outbox WHERE inquiry_id=(SELECT id FROM support_production_private.inquiries WHERE submission_id=md5('submission100')::uuid);
 bytes_before:=p.request_text;
 claim:=public.claim_support_prod_outbox(production_support_test.context(jsonb_build_object('leaseId',gen_random_uuid(),'leaseSeconds',120)));
 PERFORM production_support_test.assert(claim->>'outboxId'=p.id::text,'first primary claimed');
 work:=public.start_support_prod_send(production_support_test.context(claim));
 PERFORM production_support_test.assert(work->>'requestText'=bytes_before,'primary frozen bytes unchanged');
 event:=production_support_test.context(jsonb_build_object('outboxId',p.id,'deliveryToken',p.delivery_token,'providerEmailId',gen_random_uuid(),
 'messageId','<primary-100@example.invalid>','from','Helix Website <contact@helixskin.us>','to','support@helixskin.us','subject','Helix Website inquiry '||p.id,'eventId','primary100'));
 PERFORM production_support_test.assert(public.record_support_prod_sent(event||'{"subject":"wrong"}')='unmatched','signed wrong primary subject cannot correlate');
 PERFORM production_support_test.assert(public.record_support_prod_sent(event)='matched','owned primary signed correlation');
 batch:=public.prepare_support_prod_media(production_support_test.context(jsonb_build_object('leaseId',gen_random_uuid())));
 PERFORM production_support_test.assert(batch->'recipe'->>'parentMessageId'='<primary-100@example.invalid>','recipe freezes verified primary parent');
 PERFORM production_support_test.assert(batch->'recipe'->>'primaryOutboxId'=p.id::text AND batch->'recipe'->>'version'='1','recipe pins primary and serializer version');
 PERFORM production_support_test.assert(jsonb_array_length(batch->'recipe'->'photos')=1,'only ready unused photos selected');
 PERFORM production_support_test.assert(public.prepare_support_prod_media(production_support_test.context(jsonb_build_object('leaseId',gen_random_uuid()))) IS NULL,'active batch cannot be duplicated');
 PERFORM production_support_test.assert(NOT public.finalize_support_prod_media(production_support_test.context(jsonb_build_object('outboxId',batch->>'outboxId','leaseId',gen_random_uuid(),'requestHash',repeat('f',64),'requestBytes',5594000))),'stale recipe finalization fenced');
 ready:=public.finalize_support_prod_media(production_support_test.context(jsonb_build_object('outboxId',batch->>'outboxId','leaseId',batch->>'leaseId','requestHash',repeat('f',64),'requestBytes',5594000)));
 PERFORM production_support_test.assert(ready,'serialized recipe hash frozen before send');
 PERFORM production_support_test.assert(NOT public.finalize_support_prod_media(production_support_test.context(jsonb_build_object('outboxId',batch->>'outboxId','leaseId',batch->>'leaseId','requestHash',repeat('e',64),'requestBytes',5594000))),'frozen hash never replaced');
 receipt:=production_support_test.submit(100);
 PERFORM production_support_test.assert(receipt->>'outboxId'=p.id::text,'repeat submission always returns primary despite media outbox');
 -- Make other primaries not due to select the media; no provider call occurs.
 UPDATE support_production_private.outbox SET next_attempt_at=clock_timestamp()+interval '1 day' WHERE kind='primary';
 claim:=public.claim_support_prod_outbox(production_support_test.context(jsonb_build_object('leaseId',gen_random_uuid(),'leaseSeconds',120)));
 PERFORM production_support_test.assert(claim->>'kind'='media' AND claim->'recipe'=batch->'recipe' AND claim->>'requestHash'=repeat('f',64),'claim exposes frozen recipe/hash BEFORE first attempt');
 PERFORM production_support_test.assert((SELECT first_attempt_at IS NULL FROM support_production_private.outbox WHERE id=(claim->>'outboxId')::uuid),'recipe retrieval is not provider attempt');
 work:=public.start_support_prod_send(production_support_test.context(claim-ARRAY['kind','recipe','requestHash','requestBytes']));
 PERFORM production_support_test.assert(work->>'kind'='media' AND NOT(work ? 'requestText'),'media start discriminated without fake primary payload');
 event:=event||jsonb_build_object('outboxId',batch->>'outboxId','deliveryToken',batch->'recipe'->>'deliveryToken','providerEmailId',gen_random_uuid(),'messageId','<media-100@example.invalid>','eventId','media100');
 PERFORM production_support_test.assert(public.record_support_prod_sent(event-'subject')='unmatched','media callback requires actual signed subject');
 PERFORM production_support_test.assert(public.record_support_prod_sent(event||jsonb_build_object('subject','Helix Website inquiry '||(batch->>'outboxId')))='unmatched','media own-id subject cannot replace primary thread subject');
 PERFORM production_support_test.assert(public.record_support_prod_sent(event)='matched','media actual primary subject correlates');
 PERFORM production_support_test.assert((SELECT request_text=bytes_before FROM support_production_private.outbox WHERE id=p.id),'media leaves primary payload untouched');
END $$;

-- Reusable synthetic fixtures used by real overlapping-session proofs below.
CREATE FUNCTION production_support_test.queue_photos(n integer, count_photos integer DEFAULT 1, bytes integer DEFAULT 1) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE photos jsonb; r jsonb; photo jsonb; BEGIN
 SELECT jsonb_agg(jsonb_build_object('uploadId',md5('qphoto'||n||':'||k)::uuid,'contentType','image/png','byteSize',bytes) ORDER BY k) INTO photos FROM generate_series(0,count_photos-1) k;
 r:=production_support_test.submit(n,jsonb_build_object('photos',photos));
 FOR photo IN SELECT value FROM jsonb_array_elements(photos) LOOP
  PERFORM public.reserve_support_prod_photo(production_support_test.media_input(n,jsonb_build_object('uploadId',photo->>'uploadId')));
  PERFORM public.complete_support_prod_photo(production_support_test.media_input(n,jsonb_build_object('uploadId',photo->>'uploadId')));
 END LOOP; RETURN r;
END $$;
CREATE FUNCTION production_support_test.ready_photo(claim jsonb, raw_bytes integer DEFAULT 1, clean_bytes integer DEFAULT 1) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE v jsonb; BEGIN
 v:=production_support_test.context(jsonb_build_object('photoId',claim->>'photoId','leaseId',claim->>'leaseId'));
 IF NOT public.record_support_prod_photo_raw(v||jsonb_build_object('rawBytes',raw_bytes,'rawHash',repeat('a',64),'contentType','image/png')) THEN RETURN false; END IF;
 RETURN public.finish_support_prod_photo(v||jsonb_build_object('outcome','ready','cleanBytes',clean_bytes,'cleanHash',repeat('c',64),'width',1,'height',1));
END $$;
CREATE FUNCTION production_support_test.bind_primary(n integer) RETURNS void LANGUAGE plpgsql AS $$
DECLARE o support_production_private.outbox%ROWTYPE; c jsonb; BEGIN
 SELECT * INTO o FROM support_production_private.outbox WHERE inquiry_id=(SELECT id FROM support_production_private.inquiries WHERE submission_id=md5('submission'||n)::uuid) AND kind='primary';
 UPDATE support_production_private.outbox SET next_attempt_at=clock_timestamp()+interval '1 day' WHERE state IN ('queued','unknown','leased');
 UPDATE support_production_private.outbox SET next_attempt_at=clock_timestamp()-interval '1 second' WHERE id=o.id;
 c:=public.claim_support_prod_outbox(production_support_test.context(jsonb_build_object('leaseId',gen_random_uuid(),'leaseSeconds',120)));
 PERFORM production_support_test.assert(c->>'outboxId'=o.id::text,'synthetic helper selected intended primary');
 PERFORM public.start_support_prod_send(production_support_test.context(c));
 PERFORM production_support_test.assert(public.record_support_prod_sent(production_support_test.context(jsonb_build_object(
 'outboxId',o.id,'deliveryToken',o.delivery_token,'providerEmailId',gen_random_uuid(),'messageId','<primary-'||n||'@example.invalid>',
 'from','Helix Website <contact@helixskin.us>','to','support@helixskin.us','subject','Helix Website inquiry '||o.id,'eventId','primary_'||n)))='matched','synthetic owned primary binding');
END $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA production_support_test TO service_role;

-- Maximum accepted original and clean manifests, per-file Base64 padding, frozen bytes and uncertainty.
DO $$ DECLARE r jsonb; c jsonb; b jsonb; work jsonb; retry jsonb; frozen jsonb; cap bigint; k integer; BEGIN
 r:=production_support_test.queue_photos(200,5,4194304); SELECT reserved_bytes INTO cap FROM support_production_private.contract;
 FOR k IN 1..5 LOOP
  c:=public.claim_support_prod_photo(production_support_test.context(jsonb_build_object('leaseId',gen_random_uuid())));
  PERFORM production_support_test.assert(production_support_test.ready_photo(c,4194304,4194304),'maximum raw and clean per slot accepted');
 END LOOP;
 PERFORM production_support_test.assert((SELECT sum(l.raw_bytes)=20971520 FROM support_production_private.photo_slots s JOIN support_production_private.photo_ledger l ON l.photo_id=s.id WHERE s.inquiry_id=(r->>'inquiryId')::uuid AND l.raw_accepted),'maximum accepted original aggregate is 20MiB');
 PERFORM production_support_test.bind_primary(200);
 b:=public.prepare_support_prod_media(production_support_test.context(jsonb_build_object('leaseId',gen_random_uuid())));
 PERFORM production_support_test.assert(jsonb_array_length(b->'recipe'->'photos')=5,'maximum five clean attachments frozen together');
 PERFORM production_support_test.assert((SELECT sum(4*(((value->>'bytes')::bigint+2)/3))=27962040 FROM jsonb_array_elements(b->'recipe'->'photos')),'individual Base64 padding gives 27962040 bytes');
 PERFORM production_support_test.assert(production_support_test.try_rpc('finalize_support_prod_media',production_support_test.context(jsonb_build_object('outboxId',b->>'outboxId','leaseId',b->>'leaseId','requestHash',repeat('f',64),'requestBytes',27962040)))->>'error'='support_invalid_media_size','cannot omit serialized envelope overhead');
 PERFORM production_support_test.assert(public.finalize_support_prod_media(production_support_test.context(jsonb_build_object('outboxId',b->>'outboxId','leaseId',b->>'leaseId','requestHash',repeat('f',64),'requestBytes',27964040))),'max manifest freezes bounded serializer hash');
 c:=public.claim_support_prod_outbox(production_support_test.context(jsonb_build_object('leaseId',gen_random_uuid(),'leaseSeconds',120)));
 work:=public.start_support_prod_send(production_support_test.context(c-ARRAY['kind','recipe','requestHash','requestBytes']));
 PERFORM production_support_test.assert(public.complete_support_prod_send(production_support_test.context(jsonb_build_object('outboxId',c->>'outboxId','leaseId',c->>'leaseId','outcome','unknown'))),'unknown max media recorded');
 UPDATE support_production_private.outbox SET next_attempt_at=clock_timestamp()-interval '1 second' WHERE id=(c->>'outboxId')::uuid;
 retry:=public.claim_support_prod_outbox(production_support_test.context(jsonb_build_object('leaseId',gen_random_uuid(),'leaseSeconds',120)));
 frozen:=public.start_support_prod_send(production_support_test.context(retry-ARRAY['kind','recipe','requestHash','requestBytes']));
 PERFORM production_support_test.assert((work-ARRAY['attemptCount'])=(frozen-ARRAY['attemptCount']),'unknown retries exact recipe/hash/key/first attempt without split');
 PERFORM production_support_test.assert((SELECT count(*)=1 FROM support_production_private.media_batches WHERE inquiry_id=(r->>'inquiryId')::uuid),'unknown max batch never split');
 PERFORM production_support_test.assert((SELECT reserved_bytes=cap FROM support_production_private.contract),'all processing and delivery does not double reserve');
 -- Persisted first attempt cannot be moved backwards by runtime; create separate 21h-old synthetic fixture below instead.
END $$;

-- Late photos reuse the original parent, not the latest media message. First integrity mismatch holds without attempt.
DO $$ DECLARE r jsonb; c jsonb; first_batch jsonb; later_batch jsonb; recipe jsonb; evidence jsonb; BEGIN
 r:=production_support_test.queue_photos(201,2,1);
 c:=public.claim_support_prod_photo(production_support_test.context(jsonb_build_object('leaseId',gen_random_uuid())));
 PERFORM production_support_test.assert(production_support_test.ready_photo(c),'first late-group photo ready');
 PERFORM production_support_test.bind_primary(201);
 first_batch:=public.prepare_support_prod_media(production_support_test.context(jsonb_build_object('leaseId',gen_random_uuid())));
 PERFORM public.finalize_support_prod_media(production_support_test.context(jsonb_build_object('outboxId',first_batch->>'outboxId','leaseId',first_batch->>'leaseId','requestHash',repeat('e',64),'requestBytes',1000)));
 c:=public.claim_support_prod_outbox(production_support_test.context(jsonb_build_object('leaseId',gen_random_uuid(),'leaseSeconds',120)));
 PERFORM production_support_test.assert(NOT public.reconcile_support_prod_media(production_support_test.context(jsonb_build_object('outboxId',c->>'outboxId','leaseId',gen_random_uuid()))),'stale integrity hold fenced');
 PERFORM production_support_test.assert(public.reconcile_support_prod_media(production_support_test.context(jsonb_build_object('outboxId',c->>'outboxId','leaseId',c->>'leaseId'))),'owned reconstruction mismatch held before attempt');
 PERFORM production_support_test.assert((SELECT state='reconciliation' AND first_attempt_at IS NULL FROM support_production_private.outbox WHERE id=(c->>'outboxId')::uuid),'pre-attempt integrity hold does not invent send');
 c:=public.claim_support_prod_photo(production_support_test.context(jsonb_build_object('leaseId',gen_random_uuid())));
 PERFORM production_support_test.assert(production_support_test.ready_photo(c),'later photo ready');
 later_batch:=public.prepare_support_prod_media(production_support_test.context(jsonb_build_object('leaseId',gen_random_uuid())));
 PERFORM production_support_test.assert(later_batch->>'outboxId'<>first_batch->>'outboxId' AND jsonb_array_length(later_batch->'recipe'->'photos')=1,'late photo makes separate immutable batch only');
 PERFORM production_support_test.assert(later_batch->'recipe'->>'parentMessageId'=first_batch->'recipe'->>'parentMessageId' AND later_batch->'recipe'->>'parentMessageId'='<primary-201@example.invalid>','late media remains pinned to original primary parent');
 PERFORM production_support_test.assert((SELECT count(*)=2 FROM support_production_private.media_members WHERE batch_id IN ((later_batch->>'outboxId')::uuid,(first_batch->>'outboxId')::uuid)),'each photo appears in only one batch');
 -- Lost finalization response can retry identical metadata without creating another outbox.
 evidence:=production_support_test.context(jsonb_build_object('outboxId',later_batch->>'outboxId','leaseId',later_batch->>'leaseId','requestHash',repeat('e',64),'requestBytes',1000));
 PERFORM production_support_test.assert(public.finalize_support_prod_media(evidence) AND public.finalize_support_prod_media(evidence),'lost finalize response idempotent');
END $$;

-- Failed final outbox insert rolls back new slots along with text, quotas and capacity.
CREATE FUNCTION production_support_test.fail_media_seed() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic_outbox_failure'; END $$;
CREATE TRIGGER synthetic_media_seed_failure BEFORE INSERT ON support_production_private.outbox FOR EACH ROW EXECUTE FUNCTION production_support_test.fail_media_seed();
DO $$ DECLARE slots_before bigint; capacity_before bigint; BEGIN
 SELECT count(*) INTO slots_before FROM support_production_private.photo_slots;
 SELECT reserved_bytes INTO capacity_before FROM support_production_private.contract;
 PERFORM production_support_test.assert(production_support_test.try_submit(490)->>'error'='synthetic_outbox_failure','seed transaction reaches late failure');
 PERFORM production_support_test.assert((SELECT count(*)=slots_before FROM support_production_private.photo_slots),'failed submission creates no orphan slot');
 PERFORM production_support_test.assert((SELECT reserved_bytes=capacity_before FROM support_production_private.contract),'failed slot transaction consumes no capacity');
END $$;
DROP TRIGGER synthetic_media_seed_failure ON support_production_private.outbox;
-- Construct an explicitly old synthetic declaration without rewriting immutable timestamps.
DO $$ DECLARE old_id uuid:=gen_random_uuid(); p jsonb; cap bigint; blocked boolean:=false; BEGIN
 p:=production_support_test.input(491)-ARRAY['projectRef','contractId','submissionId','payloadHash','capabilityHash','sourceHash','emailHash'];
 INSERT INTO support_production_private.inquiries(id,submission_id,payload_hash,capability_hash,canonical_payload,declared_photo_count,declared_photo_bytes,reserved_bytes,created_at)
 VALUES(old_id,md5('submission491')::uuid,repeat('a',64),repeat('b',64),p,1,1,14680064,clock_timestamp()-interval '1 day');
 UPDATE support_production_private.contract SET reserved_bytes=reserved_bytes+14680064;
 SELECT reserved_bytes INTO cap FROM support_production_private.contract;
 PERFORM production_support_test.assert(production_support_test.try_rpc('reserve_support_prod_photo',production_support_test.media_input(491,jsonb_build_object('uploadId',md5('photo491')::uuid)))->>'error'='support_upload_closed','fixed old mint deadline cannot extend');
 PERFORM production_support_test.assert((SELECT reserved_bytes=cap FROM support_production_private.contract),'expired untouched original reservations not freed');
 BEGIN UPDATE support_production_private.photo_slots SET mint_deadline_at=clock_timestamp()+interval '1 day' WHERE inquiry_id=old_id; EXCEPTION WHEN OTHERS THEN blocked:=SQLERRM='support_record_immutable'; END;
 PERFORM production_support_test.assert(blocked,'mint deadline cannot be reset by future helper');
END $$;
-- Bounded retries end in reconciliation, not deletion or fresh identity.
DO $$ DECLARE r jsonb; c jsonb; k integer; cap bigint; BEGIN
 r:=production_support_test.queue_photos(492); SELECT reserved_bytes INTO cap FROM support_production_private.contract;
 FOR k IN 1..5 LOOP
  c:=public.claim_support_prod_photo(production_support_test.context(jsonb_build_object('leaseId',gen_random_uuid())));
  PERFORM production_support_test.assert(c IS NOT NULL,'retry photo remains claimable before cap');
  PERFORM production_support_test.assert(public.finish_support_prod_photo(production_support_test.context(jsonb_build_object('photoId',c->>'photoId','leaseId',c->>'leaseId','outcome','retry'))),'retry fence completion');
  UPDATE support_production_private.photo_ledger SET next_attempt_at=clock_timestamp()-interval '1 second' WHERE photo_id=(c->>'photoId')::uuid;
 END LOOP;
 PERFORM production_support_test.assert((SELECT state='reconciliation' AND attempt_count=5 FROM support_production_private.photo_ledger WHERE photo_id=(c->>'photoId')::uuid),'five failed attempts held for operator');
 PERFORM production_support_test.assert((SELECT reserved_bytes=cap FROM support_production_private.contract),'exhaustion retains worst-case reservation');
END $$;
