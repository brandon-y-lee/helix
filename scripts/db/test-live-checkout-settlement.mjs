import assert from "node:assert/strict";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";

// The protected forward-migration test owns the PostgreSQL 17 stack. Keep these
// helpers session-local so a fixture cannot mint an Order on a deployed system.
const fixtures = `
CREATE FUNCTION pg_temp.seed_live_checkout(
  p_account text, p_nonce uuid, p_user_id uuid DEFAULT NULL, p_guest_receipt_hash text DEFAULT NULL,
  p_bound boolean DEFAULT true, p_sent boolean DEFAULT true
) RETURNS uuid LANGUAGE plpgsql AS $seed$
DECLARE
  product CONSTANT uuid := '59100000-ffff-4000-8000-000000000001';
  session_id_ CONSTANT text := 'cs_live_' || replace(p_nonce::text,'-','');
  terms_ jsonb;
  guest_hash text;
BEGIN
  IF p_bound AND NOT p_sent THEN RAISE EXCEPTION 'A bound synthetic Session must have been sent'; END IF;
  IF p_user_id IS NOT NULL THEN
    IF p_guest_receipt_hash IS NOT NULL THEN RAISE EXCEPTION 'Account fixture cannot accept guest credentials'; END IF;
    INSERT INTO auth.users(id) VALUES(p_user_id) ON CONFLICT (id) DO NOTHING;
  ELSE
    guest_hash := coalesce(p_guest_receipt_hash,encode(sha256(convert_to('fixture-receipt:'||p_nonce::text,'UTF8')),'hex'));
  END IF;
  INSERT INTO public.products(id,slug,swatch_from,swatch_to,product_type,catalog_status,sort_order,
    display_name,editorial_description,editorial_how_to_use,routine_group,routine_sort)
  VALUES(product,'live-checkout-fixture','#112233','#445566','serum','draft',0,
    'Synthetic checkout fixture','Synthetic local receipt item','Local fixture','core',0)
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.orders(id,user_id,order_number,merchandise_subtotal_cents,total_cents,idempotency_key,checkout_environment)
    VALUES(p_nonce,p_user_id,'HX-'||p_nonce::text,2500,2500,'live:order:'||p_nonce::text,'live');
  INSERT INTO public.order_items(order_id,product_id,product_slug,product_name,variant_key,variant_label,
    unit_price_cents,quantity,line_subtotal_cents)
    VALUES(p_nonce,product,'live-checkout-fixture','Synthetic checkout fixture','base','Fixture size',2500,1,2500);
  INSERT INTO public.payment_attempts(id,order_id,checkout_environment,amount_cents,idempotency_key)
    VALUES(p_nonce,p_nonce,'live',2500,'live:attempt:'||p_nonce::text);
  terms_ := jsonb_build_object('version','checkout_v2','legacyEligible',false,'orderId',p_nonce,'attemptId',p_nonce,
    'bindingNonce',p_nonce,'sessionId',CASE WHEN p_bound THEN session_id_ END,'accountId',p_account,
    'apiVersion','2026-06-24.dahlia','environment','live','currency','USD','customerId',NULL,
    'lines',private.checkout_order_lines(p_nonce),'merchandiseSubtotalCents',2500,'discountCents',0,
    'shippingCents',0,'preTaxTotalCents',2500,'couponId',NULL,'freeShipping',true,'shippingRateId',NULL,
    'automaticTaxEnabled',false,'taxBehavior','exclusive');
  INSERT INTO private.live_checkout_bindings(account_id,order_id,attempt_id,idempotency_key,terms,binding_nonce,
    first_send_at,session_id,receipt_hash,receipt_expires_at,receipt_ownership_version)
  VALUES(p_account,p_nonce,p_nonce,'live:attempt:'||p_nonce::text,terms_,p_nonce,
    CASE WHEN p_sent THEN clock_timestamp() END,CASE WHEN p_bound THEN session_id_ END,guest_hash,
    CASE WHEN guest_hash IS NOT NULL THEN clock_timestamp()+interval '1 hour' END,
    CASE WHEN guest_hash IS NOT NULL THEN 1 END);
  RETURN p_nonce;
END;
$seed$;

CREATE FUNCTION pg_temp.live_checkout_facts(p_order_id uuid) RETURNS jsonb LANGUAGE sql STABLE AS $facts$
  SELECT jsonb_build_object('orderId',b.order_id,'attemptId',b.attempt_id,
    'sessionId','cs_live_'||replace(b.order_id::text,'-',''),'contractVersion','checkout_v2',
    'paymentIntentId','pi_'||replace(b.order_id::text,'-',''),'paymentMethodType','card',
    'customerId',b.terms->'customerId','customerEmail',NULL,'currency','USD','merchandiseSubtotalCents',2500,
    'discountCents',0,'shippingCents',0,'taxCents',0,'totalCents',2500,'shippingName','Synthetic recipient',
    'shippingAddress',jsonb_build_object('line1','Fixture 1','line2',NULL,'city','Test City','state','CA',
      'postal_code','90000','country','US'),'billingAddress',NULL,'taxBreakdown','[]'::jsonb)
  FROM private.live_checkout_bindings b WHERE b.order_id=p_order_id;
$facts$;
`;

