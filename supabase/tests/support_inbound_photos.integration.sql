-- Actual stored-size and private photo lifecycle assertions; no object/provider writes.
CREATE FUNCTION support_inbound_test.manifest(n integer, slots integer) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('uploadId',support_inbound_test.id('upload',n*10+slot),
    'contentType','image/png','byteSize',1024)),'[]'::jsonb) FROM generate_series(1,slots) slot
$$;
CREATE FUNCTION support_inbound_test.photo_seed(n integer, slots integer, source_key text DEFAULT NULL, email_key text DEFAULT NULL,
  batch_age interval DEFAULT interval '0 seconds')
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE inquiry uuid; message uuid; BEGIN
  inquiry:=(support_contract_test.submit(6000+n)->>'inquiryId')::uuid;
  SELECT id INTO message FROM private.support_messages WHERE inquiry_id=inquiry AND kind='inbound';
  INSERT INTO private.support_upload_batches(submission_id,inquiry_id,message_id,capability_hash,source_hash,email_hash,manifest,created_at)
    VALUES(support_contract_test.id('submission',6000+n),inquiry,message,support_contract_test.key('photo-capability',n),
      coalesce(source_key,support_contract_test.key('source',6000+n)),coalesce(email_key,support_contract_test.key('email',6000+n)),
      support_inbound_test.manifest(n,slots),clock_timestamp()-batch_age);
  RETURN inquiry;
END $$;
CREATE FUNCTION support_inbound_test.try_photo_seed(n integer, source_key text) RETURNS jsonb LANGUAGE plpgsql AS $$ BEGIN
  RETURN jsonb_build_object('status','admitted','inquiryId',support_inbound_test.photo_seed(n,1,source_key));
EXCEPTION WHEN program_limit_exceeded THEN RETURN '{"status":"rate_limited"}'::jsonb;
END $$;
CREATE FUNCTION support_inbound_test.reserve(n integer, slot integer) RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.reserve_support_photo_upload(support_contract_test.id('submission',6000+n),
    support_contract_test.key('photo-capability',n),support_inbound_test.id('upload',n*10+slot),
    'image/png',1024,support_contract_test.key('photo-source',n))
$$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA support_inbound_test TO service_role;

