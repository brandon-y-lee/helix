-- SYNTHETIC ONLY; assertion labels never contain visitor data or provider payloads.
CREATE FUNCTION production_support_test.denied(statement text, actor text) RETURNS boolean
LANGUAGE plpgsql AS $$ DECLARE denied boolean:=false; BEGIN
 EXECUTE format('SET LOCAL ROLE %I',actor);
 BEGIN EXECUTE statement; EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 RESET ROLE; RETURN denied;
END $$;
SELECT production_support_test.assert((SELECT bool_and(relrowsecurity AND relforcerowsecurity)
 FROM pg_class WHERE relnamespace='support_production_private'::regnamespace AND relkind='r'),'every private table forces RLS');
SELECT production_support_test.assert((SELECT count(*)=2 FROM pg_index WHERE indpred IS NOT NULL AND indexrelid IN
 ('support_production_private.support_prod_outbox_due'::regclass,'support_production_private.support_prod_outbox_expiry'::regclass)),'active work has partial due and expiry indexes');
SELECT production_support_test.assert(NOT has_schema_privilege('service_role','support_production_private','USAGE'),'bypass role lacks private schema grant');
SELECT production_support_test.assert((SELECT bool_and(NOT has_table_privilege('service_role',oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))
 FROM pg_class WHERE relnamespace='support_production_private'::regnamespace AND relkind='r'),'bypass role lacks every direct table grant');
SELECT production_support_test.assert((SELECT bool_and(prosecdef AND proconfig=ARRAY['search_path=pg_catalog']) FROM pg_proc
 WHERE pronamespace='public'::regnamespace AND proname IN ('read_support_prod_contract','submit_support_prod_inquiry','claim_support_prod_outbox','start_support_prod_send','complete_support_prod_send','record_support_prod_sent')),'all public RPCs fixed safe definer path');
SELECT production_support_test.assert((public.read_support_prod_contract()->>'projectRef') IS NULL,'no installed operational identity');
SELECT production_support_test.assert((public.read_support_prod_contract()-ARRAY['projectRef','contractId'])=
 '{"admissionEnabled":false,"workerEnabled":false,"fullMediaQualified":false,"isolationQualified":false,"operationsQualified":false}'::jsonb,'all gates disabled');
DO $$ DECLARE actor text; t text; stmt text; BEGIN
 FOREACH actor IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='support_production_private' LOOP
   FOREACH stmt IN ARRAY ARRAY['SELECT * FROM support_production_private.'||t,
     'INSERT INTO support_production_private.'||t||' DEFAULT VALUES',
     'UPDATE support_production_private.'||t||' SET not_a_column=1',
     'DELETE FROM support_production_private.'||t] LOOP
    PERFORM production_support_test.assert(production_support_test.denied(stmt,actor),'direct role table access denied');
   END LOOP;
  END LOOP;
 END LOOP;
 FOREACH actor IN ARRAY ARRAY['anon','authenticated'] LOOP
  PERFORM production_support_test.assert(production_support_test.denied('SELECT public.read_support_prod_contract()',actor),'public contract read denied');
  FOREACH t IN ARRAY ARRAY['submit_support_prod_inquiry','claim_support_prod_outbox','start_support_prod_send','complete_support_prod_send','record_support_prod_sent'] LOOP
   PERFORM production_support_test.assert(production_support_test.denied('SELECT public.'||t||'(''{}''::jsonb)',actor),'public mutation execution denied');
  END LOOP;
 END LOOP;
END $$;
UPDATE support_production_private.contract SET project_ref='synthetic-support-project',contract_id='synthetic-support-contract-v1';
SELECT production_support_test.assert(production_support_test.try_submit(1)->>'error'='support_admission_closed','new submission closed by default');
UPDATE support_production_private.contract SET admission_enabled=true,full_media_qualified=true,isolation_qualified=true,
 capacity_bytes=1073741824,source_hour_limit=10000,email_hour_limit=10000,global_hour_limit=10000;
