-- Synthetic records in a disposable parent-shaped database. The harness rolls
-- back the examples together, including the original sandbox coexistence probe.
BEGIN;
CREATE FUNCTION pg_temp.check_settlement(ok boolean, message text) RETURNS void
LANGUAGE plpgsql AS $test$
BEGIN
  IF ok IS NOT TRUE THEN RAISE EXCEPTION 'Live settlement proof failed: %',message; END IF;
END;
$test$;

DO $test$
DECLARE
  mer constant text := 'acct_591MerchantA'; other constant text := 'acct_591MerchantB';
  o constant uuid := '59110000-0000-4000-8000-000000000001';
  failed constant uuid := '59110000-0000-4000-8000-000000000002';
  no_send constant uuid := '59110000-0000-4000-8000-000000000003';
  user_id_ constant uuid := '59110000-0000-4000-8000-000000000099';
  sess text := 'cs_live_'||replace(o::text,'-','');
  failed_session text := 'cs_live_'||replace(failed::text,'-','');
  lease1 constant uuid := '59110000-0000-4000-8000-000000000011';
  lease2 constant uuid := '59110000-0000-4000-8000-000000000012';
  lease3 constant uuid := '59110000-0000-4000-8000-000000000013';
  original_event constant text := 'evt_s2coexistence';
  altered jsonb; base_terms jsonb; rejected boolean; f jsonb; nonce_ uuid; fail_facts jsonb; pi text; stored jsonb; value_before integer;
