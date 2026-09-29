-- Synthetic data only; the runner refuses databases outside its labeled local container.
CREATE SCHEMA notification_contract_test;
CREATE FUNCTION notification_contract_test.assert(p_condition boolean,p_message text)
RETURNS void LANGUAGE plpgsql AS $$ BEGIN
  IF p_condition IS DISTINCT FROM true THEN RAISE EXCEPTION '%',p_message; END IF;
END $$;
CREATE FUNCTION notification_contract_test.id(p_key text) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT md5('synthetic-product-notification:'||p_key)::uuid
$$;
CREATE FUNCTION notification_contract_test.tokens(p_offset integer DEFAULT 0) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_agg(lpad((n+p_offset)::text,43,'a') ORDER BY n) FROM generate_series(1,20) n
$$;
INSERT INTO auth.users(id) VALUES(notification_contract_test.id('admin'));
INSERT INTO public.admin_memberships(user_id,role) VALUES(notification_contract_test.id('admin'),'admin');
INSERT INTO public.system_steps(name,position,routine_group) VALUES('TREAT',3,'core');
CREATE FUNCTION notification_contract_test.seed_product(p_key text,p_status text DEFAULT 'waitlist')
RETURNS uuid LANGUAGE plpgsql AS $$ DECLARE v_id uuid:=notification_contract_test.id(p_key); BEGIN
  INSERT INTO public.products(id,slug,display_name,product_type,swatch_from,swatch_to,sort_order,
    editorial_description,editorial_how_to_use,routine_group,routine_sort,system_step_name,status,published_at)
  VALUES(v_id,'synthetic-'||p_key,'Synthetic '||p_key,'Serum','#ffffff','#eeeeee',1,
    'Synthetic governed description.','Apply synthetic guidance.','core',1,'TREAT',p_status,
    clock_timestamp()-interval '1 day');
  INSERT INTO public.product_pdp_content(product_id,how_to_use_steps) VALUES(v_id,'{}'::text[]);
  IF p_status='available' THEN
    INSERT INTO public.product_variants(id,product_id,variant_key,label,price_cents,sort_order)
    VALUES(notification_contract_test.id(p_key||'-variant'),v_id,'30ml','30 mL',2500,1);
  END IF;
  RETURN v_id;
END $$;
CREATE FUNCTION notification_contract_test.make_draft(p_product uuid,p_status text,
  p_available boolean DEFAULT true,p_inventory text DEFAULT 'in_stock',p_variant_identity text DEFAULT '')