BEGIN;
SET LOCAL ROLE service_role;
DO $$ DECLARE inquiry uuid; job uuid; lease uuid:=support_inbound_test.id('attachment-lease',39); BEGIN
  inquiry:=support_inbound_test.seed(39);
  job:=(support_inbound_test.enqueue(39,inquiry)->>'id')::uuid;
  PERFORM public.claim_support_inbound(lease,1);
  PERFORM public.finish_support_inbound(job,lease,support_inbound_test.email(39,
    '{"attachments":[{"id":"synthetic-pdf","contentType":"application/pdf","size":1024},
      {"id":"synthetic-empty","contentType":"image/png","size":0},
      {"id":"synthetic-oversize","contentType":"image/jpeg","size":10485761}]}'::jsonb));
  PERFORM support_inbound_test.assert((SELECT state='accepted' FROM private.support_inbound_jobs WHERE id=job),
    'rejected attachment metadata never discards an otherwise valid customer reply');
  PERFORM support_inbound_test.assert((SELECT count(*)=2 FROM private.support_messages WHERE inquiry_id=inquiry),
    'valid customer text remains available beside rejected attachment statuses');
  PERFORM support_inbound_test.assert((SELECT count(*)=3 AND bool_and(state='rejected')
    FROM private.support_photos WHERE inquiry_id=inquiry),
    'unsupported, empty and oversize attachments become explicit rejected photo entries');
  PERFORM support_inbound_test.assert(jsonb_array_length(public.claim_support_photos(lease,5))=0,
    'known rejected attachment metadata is never sent to a photo processor');
  PERFORM support_inbound_test.assert(private.support_pending_context(inquiry)=0,
    'explicitly rejected attachments do not leave an unresolvable processing hold');
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE service_role;
DO $$ DECLARE inquiry uuid; reservation jsonb; photo uuid; denied boolean; claim jsonb;
  lease uuid:=support_inbound_test.id('photo-lease',40); BEGIN
  inquiry:=support_inbound_test.photo_seed(40,5);
  PERFORM support_inbound_test.assert((SELECT count(*)=5 FROM private.support_photos WHERE inquiry_id=inquiry),
    'the accepted photo manifest allocates exactly five permanent message slots');
  PERFORM support_inbound_test.assert(NOT private.valid_support_photo_manifest(support_inbound_test.manifest(40,6)),
    'a sixth photo is rejected before any upload URL can be created');
  PERFORM support_inbound_test.assert(NOT private.valid_support_photo_manifest(
    jsonb_build_array(support_inbound_test.manifest(40,1)->0,support_inbound_test.manifest(40,1)->0)),
    'duplicate upload identities cannot masquerade as separate manifest slots');
  denied:=false;
  BEGIN PERFORM public.reserve_support_photo_upload(support_contract_test.id('submission',6040),
    support_contract_test.key('wrong-capability',40),support_inbound_test.id('upload',401),'image/png',1024,
    support_contract_test.key('photo-source',40));
  EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  PERFORM support_inbound_test.assert(denied,'a guessed submission identity cannot reserve private photo storage');
  denied:=false;
  BEGIN PERFORM support_inbound_test.reserve(40,6);
  EXCEPTION WHEN object_not_in_prerequisite_state THEN denied:=true; END;
  PERFORM support_inbound_test.assert(denied,'a valid capability cannot add an unadmitted sixth upload slot');
  denied:=false;
  BEGIN PERFORM public.reserve_support_photo_upload(support_contract_test.id('submission',6040),
    support_contract_test.key('photo-capability',40),support_inbound_test.id('upload',401),'image/jpeg',2048,
    support_contract_test.key('photo-source',40));
  EXCEPTION WHEN object_not_in_prerequisite_state THEN denied:=true; END;
  PERFORM support_inbound_test.assert(denied,'reusing a reserved slot with changed MIME or declared bytes is rejected');
  reservation:=support_inbound_test.reserve(40,1); photo:=(reservation->>'photoId')::uuid;
  PERFORM support_inbound_test.assert((support_inbound_test.reserve(40,1)->>'photoId')::uuid=photo,
    'upload-token retry preserves its original photo identity');
  PERFORM support_inbound_test.assert(NOT public.complete_support_photo_upload(support_contract_test.id('submission',6040),
    support_contract_test.key('wrong-capability',40),photo),'another capability cannot complete a reserved upload');
  PERFORM support_inbound_test.assert(public.complete_support_photo_upload(support_contract_test.id('submission',6040),
    support_contract_test.key('photo-capability',40),photo),'the submission capability can complete its own upload');
  PERFORM support_inbound_test.assert(public.complete_support_photo_upload(support_contract_test.id('submission',6040),
    support_contract_test.key('photo-capability',40),photo),'upload completion replay is idempotent');
  claim:=public.claim_support_photos(lease,5);
  PERFORM support_inbound_test.assert(jsonb_array_length(claim)=1 AND claim#>>'{0,id}'=photo::text,
    'photo processing claims only completed uploads');
  PERFORM support_inbound_test.assert(NOT public.finish_support_photo(photo,lease,'ready',1024,100,100,null),
    'a decoder cannot publish a derivative before charging verified actual bytes');
  PERFORM support_inbound_test.assert(public.admit_support_photo_size(photo,support_inbound_test.id('wrong-photo-lease',40),2048)='stale',
    'a stale photo processor cannot consume another worker admission');
  PERFORM support_inbound_test.assert(public.admit_support_photo_size(photo,lease,2048)='accepted',
    'the active processor records actual received bytes independently from untrusted metadata');
  PERFORM support_inbound_test.assert(public.admit_support_photo_size(photo,lease,2048)='accepted','actual-byte admission is retry-idempotent');
  PERFORM support_inbound_test.assert(NOT public.finish_support_photo(photo,lease,'ready',4194305,100,100,null)
    AND NOT public.finish_support_photo(photo,lease,'ready',1024,2561,100,null),
    'derivative byte and decoded-dimension bounds are enforced before publication');
  PERFORM support_inbound_test.assert(public.finish_support_photo(photo,lease,'ready',1024,100,100,null),
    'validated bounded derivative can become ready');
  PERFORM support_inbound_test.assert(public.get_support_photo(support_contract_test.actor('admin'),inquiry,photo)->>'mediaType'='image/webp',
    'an authorized Operator can request only the sanitized derivative');
  PERFORM support_inbound_test.assert(public.get_support_photo(support_contract_test.actor('admin'),
    support_inbound_test.id('foreign-inquiry',40),photo) IS NULL,'photo lookup cannot cross Inquiry identity');
  denied:=false;
  BEGIN PERFORM public.get_support_photo(support_contract_test.actor('catalog_publisher'),inquiry,photo);
  EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  PERFORM support_inbound_test.assert(denied,'catalog-only Operators cannot access customer photos');
  PERFORM support_inbound_test.assert((SELECT count(*)=5 FROM private.support_photos WHERE inquiry_id=inquiry),
    'photo processing and retries never free an admitted slot for replacement');
  denied:=false;
  BEGIN UPDATE private.support_photos SET expected_bytes=2048 WHERE id=photo;
  EXCEPTION WHEN object_not_in_prerequisite_state THEN denied:=true; END;
  PERFORM support_inbound_test.assert(denied,'stored declared-size and slot identity cannot be rewritten');
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE service_role;
DO $$ DECLARE inquiry uuid; slot integer; photo uuid; photos uuid[]; lease uuid:=support_inbound_test.id('photo-lease',41); BEGIN
  inquiry:=support_inbound_test.photo_seed(41,3);
  FOR slot IN 1..3 LOOP
    photo:=(support_inbound_test.reserve(41,slot)->>'photoId')::uuid;
    PERFORM public.complete_support_photo_upload(support_contract_test.id('submission',6041),
      support_contract_test.key('photo-capability',41),photo);
    photos:=array_append(photos,photo);
  END LOOP;
  PERFORM support_inbound_test.assert(jsonb_array_length(public.claim_support_photos(lease,5))=3,
    'all completed photos can be independently processed');
  PERFORM support_inbound_test.assert(public.admit_support_photo_size(photos[1],lease,10485760)='accepted'
    AND public.admit_support_photo_size(photos[2],lease,10485760)='accepted','twenty MiB of actual data can be admitted for one message');
  PERFORM support_inbound_test.assert(public.admit_support_photo_size(photos[3],lease,1)='rejected',
    'untrusted small declared sizes cannot bypass the actual twenty MiB message budget');
  PERFORM support_inbound_test.assert((SELECT state='rejected' AND rejection_reason='too_large'
    AND lease_token IS NULL AND charged_bytes IS NULL FROM private.support_photos WHERE id=photos[3]),
    'budget denial atomically rejects the photo and releases its processing hold');
  PERFORM public.finish_support_photo(photos[1],lease,'rejected',null,null,null,'invalid_image');
  PERFORM support_inbound_test.assert(public.admit_support_photo_size(photos[3],lease,1)='stale',
    'rejected data still consumes its immutable per-message admission budget');
  PERFORM support_inbound_test.assert((SELECT sum(charged_bytes)=20971520 FROM private.support_photos WHERE inquiry_id=inquiry),
    'retries and rejection cannot spend or release actual bytes twice');
