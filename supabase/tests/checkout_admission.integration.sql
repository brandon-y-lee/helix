-- Synthetic fixtures and public RPC assertions; never run against a provider database.
CREATE SCHEMA admission_test;
CREATE FUNCTION admission_test.assert(ok boolean, description text) RETURNS void
LANGUAGE plpgsql AS $$ BEGIN
  IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %', description; END IF;
END $$;
SELECT admission_test.assert(
  to_regprocedure('public.admit_checkout_creation(text,uuid,uuid,text)') IS NOT NULL,
  'shared checkout admission exists');

CREATE FUNCTION admission_test.id(kind text, n integer) RETURNS uuid LANGUAGE sql IMMUTABLE
AS $$ SELECT md5('synthetic-admission:' || kind || ':' || n)::uuid $$;
CREATE FUNCTION admission_test.key(n integer) RETURNS text LANGUAGE sql IMMUTABLE
AS $$ SELECT 'stripe-session:' || admission_test.id('order', n) || ':initial' $$;
CREATE FUNCTION admission_test.seed(n integer, owner_number integer DEFAULT NULL) RETURNS void
LANGUAGE plpgsql AS $$ DECLARE owner_id uuid; BEGIN
  IF owner_number IS NOT NULL THEN
    owner_id := admission_test.id('user', owner_number);
    INSERT INTO auth.users(id) VALUES (owner_id) ON CONFLICT DO NOTHING;
    UPDATE public.carts SET status = 'abandoned' WHERE user_id = owner_id AND status = 'active';
  END IF;
  INSERT INTO public.carts(id, user_id, guest_token_hash, expires_at, checkout_generation)
  VALUES (admission_test.id('cart', n), owner_id,
    CASE WHEN owner_id IS NULL THEN md5('guest:' || n) || md5('guest:' || n) END,
    now() + interval '1 day', admission_test.id('generation', n));
  INSERT INTO public.orders(id, order_number, user_id, cart_id, merchandise_subtotal_cents,
    total_cents, idempotency_key, checkout_generation, checkout_attempt_token,
    checkout_attempt_started_at, metadata)
  VALUES (admission_test.id('order', n), 'HX-FIXTURE-' || n, owner_id,
    admission_test.id('cart', n), 2500, 2500, 'fixture:' || n,
    admission_test.id('generation', n), admission_test.id('claim', n), now(),
    jsonb_build_object('stripe_idempotency_key', admission_test.key(n),
      'stripe_creation_outcome', 'creating'));
END $$;
CREATE FUNCTION admission_test.admit(account_id text, n integer) RETURNS jsonb LANGUAGE sql
AS $$ SELECT public.admit_checkout_creation(account_id, admission_test.id('order', n),
  admission_test.id('claim', n), admission_test.key(n)) $$;
CREATE FUNCTION admission_test.session(n integer) RETURNS jsonb LANGUAGE sql
AS $$ SELECT jsonb_build_object('kind', 'session', 'id', 'cs_test_fixture' || n,
  'status', 'open', 'payment_status', 'unpaid',
  'expires_at', extract(epoch from now() + interval '30 minutes')::bigint,
  'url', 'https://checkout.stripe.com/c/pay/cs_test_fixture' || n,
  'livemode', false, 'payment_method_types', jsonb_build_array('card')) $$;
CREATE FUNCTION admission_test.refresh(account_id text, n integer) RETURNS jsonb LANGUAGE sql
AS $$ SELECT public.claim_checkout_refresh(account_id, 'session',
  admission_test.id('order', n), NULL, 'cs_test_fixture' || n) $$;
GRANT USAGE ON SCHEMA admission_test TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA admission_test TO service_role;

-- Each quota scenario rolls back its synthetic fixtures and admissions independently.
BEGIN;
SELECT admission_test.seed(n, 1) FROM generate_series(1, 6) n;
SET LOCAL ROLE service_role;
SELECT admission_test.assert((admission_test.admit('acct_owner', n)->>'allowed')::boolean,
  'first five attempts from one Account Holder are admitted') FROM generate_series(1, 5) n;
SELECT admission_test.assert(NOT (admission_test.admit('acct_owner', 6)->>'allowed')::boolean,
  'sixth attempt is denied across separate Carts owned by the same Account Holder');
