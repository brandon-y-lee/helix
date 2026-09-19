-- Synthetic receipt ownership contracts; this file is run only in a disposable database.
-- These are real pre-cutover Sessions, captured by the migration itself.
INSERT INTO public.carts(id,guest_token_hash,expires_at)
SELECT md5('synthetic-receipt:cart:' || n)::uuid,
  repeat(md5('synthetic-receipt:guest:' || n),2),now()+interval '1 day'
FROM generate_series(60,61) n;
INSERT INTO public.orders(id,order_number,cart_id,merchandise_subtotal_cents,total_cents,idempotency_key,stripe_checkout_session_id)
SELECT md5('synthetic-receipt:order:' || n)::uuid,'HX-RECEIPT-' || n,
  md5('synthetic-receipt:cart:' || n)::uuid,2500,2500,'receipt-fixture:' || n,'cs_test_receipt' || n
FROM generate_series(60,61) n;
INSERT INTO public.order_items(order_id,product_slug,product_name,variant_key,variant_label,unit_price_cents,quantity,line_subtotal_cents)
SELECT md5('synthetic-receipt:order:' || n)::uuid,'fixture','Synthetic Serum','30ml','30 mL',2500,1,2500
FROM generate_series(60,61) n;

-- APPLY RECEIPT MIGRATIONS
CREATE SCHEMA receipt_test;
CREATE FUNCTION receipt_test.assert(ok boolean, description text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %', description; END IF; END $$;
SELECT receipt_test.assert(to_regprocedure('public.bind_guest_checkout_receipt(text,uuid,text,text,text)') IS NOT NULL,
  'guest receipt binding exists');
CREATE FUNCTION receipt_test.id(kind text, n integer) RETURNS uuid LANGUAGE sql IMMUTABLE
AS $$ SELECT md5('synthetic-receipt:' || kind || ':' || n)::uuid $$;
CREATE FUNCTION receipt_test.hash(kind text, n integer) RETURNS text LANGUAGE sql IMMUTABLE
AS $$ SELECT md5('synthetic-receipt:' || kind || ':' || n) || md5('synthetic-receipt:' || kind || ':' || n) $$;
CREATE FUNCTION receipt_test.seed(n integer, owner_number integer DEFAULT NULL, account_user_number integer DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$ DECLARE v_owner integer := coalesce(owner_number,n); v_user uuid; BEGIN
  IF account_user_number IS NOT NULL THEN
    v_user := receipt_test.id('user',account_user_number);
    INSERT INTO auth.users(id) VALUES(v_user) ON CONFLICT DO NOTHING;
  END IF;
  UPDATE public.carts SET status='abandoned' WHERE status='active' AND
    (guest_token_hash=receipt_test.hash('guest',v_owner) OR user_id=v_user);
  INSERT INTO public.carts(id,user_id,guest_token_hash,expires_at,checkout_generation)
    VALUES(receipt_test.id('cart',n),v_user,CASE WHEN v_user IS NULL THEN receipt_test.hash('guest',v_owner) END,
      now()+interval '1 day',receipt_test.id('generation',n));
  INSERT INTO public.orders(id,order_number,user_id,cart_id,merchandise_subtotal_cents,total_cents,
    idempotency_key,checkout_generation,stripe_checkout_session_id)
    VALUES(receipt_test.id('order',n),'HX-RECEIPT-' || n,v_user,receipt_test.id('cart',n),2500,2500,
      'receipt-fixture:' || n,receipt_test.id('generation',n),'cs_test_receipt' || n);
  INSERT INTO private.checkout_create_receipts(account_id,idempotency_key,order_id,owner_key,admitted_at)
    VALUES('acct_1Tm9WRFEzyaKzdmq','receipt-fixture:' || n,receipt_test.id('order',n),
      CASE WHEN v_user IS NULL THEN 'guest:' || receipt_test.id('cart',n)::text ELSE 'user:' || v_user::text END,now());
END $$;
CREATE FUNCTION receipt_test.bind(n integer, token_n integer, existing_token_n integer DEFAULT NULL)
RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.bind_guest_checkout_receipt('acct_1Tm9WRFEzyaKzdmq',o.id,
    coalesce(c.guest_token_hash,w.guest_owner_hash),
    CASE WHEN existing_token_n IS NOT NULL THEN receipt_test.hash('token',existing_token_n) END,
    receipt_test.hash('token',token_n))
  FROM public.orders o LEFT JOIN public.carts c ON c.id=o.cart_id
    LEFT JOIN private.checkout_receipt_order_windows w ON w.order_id=o.id
  WHERE o.id=receipt_test.id('order',n)
$$;
CREATE FUNCTION receipt_test.authorize(n integer, token_n integer, user_n integer DEFAULT NULL)
RETURNS boolean LANGUAGE sql AS $$ SELECT public.authorize_checkout_receipt('acct_1Tm9WRFEzyaKzdmq',
  receipt_test.id('order',n),'cs_test_receipt' || n,
  CASE WHEN user_n IS NOT NULL THEN receipt_test.id('user',user_n) END,
  CASE WHEN token_n IS NOT NULL THEN receipt_test.hash('token',token_n) END,NULL) $$;
CREATE FUNCTION receipt_test.reset_budgets() RETURNS void LANGUAGE sql
AS $$ DELETE FROM private.checkout_receipt_budgets $$;
CREATE FUNCTION receipt_test.reject_write() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Unexpected receipt replay write'; END $$;
GRANT USAGE ON SCHEMA receipt_test TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA receipt_test TO service_role;

BEGIN;
SELECT receipt_test.seed(1);
SET LOCAL ROLE service_role;
SELECT receipt_test.assert((receipt_test.bind(1,1)->>'allowed')::boolean,'first proven guest gets a receipt');
SELECT receipt_test.assert(receipt_test.authorize(1,1),'explicit guest grant authorizes the receipt');
SELECT receipt_test.assert(NOT receipt_test.authorize(1,2),'unrelated receipt token is neutral unavailable');
SELECT receipt_test.assert((receipt_test.bind(1,2,1)->>'reused')::boolean,'existing valid token is reused');
SELECT receipt_test.assert(NOT receipt_test.authorize(1,2),'unused candidate is not registered');
SELECT receipt_test.assert(NOT public.authorize_checkout_receipt('acct_wrong',receipt_test.id('order',1),
  'cs_test_receipt1',NULL,receipt_test.hash('token',1),NULL),'wrong provider account is denied');
SELECT receipt_test.assert(NOT public.authorize_checkout_receipt('acct_1Tm9WRFEzyaKzdmq',receipt_test.id('order',1),
  'cs_test_other',NULL,receipt_test.hash('token',1),NULL),'wrong Session is denied even with a grant');
SELECT receipt_test.assert(NOT (public.bind_guest_checkout_receipt('acct_1Tm9WRFEzyaKzdmq',
  receipt_test.id('order',1),receipt_test.hash('guest',2),NULL,receipt_test.hash('token',3))->>'allowed')::boolean,
  'wrong guest owner cannot mint a grant');
RESET ROLE;
UPDATE public.carts SET checkout_generation=receipt_test.id('newgeneration',1),status='merged'
  WHERE id=receipt_test.id('cart',1);
SET LOCAL ROLE service_role;
SELECT receipt_test.assert(receipt_test.authorize(1,1),'cart generation and login merge do not revoke a receipt');
RESET ROLE;
DELETE FROM public.carts WHERE id=receipt_test.id('cart',1);
SET LOCAL ROLE service_role;
SELECT receipt_test.assert(receipt_test.authorize(1,1),'cart cleanup retains immutable guest receipt ownership');
SELECT receipt_test.assert((receipt_test.bind(1,4,1)->>'allowed')::boolean,'immutable owner proves replay after cart cleanup');
RESET ROLE;
INSERT INTO auth.users(id) VALUES(receipt_test.id('user',1));
UPDATE public.orders SET user_id=receipt_test.id('user',1) WHERE id=receipt_test.id('order',1);
SET LOCAL ROLE service_role;
SELECT receipt_test.assert(NOT receipt_test.authorize(1,1),'guest grant never authorizes account-owned Order');
SELECT receipt_test.assert(receipt_test.authorize(1,NULL,1),'verified owning account authorizes its Order');
SELECT receipt_test.assert(NOT receipt_test.authorize(1,NULL,2),'another account is denied');
RESET ROLE;
UPDATE public.orders SET user_id=NULL WHERE id=receipt_test.id('order',1);
SET LOCAL ROLE service_role;
SELECT receipt_test.assert(NOT receipt_test.authorize(1,1),'ownership version prevents resurrecting an old guest grant');
ROLLBACK;

BEGIN;
SELECT receipt_test.seed(10,10); SELECT receipt_test.seed(11,10);
SET LOCAL ROLE service_role;
SELECT receipt_test.bind(10,10);
SELECT receipt_test.bind(11,11);
SELECT receipt_test.assert(receipt_test.authorize(o,t),'same-owner sibling grants are symmetric across generations')
  FROM unnest(ARRAY[10,11]) o CROSS JOIN unnest(ARRAY[10,11]) t;
SELECT receipt_test.assert((SELECT count(DISTINCT expires_at)=1 FROM private.checkout_receipt_capabilities),
  'siblings share one absolute capability deadline');
RESET ROLE;
SELECT receipt_test.seed(12,12);
SET LOCAL ROLE service_role;
SELECT receipt_test.bind(12,12,10);
SELECT receipt_test.assert(receipt_test.authorize(12,10),'existing token can receive another proven guest Order');
SELECT receipt_test.bind(12,13);
SELECT receipt_test.assert(receipt_test.authorize(12,13),'new owner candidate receives its explicitly proven Order');
SELECT receipt_test.assert(NOT receipt_test.authorize(10,13) AND NOT receipt_test.authorize(11,13),
  'new owner never inherits an existing token other-owner grants');
SELECT receipt_test.assert(NOT receipt_test.authorize(12,11),'sibling does not transitively inherit a foreign owner grant');
ROLLBACK;

BEGIN;
SELECT receipt_test.seed(15); SELECT receipt_test.seed(16,15);
SET LOCAL ROLE service_role; SELECT receipt_test.bind(15,15); RESET ROLE;
DELETE FROM private.checkout_create_receipts WHERE order_id=receipt_test.id('order',16);
SET LOCAL ROLE service_role;
SELECT receipt_test.assert(NOT (receipt_test.bind(16,16,15)->>'allowed')::boolean,
  'valid capability cannot create an unadmitted new Order window');
SELECT receipt_test.assert(NOT EXISTS(SELECT 1 FROM private.checkout_receipt_order_windows
  WHERE order_id=receipt_test.id('order',16)),'admission denial leaves no dangling receipt window');
ROLLBACK;

BEGIN;
SELECT receipt_test.seed(17); SET LOCAL ROLE service_role; SELECT receipt_test.bind(17,17); RESET ROLE;
CREATE TRIGGER no_receipt_replay_write BEFORE INSERT OR UPDATE ON private.checkout_receipt_grants
  FOR EACH STATEMENT EXECUTE FUNCTION receipt_test.reject_write();
CREATE TRIGGER no_receipt_budget_replay_write BEFORE INSERT OR UPDATE ON private.checkout_receipt_budgets
  FOR EACH STATEMENT EXECUTE FUNCTION receipt_test.reject_write();
SET LOCAL ROLE service_role;
SELECT receipt_test.assert((receipt_test.bind(17,18,17)->>'reused')::boolean,
  'committed receipt reuse performs no grant or budget writes');
ROLLBACK;

BEGIN;
SELECT receipt_test.seed(20);
SET LOCAL ROLE service_role;
SELECT receipt_test.assert((receipt_test.bind(20,n)->>'allowed')::boolean,'first five candidate issues admitted')
  FROM generate_series(20,24) n;
SELECT receipt_test.assert(NOT (receipt_test.bind(20,25)->>'allowed')::boolean,'same-Order replays consume issuance budget');
SELECT receipt_test.assert((receipt_test.bind(20,25)->>'retry_after_seconds')::integer BETWEEN 1 AND 60,
  'denial has bounded retry delay');
SELECT receipt_test.assert((receipt_test.bind(20,25,20)->>'reused')::boolean,'valid-token reuse remains free');
RESET ROLE;
SELECT receipt_test.reset_budgets();
SET LOCAL ROLE service_role;
SELECT receipt_test.bind(20,n) FROM generate_series(25,27) n;
SELECT receipt_test.assert(NOT (receipt_test.bind(20,28)->>'allowed')::boolean,'eight active candidates is a hard bound');
SELECT receipt_test.assert(receipt_test.authorize(20,20),'candidate exhaustion never evicts an earlier browser token');
ROLLBACK;

BEGIN;
SELECT receipt_test.seed(21);
SET LOCAL ROLE service_role; SELECT receipt_test.bind(21,n) FROM generate_series(200,204) n; RESET ROLE;
UPDATE private.checkout_receipt_budgets SET accepted_at=ARRAY[
  clock_timestamp()-interval '59 seconds',clock_timestamp()-interval '59 seconds',
  clock_timestamp()-interval '59 seconds',clock_timestamp()-interval '59 seconds',clock_timestamp()-interval '59 seconds'];
SET LOCAL ROLE service_role;
SELECT receipt_test.assert(NOT (receipt_test.bind(21,205)->>'allowed')::boolean,'59-second issues still count');
RESET ROLE;
UPDATE private.checkout_receipt_budgets SET accepted_at=ARRAY[
  clock_timestamp()-interval '61 seconds',clock_timestamp()-interval '61 seconds',
  clock_timestamp()-interval '61 seconds',clock_timestamp()-interval '61 seconds',clock_timestamp()-interval '61 seconds'];
SET LOCAL ROLE service_role;
SELECT receipt_test.assert((receipt_test.bind(21,205)->>'allowed')::boolean,'61-second issues leave the sliding window');
ROLLBACK;

BEGIN;
SELECT receipt_test.seed(n) FROM generate_series(30,40) n;
SET LOCAL ROLE service_role;
SELECT receipt_test.assert((receipt_test.bind(n,n)->>'allowed')::boolean,'first ten aggregate candidates admitted')
  FROM generate_series(30,39) n;
SELECT receipt_test.assert(NOT (receipt_test.bind(40,40)->>'allowed')::boolean,'rotating guests cannot bypass aggregate bound');
SELECT receipt_test.assert((SELECT count(*)=10 FROM private.checkout_receipt_capabilities),'denied issuance creates no candidate');
SELECT receipt_test.assert((SELECT count(*)=10 FROM private.checkout_receipt_order_windows),'denied issuance starts no receipt window');
ROLLBACK;

BEGIN;
SELECT receipt_test.seed(50); SET LOCAL ROLE service_role; SELECT receipt_test.bind(50,50); RESET ROLE;
UPDATE private.checkout_receipt_grants SET revoked_at=now() WHERE order_id=receipt_test.id('order',50);
SET LOCAL ROLE service_role;
SELECT receipt_test.assert(NOT receipt_test.authorize(50,50),'revoked grant is denied');
SELECT receipt_test.assert(NOT (receipt_test.bind(50,51,50)->>'allowed')::boolean,'replay does not revive revoked grant');
RESET ROLE;
-- Test an already-expired immutable record by moving the synthetic clock facts only with triggers disabled.
ALTER TABLE private.checkout_receipt_grants DISABLE TRIGGER USER;
UPDATE private.checkout_receipt_grants SET revoked_at=NULL,created_at=now()-interval '2 hours',expires_at=now()-interval '1 second';
ALTER TABLE private.checkout_receipt_grants ENABLE TRIGGER USER;
SET LOCAL ROLE service_role;
SELECT receipt_test.assert(NOT receipt_test.authorize(50,50),'expired explicit grant is denied');
ROLLBACK;

BEGIN;
SET LOCAL ROLE service_role;
SELECT receipt_test.assert(public.authorize_checkout_receipt('acct_1Tm9WRFEzyaKzdmq',receipt_test.id('order',60),
  'cs_test_receipt60',NULL,NULL,receipt_test.hash('guest',60)),'exact migrated legacy Session accepts original guest proof');
SELECT receipt_test.assert(NOT public.authorize_checkout_receipt('acct_1Tm9WRFEzyaKzdmq',receipt_test.id('order',60),
  'cs_test_receipt60',NULL,NULL,receipt_test.hash('guest',61)),'legacy guest proof does not authorize another guest');
SELECT receipt_test.assert((receipt_test.bind(61,61)->>'allowed')::boolean,'legacy upgrade requires no invented admission');
RESET ROLE;
INSERT INTO auth.users(id) VALUES(receipt_test.id('user',60));
UPDATE public.orders SET user_id=receipt_test.id('user',60) WHERE id=receipt_test.id('order',60);
UPDATE public.orders SET user_id=NULL WHERE id=receipt_test.id('order',60);
UPDATE public.orders SET stripe_checkout_session_id='cs_test_replacement61' WHERE id=receipt_test.id('order',61);
SET LOCAL ROLE service_role;
SELECT receipt_test.assert(NOT public.authorize_checkout_receipt('acct_1Tm9WRFEzyaKzdmq',receipt_test.id('order',60),
  'cs_test_receipt60',NULL,NULL,receipt_test.hash('guest',60)),'ownership round-trip cannot revive legacy guest proof');
SELECT receipt_test.assert(NOT (receipt_test.bind(60,60)->>'allowed')::boolean,
  'ownership round-trip cannot mint its first receipt window from old legacy proof');
SELECT receipt_test.assert(NOT public.authorize_checkout_receipt('acct_1Tm9WRFEzyaKzdmq',receipt_test.id('order',61),
  'cs_test_replacement61',NULL,NULL,receipt_test.hash('guest',61)),'new Session on an old Order cannot opt into legacy access');
ROLLBACK;

-- Once a legacy Order is upgraded, its receipt window replaces the old Cart fallback.
BEGIN;
SET LOCAL ROLE service_role;
SELECT receipt_test.bind(60,60);
UPDATE private.checkout_receipt_order_windows SET revoked_at=now() WHERE order_id=receipt_test.id('order',60);
SELECT receipt_test.assert(NOT public.authorize_checkout_receipt('acct_1Tm9WRFEzyaKzdmq',receipt_test.id('order',60),
  'cs_test_receipt60',NULL,receipt_test.hash('token',60),receipt_test.hash('guest',60)),
  'legacy Cart proof cannot bypass an upgraded revoked receipt window');
ROLLBACK;

BEGIN;
SET LOCAL ROLE service_role; SELECT receipt_test.bind(60,60); RESET ROLE;
ALTER TABLE private.checkout_receipt_order_windows DISABLE TRIGGER USER;
UPDATE private.checkout_receipt_order_windows SET created_at=now()-interval '25 hours',expires_at=now()-interval '1 hour'
  WHERE order_id=receipt_test.id('order',60);
ALTER TABLE private.checkout_receipt_order_windows ENABLE TRIGGER USER;
SET LOCAL ROLE service_role;
SELECT receipt_test.assert(NOT public.authorize_checkout_receipt('acct_1Tm9WRFEzyaKzdmq',receipt_test.id('order',60),
  'cs_test_receipt60',NULL,receipt_test.hash('token',60),receipt_test.hash('guest',60)),
  'legacy Cart proof cannot extend an upgraded expired receipt window');
ROLLBACK;

BEGIN;
SET LOCAL ROLE service_role; SELECT receipt_test.bind(60,60);
SELECT receipt_test.assert(receipt_test.authorize(60,60),'an upgraded legacy Order accepts its valid receipt capability');
SELECT receipt_test.assert(NOT public.authorize_checkout_receipt('acct_1Tm9WRFEzyaKzdmq',receipt_test.id('order',60),
  'cs_test_receipt60',NULL,NULL,receipt_test.hash('guest',60)),
  'legacy Cart proof alone cannot replace a missing capability after upgrade');
UPDATE private.checkout_receipt_grants SET revoked_at=now() WHERE order_id=receipt_test.id('order',60);
SELECT receipt_test.assert(NOT public.authorize_checkout_receipt('acct_1Tm9WRFEzyaKzdmq',receipt_test.id('order',60),
  'cs_test_receipt60',NULL,receipt_test.hash('token',60),receipt_test.hash('guest',60)),
  'legacy Cart proof cannot bypass an upgraded revoked explicit grant');
ROLLBACK;

BEGIN;
SELECT receipt_test.seed(70); SET LOCAL ROLE service_role; SELECT receipt_test.bind(70,70);
DO $$ BEGIN
  BEGIN UPDATE private.checkout_receipt_order_windows SET expires_at=expires_at+interval '1 hour';
    RAISE EXCEPTION 'receipt window unexpectedly mutable'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN UPDATE private.checkout_receipt_cohorts SET expires_at=expires_at+interval '1 hour';
    RAISE EXCEPTION 'receipt cohort unexpectedly mutable'; EXCEPTION WHEN check_violation THEN NULL; END;
  UPDATE private.checkout_receipt_capabilities SET revoked_at=now();
  BEGIN UPDATE private.checkout_receipt_capabilities SET revoked_at=NULL;
    RAISE EXCEPTION 'receipt revocation unexpectedly reversible'; EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
SELECT receipt_test.assert(NOT receipt_test.authorize(70,70),'revoked capability denies all its grants');
ROLLBACK;

BEGIN;
SELECT receipt_test.seed(80); SET LOCAL ROLE service_role; SELECT receipt_test.bind(80,80); RESET ROLE;
ALTER TABLE private.checkout_receipt_capabilities DISABLE TRIGGER USER;
UPDATE private.checkout_receipt_capabilities SET created_at=now()-interval '25 hours',expires_at=now()-interval '1 hour';
ALTER TABLE private.checkout_receipt_capabilities ENABLE TRIGGER USER;
SET LOCAL ROLE service_role;
SELECT receipt_test.assert(NOT receipt_test.authorize(80,80),'expired capability denies a still-future explicit grant');
RESET ROLE;
ALTER TABLE private.checkout_receipt_capabilities DISABLE TRIGGER USER;
UPDATE private.checkout_receipt_capabilities SET created_at=now(),expires_at=now()+interval '24 hours';
ALTER TABLE private.checkout_receipt_capabilities ENABLE TRIGGER USER;
ALTER TABLE private.checkout_receipt_order_windows DISABLE TRIGGER USER;
UPDATE private.checkout_receipt_order_windows SET created_at=now()-interval '25 hours',expires_at=now()-interval '1 hour';
ALTER TABLE private.checkout_receipt_order_windows ENABLE TRIGGER USER;
SET LOCAL ROLE service_role;
SELECT receipt_test.assert(NOT receipt_test.authorize(80,80),'expired Order window denies a still-future capability');
SELECT receipt_test.assert(NOT (receipt_test.bind(80,81)->>'allowed')::boolean,'rotation never restarts an expired Order window');
ROLLBACK;

-- Rotation preserves each Order's original deadline even when a new cohort lives longer.
BEGIN;
SELECT receipt_test.seed(90,90); SELECT receipt_test.seed(91,90);
SET LOCAL ROLE service_role; SELECT receipt_test.bind(90,90); SELECT receipt_test.bind(91,91,90); RESET ROLE;
ALTER TABLE private.checkout_receipt_cohorts DISABLE TRIGGER USER;
ALTER TABLE private.checkout_receipt_capabilities DISABLE TRIGGER USER;
ALTER TABLE private.checkout_receipt_order_windows DISABLE TRIGGER USER;
ALTER TABLE private.checkout_receipt_grants DISABLE TRIGGER USER;
UPDATE private.checkout_receipt_cohorts SET created_at=now()-interval '23 hours',expires_at=now()+interval '1 hour';
UPDATE private.checkout_receipt_capabilities SET created_at=now()-interval '23 hours',expires_at=now()+interval '1 hour';
UPDATE private.checkout_receipt_order_windows SET created_at=now()-interval '3 hours',expires_at=now()+interval '21 hours';
UPDATE private.checkout_receipt_grants SET created_at=now()-interval '3 hours',expires_at=now()+interval '1 hour';
ALTER TABLE private.checkout_receipt_cohorts ENABLE TRIGGER USER;
ALTER TABLE private.checkout_receipt_capabilities ENABLE TRIGGER USER;
ALTER TABLE private.checkout_receipt_order_windows ENABLE TRIGGER USER;
ALTER TABLE private.checkout_receipt_grants ENABLE TRIGGER USER;
SET LOCAL ROLE service_role;
SELECT receipt_test.assert((receipt_test.bind(91,92,90)->>'expires_at')::timestamptz=now()+interval '1 hour',
  'near-expiry capability reuse retains its absolute cookie deadline');
RESET ROLE;
ALTER TABLE private.checkout_receipt_cohorts DISABLE TRIGGER USER;
ALTER TABLE private.checkout_receipt_capabilities DISABLE TRIGGER USER;
ALTER TABLE private.checkout_receipt_grants DISABLE TRIGGER USER;
UPDATE private.checkout_receipt_cohorts SET created_at=now()-interval '25 hours',expires_at=now()-interval '1 hour';
UPDATE private.checkout_receipt_capabilities SET created_at=now()-interval '25 hours',expires_at=now()-interval '1 hour';
UPDATE private.checkout_receipt_grants SET expires_at=now()-interval '1 hour';
ALTER TABLE private.checkout_receipt_cohorts ENABLE TRIGGER USER;
ALTER TABLE private.checkout_receipt_capabilities ENABLE TRIGGER USER;
ALTER TABLE private.checkout_receipt_grants ENABLE TRIGGER USER;
SET LOCAL ROLE service_role;
SELECT receipt_test.assert((receipt_test.bind(91,92,90)->>'allowed')::boolean,'expired capability rotates only after renewed guest ownership proof');
SELECT receipt_test.assert((SELECT expires_at=now()+interval '21 hours' FROM private.checkout_receipt_grants
  WHERE order_id=receipt_test.id('order',91) AND token_hash=receipt_test.hash('token',92)),
  'fresh cohort cannot extend the original Order receipt window');
SELECT receipt_test.assert(NOT receipt_test.authorize(91,90) AND receipt_test.authorize(91,92),
  'rotation leaves old capability expired while authorizing only the remaining Order window');
ROLLBACK;

-- No browser role can call a privileged receipt RPC or read its private storage.
SELECT receipt_test.assert(NOT has_function_privilege(role_name,
  'public.bind_guest_checkout_receipt(text,uuid,text,text,text)','EXECUTE')
  AND NOT has_function_privilege(role_name,'public.authorize_checkout_receipt(text,uuid,text,uuid,text,text)','EXECUTE'),
  'receipt RPC is service-only') FROM unnest(ARRAY['anon','authenticated']) role_name;
SELECT receipt_test.assert(c.relrowsecurity AND c.relforcerowsecurity,'private receipt table forces RLS')
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='private' AND c.relname LIKE 'checkout_receipt_%' AND c.relkind='r';
DO $$ DECLARE role_name text; BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
    EXECUTE 'SET LOCAL ROLE ' || quote_ident(role_name);
    BEGIN PERFORM 1 FROM private.checkout_receipt_grants;
      RAISE EXCEPTION 'receipt storage unexpectedly readable'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN PERFORM public.authorize_checkout_receipt('acct_1Tm9WRFEzyaKzdmq',gen_random_uuid(),'cs_test_unknown',NULL,NULL,NULL);
      RAISE EXCEPTION 'receipt authorization unexpectedly callable'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    EXECUTE 'RESET ROLE';
  END LOOP;
END $$;