END $$;
ROLLBACK;

-- Model already elapsed clocks at insertion, preserving production's immutable history trigger.
BEGIN;
SET LOCAL ROLE service_role;
DO $$ DECLARE inquiry uuid; photo uuid; slot integer; photos uuid[]; lease uuid:=support_inbound_test.id('photo-lease',44); BEGIN
  inquiry:=support_inbound_test.photo_seed(44,2);
  FOR slot IN 1..2 LOOP
    photo:=(support_inbound_test.reserve(44,slot)->>'photoId')::uuid;
    PERFORM public.complete_support_photo_upload(support_contract_test.id('submission',6044),
      support_contract_test.key('photo-capability',44),photo);
    photos:=array_append(photos,photo);
  END LOOP;
  PERFORM public.claim_support_photos(lease,5);
  PERFORM support_inbound_test.assert(public.admit_support_photo_size(photos[1],lease,10485761)='rejected',
    'a live worker exceeding the individual ten MiB limit atomically rejects its photo');
  PERFORM support_inbound_test.assert(public.admit_support_photo_size(photos[2],lease,1024)='accepted'
    AND public.admit_support_photo_size(photos[2],lease,2048)='rejected',
    'a retry with different actual bytes cannot rewrite its first admission');
  PERFORM support_inbound_test.assert((SELECT count(*)=2 AND bool_and(state='rejected' AND lease_token IS NULL)
    FROM private.support_photos WHERE inquiry_id=inquiry),'size failures leave terminal inspectable photos without active leases');
  PERFORM support_inbound_test.assert((SELECT charged_bytes=1024 FROM private.support_photos WHERE id=photos[2]),
    'a rejected changed-size replay preserves its original budget charge');