SELECT admission_test.assert((admission_test.admit('acct_owner', 6)->>'retry_after_seconds')::integer BETWEEN 1 AND 60,
  'denied creation supplies a bounded retry delay');
SELECT admission_test.assert((admission_test.admit('acct_owner', 1)->>'replay')::boolean,
  'same attempt replays even while the owner quota is exhausted');
RESET ROLE;
UPDATE public.orders SET checkout_attempt_token = admission_test.id('replacement-claim', 1)
  WHERE id = admission_test.id('order', 1);
SET LOCAL ROLE service_role;
SELECT admission_test.assert((public.admit_checkout_creation('acct_owner', admission_test.id('order', 1),
  admission_test.id('replacement-claim', 1), admission_test.key(1))->>'replay')::boolean,
  'reclaiming the same durable attempt does not spend another creation admission');
ROLLBACK;

BEGIN;
SELECT admission_test.seed(n) FROM generate_series(11, 21) n;
SET LOCAL ROLE service_role;
SELECT admission_test.assert((admission_test.admit('acct_rotating', n)->>'allowed')::boolean,
  'guest attempts below the shared account ceiling are admitted') FROM generate_series(11, 20) n;
SELECT admission_test.assert(NOT (admission_test.admit('acct_rotating', 21)->>'allowed')::boolean,
  'rotating guest cookies cannot bypass the ten-attempt account ceiling');
SELECT admission_test.assert((admission_test.admit('acct_rotating', 11)->>'replay')::boolean,
  'an admitted attempt can replay with a full shared quota');
SELECT admission_test.assert((admission_test.admit('acct_other', 21)->>'allowed')::boolean,
  'a different Stripe account has a separate quota');
ROLLBACK;

BEGIN;
SELECT admission_test.seed(n, 30) FROM generate_series(31, 36) n;
SELECT admission_test.seed(n) FROM generate_series(37, 41) n;
SET LOCAL ROLE service_role;
SELECT admission_test.admit('acct_atomic', n) FROM generate_series(31, 35) n;
SELECT admission_test.assert(NOT (admission_test.admit('acct_atomic', 36)->>'allowed')::boolean,
  'owner denial refuses a fresh attempt');
SELECT admission_test.assert((admission_test.admit('acct_atomic', n)->>'allowed')::boolean,
  'owner denial does not consume one of the remaining aggregate slots') FROM generate_series(37, 41) n;
ROLLBACK;

BEGIN;
SELECT admission_test.seed(n) FROM generate_series(140, 149) n;
SELECT admission_test.seed(n, 150) FROM generate_series(150, 154) n;
SET LOCAL ROLE service_role;
SELECT admission_test.admit('acct_aggregateatomic', n) FROM generate_series(140, 149) n;
SELECT admission_test.assert(NOT (admission_test.admit('acct_aggregateatomic', 150)->>'allowed')::boolean,
  'aggregate denial refuses a new owner attempt');
RESET ROLE;
UPDATE private.checkout_admission_budgets SET accepted_at = ARRAY(
  SELECT at_time - interval '61 seconds' FROM unnest(accepted_at) at_time)
  WHERE account_id = 'acct_aggregateatomic' AND budget_key = 'create:account';
SET LOCAL ROLE service_role;
SELECT admission_test.assert((admission_test.admit('acct_aggregateatomic', n)->>'allowed')::boolean,
  'aggregate denial does not partially spend the denied owner budget') FROM generate_series(150, 154) n;
ROLLBACK;

BEGIN;
SELECT admission_test.seed(n, 50) FROM generate_series(51, 56) n;
SET LOCAL ROLE service_role;
SELECT admission_test.admit('acct_window', n) FROM generate_series(51, 55) n;
RESET ROLE;
-- Advance the persisted admission timestamps, never wait a minute in a unit runner.
UPDATE private.checkout_admission_budgets SET accepted_at = ARRAY(
  SELECT clock_timestamp() - interval '59 seconds' FROM unnest(accepted_at))
  WHERE account_id = 'acct_window';