SELECT production_support_test.assert(production_support_test.try_submit(1)->>'error'='support_admission_closed','operations attestation independently closes admission');
UPDATE support_production_private.contract SET operations_qualified=true;
SELECT production_support_test.assert(production_support_test.try_submit(1,'{"projectRef":"wrong-project"}')->>'error'='support_wrong_contract','wrong project rejected');
SELECT production_support_test.assert(production_support_test.try_submit(1,'{"unexpected":"value"}')->>'error'='support_invalid_input','unknown input rejected');
SELECT production_support_test.assert(production_support_test.try_submit(1,'{"subject":"bad\r\nheader"}')->>'error'='support_invalid_input','header control rejected');
SELECT production_support_test.assert(production_support_test.try_submit(1,'{"body":"bad\rbody"}')->>'error'='support_invalid_input','body control rejected');
SELECT production_support_test.assert(production_support_test.try_submit(1,jsonb_build_object('body',repeat('x',10001)))->>'error'='support_invalid_input','oversized body rejected');
SELECT production_support_test.assert(production_support_test.try_submit(1,jsonb_build_object('photos',jsonb_build_array(jsonb_build_object('uploadId',md5('p')::uuid,'contentType','image/gif','byteSize',1))))->>'error'='support_invalid_photos','photo type rejected');
SELECT production_support_test.assert(production_support_test.try_submit(1,jsonb_build_object('photos',jsonb_build_array(jsonb_build_object('uploadId',md5('p')::uuid,'contentType','image/jpeg','byteSize',10485761))))->>'error'='support_invalid_photos','photo individual bytes rejected');
SELECT production_support_test.assert(production_support_test.try_submit(1,jsonb_build_object('photos',(
 SELECT jsonb_agg(jsonb_build_object('uploadId',md5('p'||n)::uuid,'contentType','image/png','byteSize',8388608)) FROM generate_series(1,3) n)))->>'error'='support_invalid_photos','photo aggregate bytes rejected');
DO $$ DECLARE first jsonb; replay jsonb; c bigint; BEGIN
 first:=production_support_test.submit(1);
 PERFORM production_support_test.assert(first->>'status'='saved','saved durable receipt');
 PERFORM production_support_test.assert((first->>'reservedBytes')::bigint=14680064,'one byte declares full 14MiB slot');
 SELECT reserved_bytes INTO c FROM support_production_private.contract;
 UPDATE support_production_private.contract SET admission_enabled=false;
 replay:=production_support_test.submit(1,jsonb_build_object('sourceHash',repeat('c',64)));
 PERFORM production_support_test.assert(first=replay,'retry preserves receipt despite source change and admission pause');
 PERFORM production_support_test.assert((SELECT reserved_bytes=c FROM support_production_private.contract),'retry does not reserve again');
 PERFORM production_support_test.assert(production_support_test.try_submit(1,'{"capabilityHash":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"}')->>'error'='support_submission_conflict','capability mismatch conflicts');
 PERFORM production_support_test.assert(production_support_test.try_submit(1,'{"body":"changed canonical content"}')->>'error'='support_submission_conflict','same supplied hash cannot hide changed content');
 UPDATE support_production_private.contract SET admission_enabled=true;
END $$;
-- Simulate failure at the final outbox insert; quota, text and capacity must all roll back.
CREATE FUNCTION production_support_test.fail_outbox() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic_outbox_failure'; END $$;
CREATE TRIGGER synthetic_failure BEFORE INSERT ON support_production_private.outbox FOR EACH ROW EXECUTE FUNCTION production_support_test.fail_outbox();
DO $$ DECLARE used_before bigint; reserved_before bigint; BEGIN
 SELECT sum(used) INTO used_before FROM support_production_private.abuse_windows;
 SELECT reserved_bytes INTO reserved_before FROM support_production_private.contract;
 PERFORM production_support_test.assert(production_support_test.try_submit(2)->>'error'='synthetic_outbox_failure','outbox failure reached');
 PERFORM production_support_test.assert((SELECT count(*)=0 FROM support_production_private.inquiries WHERE submission_id=md5('submission2')::uuid),'failed transaction has no text');
 PERFORM production_support_test.assert((SELECT sum(used)=used_before FROM support_production_private.abuse_windows),'failed transaction has no quota charge');
 PERFORM production_support_test.assert((SELECT reserved_bytes=reserved_before FROM support_production_private.contract),'failed transaction has no reservation');