BEGIN
  PERFORM pg_temp.seed_live_checkout(mer,o,user_id_,NULL,false,true);
  PERFORM pg_temp.seed_live_checkout(mer,failed,user_id_);
  PERFORM pg_temp.seed_live_checkout(mer,no_send,user_id_,NULL,false,false);
  SELECT terms INTO STRICT base_terms FROM private.live_checkout_bindings WHERE attempt_id=o;
  FOR altered IN SELECT unnest(ARRAY[
      base_terms-'couponId', base_terms||'{"couponId":"promo_other"}', base_terms-'customerId',
      base_terms-'shippingRateId', base_terms||'{"shippingRateId":17}',base_terms||'{"customerId":17}',
      base_terms||'{"bindingNonce":"00000000-0000-0000-0000-000000000000"}',
      base_terms||'{"sessionId":"cs_live_unrelated"}',base_terms||'{"automaticTaxEnabled":"false"}'])
  LOOP
    rejected:=false;
    BEGIN
      INSERT INTO private.live_checkout_bindings(account_id,order_id,attempt_id,idempotency_key,terms,binding_nonce)
      SELECT account_id,order_id,attempt_id,idempotency_key,altered,binding_nonce
        FROM private.live_checkout_bindings WHERE attempt_id=o;
    EXCEPTION WHEN raise_exception THEN
      rejected:=SQLERRM='Live binding does not match the original checkout contract';
    END;
    PERFORM pg_temp.check_settlement(rejected,'invalid original live terms must be rejected before uniqueness');
  END LOOP;
  INSERT INTO public.stripe_webhook_events(stripe_event_id,type,payload) VALUES(original_event,'checkout.session.completed','{}');
  SELECT count(*) INTO value_before FROM private.email_intents WHERE purpose='order_confirmation';
  SELECT (public.read_pending_live_checkout_contract(mer,o,o)->>'bindingNonce')::uuid INTO nonce_;
  PERFORM pg_temp.check_settlement(nonce_ IS NOT NULL AND public.read_live_checkout_order_id(mer,sess) IS NULL, 'lost-response precursor');
  PERFORM pg_temp.check_settlement(public.read_pending_live_checkout_contract(other,o,o) IS NULL AND
    public.read_pending_live_checkout_contract(mer,no_send,no_send) IS NULL, 'merchant and send-started gates');
  PERFORM pg_temp.check_settlement(NOT public.bind_recovered_live_checkout_session(mer,o,o,sess,lease2)
    AND NOT public.bind_recovered_live_checkout_session(other,o,o,sess,nonce_)
    AND NOT public.bind_recovered_live_checkout_session(mer,o,o,'cs_test_sandbox',nonce_),
    'wrong nonce/account/mode cannot bind');
  PERFORM pg_temp.check_settlement(public.bind_recovered_live_checkout_session(mer,o,o,sess,nonce_) AND
    public.bind_recovered_live_checkout_session(mer,o,o,sess,nonce_) AND NOT
    public.bind_recovered_live_checkout_session(mer,o,o,'cs_live_other',nonce_), 'one immutable session');
  PERFORM pg_temp.check_settlement(public.read_live_checkout_order_id(mer,sess)=o AND
    public.read_live_checkout_payment_contract(mer,o,sess)->>'environment'='live' AND
    public.read_live_checkout_payment_contract(other,o,sess) IS NULL,'trusted local identity and terms');
  f:=pg_temp.live_checkout_facts(o); pi:=f->>'paymentIntentId';
  PERFORM pg_temp.check_settlement(public.finalize_live_checkout_payment(other,o,o,sess,f)='unmatched' AND
    public.finalize_live_checkout_payment(mer,o,o,sess,f||'{"shippingCents":99}')='conflict' AND
    public.finalize_live_checkout_payment(mer,o,o,sess,f||'{"totalCents":1}')='conflict' AND
    public.finalize_live_checkout_payment(mer,o,o,sess,f||'{"totalCents":"2500"}')='conflict' AND
    public.finalize_live_checkout_payment(mer,o,o,sess,f||'{"shippingAddress":null}')='conflict',
    'bad merchant, amount or physical address never settles');
  PERFORM pg_temp.check_settlement((SELECT status='pending_payment' FROM public.orders WHERE id=o),'unchanged after disputed facts');
  PERFORM pg_temp.check_settlement(public.finalize_live_checkout_payment(mer,o,o,sess,f)='paid','verified payment');
  PERFORM pg_temp.check_settlement(public.finalize_live_checkout_payment(mer,o,o,sess,f)='already_paid' AND
    public.finalize_live_checkout_payment(mer,o,o,sess,f||'{"paymentIntentId":"pi_different"}')='conflict' AND
    public.record_live_checkout_unpaid(mer,o,o,sess,'expired')='already_paid','replays cannot replace settled facts');
  PERFORM pg_temp.check_settlement((SELECT o1.status='paid' AND a.status='paid' AND o1.paid_at IS NOT NULL
    AND o1.stripe_checkout_session_id IS NULL AND a.stripe_payment_intent_id IS NULL AND o1.reward_points_earned=0
    AND o1.shipping_address=f->'shippingAddress' AND o1.billing_address IS DISTINCT FROM o1.shipping_address
    FROM public.orders o1 JOIN public.payment_attempts a ON a.order_id=o1.id WHERE o1.id=o), 'canonical paid rows and physical delivery');
  PERFORM pg_temp.check_settlement((SELECT count(*) FROM private.email_intents WHERE purpose='order_confirmation')=value_before,
    'live payment cannot enqueue sandbox mail');
  PERFORM pg_temp.check_settlement(public.read_live_checkout_refund_target(other,pi) IS NULL AND
    public.record_live_checkout_refund(mer,pi,'ch_s2refund',2501,'USD')='conflict' AND
    public.record_live_checkout_refund(mer,pi,'ch_s2refund',800,'EUR')='conflict', 'validated refund identity/amount/currency');
  PERFORM pg_temp.check_settlement(public.record_live_checkout_refund(mer,pi,'ch_s2refund',800,'USD')='partial','partial amount recorded');
  PERFORM pg_temp.check_settlement((public.read_live_checkout_refund_target(mer,pi)->>'refundedCents')::integer=800 AND
    public.record_live_checkout_refund(mer,pi,'ch_s2refund',800,'USD')='already_recorded' AND
    public.record_live_checkout_refund(mer,pi,'ch_s2refund',100,'USD')='conflict','partial refund high-water mark');
  PERFORM pg_temp.check_settlement(public.record_live_checkout_refund(mer,pi,'ch_other',2500,'USD')='conflict' AND
    public.record_live_checkout_refund(mer,pi,'ch_s2refund',2500,'USD')='refunded' AND
    public.finalize_live_checkout_payment(mer,o,o,sess,f)='refunded' AND
    public.record_live_checkout_refund(mer,pi,'ch_s2refund',2500,'USD')='already_recorded','full refund preserves terminal state');
  fail_facts:=pg_temp.live_checkout_facts(failed);
  PERFORM pg_temp.check_settlement(public.record_live_checkout_unpaid(mer,failed,failed,failed_session,'expired')='recorded' AND
    public.record_live_checkout_unpaid(mer,failed,failed,failed_session,'expired')='already_recorded' AND
    public.finalize_live_checkout_payment(mer,failed,failed,failed_session,fail_facts)='conflict','contradictory late payment held');
  PERFORM pg_temp.check_settlement(public.claim_live_stripe_event(mer,original_event,'checkout.session.completed',sess,lease1)='claimed'
    AND public.claim_live_stripe_event(mer,original_event,'checkout.session.completed',sess,lease2)='busy'
    AND NOT public.finish_live_stripe_event(mer,original_event,lease2,'processed',NULL),'exclusive delivery lease');
  PERFORM pg_temp.check_settlement(public.finish_live_stripe_event(mer,original_event,lease1,'retryable','provider_unavailable')
    AND public.claim_live_stripe_event(mer,original_event,'checkout.session.completed',sess,lease2)='claimed'
    AND NOT public.finish_live_stripe_event(mer,original_event,lease1,'processed',NULL)
    AND public.finish_live_stripe_event(mer,original_event,lease2,'processed',NULL)
    AND public.claim_live_stripe_event(mer,original_event,'checkout.session.completed',sess,lease3)='processed','retries are fenced');
  PERFORM pg_temp.check_settlement(public.claim_live_stripe_event(other,original_event,'checkout.session.completed',sess,lease3)='claimed'
    AND public.claim_live_stripe_event(mer,original_event,'checkout.session.expired',sess,lease3)='conflict'
    AND (SELECT processed_at IS NULL AND payload='{}'::jsonb FROM public.stripe_webhook_events WHERE stripe_event_id=original_event),
    'other merchant and historic sandbox event remain isolated');
  PERFORM pg_temp.check_settlement(public.read_live_checkout_order_id(mer,'cs_test_fixture') IS NULL
    AND NOT public.authorize_live_checkout_receipt(other,o,sess,user_id_,NULL), 'old sandbox cannot acquire live authorization');
END;
$test$;
ROLLBACK;