SET LOCAL ROLE service_role;
SELECT admission_test.assert(NOT (admission_test.admit('acct_window', 56)->>'allowed')::boolean,
  'admissions fifty-nine seconds old still count against the exact sliding window');
RESET ROLE;
UPDATE private.checkout_admission_budgets SET accepted_at = ARRAY(
  SELECT clock_timestamp() - interval '61 seconds' FROM unnest(accepted_at))
  WHERE account_id = 'acct_window';
SET LOCAL ROLE service_role;
SELECT admission_test.assert((admission_test.admit('acct_window', 51)->>'replay')::boolean,
  'an admitted attempt remains a free durable replay after its quota window expires');
SELECT admission_test.assert((admission_test.admit('acct_window', 56)->>'allowed')::boolean,
  'admissions older than sixty seconds leave the exact sliding window');
ROLLBACK;

BEGIN;
SELECT admission_test.seed(61);
SET LOCAL ROLE service_role;
DO $$ BEGIN
  BEGIN
    IF (public.admit_checkout_creation('acct_invalid', admission_test.id('order', 61),
      admission_test.id('wrong-claim', 61), admission_test.key(61))->>'allowed')::boolean THEN
      RAISE EXCEPTION 'incorrectly admitted a stale claim' USING ERRCODE='ZX001';
    END IF;
  EXCEPTION WHEN SQLSTATE '22023' OR SQLSTATE 'P0001' THEN NULL; END;
  BEGIN
    IF (public.admit_checkout_creation('acct_invalid', admission_test.id('order', 61),
      admission_test.id('claim', 61), admission_test.key(62))->>'allowed')::boolean THEN
      RAISE EXCEPTION 'incorrectly admitted an unprepared idempotency key' USING ERRCODE='ZX001';
    END IF;
  EXCEPTION WHEN SQLSTATE '22023' OR SQLSTATE 'P0001' THEN NULL; END;
END $$;
SELECT admission_test.assert((admission_test.admit('acct_invalid', 61)->>'allowed')::boolean,
  'rejected stale claims do not prevent the valid prepared claim');
ROLLBACK;

BEGIN;
SELECT admission_test.seed(71);
UPDATE public.orders SET stripe_checkout_session_id = 'cs_test_fixture71'
  WHERE id = admission_test.id('order', 71);
SET LOCAL ROLE service_role;
DO $$ DECLARE denied boolean := false; BEGIN
  BEGIN
    denied := NOT (admission_test.admit('acct_attached', 71)->>'allowed')::boolean;
  EXCEPTION WHEN SQLSTATE '22023' OR SQLSTATE 'P0001' THEN denied := true; END;
  PERFORM admission_test.assert(denied, 'an already attached Session cannot receive a new creation admission');
END $$;
ROLLBACK;

BEGIN;
SELECT admission_test.seed(81);
SET LOCAL ROLE service_role;
SELECT admission_test.admit('acct_cache', 81);
RESET ROLE;
UPDATE public.orders SET stripe_checkout_session_id = 'cs_test_fixture81',
  metadata = metadata || '{"stripe_creation_outcome":"attached"}'::jsonb
  WHERE id = admission_test.id('order', 81);
SET LOCAL ROLE service_role;
SELECT admission_test.assert(public.cache_created_checkout_session('acct_cache', admission_test.id('order', 81),
  admission_test.id('claim', 81), admission_test.key(81), admission_test.session(81)),
  'a created and attached Session can seed its replay cache without a provider refresh');
SELECT admission_test.assert(NOT EXISTS (SELECT 1 FROM private.checkout_admission_budgets
  WHERE account_id = 'acct_cache' AND budget_key = 'refresh:account'),
  'seeding a newly created Session creates no provider refresh budget entry');
SELECT admission_test.assert(NOT (admission_test.refresh('acct_cache', 81)->>'allowed')::boolean
  AND admission_test.refresh('acct_cache', 81)->'cached' = admission_test.session(81),
  'a newly created Session returns its bounded cached state during the cooldown');
DO $$ DECLARE response jsonb; BEGIN
  response := public.claim_checkout_refresh('acct_cache', 'attempt', admission_test.id('order', 81),
    admission_test.id('claim', 81), admission_test.key(81));
  PERFORM admission_test.assert(NOT (response->>'allowed')::boolean,
    'Session and durable attempt share one cooldown after attachment');