END $$;
DROP TRIGGER synthetic_failure ON support_production_private.outbox;
-- Independently source and email limits fail even when other quotas have room.
UPDATE support_production_private.contract SET source_hour_limit=1;
SELECT production_support_test.assert(production_support_test.try_submit(3,jsonb_build_object('sourceHash',production_support_test.input(1)->>'sourceHash'))->>'error'='support_rate_limited','source quota independent');
UPDATE support_production_private.contract SET source_hour_limit=10000,email_hour_limit=1;
SELECT production_support_test.assert(production_support_test.try_submit(3,jsonb_build_object('emailHash',production_support_test.input(1)->>'emailHash'))->>'error'='support_rate_limited','email quota independent');
UPDATE support_production_private.contract SET email_hour_limit=10000;
-- First-send marker, frozen bytes, non-reused leases and callback races.
DO $$ DECLARE claim jsonb; work jsonb; retry jsonb; event jsonb; o support_production_private.outbox%ROWTYPE;
 lease uuid:=gen_random_uuid(); lease2 uuid:=gen_random_uuid(); BEGIN
 claim:=public.claim_support_prod_outbox(production_support_test.context(jsonb_build_object('leaseId',lease,'leaseSeconds',120)));
 PERFORM production_support_test.assert(claim IS NULL,'worker disabled independently');
 UPDATE support_production_private.contract SET worker_enabled=true;
 claim:=public.claim_support_prod_outbox(production_support_test.context(jsonb_build_object('leaseId',lease,'leaseSeconds',120)));
 SELECT * INTO o FROM support_production_private.outbox WHERE id=(claim->>'outboxId')::uuid;
 event:=production_support_test.context(jsonb_build_object('outboxId',o.id,'deliveryToken',o.delivery_token,
 'providerEmailId',gen_random_uuid(),'messageId','<synthetic-primary@example.invalid>',
 'from','Helix Website <contact@helixskin.us>','to','support@helixskin.us','eventId','evt_early'));
 PERFORM production_support_test.assert(public.record_support_prod_sent(event)='unmatched','event before attempted send cannot claim ownership');
 work:=public.start_support_prod_send(production_support_test.context(claim));
 PERFORM production_support_test.assert(work->>'attemptCount'='1' AND work->>'firstAttemptAt' IS NOT NULL,'permanent first attempt before external call');
 PERFORM production_support_test.assert(encode(sha256(convert_to(work->>'requestText','UTF8')),'hex')=work->>'requestHash','frozen serialized bytes hash');
 PERFORM production_support_test.assert((work->>'requestText')::jsonb->>'subject'='Helix Website inquiry '||o.id,'opaque provider subject');
 PERFORM production_support_test.assert(starts_with((work->>'requestText')::jsonb->>'text',
 E'Unverified visitor content: visitor-provided identity and Reply-To are unverified. Do not disclose Account, Order or private information based on them.\n\nInquiry: '),'actual frozen primary body warns against trusting visitor identity');
 PERFORM production_support_test.assert((work->>'requestText')::jsonb->'tags'=jsonb_build_array(
 jsonb_build_object('name','helix_support_outbox','value',o.id::text),
 jsonb_build_object('name','helix_support_contract','value',o.contract_id),
 jsonb_build_object('name','helix_support_delivery','value',o.delivery_token)),'frozen opaque ownership tags and delivery secret');
 PERFORM production_support_test.assert((work->>'requestText')::jsonb->>'from'='Helix Website <contact@helixskin.us>' AND
 (work->>'requestText')::jsonb->'to'='["support@helixskin.us"]'::jsonb,'fixed provider envelope');
 PERFORM production_support_test.assert(public.start_support_prod_send(production_support_test.context(claim)) IS NULL,'same lease cannot prepare twice');
 PERFORM production_support_test.assert(NOT public.complete_support_prod_send(production_support_test.context(claim||jsonb_build_object('leaseId',gen_random_uuid(),'outcome','unknown'))),'wrong lease completion fenced');
 PERFORM production_support_test.assert(public.complete_support_prod_send(production_support_test.context(claim||'{"outcome":"unknown"}')),'unknown outcome durable');
 UPDATE support_production_private.outbox SET next_attempt_at=clock_timestamp()-interval '1 second' WHERE id=o.id;
 PERFORM production_support_test.assert(public.claim_support_prod_outbox(production_support_test.context(jsonb_build_object('leaseId',lease,'leaseSeconds',120))) IS NULL,'lease token cannot be reused');
 claim:=public.claim_support_prod_outbox(production_support_test.context(jsonb_build_object('leaseId',lease2,'leaseSeconds',120)));
 retry:=public.start_support_prod_send(production_support_test.context(claim));
 PERFORM production_support_test.assert(retry-ARRAY['attemptCount']=work-ARRAY['attemptCount'],'unknown retry exact same bytes key first-attempt');
 PERFORM production_support_test.assert(public.record_support_prod_sent(event||jsonb_build_object('deliveryToken',repeat('f',64)))='unmatched','forged same-account tags need secret delivery token');
 UPDATE support_production_private.contract SET worker_enabled=false,admission_enabled=false;
 PERFORM production_support_test.assert(public.record_support_prod_sent(event)='matched','early callback reconciles while paused');
 PERFORM production_support_test.assert(NOT public.complete_support_prod_send(production_support_test.context(claim||jsonb_build_object('outcome','accepted','providerEmailId',event->>'providerEmailId'))),'callback fences delayed completion');
 PERFORM production_support_test.assert(public.record_support_prod_sent(event)='duplicate','duplicate callback idempotent');
 PERFORM production_support_test.assert(public.record_support_prod_sent(event||'{"eventId":"evt_later"}')='matched','out of order same binding safe');
 PERFORM production_support_test.assert(public.record_support_prod_sent(event||'{"eventId":"evt_conflict","messageId":"<different@example.invalid>"}')='conflict','RFC binding immutable');
 PERFORM production_support_test.assert(public.record_support_prod_sent(event||jsonb_build_object('eventId','evt_provider_conflict','providerEmailId',gen_random_uuid()))='conflict','provider UUID binding immutable');
 PERFORM production_support_test.assert(public.record_support_prod_sent(event||'{"eventId":"evt_bad_envelope","to":"other@example.invalid"}')='unmatched','event cannot redirect envelope');
 UPDATE support_production_private.contract SET worker_enabled=true,admission_enabled=true;