const developmentAssertions = `
BEGIN;
DO $development$
DECLARE
  merchant CONSTANT text := 'acct_591Development';
  owned CONSTANT uuid := '59100000-dddd-4000-8000-000000000001';
  user_id_ CONSTANT uuid := '59100000-dddd-4000-8000-000000000002';
  sandbox_id CONSTANT uuid := '59100000-dddd-4000-8000-000000000003';
  session_id_ CONSTANT text := 'cs_live_'||replace(owned::text,'-','');
BEGIN
  PERFORM pg_temp.seed_live_checkout(merchant,owned,user_id_);
  IF public.classify_live_checkout_attempt(merchant,owned,owned,owned,'pi_unrelated')<>'unmatched' OR private.live_checkout_target() OR public.authorize_live_checkout_receipt(merchant,owned,session_id_,user_id_,NULL)
    OR public.read_live_checkout_receipt(merchant,owned,session_id_,user_id_,NULL) IS NOT NULL
    OR public.read_live_checkout_order_history(merchant,user_id_,10,NULL,NULL)<>'[]'::jsonb
    OR public.finalize_live_checkout_payment(merchant,owned,owned,session_id_,pg_temp.live_checkout_facts(owned)) IS DISTINCT FROM 'unmatched'
    OR (SELECT status FROM public.orders WHERE id=owned) IS DISTINCT FROM 'pending_payment'::public.order_status THEN
    RAISE EXCEPTION 'Development marker allowed a live payment or live private read';
  END IF;
  INSERT INTO public.orders(id,user_id,order_number,merchandise_subtotal_cents,total_cents,
    idempotency_key,stripe_checkout_session_id)
    VALUES(sandbox_id,user_id_,'HX-591-DEV-SANDBOX',2500,2500,'591:dev:sandbox','cs_test_591Sandbox');
  IF NOT public.authorize_checkout_receipt('acct_1Tm9WRFEzyaKzdmq',sandbox_id,'cs_test_591Sandbox',user_id_,NULL,NULL)
    OR public.authorize_checkout_receipt('acct_1Tm9WRFEzyaKzdmq',sandbox_id,'cs_test_591Sandbox',NULL,NULL,NULL) THEN
    RAISE EXCEPTION 'Existing sandbox receipt owner contract changed on development';
  END IF;
END;
$development$;
ROLLBACK;
`;

const files = ["live_checkout_receipts.integration.sql", "live_checkout_settlement.integration.sql"];