END $$;
ROLLBACK;

BEGIN;
SELECT admission_test.seed(131);
SET LOCAL ROLE service_role;
SELECT admission_test.admit('acct_attachrace', 131);
RESET ROLE;
-- Model the committed attachment before the separate creation-cache RPC arrives.
UPDATE public.orders SET stripe_checkout_session_id = 'cs_test_fixture131',
  metadata = metadata || '{"stripe_creation_outcome":"attached"}'::jsonb
  WHERE id = admission_test.id('order', 131);
SET LOCAL ROLE service_role;
DO $$ DECLARE session_claim jsonb; attempt_claim jsonb; completed jsonb; BEGIN
  session_claim := admission_test.refresh('acct_attachrace', 131);
  PERFORM admission_test.assert((session_claim->>'allowed')::boolean,
    'a newly attached Session can claim a refresh before creation cache publication');
  attempt_claim := public.claim_checkout_refresh('acct_attachrace', 'attempt', admission_test.id('order', 131),
    admission_test.id('claim', 131), admission_test.key(131));
  PERFORM admission_test.assert(NOT (attempt_claim->>'allowed')::boolean,
    'Session and attempt coalesce immediately after attachment before cache publication');
  PERFORM admission_test.assert(public.cache_created_checkout_session('acct_attachrace', admission_test.id('order', 131),
    admission_test.id('claim', 131), admission_test.key(131), admission_test.session(131)),
    'creation cache publication can complete while a Session refresh is in flight');
  completed := admission_test.session(131) || '{"status":"complete","payment_status":"paid","url":null}'::jsonb;
  PERFORM admission_test.assert(public.finish_checkout_refresh('acct_attachrace', 'session',
    admission_test.id('order', 131), NULL, 'cs_test_fixture131', (session_claim->>'token')::uuid, completed),
    'creation cache publication preserves the original Session refresh lease');
  PERFORM admission_test.assert(public.cache_created_checkout_session('acct_attachrace', admission_test.id('order', 131),
    admission_test.id('claim', 131), admission_test.key(131), admission_test.session(131)),
    'a delayed duplicate creation-cache publication remains retry safe');
  PERFORM admission_test.assert(admission_test.refresh('acct_attachrace', 131)->'cached' = completed,
    'delayed creation-cache publication cannot overwrite a newer verified completed snapshot');
END $$;
ROLLBACK;

BEGIN;
SELECT admission_test.seed(91);
UPDATE public.orders SET stripe_checkout_session_id = 'cs_test_fixture91'
  WHERE id = admission_test.id('order', 91);
SET LOCAL ROLE service_role;
DO $$ DECLARE claim jsonb; token uuid; BEGIN
  claim := admission_test.refresh('acct_refresh', 91);
  token := (claim->>'token')::uuid;
  PERFORM admission_test.assert((claim->>'allowed')::boolean AND token IS NOT NULL,
    'a Session without a cached state obtains one refresh lease');
  PERFORM admission_test.assert(NOT (admission_test.refresh('acct_refresh', 91)->>'allowed')::boolean,
    'another request cannot refresh an in-flight Session');
  PERFORM admission_test.assert(NOT public.finish_checkout_refresh('acct_refresh', 'session',
    admission_test.id('order', 91), NULL, 'cs_test_fixture91', admission_test.id('wrong-refresh', 91),
    admission_test.session(91)), 'a stale refresh token cannot finish another request');
  PERFORM admission_test.assert(public.finish_checkout_refresh('acct_refresh', 'session',
    admission_test.id('order', 91), NULL, 'cs_test_fixture91', token, admission_test.session(91)),
    'the lease owner can store minimal Session state');
  PERFORM admission_test.assert(admission_test.refresh('acct_refresh', 91)->'cached' = admission_test.session(91),
    'a coalesced request receives the authoritative cached snapshot');
END $$;
RESET ROLE;
UPDATE private.checkout_refresh_state SET last_started_at = now() - interval '6 seconds'
  WHERE account_id = 'acct_refresh';