END $$;
-- Fixture-only operator sets a previously unattempted row to a historical unknown handoff.
SELECT production_support_test.submit(10);
UPDATE support_production_private.outbox SET first_attempt_at=clock_timestamp()-interval '20 hours',attempt_count=1,state='unknown'
 WHERE inquiry_id=(SELECT id FROM support_production_private.inquiries WHERE submission_id=md5('submission10')::uuid);
SELECT production_support_test.assert(public.claim_support_prod_outbox(production_support_test.context(jsonb_build_object('leaseId',gen_random_uuid(),'leaseSeconds',120))) IS NULL,'20 hour old unknown cannot automatically retry');
SELECT production_support_test.assert((SELECT state='reconciliation' AND first_attempt_at IS NOT NULL FROM support_production_private.outbox
 WHERE inquiry_id=(SELECT id FROM support_production_private.inquiries WHERE submission_id=md5('submission10')::uuid)),'20 hour work explicitly held');
-- A stale lease cannot finish a later handoff even after an expired lease is reclaimed.
SELECT production_support_test.submit(11);
DO $$ DECLARE first jsonb; later jsonb; w jsonb; BEGIN
 first:=public.claim_support_prod_outbox(production_support_test.context(jsonb_build_object('leaseId',gen_random_uuid(),'leaseSeconds',120)));
 w:=public.start_support_prod_send(production_support_test.context(first));
 UPDATE support_production_private.outbox SET lease_until=clock_timestamp()-interval '1 second' WHERE id=(first->>'outboxId')::uuid;
 later:=public.claim_support_prod_outbox(production_support_test.context(jsonb_build_object('leaseId',gen_random_uuid(),'leaseSeconds',120)));
 PERFORM public.start_support_prod_send(production_support_test.context(later));
 PERFORM production_support_test.assert(NOT public.complete_support_prod_send(production_support_test.context(first||'{"outcome":"unknown"}')),'stale lease fenced after reclaim');
 PERFORM production_support_test.assert(public.complete_support_prod_send(production_support_test.context(later||'{"outcome":"rejected"}')),'definitive rejection safely held without rekey');