END $$;
ROLLBACK;

CREATE FUNCTION support_inbound_test.cleanup_seed(n integer, upload_age interval, processing_age interval, deleted_age interval DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql AS $$ DECLARE inquiry uuid; message uuid; photo uuid; BEGIN
  inquiry:=support_inbound_test.photo_seed(n,0);
  SELECT id INTO message FROM private.support_messages WHERE inquiry_id=inquiry;
  photo:=support_inbound_test.id('cleanup-photo',n);
  INSERT INTO private.support_photos(id,inquiry_id,message_id,submission_id,upload_id,source,raw_path,clean_path,
    expected_bytes,expected_type,state,upload_completed,upload_expires_at,charged_bytes,clean_bytes,width,height,
    last_processing_until,created_at,raw_delete_requested_at,raw_deleted_at)
    VALUES(photo,inquiry,message,support_contract_test.id('submission',6000+n),support_inbound_test.id('cleanup-upload',n),
      'upload','raw/'||inquiry||'/'||photo,'clean/'||inquiry||'/'||photo||'.webp',1024,'image/png','ready',true,
      clock_timestamp()-upload_age,1024,512,100,100,clock_timestamp()-processing_age,
      clock_timestamp()-greatest(interval '3 hours',upload_age,processing_age,deleted_age+interval '1 day'),
      CASE WHEN deleted_age IS NOT NULL THEN clock_timestamp()-deleted_age END,
      CASE WHEN deleted_age IS NOT NULL THEN clock_timestamp()-deleted_age END);
  RETURN photo;
END $$;
GRANT EXECUTE ON FUNCTION support_inbound_test.cleanup_seed(integer,interval,interval,interval) TO service_role;

BEGIN;
SET LOCAL ROLE service_role;
DO $$ DECLARE valid_token_photo uuid; recent_processing_photo uuid; eligible_photo uuid; work jsonb; denied boolean:=false;
  lease uuid:=support_inbound_test.id('cleanup-lease',50); replacement uuid:=support_inbound_test.id('cleanup-retry',50); BEGIN
  valid_token_photo:=support_inbound_test.cleanup_seed(50,interval '4 minutes',interval '20 minutes');
  recent_processing_photo:=support_inbound_test.cleanup_seed(51,interval '20 minutes',interval '4 minutes');
  eligible_photo:=support_inbound_test.cleanup_seed(52,interval '20 minutes',interval '20 minutes');
  work:=public.claim_support_photo_cleanup(lease,5);
  PERFORM support_inbound_test.assert(jsonb_array_length(work)=1 AND work#>>'{0,id}'=eligible_photo::text,
    'cleanup waits through both upload capability expiry and worker expiry grace periods');
  PERFORM support_inbound_test.assert((SELECT raw_delete_requested_at IS NOT NULL AND raw_deleted_at IS NULL
    AND clean_delete_requested_at IS NULL FROM private.support_photos WHERE id=eligible_photo),
    'raw deletion tombstone commits before object deletion while the sanitized ready derivative remains');
  PERFORM support_inbound_test.assert((SELECT count(*)=2 FROM private.support_photos
    WHERE id IN (valid_token_photo,recent_processing_photo) AND raw_delete_requested_at IS NULL),
    'not-yet-safe objects are untouched by a cleanup claim');
  PERFORM support_inbound_test.assert(public.finish_support_photo_cleanup(eligible_photo,lease,'retry'),
    'a failed object deletion remains retryable with its tombstone');
  PERFORM support_inbound_test.assert(NOT public.finish_support_photo_cleanup(eligible_photo,null,'done'),
    'an absent cleanup lease cannot finalize a retried tombstone');
  UPDATE private.support_photos SET cleanup_next_attempt_at=clock_timestamp()-interval '1 second' WHERE id=eligible_photo;
  work:=public.claim_support_photo_cleanup(replacement,1);
  PERFORM support_inbound_test.assert(work#>>'{0,id}'=eligible_photo::text,
    'a later cleanup invocation retries the same immutable object identity');
  PERFORM support_inbound_test.assert(NOT public.finish_support_photo_cleanup(eligible_photo,lease,'done'),
    'a stale cleanup worker cannot finalize the replacement worker lease');
  PERFORM support_inbound_test.assert(public.finish_support_photo_cleanup(eligible_photo,replacement,'done'),
    'successful deletion records completion under the current cleanup lease');
  PERFORM support_inbound_test.assert((SELECT raw_deleted_at IS NOT NULL AND charged_bytes=1024
    FROM private.support_photos WHERE id=eligible_photo),'completed deletion retains slot and byte-budget tombstones');
  BEGIN DELETE FROM private.support_photos WHERE id=eligible_photo;
  EXCEPTION WHEN insufficient_privilege OR object_not_in_prerequisite_state THEN denied:=true; END;
  PERFORM support_inbound_test.assert(denied,'cleanup cannot erase the permanent photo admission identity');
END $$;
ROLLBACK;

SELECT support_inbound_test.assert((SELECT count(*)=2 AND bool_and(relrowsecurity AND relforcerowsecurity)
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='private'
    AND c.relname IN ('support_upload_batches','support_photos')),'photo content and capability tables have forced RLS');
BEGIN;
SET LOCAL ROLE authenticated;
DO $$ DECLARE denied boolean:=false; BEGIN
  BEGIN PERFORM 1 FROM private.support_photos; EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  PERFORM support_inbound_test.assert(denied,'authenticated browsers cannot read private object paths');
  denied:=false;
  BEGIN PERFORM 1 FROM private.support_upload_batches; EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  PERFORM support_inbound_test.assert(denied,'authenticated browsers cannot retrieve upload capability digests');
  denied:=false;
  BEGIN PERFORM public.claim_support_photos(support_inbound_test.id('browser-photo-lease',1),1);
  EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  PERFORM support_inbound_test.assert(denied,'browser roles cannot process arbitrary private photo jobs');
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE service_role;
DO $$ DECLARE n integer; cohort integer; source_key text; email_key text; denied boolean;
  lease uuid; cleanup jsonb; photo jsonb; before_count integer; BEGIN
  FOR cohort IN 0..1 LOOP
    SELECT count(*) INTO before_count FROM private.support_upload_batches;
    FOR n IN 60+cohort*10..64+cohort*10 LOOP
      source_key:=CASE WHEN cohort=0 THEN support_contract_test.key('outstanding-source',1) ELSE null END;
      email_key:=CASE WHEN cohort=1 THEN support_contract_test.key('outstanding-email',1) ELSE null END;
      PERFORM support_inbound_test.photo_seed(n,1,source_key,email_key);
    END LOOP;
    denied:=false;
    BEGIN PERFORM support_inbound_test.photo_seed(65+cohort*10,1,source_key,email_key);
    EXCEPTION WHEN program_limit_exceeded THEN denied:=true; END;
    PERFORM support_inbound_test.assert(denied,'five outstanding batches bound each original source and email identity');
    PERFORM support_inbound_test.assert((SELECT count(*)=before_count+5 FROM private.support_upload_batches),
      'outstanding quota rejection rolls back its Inquiry and photo batch admission');
    UPDATE private.support_photos SET state='rejected',rejection_reason='expired',
      upload_expires_at=clock_timestamp()-interval '10 minutes',last_processing_until=clock_timestamp()-interval '10 minutes'
      WHERE state='pending' AND submission_id IN (SELECT support_contract_test.id('submission',6000+cohort_rows.number)
        FROM generate_series(60+cohort*10,64+cohort*10) AS cohort_rows(number));
    denied:=false;
    BEGIN PERFORM support_inbound_test.photo_seed(65+cohort*10,1,source_key,email_key);
    EXCEPTION WHEN program_limit_exceeded THEN denied:=true; END;
    PERFORM support_inbound_test.assert(denied,'cancelled or expired photos retain outstanding quota until raw deletion completes');
    lease:=support_inbound_test.id('quota-cleanup',cohort);
    cleanup:=public.claim_support_photo_cleanup(lease,5);
    PERFORM support_inbound_test.assert(jsonb_array_length(cleanup)=5,'all safely expired cohort objects have bounded cleanup work');
    FOR photo IN SELECT value FROM jsonb_array_elements(cleanup) LOOP
      PERFORM public.finish_support_photo_cleanup((photo->>'id')::uuid,lease,'done');
    END LOOP;
    PERFORM support_inbound_test.photo_seed(65+cohort*10,1,source_key,email_key);
  END LOOP;
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE service_role;
DO $$ DECLARE n integer; denied boolean:=false; BEGIN
  FOR n IN 8000..8099 LOOP PERFORM support_inbound_test.photo_seed(n,1); END LOOP;
  BEGIN PERFORM support_inbound_test.photo_seed(8100,1);
  EXCEPTION WHEN program_limit_exceeded THEN denied:=true; END;
  PERFORM support_inbound_test.assert(denied AND (SELECT count(*)=100 FROM private.support_upload_batches),
    'one hundred globally outstanding photo batches bound uncollected raw storage');
  PERFORM support_inbound_test.assert((SELECT count(*)=100 FROM private.support_inquiries),
    'global photo backpressure atomically rolls back the declined Inquiry');
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE service_role;
DO $$ DECLARE inquiry uuid; job uuid; upload uuid; work jsonb; lease uuid:=support_inbound_test.id('mixed-photo-lease',42); BEGIN
  inquiry:=support_inbound_test.seed(42);
  job:=(support_inbound_test.enqueue(42,inquiry)->>'id')::uuid;
  PERFORM public.claim_support_inbound(lease,1);
  PERFORM public.finish_support_inbound(job,lease,support_inbound_test.email(42,
    '{"attachments":[{"id":"valid-synthetic-image","contentType":"image/png","size":1024}]}'::jsonb));
  PERFORM support_inbound_test.photo_seed(42,1);
  upload:=(support_inbound_test.reserve(42,1)->>'photoId')::uuid;
  PERFORM public.complete_support_photo_upload(support_contract_test.id('submission',6042),
    support_contract_test.key('photo-capability',42),upload);
  work:=public.claim_support_photos(lease,5,false);
  PERFORM support_inbound_test.assert(jsonb_array_length(work)=1 AND work#>>'{0,id}'=upload::text,
    'web uploads keep processing when provider-photo retrieval is disabled');
  PERFORM support_inbound_test.assert((SELECT state='pending' FROM private.support_photos WHERE source='resend'),
    'disabled provider-photo processing leaves its admitted attachment retryable');
  work:=public.claim_support_photos(lease,5,true);
  PERFORM support_inbound_test.assert(jsonb_array_length(work)=1 AND work#>>'{0,source,kind}'='resend',
    'restoring provider-photo retrieval claims the same queued attachment');
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE service_role;
DO $$ DECLARE photo uuid; original_deleted_at timestamptz; work jsonb; lease uuid:=support_inbound_test.id('resweep-lease',53); BEGIN
  photo:=support_inbound_test.cleanup_seed(53,interval '3 days',interval '3 days',interval '2 days');
  SELECT raw_deleted_at INTO original_deleted_at FROM private.support_photos WHERE id=photo;
  work:=public.claim_support_photo_cleanup(lease,1);
  PERFORM support_inbound_test.assert(jsonb_array_length(work)=1 AND work#>>'{0,id}'=photo::text,
    'old acknowledged raw paths are swept again to remove late or restored source objects');
  PERFORM public.finish_support_photo_cleanup(photo,lease,'done');
  PERFORM support_inbound_test.assert((SELECT raw_deleted_at=original_deleted_at
    AND cleanup_next_attempt_at>clock_timestamp()+interval '23 hours' FROM private.support_photos WHERE id=photo),
    'a successful resweep keeps the first deletion evidence and schedules another bounded daily sweep');
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE service_role;
DO $$ DECLARE inquiry uuid; photo uuid; denied boolean:=false; BEGIN
  inquiry:=support_inbound_test.photo_seed(80,1,null,null,interval '25 hours');
  SELECT id INTO photo FROM private.support_photos WHERE inquiry_id=inquiry;
  UPDATE private.support_photos SET upload_completed=true WHERE id=photo;
  BEGIN PERFORM public.read_support_photo_uploads(support_contract_test.id('submission',6080),
    support_contract_test.key('photo-capability',80));
  EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  PERFORM support_inbound_test.assert(denied,'guest upload status capabilities cannot read photo records after twenty-four hours');
  PERFORM support_inbound_test.assert(NOT public.complete_support_photo_upload(support_contract_test.id('submission',6080),
    support_contract_test.key('photo-capability',80),photo),
    'expired guest capabilities cannot replay completion even for a previously completed upload');
  PERFORM support_inbound_test.assert((SELECT count(*)=1 FROM private.support_photos WHERE id=photo),
    'expiring guest access preserves the durable photo admission tombstone');
END $$;
ROLLBACK;