SET LOCAL ROLE service_role;
DO $$ DECLARE claim jsonb; BEGIN
  claim := admission_test.refresh('acct_refresh', 91);
  PERFORM admission_test.assert((claim->>'allowed')::boolean, 'a refresh is admitted after five seconds');
  PERFORM admission_test.assert(public.finish_checkout_refresh('acct_refresh', 'session',
    admission_test.id('order', 91), NULL, 'cs_test_fixture91', (claim->>'token')::uuid, NULL),
    'a provider error releases its matching lease');
  PERFORM admission_test.assert(NOT (admission_test.refresh('acct_refresh', 91)->>'allowed')::boolean
    AND admission_test.refresh('acct_refresh', 91)->'cached' = admission_test.session(91),
    'a failed refresh retains cached state and still consumes the cooldown');
END $$;
ROLLBACK;

BEGIN;
SELECT admission_test.seed(101);
SELECT admission_test.seed(102);
UPDATE public.orders SET stripe_checkout_session_id = 'cs_test_fixture101'
  WHERE id = admission_test.id('order', 101);
SET LOCAL ROLE service_role;
DO $$ DECLARE denied boolean := false; BEGIN
  BEGIN
    denied := NOT (public.claim_checkout_refresh('acct_unowned', 'session', admission_test.id('order', 102),
      NULL, 'cs_test_fixture101')->>'allowed')::boolean;
  EXCEPTION WHEN SQLSTATE '22023' OR SQLSTATE 'P0001' THEN denied := true; END;
  PERFORM admission_test.assert(denied, 'a guessed Session ID cannot refresh a different Order');
  denied := false;
  BEGIN
    denied := NOT (public.claim_checkout_refresh('acct_unowned', 'attempt', admission_test.id('order', 102),
      admission_test.id('claim', 102), admission_test.key(102))->>'allowed')::boolean;
  EXCEPTION WHEN SQLSTATE '22023' OR SQLSTATE 'P0001' THEN denied := true; END;
  PERFORM admission_test.assert(denied, 'an attempt without creation admission cannot make a provider request');
END $$;
ROLLBACK;

BEGIN;
SELECT admission_test.seed(111);
UPDATE public.orders SET stripe_checkout_session_id = 'cs_test_fixture111'
  WHERE id = admission_test.id('order', 111);
CREATE TEMP TABLE lease_fixture(token uuid);
GRANT ALL ON lease_fixture TO service_role;
SET LOCAL ROLE service_role;
INSERT INTO lease_fixture SELECT (admission_test.refresh('acct_lease', 111)->>'token')::uuid;
DO $$ DECLARE denied boolean := false; BEGIN
  BEGIN
    denied := NOT public.finish_checkout_refresh('acct_lease', 'session', admission_test.id('order', 111),
      NULL, 'cs_test_fixture111', (SELECT token FROM lease_fixture),
      admission_test.session(111) || '{"customer_email":"synthetic@example.invalid"}'::jsonb);
  EXCEPTION WHEN SQLSTATE '22023' OR SQLSTATE 'P0001' THEN denied := true; END;
  PERFORM admission_test.assert(denied, 'cached snapshots reject extra personal data fields');
  denied := false;
  BEGIN
    denied := NOT public.finish_checkout_refresh('acct_lease', 'session', admission_test.id('order', 111),
      NULL, 'cs_test_fixture111', (SELECT token FROM lease_fixture),
      admission_test.session(111) || '{"livemode":true}'::jsonb);
  EXCEPTION WHEN SQLSTATE '22023' OR SQLSTATE 'P0001' THEN denied := true; END;
  PERFORM admission_test.assert(denied, 'sandbox refresh cache rejects a live Session snapshot');
END $$;
RESET ROLE;
UPDATE private.checkout_refresh_state SET lease_until = now() - interval '1 second'
  WHERE account_id = 'acct_lease';
SET LOCAL ROLE service_role;
SELECT admission_test.assert(NOT public.finish_checkout_refresh('acct_lease', 'session',
  admission_test.id('order', 111), NULL, 'cs_test_fixture111', (SELECT token FROM lease_fixture),
  admission_test.session(111)), 'an expired lease cannot write even with its formerly matching token');
ROLLBACK;