END $$;
-- Full allowed declared maximum still reserves transient 70MiB, not accepted 20MiB.
DO $$ DECLARE photos jsonb; receipt jsonb; old_count bigint; old_reserved bigint; BEGIN
 SELECT jsonb_agg(jsonb_build_object('uploadId',md5('maxphoto'||n)::uuid,'contentType','image/webp','byteSize',4194304)) INTO photos FROM generate_series(1,5) n;
 receipt:=production_support_test.submit(20,jsonb_build_object('photos',photos));
 PERFORM production_support_test.assert(receipt->>'reservedBytes'='73400320','five 4MiB declarations reserve 70MiB transient capacity');
 PERFORM production_support_test.assert(production_support_test.try_submit(21,jsonb_build_object('photos',photos||jsonb_build_array(photos->0)))->>'error'='support_invalid_photos','six slots rejected');
 PERFORM production_support_test.assert(production_support_test.try_submit(21,jsonb_build_object('photos',jsonb_build_array(photos->0,photos->0)))->>'error'='support_invalid_photos','duplicate upload identity rejected');
 SELECT count(*) INTO old_count FROM support_production_private.inquiries;
 SELECT reserved_bytes INTO old_reserved FROM support_production_private.contract;
 UPDATE support_production_private.contract SET full_media_qualified=false;
 PERFORM production_support_test.assert(production_support_test.try_submit(21)->>'error'='support_admission_closed','full media gate independently required');
 PERFORM production_support_test.assert(public.claim_support_prod_outbox(production_support_test.context(jsonb_build_object('leaseId',gen_random_uuid(),'leaseSeconds',120))) IS NULL,'full media gate also required to send');
 UPDATE support_production_private.contract SET full_media_qualified=true,isolation_qualified=false;
 PERFORM production_support_test.assert(production_support_test.try_submit(21)->>'error'='support_admission_closed','isolation gate independently required');
 UPDATE support_production_private.contract SET isolation_qualified=true;
 PERFORM production_support_test.assert((SELECT reserved_bytes=old_reserved FROM support_production_private.contract),'closed gates never change capacity');
 PERFORM production_support_test.assert((SELECT count(*)=old_count FROM support_production_private.inquiries),'closed gates never persist text');
END $$;
-- History and identity fields are immutable even if a later helper accidentally gets broader access.
DO $$ DECLARE o support_production_private.outbox%ROWTYPE; blocked boolean:=false; BEGIN
 SELECT * INTO o FROM support_production_private.outbox WHERE first_attempt_at IS NOT NULL LIMIT 1;
 BEGIN UPDATE support_production_private.outbox SET request_text='replacement' WHERE id=o.id;
 EXCEPTION WHEN OTHERS THEN blocked:=SQLERRM='support_outbox_immutable'; END;
 PERFORM production_support_test.assert(blocked,'frozen request cannot be overwritten'); blocked:=false;
 BEGIN UPDATE support_production_private.outbox SET first_attempt_at=NULL,attempt_count=0 WHERE id=o.id;
 EXCEPTION WHEN OTHERS THEN blocked:=SQLERRM='support_outbox_immutable'; END;
 PERFORM production_support_test.assert(blocked,'first-attempt marker cannot be reset'); blocked:=false;
 BEGIN DELETE FROM support_production_private.inquiries WHERE id=o.inquiry_id;
 EXCEPTION WHEN OTHERS THEN blocked:=SQLERRM='support_record_immutable'; END;
 PERFORM production_support_test.assert(blocked,'preservation default prevents record deletion');
END $$;
-- Hold reconciliation can bind late signed evidence, never a different already-owned provider identity.
DO $$ DECLARE o support_production_private.outbox%ROWTYPE; already support_production_private.outbox%ROWTYPE; event jsonb; BEGIN
 SELECT * INTO o FROM support_production_private.outbox WHERE inquiry_id=(SELECT id FROM support_production_private.inquiries WHERE submission_id=md5('submission10')::uuid);
 SELECT * INTO already FROM support_production_private.outbox WHERE rfc_message_id IS NOT NULL LIMIT 1;
 event:=production_support_test.context(jsonb_build_object('outboxId',o.id,'deliveryToken',o.delivery_token,
 'providerEmailId',already.provider_email_id,'messageId','<synthetic-late@example.invalid>',
 'from','Helix Website <contact@helixskin.us>','to','support@helixskin.us','eventId','evt_cross_binding'));
 PERFORM production_support_test.assert(public.record_support_prod_sent(event)='conflict','provider UUID cannot bind two outboxes');
 event:=event||jsonb_build_object('providerEmailId',gen_random_uuid(),'messageId',already.rfc_message_id,'eventId','evt_cross_rfc');
 PERFORM production_support_test.assert(public.record_support_prod_sent(event)='conflict','RFC message ID cannot bind two outboxes');
 event:=event||'{"messageId":"<synthetic-late@example.invalid>","eventId":"evt_late_reconcile"}';
 PERFORM production_support_test.assert(public.record_support_prod_sent(event)='matched','callback after 20 hour reconciliation is allowed');
END $$;