RETURNS uuid LANGUAGE plpgsql AS $$ DECLARE v_document jsonb; v_draft uuid; v_result jsonb; BEGIN
  v_result:=public.create_catalog_product_draft(p_product,notification_contract_test.id('admin'));
  v_draft:=(v_result#>>'{draft,id}')::uuid;
  v_document:=v_result#>'{draft,document}';
  v_document:=jsonb_set(v_document,'{product,status}',to_jsonb(p_status));
  v_document:=jsonb_set(v_document,'{variants}',CASE WHEN p_status='waitlist' THEN '[]'::jsonb
    ELSE jsonb_build_array(jsonb_build_object('id',notification_contract_test.id(p_product::text||'-variant'||p_variant_identity),
      'product_id',p_product,'variant_key','30ml','label','30 mL','price_cents',2500,'sort_order',1,
      'available',p_available,'inventory_status',p_inventory,'archived_at',null,'option_values','{}'::jsonb)) END);
  v_result:=public.save_catalog_product_draft(v_draft,1,v_document,notification_contract_test.id('admin'),'admin');
  PERFORM notification_contract_test.assert((v_result->>'ok')::boolean,'synthetic draft save failed');
  v_result:=public.transition_catalog_product_draft(v_draft,2,'ready','[]'::jsonb,notification_contract_test.id('admin'));
  PERFORM notification_contract_test.assert((v_result->>'ok')::boolean,'synthetic draft ready transition failed');
  RETURN v_draft;
END $$;
CREATE FUNCTION notification_contract_test.publish(p_product uuid,p_status text,
  p_available boolean DEFAULT true,p_inventory text DEFAULT 'in_stock',p_variant_identity text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql AS $$ DECLARE v_result jsonb; BEGIN
  v_result:=public.publish_catalog_product_draft(
    notification_contract_test.make_draft(p_product,p_status,p_available,p_inventory,p_variant_identity),3,
    notification_contract_test.id('admin'),'admin','[]'::jsonb);
  PERFORM notification_contract_test.assert((v_result->>'ok')::boolean,'actual canonical publication failed: '||v_result::text);
  RETURN v_result;
END $$;
GRANT USAGE ON SCHEMA notification_contract_test TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA notification_contract_test TO service_role;

SELECT notification_contract_test.seed_product('legacy');
SELECT notification_contract_test.seed_product('already-available','available');
INSERT INTO private.product_waitlist_enrollments(product_id,normalized_email,created_at,updated_at) VALUES
  (notification_contract_test.id('legacy'),'legacy@example.invalid',clock_timestamp()-interval '6 months',clock_timestamp()-interval '6 months'),
  (notification_contract_test.id('legacy'),'expired@example.invalid','2024-02-29T12:00:00Z','2024-02-29T12:00:00Z');
INSERT INTO private.product_waitlist_consent_events(enrollment_id,policy_version,source)
SELECT id,'historical_v1','pdp_waitlist' FROM private.product_waitlist_enrollments WHERE normalized_email='legacy@example.invalid';
CREATE TABLE notification_contract_test.legacy_rows AS SELECT to_jsonb(e) AS snapshot FROM private.product_waitlist_enrollments e;
CREATE TABLE notification_contract_test.legacy_evidence AS SELECT to_jsonb(e) AS snapshot FROM private.product_waitlist_consent_events e;

-- APPLY PRODUCT NOTIFICATION MIGRATION

SELECT notification_contract_test.assert(
  to_regprocedure('public.enroll_product_waitlist(uuid,text,boolean,text,text,text,uuid,text,jsonb)') IS NOT NULL,
  'enrollment requires a durable request identity');
SELECT notification_contract_test.assert(
  to_regprocedure('public.enroll_product_waitlist(uuid,text,boolean,text,text,text)') IS NULL,
  'the non-idempotent six-argument intake is retired');
SELECT notification_contract_test.assert(NOT EXISTS(
  SELECT 1 FROM notification_contract_test.legacy_rows b
  LEFT JOIN private.product_waitlist_enrollments e ON e.id=(b.snapshot->>'id')::bigint
  WHERE to_jsonb(e)-'generation' IS DISTINCT FROM b.snapshot),'legacy enrollment fields survive unchanged');
SELECT notification_contract_test.assert((SELECT jsonb_agg(snapshot ORDER BY snapshot::text) FROM notification_contract_test.legacy_evidence)=
  (SELECT jsonb_agg(to_jsonb(e) ORDER BY to_jsonb(e)::text) FROM private.product_waitlist_consent_events e),
  'append-only historical evidence survives unchanged');
SELECT notification_contract_test.assert((SELECT count(*)=2 AND bool_and(g.generation=1
  AND g.requested_at=e.created_at AND g.expires_at=e.created_at+interval '12 months')
  FROM private.product_notification_generations g JOIN private.product_waitlist_enrollments e ON e.id=g.enrollment_id),
  'legacy request expiry is exactly twelve calendar months from its original creation');
SELECT notification_contract_test.assert((SELECT g.expires_at='2025-02-28T12:00:00Z'::timestamptz
  FROM private.product_notification_generations g JOIN private.product_waitlist_enrollments e ON e.id=g.enrollment_id
  WHERE e.normalized_email='expired@example.invalid'),'leap-day expiry uses calendar months, not a fixed day count');
SELECT notification_contract_test.assert((SELECT count(*)=0 FROM private.marketing_subscribers),
  'historical waitlist evidence never becomes marketing permission');
SELECT notification_contract_test.assert((SELECT count(*)=0 FROM private.product_notification_transitions),
  'installation establishes current availability without historical transitions');
SELECT notification_contract_test.assert((SELECT count(*)=0 FROM private.email_intents),
  'installation does not replay historical notifications or send management links');
SELECT notification_contract_test.assert((SELECT count(*)=2 AND NOT bool_or(enabled) FROM private.email_controls
  WHERE purpose IN ('product_availability','product_waitlist_recovery')),'notification delivery begins disabled');

CREATE FUNCTION notification_contract_test.enroll(p_product uuid,p_email text,p_request text,
  p_consent boolean DEFAULT false,p_contract jsonb DEFAULT null) RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.enroll_product_waitlist(p_product,p_email,p_consent,'welcome_v1','pdp_waitlist',
    encode(extensions.digest(p_request,'sha256'),'hex'),notification_contract_test.id(p_request),
    CASE WHEN p_consent THEN encode(extensions.digest(p_request||'-confirm','sha256'),'hex') ELSE null END,p_contract)
$$;

BEGIN;
SELECT notification_contract_test.seed_product('generation');
SELECT notification_contract_test.assert(notification_contract_test.enroll(notification_contract_test.id('generation'),
  'generation@example.invalid','generation-first')->>'ok'='true','new request is accepted');
CREATE TEMP TABLE first_generation AS SELECT g.* FROM private.product_notification_generations g
  JOIN private.product_waitlist_enrollments e ON e.id=g.enrollment_id WHERE e.normalized_email='generation@example.invalid';
SELECT notification_contract_test.enroll(notification_contract_test.id('generation'),'generation@example.invalid','generation-first');
SELECT notification_contract_test.enroll(notification_contract_test.id('generation'),'generation@example.invalid','generation-duplicate');
SELECT notification_contract_test.assert((SELECT count(*)=1 AND bool_and(g.expires_at=f.expires_at
  AND g.requested_at=f.requested_at AND g.generation=f.generation)
  FROM private.product_notification_generations g JOIN first_generation f USING(enrollment_id)),
  'same-ID retries and new duplicate submissions never renew a live request');
SELECT notification_contract_test.assert((SELECT count(*)=0 FROM private.product_notification_tokens),
  'enrollment responses grant no cancellation capability');
SELECT notification_contract_test.assert((SELECT count(*)=0 FROM private.marketing_subscribers),
  'unchecked separate marketing checkbox creates no subscription');
UPDATE private.product_notification_generations SET withdrawn_at=clock_timestamp()
  WHERE enrollment_id=(SELECT enrollment_id FROM first_generation);
SELECT notification_contract_test.enroll(notification_contract_test.id('generation'),'generation@example.invalid','generation-first');
SELECT notification_contract_test.assert((SELECT generation=1 FROM private.product_waitlist_enrollments
  WHERE normalized_email='generation@example.invalid'),'replay of an accepted request cannot create a later generation');
SELECT notification_contract_test.enroll(notification_contract_test.id('generation'),'generation@example.invalid','generation-renewal');
SELECT notification_contract_test.assert((SELECT generation=2 FROM private.product_waitlist_enrollments
  WHERE normalized_email='generation@example.invalid'),'a fresh deliberate request may create a new generation after withdrawal');
SELECT notification_contract_test.assert((SELECT count(*)=2 FROM private.product_notification_generations
  WHERE enrollment_id=(SELECT enrollment_id FROM first_generation)),'prior generations remain durable');
ROLLBACK;

-- Canonical publication is the event authority. No cached/Algolia read participates.
BEGIN;
SELECT notification_contract_test.publish(notification_contract_test.id('legacy'),'available');
SELECT notification_contract_test.assert((SELECT count(*)=1 FROM private.product_notification_transitions
  WHERE product_id=notification_contract_test.id('legacy')),'false-to-true publication records one durable transition');
SELECT notification_contract_test.assert(private.product_is_purchasable(notification_contract_test.id('legacy'),clock_timestamp()),
  'observer after publication sees its new published_at despite transaction-start now');
UPDATE private.email_controls SET enabled=true,accepted_after=clock_timestamp()-interval '1 day'
  WHERE purpose='product_availability';
SELECT public.materialize_product_notifications(20);
SELECT public.materialize_product_notifications(20);
SELECT notification_contract_test.assert((SELECT count(*)=1 FROM private.email_intents WHERE purpose='product_availability'
  AND recipient='legacy@example.invalid'),'one unexpired historical request consumes one future transition exactly once');
SELECT notification_contract_test.assert((SELECT count(*)=0 FROM private.email_intents WHERE recipient='expired@example.invalid'),
  'already-expired historical requests never receive a notification');
SELECT notification_contract_test.publish(notification_contract_test.id('legacy'),'available',true,'in_stock','replacement');
SELECT notification_contract_test.assert((SELECT archived_at IS NOT NULL FROM public.product_variants
  WHERE id=notification_contract_test.id(notification_contract_test.id('legacy')::text||'-variant')),
  'replacement fixture really archives the previous Variant');
SELECT notification_contract_test.assert((SELECT archived_at IS NULL AND available FROM public.product_variants
  WHERE id=notification_contract_test.id(notification_contract_test.id('legacy')::text||'-variantreplacement')),
  'replacement fixture installs a distinct active Variant');
SELECT notification_contract_test.assert((SELECT count(*)=1 FROM private.product_notification_transitions
  WHERE product_id=notification_contract_test.id('legacy')),'available-to-available replacement causes no transient false transition');
SELECT notification_contract_test.publish(notification_contract_test.id('legacy'),'available',false,'in_stock');
SELECT notification_contract_test.assert(NOT private.product_is_purchasable(notification_contract_test.id('legacy'),clock_timestamp()),
  'an unavailable Variant is not Purchasable even when inventory is in stock');
SELECT notification_contract_test.publish(notification_contract_test.id('legacy'),'available',true,'low_stock');
SELECT notification_contract_test.assert((SELECT count(*)=2 FROM private.product_notification_transitions
  WHERE product_id=notification_contract_test.id('legacy')),'Variant-only false-to-true publication produces a distinct transition');
SELECT public.materialize_product_notifications(20);
SELECT notification_contract_test.assert((SELECT count(*)=1 FROM private.email_intents WHERE purpose='product_availability'
  AND recipient='legacy@example.invalid'),'a consumed generation cannot be replayed for another transition');
ROLLBACK;
SELECT notification_contract_test.assert((SELECT count(*)=0 FROM private.product_notification_transitions),
  'rolled-back publications leave no durable availability transition');
SELECT notification_contract_test.assert((SELECT count(*)=0 FROM private.email_intents),
  'rolled-back materialization leaves no delivery work');

BEGIN;
SELECT notification_contract_test.seed_product('predicates','available');
SELECT notification_contract_test.assert(private.product_is_purchasable(notification_contract_test.id('predicates'),clock_timestamp()),
  'active published available Product with in-stock Variant is Purchasable');
UPDATE public.product_variants SET archived_at=clock_timestamp() WHERE product_id=notification_contract_test.id('predicates');
SELECT notification_contract_test.assert(NOT private.product_is_purchasable(notification_contract_test.id('predicates'),clock_timestamp()),
  'archived Variant is never Purchasable');
UPDATE public.product_variants SET archived_at=null,inventory_status='out_of_stock' WHERE product_id=notification_contract_test.id('predicates');
SELECT notification_contract_test.assert(NOT private.product_is_purchasable(notification_contract_test.id('predicates'),clock_timestamp()),
  'out-of-stock Variant is never Purchasable');
UPDATE public.product_variants SET inventory_status='in_stock' WHERE product_id=notification_contract_test.id('predicates');
UPDATE public.products SET published_at=clock_timestamp()+interval '1 day' WHERE id=notification_contract_test.id('predicates');
SELECT notification_contract_test.assert(NOT private.product_is_purchasable(notification_contract_test.id('predicates'),clock_timestamp()),
  'future publication is not yet Purchasable');
UPDATE public.products SET published_at=clock_timestamp()-interval '1 day',catalog_status='archived'
  WHERE id=notification_contract_test.id('predicates');
SELECT notification_contract_test.assert(NOT private.product_is_purchasable(notification_contract_test.id('predicates'),clock_timestamp()),
  'archived Product is not publicly Purchasable');
ROLLBACK;

-- A new explicit checkbox request composes confirmed-subscription admission atomically.
BEGIN;
SELECT notification_contract_test.seed_product('joint');
DO $$ DECLARE failed boolean:=false; BEGIN
  BEGIN
    PERFORM notification_contract_test.enroll(notification_contract_test.id('joint'),'joint@example.invalid','joint-disabled',
      true,marketing_contract_test.contract());
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'marketing_subscription_unavailable' THEN RAISE; END IF;
    failed:=true;
  END;
  PERFORM notification_contract_test.assert(failed,'disabled marketing rejects joint signup truthfully');
END $$;
SELECT notification_contract_test.assert(NOT EXISTS(SELECT 1 FROM private.product_waitlist_enrollments
  WHERE normalized_email='joint@example.invalid'),'joint failure rolls back the Product request');
SELECT notification_contract_test.assert(NOT EXISTS(SELECT 1 FROM private.product_notification_requests
  WHERE request_id=notification_contract_test.id('joint-disabled')),'joint failure does not consume its retry identity');
SELECT notification_contract_test.assert(NOT EXISTS(SELECT 1 FROM private.marketing_subscribers
  WHERE normalized_email='joint@example.invalid'),'joint failure creates no marketing subscriber');
UPDATE private.email_controls SET enabled=true,accepted_after=clock_timestamp()-interval '1 day'
  WHERE purpose IN ('marketing_confirmation','welcome_initial','welcome_education');
SELECT notification_contract_test.enroll(notification_contract_test.id('joint'),'joint@example.invalid','joint-disabled',
  true,marketing_contract_test.contract());
SELECT notification_contract_test.assert((SELECT count(*)=1 AND bool_and(status='pending' AND NOT global_allowed AND NOT topic_allowed)
  FROM private.marketing_subscribers WHERE normalized_email='joint@example.invalid'),'fresh explicit choice starts pending verification only');
SELECT notification_contract_test.assert((SELECT count(*)=1 FROM private.product_waitlist_consent_events c
  JOIN private.product_waitlist_enrollments e ON e.id=c.enrollment_id WHERE e.normalized_email='joint@example.invalid'),
  'fresh checkbox wording evidence is retained independently');
SELECT notification_contract_test.assert((SELECT count(*)=1 FROM private.email_intents WHERE recipient='joint@example.invalid'
  AND purpose='marketing_confirmation'),'joint signup queues exactly one independent confirmation');
SELECT notification_contract_test.assert(NOT EXISTS(SELECT 1 FROM private.email_intents WHERE recipient='joint@example.invalid'
  AND purpose IN ('welcome_initial','welcome_education')),'unconfirmed permission never starts welcome');
ROLLBACK;

SELECT notification_contract_test.assert(NOT EXISTS(
  SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='private' AND c.relkind='r' AND c.relname LIKE 'product_notification_%'
    AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity)), 'notification persistence has forced private RLS');
SELECT notification_contract_test.assert(NOT EXISTS(
  SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  CROSS JOIN unnest(ARRAY['anon','authenticated']) role_name
  CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE']) privilege
  WHERE n.nspname='private' AND c.relkind='r' AND (c.relname LIKE 'product_notification_%' OR c.relname LIKE 'product_waitlist_%')
    AND has_table_privilege(role_name,c.oid,privilege)), 'browser roles have no direct request or capability table access');
SELECT notification_contract_test.assert(NOT EXISTS(
  SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname IN ('public','private') AND (p.proname LIKE '%product_notification%' OR p.proname='enroll_product_waitlist')
    AND (has_function_privilege('anon',p.oid,'EXECUTE') OR has_function_privilege('authenticated',p.oid,'EXECUTE'))),
  'notification entry points and internal helpers have no browser execution grant');
BEGIN;
SET LOCAL ROLE anon;
DO $$ DECLARE failed boolean:=false; BEGIN
  BEGIN PERFORM public.enroll_product_waitlist('00000000-0000-0000-0000-000000000001','outsider@example.invalid',
    false,'v1','pdp_waitlist',repeat('a',64),'00000000-0000-0000-0000-000000000002');
  EXCEPTION WHEN insufficient_privilege THEN failed:=true; END;
  IF NOT failed THEN RAISE EXCEPTION 'Anonymous caller bypassed service-only enrollment'; END IF;
END $$;
ROLLBACK;

-- Recovery begins with a generic, bounded request; only the mailbox receives capabilities.
BEGIN;
UPDATE private.email_controls SET enabled=true WHERE purpose='product_waitlist_recovery';
SELECT notification_contract_test.assert(public.request_product_notification_recovery(
  'missing@example.invalid',repeat('a',64),notification_contract_test.tokens(),true,
  notification_contract_test.id('missing-recovery'))='{"ok":true}'::jsonb,
  'missing-address recovery has the same generic response');
SELECT notification_contract_test.assert((SELECT count(*)=0 FROM private.email_intents),
  'enabled recovery creates no message for an unknown address');
SELECT notification_contract_test.assert((SELECT count(*)=0 FROM private.product_notification_tokens),
  'enabled recovery creates no capability for an unknown address');
ROLLBACK;

BEGIN;
UPDATE private.email_controls SET enabled=true,accepted_after=clock_timestamp()-interval '1 day'
  WHERE purpose IN ('product_availability','product_waitlist_recovery');
SELECT notification_contract_test.assert(public.request_product_notification_recovery(
  'legacy@example.invalid',repeat('b',64),notification_contract_test.tokens(),false,
  notification_contract_test.id('restricted-recovery'))='{"ok":true}'::jsonb,
  'restricted address recovery has the same generic response');
SELECT notification_contract_test.assert((SELECT count(*)=0 FROM private.email_intents),
  'a restricted recipient is never rerouted to a different mailbox');
SET LOCAL ROLE service_role;
SELECT notification_contract_test.assert(public.request_product_notification_recovery(
  'legacy@example.invalid',repeat('c',64),notification_contract_test.tokens(),true,
  notification_contract_test.id('legacy-recovery'))='{"ok":true}'::jsonb,
  'eligible legacy recovery has the same generic response');
RESET ROLE;
SELECT notification_contract_test.assert((SELECT count(*)=1 FROM private.email_intents
  WHERE recipient='legacy@example.invalid' AND purpose='product_waitlist_recovery'),
  'explicit legacy recovery queues one private mailbox message');
SELECT notification_contract_test.assert((SELECT count(*)=1 FROM private.product_notification_tokens),
  'only unexpired addressed requests receive recovery capabilities');
SELECT notification_contract_test.assert((SELECT bool_and(expires_at>clock_timestamp() AND expires_at<=clock_timestamp()+interval '24 hours')
  FROM private.product_notification_tokens),'recovery capability expires within one day');
CREATE TEMP TABLE first_recovery AS SELECT id,receipt FROM private.email_intents WHERE purpose='product_waitlist_recovery';
SELECT public.request_product_notification_recovery('legacy@example.invalid',repeat('d',64),notification_contract_test.tokens(20),true,
  notification_contract_test.id('legacy-recovery'));
SELECT public.request_product_notification_recovery('legacy@example.invalid',repeat('e',64),notification_contract_test.tokens(40),true,
  notification_contract_test.id('legacy-new-recovery'));
SELECT notification_contract_test.assert((SELECT count(*)=1 FROM private.email_intents WHERE purpose='product_waitlist_recovery'),
  'lost-response replay and a fresh overlapping request coalesce outstanding recovery');
SELECT notification_contract_test.assert((SELECT i.receipt=f.receipt FROM private.email_intents i JOIN first_recovery f USING(id)),
  'unauthenticated requests cannot rotate or change an outstanding valid link');
SELECT notification_contract_test.assert(NOT EXISTS(SELECT 1 FROM private.marketing_subscribers),
  'recovery does not enroll or restore marketing permission');
DO $$ DECLARE token text; BEGIN
  SELECT receipt#>>'{links,0,token}' INTO token FROM first_recovery;
  PERFORM notification_contract_test.assert(length(token)=43,'only the private recovery payload contains its full capability');
  PERFORM notification_contract_test.assert(public.cancel_product_notification(repeat('z',43))='{"ok":true}'::jsonb,
    'an outsider guessed token gets a generic result');
  PERFORM notification_contract_test.assert(NOT EXISTS(SELECT 1 FROM private.product_notification_generations WHERE withdrawn_at IS NOT NULL),
    'a guessed token cannot withdraw any request');
  UPDATE public.products SET catalog_status='archived' WHERE id=notification_contract_test.id('legacy');
  INSERT INTO private.product_notification_tokens(token_hash,enrollment_id,generation,expires_at,recovery_intent_id)
    SELECT encode(extensions.digest(repeat('e',43),'sha256'),'hex'),t.enrollment_id,t.generation,
      clock_timestamp()-interval '1 second',t.recovery_intent_id FROM private.product_notification_tokens t LIMIT 1;
  PERFORM public.cancel_product_notification(repeat('e',43));
  PERFORM notification_contract_test.assert(NOT EXISTS(SELECT 1 FROM private.product_notification_generations WHERE withdrawn_at IS NOT NULL),
    'an expired mailbox capability cannot withdraw the still-live request');
  PERFORM public.cancel_product_notification(token);
  PERFORM notification_contract_test.assert((SELECT withdrawn_at IS NOT NULL FROM private.product_notification_generations g
    JOIN private.product_waitlist_enrollments e ON e.id=g.enrollment_id WHERE e.normalized_email='legacy@example.invalid'),
    'mailbox cancellation works even after Product archival');
  UPDATE public.products SET catalog_status='active' WHERE id=notification_contract_test.id('legacy');
  PERFORM notification_contract_test.enroll(notification_contract_test.id('legacy'),'legacy@example.invalid','legacy-new-generation');
  PERFORM public.cancel_product_notification(token);
  PERFORM notification_contract_test.assert((SELECT g.generation=2 AND g.withdrawn_at IS NULL
    FROM private.product_notification_generations g JOIN private.product_waitlist_enrollments e
    ON e.id=g.enrollment_id AND e.generation=g.generation WHERE e.normalized_email='legacy@example.invalid'),
    'old mailbox capability cannot cancel a later generation');
END $$;
ROLLBACK;

-- Expired historical generations remain expired even when recovery is requested.
BEGIN;
UPDATE private.email_controls SET enabled=true WHERE purpose='product_waitlist_recovery';
SELECT public.request_product_notification_recovery('expired@example.invalid',repeat('a',64),notification_contract_test.tokens(),true,
  notification_contract_test.id('expired-recovery'));
SELECT notification_contract_test.assert((SELECT count(*)=0 FROM private.product_notification_tokens),
  'recovery never creates a capability for an expired request');
SELECT notification_contract_test.assert((SELECT count(*)=0 FROM private.email_intents),
  'expired recovery neither sends mail nor renews its request');
ROLLBACK;

BEGIN;
UPDATE private.email_controls SET enabled=true,accepted_after=clock_timestamp()-interval '1 day' WHERE purpose='product_availability';
SELECT notification_contract_test.seed_product('event-order');
SELECT notification_contract_test.enroll(notification_contract_test.id('event-order'),'events@example.invalid','events-request');
SELECT notification_contract_test.publish(notification_contract_test.id('event-order'),'available');
SELECT notification_contract_test.publish(notification_contract_test.id('event-order'),'available',false,'unavailable');
SELECT notification_contract_test.publish(notification_contract_test.id('event-order'),'available');
SELECT public.materialize_product_notifications(1);
SELECT public.materialize_product_notifications(100);
SELECT notification_contract_test.assert((SELECT g.consumed_transition_id=min(t.id)
  FROM private.product_waitlist_enrollments e JOIN private.product_notification_generations g
  ON g.enrollment_id=e.id AND g.generation=e.generation JOIN private.product_notification_transitions t ON t.product_id=e.product_id
  WHERE e.normalized_email='events@example.invalid' GROUP BY g.consumed_transition_id),
  'a delayed worker consumes the first eligible durable transition even when a later one already exists');
SELECT notification_contract_test.assert((SELECT count(*)=1 FROM private.email_intents WHERE recipient='events@example.invalid'),
  'worker batch sizes and repeated publication cannot duplicate one request notification');
ROLLBACK;

BEGIN;
UPDATE private.email_controls SET enabled=true,accepted_after=clock_timestamp()-interval '1 day' WHERE purpose='product_availability';
SELECT notification_contract_test.seed_product('delayed-unavailable');
SELECT notification_contract_test.enroll(notification_contract_test.id('delayed-unavailable'),'delayed@example.invalid','delayed-request');
SELECT notification_contract_test.publish(notification_contract_test.id('delayed-unavailable'),'available');
SELECT notification_contract_test.publish(notification_contract_test.id('delayed-unavailable'),'available',false,'unavailable');
SELECT public.materialize_product_notifications(20);
SELECT notification_contract_test.assert((SELECT state='blocked' FROM private.email_intents WHERE recipient='delayed@example.invalid'),
  'a delayed unavailable Offer produces no sendable notification');
SELECT notification_contract_test.publish(notification_contract_test.id('delayed-unavailable'),'available');
SELECT public.materialize_product_notifications(20);
SELECT notification_contract_test.assert((SELECT count(*)=1 AND bool_and(state='blocked') FROM private.email_intents WHERE recipient='delayed@example.invalid'),
  'a consumed but blocked transition cannot silently replay as a later availability message');
ROLLBACK;


BEGIN;
UPDATE private.email_controls SET enabled=true,accepted_after=clock_timestamp()-interval '1 day' WHERE purpose='product_availability';
SELECT notification_contract_test.seed_product('renewed-cursor');
SELECT notification_contract_test.enroll(notification_contract_test.id('renewed-cursor'),'cursor@example.invalid','cursor-one');
SELECT notification_contract_test.publish(notification_contract_test.id('renewed-cursor'),'available');
SELECT public.materialize_product_notifications(100);
SELECT notification_contract_test.publish(notification_contract_test.id('renewed-cursor'),'waitlist');
SELECT notification_contract_test.enroll(notification_contract_test.id('renewed-cursor'),'cursor@example.invalid','cursor-two');
SELECT public.materialize_product_notifications(100);
SELECT notification_contract_test.assert((SELECT count(*)=1 FROM private.email_intents WHERE recipient='cursor@example.invalid'),
  'renewed generation cannot consume an availability transition preceding its enrollment');
SELECT notification_contract_test.publish(notification_contract_test.id('renewed-cursor'),'available');
SELECT public.materialize_product_notifications(100);
SELECT public.materialize_product_notifications(100);
SELECT notification_contract_test.assert((SELECT count(*)=2 AND count(DISTINCT receipt->>'generation')=2
  AND count(DISTINCT receipt->>'transitionId')=2 FROM private.email_intents WHERE recipient='cursor@example.invalid'),
  'each explicitly renewed generation receives only its first subsequent distinct transition');
ROLLBACK;

CREATE FUNCTION notification_contract_test.payload(p_id uuid) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object('from','Helix <onboarding@resend.dev>','reply_to','support@example.invalid',
    'to',jsonb_build_array(recipient),
    'subject',CASE WHEN purpose='product_availability' THEN '[DEMO] helix — '||(receipt->>'productName')||' is ready for Checkout'
      ELSE 'Synthetic approved Product request recovery' END,
    'html',CASE WHEN purpose='product_availability' THEN '<p>Synthetic Product message</p><a href="https://helixskin.vercel.app/products/'
      ||(receipt->>'productSlug')||'">View Product</a>' ELSE '<p>Synthetic recovery</p>' END,
    'text',CASE WHEN purpose='product_availability' THEN 'View '||(receipt->>'productName')||': https://helixskin.vercel.app/products/'
      ||(receipt->>'productSlug')||E'\n\n' ELSE 'Synthetic recovery' END,
    'tags',jsonb_build_array(jsonb_build_object('name','helix_environment','value',environment),
      jsonb_build_object('name','helix_message_id','value',id::text))) FROM private.email_intents WHERE id=p_id;
$$;
GRANT EXECUTE ON FUNCTION notification_contract_test.payload(uuid) TO service_role;
CREATE FUNCTION notification_contract_test.accept(p_id uuid,p_provider_suffix text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_lease uuid:=notification_contract_test.id('accept-'||p_provider_suffix); BEGIN
  UPDATE private.email_intents SET state='leased',lease_token=v_lease,lease_expires_at=clock_timestamp()+interval '5 minutes'
    WHERE id=p_id;
  PERFORM notification_contract_test.assert(public.prepare_email_attempt(p_id,v_lease,notification_contract_test.payload(p_id)) IS NOT NULL,
    'synthetic accepted recovery must pass actual shared admission');
  PERFORM notification_contract_test.assert(public.finish_email_attempt(p_id,v_lease,'accepted','synthetic_'||p_provider_suffix,null),
    'synthetic provider acceptance must complete its admitted lease');
END $$;

-- Fair mailbox recovery remains bounded without stranding requests beyond the first page.
BEGIN;
UPDATE private.email_controls SET enabled=true,accepted_after=clock_timestamp()-interval '1 day'
  WHERE purpose='product_waitlist_recovery';
DO $$ DECLARE n integer; BEGIN
  FOR n IN 1..21 LOOP
    PERFORM notification_contract_test.seed_product('many-'||n);
    PERFORM notification_contract_test.enroll(notification_contract_test.id('many-'||n),'many@example.invalid','many-'||n);
  END LOOP;
END $$;
SELECT public.request_product_notification_recovery('many@example.invalid',repeat('a',64),notification_contract_test.tokens(500),true,
  notification_contract_test.id('many-recover-first'));
SELECT notification_contract_test.assert((SELECT jsonb_array_length(receipt->'links')=20 FROM private.email_intents
  WHERE recipient='many@example.invalid'),'first recovery bundle contains at most twenty generation links');
SELECT notification_contract_test.accept(id,'many_first') FROM private.email_intents WHERE recipient='many@example.invalid';
SELECT public.request_product_notification_recovery('many@example.invalid',repeat('b',64),notification_contract_test.tokens(520),true,
  notification_contract_test.id('many-recover-first'));
SELECT notification_contract_test.assert((SELECT count(*)=1 FROM private.email_intents WHERE recipient='many@example.invalid'),
  'replay of the original HTTP request cannot advance the cursor after provider acceptance');
UPDATE private.product_notification_recovery_addresses SET last_bundle_at=clock_timestamp()-interval '61 seconds'
  WHERE address_hash=encode(extensions.digest('many@example.invalid','sha256'),'hex');
SELECT public.request_product_notification_recovery('many@example.invalid',repeat('c',64),notification_contract_test.tokens(540),true,
  notification_contract_test.id('many-recover-next'));
SELECT notification_contract_test.assert((SELECT count(*)=2 AND max(jsonb_array_length(receipt->'links'))=20
  FROM private.email_intents WHERE recipient='many@example.invalid'),'a fresh request after cooldown creates another bounded bundle');
SELECT notification_contract_test.assert((SELECT count(DISTINCT link->>'enrollmentId')=21 FROM private.email_intents i
  CROSS JOIN LATERAL jsonb_array_elements(i.receipt->'links') link WHERE i.recipient='many@example.invalid'),
  'fair cursor reaches the request beyond the first twenty');
SELECT notification_contract_test.assert((SELECT count(*)=21 FROM private.product_notification_tokens t
  JOIN private.product_waitlist_enrollments e ON e.id=t.enrollment_id WHERE e.normalized_email='many@example.invalid'),
  'second bundle reuses still-valid capabilities instead of rotating earlier links');
SELECT notification_contract_test.accept(id,'many_second') FROM private.email_intents WHERE recipient='many@example.invalid' AND state='queued';
-- Advance only synthetic rate/cooldown accounting; issued token and generation timestamps remain immutable.
UPDATE private.product_notification_recovery_addresses SET last_bundle_at=clock_timestamp()-interval '61 seconds'
  WHERE address_hash=encode(extensions.digest('many@example.invalid','sha256'),'hex');
UPDATE private.product_notification_recovery_limits SET occurrences=ARRAY[clock_timestamp()-interval '61 minutes'];
SELECT public.request_product_notification_recovery('many@example.invalid',repeat('d',64),notification_contract_test.tokens(560),true,
  notification_contract_test.id('many-all-valid-links'));
SELECT notification_contract_test.assert((SELECT count(*)=3 AND max(jsonb_array_length(receipt->'links'))=20
  FROM private.email_intents WHERE recipient='many@example.invalid'),
  'when every request already has a valid link another bounded recovery bundle still succeeds');
SELECT notification_contract_test.assert((SELECT count(*)=21 FROM private.product_notification_tokens t
  JOIN private.product_waitlist_enrollments e ON e.id=t.enrollment_id WHERE e.normalized_email='many@example.invalid'),
  'the all-valid-link recovery case rotates no capabilities');
ROLLBACK;

BEGIN;
UPDATE private.email_controls SET enabled=true,accepted_after=clock_timestamp()-interval '1 day'
  WHERE purpose='product_waitlist_recovery';
SELECT public.request_product_notification_recovery('legacy@example.invalid',repeat('a',64),notification_contract_test.tokens(600),true,
  notification_contract_test.id('cooldown-first'));
SELECT notification_contract_test.accept(id,'cooldown_first') FROM private.email_intents WHERE recipient='legacy@example.invalid';
SELECT public.request_product_notification_recovery('legacy@example.invalid',repeat('b',64),notification_contract_test.tokens(620),true,
  notification_contract_test.id('cooldown-second'));
SELECT notification_contract_test.assert((SELECT count(*)=1 FROM private.email_intents WHERE recipient='legacy@example.invalid'),
  'fresh anonymous retries cannot send another accepted recovery inside sixty seconds');
ROLLBACK;

BEGIN;
UPDATE private.email_controls SET enabled=true WHERE purpose='product_waitlist_recovery';
DO $$ DECLARE n integer; v_result jsonb; BEGIN
  FOR n IN 1..4 LOOP
    v_result:=public.request_product_notification_recovery('missing-capped@example.invalid',lpad(n::text,64,'a'),
      notification_contract_test.tokens(700+n*20),true,notification_contract_test.id('address-limit-'||n));
    PERFORM notification_contract_test.assert(v_result='{"ok":true}'::jsonb,'address-throttled requests retain generic response');
  END LOOP;
END $$;
SELECT notification_contract_test.assert((SELECT cardinality(occurrences)=3
  FROM private.product_notification_recovery_limits WHERE key='address:'||encode(extensions.digest('missing-capped@example.invalid','sha256'),'hex')),
  'missing addresses count toward the three-per-address hourly limit');
DO $$ DECLARE n integer; BEGIN
  FOR n IN 1..11 LOOP
    PERFORM public.request_product_notification_recovery('missing-source-'||n||'@example.invalid',repeat('f',64),
      notification_contract_test.tokens(800+n*20),true,notification_contract_test.id('source-limit-'||n));
  END LOOP;
END $$;
SELECT notification_contract_test.assert((SELECT cardinality(occurrences)=10
  FROM private.product_notification_recovery_limits WHERE key='source:'||repeat('f',64)),
  'one trusted request source cannot exceed ten hourly recovery attempts across addresses');
ROLLBACK;

-- Canonical URL changes can refresh an unattempted message without changing its identity.
BEGIN;
UPDATE private.email_controls SET enabled=true,accepted_after=clock_timestamp()-interval '1 day' WHERE purpose='product_availability';
SELECT notification_contract_test.seed_product('stale-slug');
SELECT notification_contract_test.enroll(notification_contract_test.id('stale-slug'),'slug@example.invalid','stale-slug');
SELECT notification_contract_test.publish(notification_contract_test.id('stale-slug'),'available');
SELECT public.materialize_product_notifications(100);
CREATE TEMP TABLE original_slug_intent AS SELECT id,idempotency_key,receipt FROM private.email_intents WHERE recipient='slug@example.invalid';
UPDATE private.email_intents SET state='leased',lease_token=notification_contract_test.id('slug-lease'),
  lease_expires_at=clock_timestamp()+interval '5 minutes' WHERE recipient='slug@example.invalid';
UPDATE public.products SET slug='synthetic-current-slug',display_name='Current public Product' WHERE id=notification_contract_test.id('stale-slug');
SELECT notification_contract_test.assert(public.refresh_product_notification_email(id,notification_contract_test.id('slug-lease'))
  #>>'{receipt,productSlug}'='synthetic-current-slug','first-attempt context resolves the current canonical Product URL')
  FROM private.email_intents WHERE recipient='slug@example.invalid';
SELECT notification_contract_test.assert((SELECT i.idempotency_key=o.idempotency_key
  AND (i.receipt-ARRAY['productSlug','productName'])=(o.receipt-ARRAY['productSlug','productName'])
  FROM private.email_intents i JOIN original_slug_intent o USING(id)),
  'refresh preserves the same message, generation, transition, recipient and idempotency identity');
CREATE TEMP TABLE stale_slug_payload AS SELECT id,notification_contract_test.payload(id) AS payload
  FROM private.email_intents WHERE recipient='slug@example.invalid';
UPDATE public.products SET slug='synthetic-newer-slug' WHERE id=notification_contract_test.id('stale-slug');
SELECT notification_contract_test.assert(public.prepare_email_attempt(id,notification_contract_test.id('slug-lease'),payload) IS NULL,
  'rename between rendering and admission rejects stale content before provider handoff') FROM stale_slug_payload;
SELECT notification_contract_test.assert((SELECT state='retry' AND first_attempt_at IS NULL FROM private.email_intents WHERE recipient='slug@example.invalid'),
  'a stale render remains retryable instead of stranding a legitimate notification');
UPDATE private.email_intents SET state='leased',lease_token=notification_contract_test.id('slug-lease'),
  lease_expires_at=clock_timestamp()+interval '5 minutes' WHERE recipient='slug@example.invalid';
SELECT public.refresh_product_notification_email(id,notification_contract_test.id('slug-lease'))
  FROM private.email_intents WHERE recipient='slug@example.invalid';
CREATE TEMP TABLE second_stale_payload AS SELECT id,notification_contract_test.payload(id) AS payload
  FROM private.email_intents WHERE recipient='slug@example.invalid';
UPDATE public.products SET slug='synthetic-latest-slug' WHERE id=notification_contract_test.id('stale-slug');
SELECT public.refresh_product_notification_email(id,notification_contract_test.id('slug-lease'))
  FROM private.email_intents WHERE recipient='slug@example.invalid';
SELECT notification_contract_test.assert(public.prepare_email_attempt(id,notification_contract_test.id('slug-lease'),payload) IS NULL,
  'a second refresh under the same lease cannot admit an earlier stale rendered payload') FROM second_stale_payload;
SELECT notification_contract_test.assert((SELECT state='retry' AND first_attempt_at IS NULL AND attempt_count=0
  FROM private.email_intents WHERE recipient='slug@example.invalid'),'stale render never spends a provider attempt');
UPDATE private.email_intents SET state='leased',lease_token=notification_contract_test.id('slug-lease'),
  lease_expires_at=clock_timestamp()+interval '5 minutes' WHERE recipient='slug@example.invalid';
SELECT public.refresh_product_notification_email(id,notification_contract_test.id('slug-lease'))
  FROM private.email_intents WHERE recipient='slug@example.invalid';
SELECT notification_contract_test.assert(public.prepare_email_attempt(id,notification_contract_test.id('slug-lease'),
  notification_contract_test.payload(id)) IS NOT NULL,'fresh canonical content can admit the original logical notification')
  FROM private.email_intents WHERE recipient='slug@example.invalid';
CREATE TEMP TABLE attempted_slug_intent AS SELECT id,receipt,request_payload,first_attempt_at FROM private.email_intents WHERE recipient='slug@example.invalid';
UPDATE public.products SET slug='synthetic-after-handoff' WHERE id=notification_contract_test.id('stale-slug');
SELECT public.refresh_product_notification_email(id,notification_contract_test.id('slug-lease'))
  FROM private.email_intents WHERE recipient='slug@example.invalid';
SELECT notification_contract_test.assert((SELECT i.receipt=a.receipt AND i.request_payload=a.request_payload AND i.first_attempt_at=a.first_attempt_at
  FROM private.email_intents i JOIN attempted_slug_intent a USING(id)),
  'refresh after possible provider handoff cannot rewrite frozen content or acceptance time');
ROLLBACK;

BEGIN;
UPDATE private.email_controls SET enabled=true,accepted_after=clock_timestamp()-interval '1 day' WHERE purpose='product_availability';
SELECT notification_contract_test.seed_product('stale-stock');
SELECT notification_contract_test.enroll(notification_contract_test.id('stale-stock'),'stock@example.invalid','stale-stock');
SELECT notification_contract_test.publish(notification_contract_test.id('stale-stock'),'available');
SELECT public.materialize_product_notifications(100);
SELECT notification_contract_test.publish(notification_contract_test.id('stale-stock'),'available',false,'unavailable');
UPDATE private.email_intents SET state='leased',lease_token=notification_contract_test.id('stock-lease'),
  lease_expires_at=clock_timestamp()+interval '5 minutes' WHERE recipient='stock@example.invalid';
SELECT notification_contract_test.assert(public.prepare_email_attempt(id,notification_contract_test.id('stock-lease'),
  notification_contract_test.payload(id)) IS NULL,'handoff blocks an Offer withdrawn since materialization')
  FROM private.email_intents WHERE recipient='stock@example.invalid';
ROLLBACK;

BEGIN;
UPDATE private.email_controls SET enabled=true,accepted_after=clock_timestamp()-interval '1 day' WHERE purpose='product_availability';
SELECT notification_contract_test.publish(notification_contract_test.id('legacy'),'available');
SELECT public.materialize_product_notifications(100);
UPDATE private.email_intents SET state='blocked',recipient=null,receipt=null,request_payload=null,content_deleted_at=clock_timestamp()
  WHERE purpose='product_availability';
SELECT public.materialize_product_notifications(100);
SELECT notification_contract_test.assert((SELECT count(*)=1 AND bool_and(content_deleted_at IS NOT NULL) FROM private.email_intents),
  'private content removal preserves message identity and cannot re-enqueue a consumed request');
SELECT notification_contract_test.assert((SELECT count(*)=1 FROM private.product_notification_generations WHERE consumed_transition_id IS NOT NULL),
  'consumption tombstone survives email content removal');
ROLLBACK;

BEGIN;
SELECT public.configure_product_notification_email(false,(SELECT jsonb_object_agg(c->>'purpose',c->'updatedAt')
  FROM jsonb_array_elements(public.read_product_notification_email_control()) c));
SELECT notification_contract_test.publish(notification_contract_test.id('legacy'),'available');
SELECT notification_contract_test.assert(public.materialize_product_notifications(20)=0,
  'disabled delivery cannot materialize a fresh publication');
SELECT public.configure_product_notification_email(true,(SELECT jsonb_object_agg(c->>'purpose',c->'updatedAt')
  FROM jsonb_array_elements(public.read_product_notification_email_control()) c));
SELECT notification_contract_test.assert(public.materialize_product_notifications(20)=0,
  're-enabling starts a new cutoff and never replays publication while delivery was disabled');
SELECT notification_contract_test.publish(notification_contract_test.id('legacy'),'available',false,'unavailable');
SELECT notification_contract_test.publish(notification_contract_test.id('legacy'),'available');
SELECT notification_contract_test.assert(public.materialize_product_notifications(20)=1,
  'an original unexpired request remains eligible for a subsequent post-activation transition');
ROLLBACK;

BEGIN;
SELECT notification_contract_test.seed_product('request-binding');
SELECT notification_contract_test.enroll(notification_contract_test.id('request-binding'),'bound@example.invalid','bound-request');
DO $$ DECLARE denied boolean:=false; BEGIN
  BEGIN PERFORM notification_contract_test.enroll(notification_contract_test.id('request-binding'),'other@example.invalid','bound-request');
  EXCEPTION WHEN invalid_parameter_value THEN denied:=true; END;
  PERFORM notification_contract_test.assert(denied,'an enrollment replay ID cannot be rebound to a different address');
END $$;
SELECT public.request_product_notification_recovery('bound@example.invalid',repeat('a',64),notification_contract_test.tokens(900),true,
  notification_contract_test.id('bound-request'));
SELECT notification_contract_test.assert((SELECT count(*)=1 AND bool_and(purpose='enrollment') FROM private.product_notification_requests
  WHERE request_id=notification_contract_test.id('bound-request')),'a recovery request cannot repurpose an existing enrollment identity');
SELECT notification_contract_test.assert((SELECT count(*)=0 FROM private.email_intents),
  'cross-purpose request replay cannot create a recovery message');
ROLLBACK;


BEGIN;
UPDATE private.email_controls SET enabled=true,accepted_after=clock_timestamp()-interval '1 day' WHERE purpose='product_availability';
DO $$ DECLARE kind text; intent private.email_intents%rowtype; refreshed jsonb;
  lease uuid:=notification_contract_test.id('visibility-lease'); BEGIN
  FOREACH kind IN ARRAY ARRAY['archived','unpublished'] LOOP
    PERFORM notification_contract_test.seed_product('visibility-'||kind);
    PERFORM notification_contract_test.enroll(notification_contract_test.id('visibility-'||kind),
      'visibility-'||kind||'@example.invalid','visibility-'||kind);
    PERFORM notification_contract_test.publish(notification_contract_test.id('visibility-'||kind),'available');
    PERFORM public.materialize_product_notifications(100);
    SELECT * INTO STRICT intent FROM private.email_intents WHERE recipient='visibility-'||kind||'@example.invalid';
    UPDATE public.products SET catalog_status=CASE WHEN kind='archived' THEN 'archived' ELSE catalog_status END,
      published_at=CASE WHEN kind='unpublished' THEN clock_timestamp()+interval '1 day' ELSE published_at END,
      display_name='Private unpublished fixture content' WHERE id=notification_contract_test.id('visibility-'||kind);
    UPDATE private.email_intents SET state='leased',lease_token=lease,lease_expires_at=clock_timestamp()+interval '5 minutes' WHERE id=intent.id;
    refreshed:=public.refresh_product_notification_email(intent.id,lease);
    PERFORM notification_contract_test.assert(refreshed#>>'{receipt,productName}'=intent.receipt->>'productName',
      'refresh never imports private archived or future-publication content');
    PERFORM notification_contract_test.assert(public.prepare_email_attempt(intent.id,lease,notification_contract_test.payload(intent.id)) IS NULL,
      'public visibility removal before first handoff revokes provider admission');
    PERFORM notification_contract_test.assert((SELECT state='blocked' AND first_attempt_at IS NULL FROM private.email_intents WHERE id=intent.id),
      'archived or unpublished Product is terminally blocked before any provider handoff');
  END LOOP;
END $$;
ROLLBACK;