BEGIN;
SELECT admission_test.seed(121);
UPDATE public.orders SET stripe_checkout_session_id = 'cs_test_fixture121'
  WHERE id = admission_test.id('order', 121);
CREATE TEMP TABLE replaced_lease_fixture(token uuid);
GRANT ALL ON replaced_lease_fixture TO service_role;
SET LOCAL ROLE service_role;
INSERT INTO replaced_lease_fixture SELECT (admission_test.refresh('acct_replacedlease', 121)->>'token')::uuid;
RESET ROLE;
UPDATE private.checkout_refresh_state SET lease_until = now() - interval '1 second',
  last_started_at = now() - interval '6 seconds' WHERE account_id = 'acct_replacedlease';
SET LOCAL ROLE service_role;
DO $$ DECLARE claim jsonb; completed jsonb; BEGIN
  claim := admission_test.refresh('acct_replacedlease', 121);
  completed := admission_test.session(121) || '{"status":"complete","payment_status":"paid","url":null}'::jsonb;
  PERFORM admission_test.assert((claim->>'allowed')::boolean
    AND (claim->>'token')::uuid IS DISTINCT FROM (SELECT token FROM replaced_lease_fixture),
    'an expired refresh is replaced by a new lease token');
  PERFORM admission_test.assert(public.finish_checkout_refresh('acct_replacedlease', 'session',
    admission_test.id('order', 121), NULL, 'cs_test_fixture121', (claim->>'token')::uuid, completed),
    'the replacement lease can cache the newer completed payment state');
  PERFORM admission_test.assert(NOT public.finish_checkout_refresh('acct_replacedlease', 'session',
    admission_test.id('order', 121), NULL, 'cs_test_fixture121', (SELECT token FROM replaced_lease_fixture),
    admission_test.session(121)), 'late completion of the old lease cannot overwrite the replacement result');
  PERFORM admission_test.assert(admission_test.refresh('acct_replacedlease', 121)->'cached' = completed,
    'the newer completed payment state remains cached after the stale completion');
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE service_role;
SELECT admission_test.assert((public.claim_checkout_refresh('acct_refreshlimit', 'shipping_rate', NULL, NULL,
  'shr_fixture' || n)->>'allowed')::boolean, 'refresh below the account ceiling is admitted')
  FROM generate_series(1, 30) n;
SELECT admission_test.assert(NOT (public.claim_checkout_refresh('acct_refreshlimit', 'shipping_rate', NULL, NULL,
  'shr_fixture31')->>'allowed')::boolean, 'a thirty-first distinct provider refresh is denied');
ROLLBACK;

DO $$ DECLARE signature text; role_name text; relation_name text; BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'public.admit_checkout_creation(text,uuid,uuid,text)',
    'public.claim_checkout_refresh(text,text,uuid,uuid,text)',
    'public.finish_checkout_refresh(text,text,uuid,uuid,text,uuid,jsonb)',
    'public.cache_created_checkout_session(text,uuid,uuid,text,jsonb)'
  ] LOOP
    FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      PERFORM admission_test.assert(NOT has_function_privilege(role_name, signature, 'EXECUTE'),
        role_name || ' cannot invoke payment admission RPC ' || signature);
    END LOOP;
    PERFORM admission_test.assert(has_function_privilege('service_role', signature, 'EXECUTE'),
      'trusted server can invoke ' || signature);
    PERFORM admission_test.assert((SELECT proconfig = ARRAY['search_path=""']
      FROM pg_proc WHERE oid = signature::regprocedure), 'payment RPC has a fixed empty search path');
  END LOOP;
  FOREACH relation_name IN ARRAY ARRAY['private.checkout_create_receipts',
    'private.checkout_admission_budgets', 'private.checkout_refresh_state'] LOOP
    PERFORM admission_test.assert((SELECT relrowsecurity FROM pg_class WHERE oid = relation_name::regclass),
      'admission data retains RLS defense in depth');
    FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      PERFORM admission_test.assert(NOT has_table_privilege(role_name, relation_name, 'SELECT,INSERT,UPDATE,DELETE'),
        role_name || ' cannot access admission data');
    END LOOP;
  END LOOP;
END $$;