// Observe PostgreSQL blocking the competing unique-key insert before releasing
// the winner. Both sessions exercise the service RPC under its normal role.
async function checkConcurrentEventClaim(stack, database, ownerSql) {
  const event = "'acct_591EventRace','evt_591Race'";
  const firstLease = "'59100000-eeee-4000-8000-000000000001'";
  const secondLease = "'59100000-eeee-4000-8000-000000000002'";
  const claim = lease => `SELECT public.claim_live_stripe_event(${event},'checkout.session.completed','cs_live_591Race',${lease});`;
  const finish = lease => `SELECT public.finish_live_stripe_event(${event},${lease},'processed',NULL);`;
  const open = () => {
    const child = stack.session(database);
    const output = { stdout: "", stderr: "" };
    for (const stream of ["stdout", "stderr"]) child[stream].setEncoding("utf8").on("data", text => { output[stream] += text; });
    return { child, output, closed: once(child, "close") };
  };
  async function until(test, message) {
    const deadline = Date.now() + 12_000;
    while (Date.now() < deadline) {
      if (await test()) return;
      await delay(40);
    }
    assert.fail(message);
  }
  const first = open();
  const second = open();
  try {
    first.child.stdin.write("SET application_name='helix_event_claim_owner'; BEGIN; SET LOCAL ROLE service_role;\n" +
      claim(firstLease) + "\n\\echo claim-held\n");
    await until(() => first.output.stdout.includes("claim-held"), "First event claim did not acquire its lease");
    assert.ok(first.output.stdout.trim().split(/\s+/).includes("claimed"), first.output.stderr);
    second.child.stdin.end("SET application_name='helix_event_claim_competitor'; SET ROLE service_role;\n" + claim(secondLease));
    await until(() => ownerSql(`SELECT EXISTS (SELECT FROM pg_stat_activity a JOIN pg_stat_activity b ON a.datid=b.datid
      WHERE a.datname=current_database() AND a.application_name='helix_event_claim_owner'
        AND b.application_name='helix_event_claim_competitor' AND a.pid=ANY(pg_blocking_pids(b.pid)));`) === "t",
    "The concurrent service call did not block on the uncommitted event");
    first.child.stdin.end("COMMIT;\n");
    for (const session of [first, second]) assert.equal((await session.closed)[0], 0, session.output.stderr);
    assert.equal(second.output.stdout.trim(), "busy");
    assert.deepEqual(ownerSql("SET ROLE service_role;\n" + finish(secondLease) + finish(firstLease) + claim(secondLease)).split("\n"),
      ["f", "t", "processed"], "Only the lease owner may finish, and terminal duplicates must remain deduplicated");
  } finally {
    for (const session of [first, second]) {
      if (!session.child.stdin.destroyed && !session.child.stdin.writableEnded) session.child.stdin.end("ROLLBACK;\n");
    }
    await Promise.all([first.closed, second.closed]);
  }
}

export async function runLiveCheckoutSettlementTests({ ownerSql, database, environment, stack }) {
  assert.match(stack.nonce, /^[0-9a-f]{12}$/);
  assert.ok(environment === "development" || environment === "production");
  const stage = environment === "development" ? "fresh_a" : "fresh_b";
  assert.equal(database, `helix_bootstrap_${stage}_${stack.nonce}`);
  const marker = environment === "development" ? "zyfkunnpnlmgvrojmrbg" : "erasogmsqpgiirovubjh";
  const guard = `DO $guard$ BEGIN
    IF current_database()<>'${database}' OR inet_client_addr() IS NOT NULL OR current_user<>'postgres'
      OR NOT EXISTS (SELECT FROM private.helix_environment WHERE singleton
        AND (environment,project_ref)=('${environment}','${marker}')) THEN
      RAISE EXCEPTION 'Settlement proof requires the exact disposable Unix-socket database';
    END IF;
  END; $guard$;`;
  const scenarios = environment === "development" ? developmentAssertions : files.map(name =>
    readFileSync(new URL("../../supabase/tests/" + name, import.meta.url), "utf8")).join("\n");
  await ownerSql([guard, fixtures, scenarios].join("\n"));
  if (environment === "production") await checkConcurrentEventClaim(stack, database, ownerSql);
}
