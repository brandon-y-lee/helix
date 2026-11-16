-- Accepted checkout facts are local, immutable and distinct from provider-computed totals.
-- No provider event can opt a new attempt into the legacy validator.
alter table public.payment_attempts
  add column contract_version text,
  add column stripe_idempotency_key text unique,
  add constraint payment_attempt_contract_version check (contract_version is null or contract_version = 'checkout_v2');

create table private.checkout_payment_contracts (
  attempt_id uuid primary key references public.payment_attempts(id),
  order_id uuid not null references public.orders(id),
  terms jsonb not null check (pg_catalog.jsonb_typeof(terms) = 'object'),
  created_at timestamptz not null default pg_catalog.now()
);
create index checkout_payment_contracts_order_idx on private.checkout_payment_contracts(order_id);
create table private.checkout_legacy_contracts (
  order_id uuid not null references public.orders(id),
  session_id text not null,
  terms jsonb not null,
  created_at timestamptz not null default pg_catalog.now(),
  primary key (order_id, session_id)
);
create table private.checkout_payment_exceptions (
  id uuid primary key default extensions.gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  attempt_id uuid references public.payment_attempts(id),
  session_id text not null check (session_id ~ '^cs_[A-Za-z0-9_]{1,200}$'),
  account_id text not null default 'acct_1Tm9WRFEzyaKzdmq' check (account_id = 'acct_1Tm9WRFEzyaKzdmq'),
  environment text not null default 'sandbox' check (environment = 'sandbox'),
  code text not null check (code in ('invalid_contract','provider_context_mismatch','session_identity_mismatch',
    'payment_identity_mismatch','payment_state_mismatch','unsupported_zero_total','line_items_mismatch',
    'discount_mismatch','shipping_mismatch','tax_mismatch','unsupported_tax_behavior','amount_mismatch',
    'missing_shipping_address','missing_contract','side_effects_failed','finalization_failed',
    'settlement_effects_failed','full_refund_reconciliation_failed')),
  payment_intent_id text check (payment_intent_id is null or payment_intent_id ~ '^pi_[A-Za-z0-9_]{1,200}$'),
  payment_status text not null check (payment_status in ('paid','unpaid','no_payment_required','refunded','unknown')),
  amount_cents integer check (amount_cents is null or amount_cents >= 0),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  resolved_at timestamptz,
  unique (order_id, session_id, code)
);
create index checkout_payment_exceptions_unresolved_idx
  on private.checkout_payment_exceptions(order_id,session_id,updated_at desc) where resolved_at is null;
create table private.checkout_verified_payments (
  order_id uuid not null references public.orders(id),
  session_id text not null,
  attempt_id uuid references public.payment_attempts(id),
  contract_version text not null check (contract_version in ('checkout_v1','checkout_v2')),
  payment_intent_id text not null,
  discount_cents integer not null,
  shipping_cents integer not null,
  tax_cents integer not null,
  total_cents integer not null,
  tax_breakdown jsonb not null,
  shipping_name text not null,
  shipping_address jsonb not null check (pg_catalog.jsonb_typeof(shipping_address)='object'),
  billing_address jsonb check (billing_address is null or pg_catalog.jsonb_typeof(billing_address)='object'),
  verified_at timestamptz not null default pg_catalog.now(),
  primary key (order_id,session_id)
);

alter table private.checkout_payment_contracts enable row level security;
alter table private.checkout_payment_contracts force row level security;
alter table private.checkout_legacy_contracts enable row level security;
alter table private.checkout_legacy_contracts force row level security;
alter table private.checkout_payment_exceptions enable row level security;
alter table private.checkout_payment_exceptions force row level security;
alter table private.checkout_verified_payments enable row level security;
alter table private.checkout_verified_payments force row level security;
revoke all on private.checkout_payment_contracts,private.checkout_legacy_contracts,
  private.checkout_payment_exceptions,private.checkout_verified_payments from public,anon,authenticated,service_role;
grant select,insert on private.checkout_payment_contracts,private.checkout_verified_payments to service_role;
grant select on private.checkout_legacy_contracts to service_role;
grant select,insert,update on private.checkout_payment_exceptions to service_role;
grant usage on schema private to service_role;

create function private.checkout_contract_immutable() returns trigger language plpgsql
security invoker set search_path='' as $$ begin
  raise exception using errcode='55000',message='accepted checkout facts are immutable';
end $$;
create trigger checkout_payment_contracts_immutable before update or delete on private.checkout_payment_contracts
for each row execute function private.checkout_contract_immutable();
create trigger checkout_legacy_contracts_immutable before update or delete on private.checkout_legacy_contracts
for each row execute function private.checkout_contract_immutable();
create trigger checkout_verified_payments_immutable before update or delete on private.checkout_verified_payments
for each row execute function private.checkout_contract_immutable();
revoke all on function private.checkout_contract_immutable() from public,anon,authenticated,service_role;

create function private.checkout_order_lines(p_order_id uuid) returns jsonb language sql stable
security invoker set search_path='' as $$
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'lineId',i.id,'productId',i.product_id,'productSlug',i.product_slug,'variantKey',i.variant_key,
    'quantity',i.quantity,'unitAmountCents',i.unit_price_cents) order by i.product_id,i.variant_key,i.id),'[]'::jsonb)
  from public.order_items i where i.order_id=p_order_id;
$$;
revoke all on function private.checkout_order_lines(uuid) from public,anon,authenticated;
grant execute on function private.checkout_order_lines(uuid) to service_role;

-- Freeze the old binding and accepted facts at the cutover. This table has no application INSERT grant.
insert into private.checkout_legacy_contracts(order_id,session_id,terms)
select o.id,b.session_id,pg_catalog.jsonb_build_object(
  'version','checkout_v1','legacyEligible',true,'orderId',o.id,'attemptId',b.attempt_id,
  'sessionId',b.session_id,'accountId','acct_1Tm9WRFEzyaKzdmq','apiVersion','2026-06-24.dahlia',
  'environment','sandbox','currency',o.currency,'customerId',o.stripe_customer_id,
  'lines',private.checkout_order_lines(o.id),'merchandiseSubtotalCents',o.merchandise_subtotal_cents,
  'discountCents',o.discount_cents,'shippingCents',o.shipping_cents,
  'preTaxTotalCents',o.merchandise_subtotal_cents-o.discount_cents+o.shipping_cents,
  'couponId',null,'shippingRateId',null,'freeShipping',o.shipping_cents=0,
  'automaticTaxEnabled',null,'taxBehavior',null)
from public.orders o join lateral (
  select o.stripe_checkout_session_id as session_id,
    (select p.id from public.payment_attempts p where p.stripe_checkout_session_id=o.stripe_checkout_session_id and p.order_id=o.id) as attempt_id
  where o.stripe_checkout_session_id is not null
  union
  select p.stripe_checkout_session_id,p.id from public.payment_attempts p
  where p.order_id=o.id and p.stripe_checkout_session_id is not null
) b on true where o.checkout_environment='sandbox';

create function public.is_legacy_checkout_session(p_order_id uuid,p_session_id text) returns boolean
language sql stable security invoker set search_path='' as $$
  select exists(select 1 from private.checkout_legacy_contracts l join public.orders o on o.id=l.order_id
    where l.order_id=p_order_id and l.session_id=p_session_id and o.stripe_checkout_session_id=p_session_id)
    and not exists(select 1 from public.payment_attempts p where p.order_id=p_order_id
      and p.stripe_checkout_session_id=p_session_id and p.contract_version is not null);
$$;

create function public.prepare_checkout_payment_contract(
  p_order_id uuid,p_attempt_token uuid,p_stripe_idempotency_key text,p_terms jsonb
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  v_order public.orders%rowtype;
  v_attempt public.payment_attempts%rowtype;
  v_terms jsonb;
  v_lines jsonb;
  v_supplied_lines jsonb;
  v_field text;
begin
  select * into v_order from public.orders where id=p_order_id for update;
  if not found or v_order.checkout_environment<>'sandbox' or v_order.status not in ('pending_payment','payment_failed')
    or v_order.checkout_attempt_token is distinct from p_attempt_token
    or v_order.checkout_attempt_started_at is null or v_order.checkout_attempt_started_at < pg_catalog.now()-interval '5 minutes'
    or v_order.metadata->>'stripe_idempotency_key' is distinct from p_stripe_idempotency_key
    or p_stripe_idempotency_key is null or pg_catalog.length(p_stripe_idempotency_key) not between 1 and 255
  then raise exception using errcode='22023',message='checkout attempt does not own accepted terms'; end if;

  select * into v_attempt from public.payment_attempts where stripe_idempotency_key=p_stripe_idempotency_key;
  if found then
    if v_attempt.order_id<>p_order_id or v_attempt.contract_version<>'checkout_v2' then
      raise exception using errcode='22023',message='checkout attempt identity mismatch';
    end if;
    select terms into v_terms from private.checkout_payment_contracts where attempt_id=v_attempt.id;
    if not found then raise exception using errcode='55000',message='checkout accepted terms missing'; end if;
    -- An execution lease can rotate. A logical provider attempt and its frozen quote cannot.
    return v_terms || pg_catalog.jsonb_build_object('attemptId',v_attempt.id,'sessionId',v_attempt.stripe_checkout_session_id);
  end if;

  if p_terms is null or pg_catalog.jsonb_typeof(p_terms)<>'object'
    or p_terms-array['orderId','accountId','apiVersion','environment','currency','customerId','lines',
      'merchandiseSubtotalCents','discountCents','shippingCents','preTaxTotalCents','couponId',
      'shippingRateId','freeShipping','automaticTaxEnabled','taxBehavior'] <> '{}'::jsonb
    or p_terms->>'orderId' is distinct from p_order_id::text
    or p_terms->>'accountId' is distinct from 'acct_1Tm9WRFEzyaKzdmq'
    or p_terms->>'apiVersion' is distinct from '2026-06-24.dahlia'
    or p_terms->>'environment' is distinct from 'sandbox' or p_terms->>'currency' is distinct from 'USD'
    or p_terms->>'merchandiseSubtotalCents' is distinct from v_order.merchandise_subtotal_cents::text
    or p_terms->>'discountCents' is distinct from v_order.discount_cents::text
    or p_terms->>'shippingCents' is distinct from v_order.shipping_cents::text
    or p_terms->>'preTaxTotalCents' is distinct from (v_order.merchandise_subtotal_cents-v_order.discount_cents+v_order.shipping_cents)::text
    or v_order.merchandise_subtotal_cents-v_order.discount_cents+v_order.shipping_cents<=0
    or pg_catalog.jsonb_typeof(p_terms->'automaticTaxEnabled') is distinct from 'boolean'
    or p_terms->>'taxBehavior' not in ('exclusive','inclusive','unspecified')
    or p_terms->>'taxBehavior' is null
    or pg_catalog.jsonb_typeof(p_terms->'freeShipping') is distinct from 'boolean'
    or (p_terms->>'freeShipping')::boolean is distinct from (v_order.shipping_cents=0)
    or pg_catalog.jsonb_typeof(p_terms->'lines') is distinct from 'array'
    or not(p_terms ?& array['customerId','couponId','shippingRateId'])
    or (p_terms->>'customerId' is not null and p_terms->>'customerId' !~ '^cus_[A-Za-z0-9_]{1,200}$')
    or (p_terms->>'couponId' is not null and p_terms->>'couponId' !~ '^[A-Za-z0-9_-]{1,200}$')
    or (p_terms->>'shippingRateId' is not null and p_terms->>'shippingRateId' !~ '^shr_[A-Za-z0-9_]{1,200}$')
    or (v_order.discount_cents>0 and p_terms->>'couponId' is null)
    or (v_order.discount_cents=0 and p_terms->>'couponId' is not null)
    or (v_order.shipping_cents>0 and p_terms->>'shippingRateId' is null)
  then raise exception using errcode='22023',message='invalid accepted checkout terms'; end if;
  foreach v_field in array array['merchandiseSubtotalCents','discountCents','shippingCents','preTaxTotalCents'] loop
    if pg_catalog.jsonb_typeof(p_terms->v_field) is distinct from 'number' then
      raise exception using errcode='22023',message='accepted checkout amounts must be numbers';
    end if;
  end loop;
  foreach v_field in array array['customerId','couponId','shippingRateId'] loop
    if pg_catalog.jsonb_typeof(p_terms->v_field) not in ('string','null') then
      raise exception using errcode='22023',message='accepted checkout references must be strings';
    end if;
  end loop;
  v_lines:=private.checkout_order_lines(p_order_id);
  select pg_catalog.jsonb_agg(line - 'lineId' order by line->>'productId',line->>'variantKey') into v_supplied_lines
  from pg_catalog.jsonb_array_elements(p_terms->'lines') line;
  if pg_catalog.jsonb_array_length(v_lines)=0 or v_supplied_lines is distinct from
    (select pg_catalog.jsonb_agg(line - 'lineId' order by line->>'productId',line->>'variantKey')
      from pg_catalog.jsonb_array_elements(v_lines) line)
  then raise exception using errcode='22023',message='accepted checkout lines differ from order'; end if;

  insert into public.payment_attempts(order_id,amount_cents,idempotency_key,contract_version,stripe_idempotency_key,metadata)
  values(p_order_id,v_order.total_cents,'payment-attempt:'||p_stripe_idempotency_key,'checkout_v2',p_stripe_idempotency_key,
    pg_catalog.jsonb_build_object('schema','checkout_v2','stripe_idempotency_key',p_stripe_idempotency_key,
      'payment_method_configuration','card','payment_method_types',pg_catalog.jsonb_build_array('card')))
  returning * into v_attempt;
  v_terms:=p_terms||pg_catalog.jsonb_build_object('version','checkout_v2','legacyEligible',false,'lines',v_lines);
  insert into private.checkout_payment_contracts(attempt_id,order_id,terms) values(v_attempt.id,p_order_id,v_terms);
  return v_terms||pg_catalog.jsonb_build_object('attemptId',v_attempt.id,'sessionId',null);
end $$;

create function public.bind_checkout_payment_session(
  p_order_id uuid,p_attempt_id uuid,p_session_id text,p_stripe_idempotency_key text
) returns boolean language plpgsql security invoker set search_path='' as $$
declare v_order public.orders%rowtype; begin
  select * into v_order from public.orders where id=p_order_id for update;
  if not found or v_order.stripe_checkout_session_id is distinct from p_session_id
    or v_order.metadata->>'stripe_idempotency_key' is distinct from p_stripe_idempotency_key
    or p_session_id is null or p_session_id !~ '^cs_test_[A-Za-z0-9_]{1,200}$' then return false; end if;
  update public.payment_attempts set stripe_checkout_session_id=p_session_id
  where id=p_attempt_id and order_id=p_order_id and stripe_idempotency_key=p_stripe_idempotency_key
    and contract_version='checkout_v2' and (stripe_checkout_session_id is null or stripe_checkout_session_id=p_session_id);
  return found;
end $$;

create function public.read_checkout_payment_contract(p_order_id uuid,p_session_id text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_terms jsonb; v_order public.orders%rowtype; begin
  -- Recover only an already attached local Session for the same durable provider key.
  -- This closes a crash between Order attachment and Attempt attachment, without trusting event metadata.
  select * into v_order from public.orders where id=p_order_id and stripe_checkout_session_id=p_session_id for update;
  if not found then return null; end if;
  update public.payment_attempts p set stripe_checkout_session_id=p_session_id
    where p.order_id=p_order_id and p.contract_version='checkout_v2' and p.stripe_checkout_session_id is null
      and p.stripe_idempotency_key=v_order.metadata->>'stripe_idempotency_key'
      and exists(select 1 from private.checkout_payment_contracts c where c.attempt_id=p.id);
  select c.terms||pg_catalog.jsonb_build_object('attemptId',p.id,'sessionId',p.stripe_checkout_session_id)
    into v_terms from public.payment_attempts p join private.checkout_payment_contracts c on c.attempt_id=p.id
    join public.orders o on o.id=p.order_id
    where p.order_id=p_order_id and p.stripe_checkout_session_id=p_session_id
      and o.stripe_checkout_session_id=p_session_id and o.metadata->>'stripe_idempotency_key'=p.stripe_idempotency_key
      and p.contract_version='checkout_v2';
  if found then return v_terms; end if;
  if public.is_legacy_checkout_session(p_order_id,p_session_id) then
    select terms into v_terms from private.checkout_legacy_contracts where order_id=p_order_id and session_id=p_session_id;
    return v_terms;
  end if;
  return null;
end $$;

create function public.record_checkout_payment_exception(
  p_order_id uuid,p_attempt_id uuid,p_session_id text,p_code text,p_payment_intent_id text,
  p_payment_status text,p_amount_cents integer
) returns boolean language plpgsql security invoker set search_path='' as $$ begin
  if not exists(select 1 from public.orders where id=p_order_id and checkout_environment='sandbox')
    or (p_attempt_id is not null and not exists(select 1 from public.payment_attempts where id=p_attempt_id and order_id=p_order_id))
  then raise exception using errcode='22023',message='invalid checkout exception identity'; end if;
  insert into private.checkout_payment_exceptions(order_id,attempt_id,session_id,code,payment_intent_id,payment_status,amount_cents)
  values(p_order_id,p_attempt_id,p_session_id,p_code,p_payment_intent_id,p_payment_status,p_amount_cents)
  on conflict(order_id,session_id,code) do update set
    attempt_id=excluded.attempt_id,payment_intent_id=excluded.payment_intent_id,payment_status=excluded.payment_status,
    amount_cents=excluded.amount_cents,updated_at=pg_catalog.now(),resolved_at=null;
  return true;
end $$;
create function public.read_checkout_payment_exception(p_order_id uuid,p_session_id text) returns jsonb
language sql stable security invoker set search_path='' as $$
  select pg_catalog.jsonb_build_object('code',code,'paymentStatus',payment_status,
    'paymentIntentId',payment_intent_id,'amountCents',amount_cents)
  from private.checkout_payment_exceptions where order_id=p_order_id and session_id=p_session_id and resolved_at is null
  order by updated_at desc,id limit 1;
$$;
create function public.resolve_checkout_payment_exceptions(p_order_id uuid,p_session_id text,p_code text default null)
returns boolean language plpgsql security invoker set search_path='' as $$ begin
  update private.checkout_payment_exceptions set resolved_at=pg_catalog.now(),updated_at=pg_catalog.now()
  where order_id=p_order_id and session_id=p_session_id and resolved_at is null and ((p_code is null and code<>'full_refund_reconciliation_failed') or code=p_code);
  return true;
end $$;

-- Preserve the established effects and lock ordering behind an internal service-only function.
alter function public.finalize_paid_checkout_order(uuid,text,text,integer,integer,integer,integer,text,text,integer,text,jsonb,jsonb,text,text)
  set schema private;
alter function private.finalize_paid_checkout_order(uuid,text,text,integer,integer,integer,integer,text,text,integer,text,jsonb,jsonb,text,text)
  rename to finalize_paid_checkout_order_effects;
create or replace function public.finalize_paid_checkout_order(
  p_order_id uuid,
  p_session_id text,
  p_customer_email text,
  p_discount_cents integer,
  p_shipping_cents integer,
  p_tax_cents integer,
  p_total_cents integer,
  p_payment_intent_id text,
  p_customer_id text,
  p_reward_points_earned integer,
  p_shipping_name text,
  p_shipping_address jsonb,
  p_billing_address jsonb,
  p_payment_method_type text,
  p_payment_raw_status text
)
returns setof public.orders
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not public.is_legacy_checkout_session(p_order_id,p_session_id) then
    raise exception using errcode='22023',message='verified checkout contract is required';
  end if;
  return query select * from private.finalize_paid_checkout_order_effects(p_order_id,p_session_id,p_customer_email,p_discount_cents,p_shipping_cents,p_tax_cents,p_total_cents,p_payment_intent_id,p_customer_id,p_reward_points_earned,p_shipping_name,p_shipping_address,p_billing_address,p_payment_method_type,p_payment_raw_status);
end;
$$;

create function public.finalize_verified_checkout_payment(
  p_order_id uuid,p_attempt_id uuid,p_session_id text,p_contract_version text,p_facts jsonb,p_reward_points_earned integer
) returns setof public.orders language plpgsql security invoker set search_path='' as $$
declare
  v_order public.orders%rowtype;
  v_user_id uuid;
  v_reward_points integer;
  v_terms jsonb;
  v_previous private.checkout_verified_payments%rowtype;
  v_key text;
  v_tax_component jsonb;
  v_tax_sum bigint:=0;
  v_shipping_address jsonb;
  v_billing_address jsonb;
begin
  select user_id,reward_points_redeemed into v_user_id,v_reward_points from public.orders
    where id=p_order_id and stripe_checkout_session_id=p_session_id;
  if v_user_id is not null and coalesce(v_reward_points,0)>0 then
    perform public.ensure_rewards_account(v_user_id);
    perform 1 from public.rewards_accounts where user_id=v_user_id for update;
  end if;
  select * into v_order from public.orders where id=p_order_id and stripe_checkout_session_id=p_session_id for update;
  if not found then return; end if;
  v_terms:=public.read_checkout_payment_contract(p_order_id,p_session_id);
  if v_terms is null or v_terms->>'version' is distinct from p_contract_version
    or v_terms->>'attemptId' is distinct from p_attempt_id::text
  then return; end if;
  if v_order.status='refunded' then return next v_order; return; end if;
  if p_facts is null or pg_catalog.jsonb_typeof(p_facts)<>'object'
    or p_facts->>'orderId' is distinct from p_order_id::text
    or p_facts->>'sessionId' is distinct from p_session_id
    or p_facts->>'attemptId' is distinct from p_attempt_id::text
    or p_facts->>'contractVersion' is distinct from p_contract_version
    or p_facts->>'currency' is distinct from 'USD'
    or p_facts->>'paymentMethodType' is null or p_facts->>'paymentMethodType' !~ '^[a-z][a-z0-9_]{0,63}$'
    or (p_contract_version='checkout_v2' and p_facts->>'paymentMethodType'<>'card')
    or p_facts->>'merchandiseSubtotalCents' is distinct from v_terms->>'merchandiseSubtotalCents'
    or p_facts->>'discountCents' is distinct from v_terms->>'discountCents'
    or p_facts->>'shippingCents' is distinct from v_terms->>'shippingCents'
    or p_facts->>'paymentIntentId' is null or p_facts->>'paymentIntentId' !~ '^pi_[A-Za-z0-9_]{1,200}$'
    or (v_terms->>'customerId' is not null and p_facts->>'customerId' is distinct from v_terms->>'customerId')
    or pg_catalog.jsonb_typeof(p_facts->'shippingAddress') is distinct from 'object'
    or p_facts->'shippingAddress'->>'country' is distinct from 'US'
    or coalesce(pg_catalog.length(pg_catalog.btrim(p_facts->>'shippingName')),0)=0
    or coalesce(pg_catalog.length(pg_catalog.btrim(p_facts->'shippingAddress'->>'line1')),0)=0
    or coalesce(pg_catalog.length(pg_catalog.btrim(p_facts->'shippingAddress'->>'city')),0)=0
    or coalesce(pg_catalog.length(pg_catalog.btrim(p_facts->'shippingAddress'->>'state')),0)=0
    or coalesce(pg_catalog.length(pg_catalog.btrim(p_facts->'shippingAddress'->>'postal_code')),0)=0
    or pg_catalog.jsonb_typeof(p_facts->'taxBreakdown') is distinct from 'array'
    or (p_facts->'billingAddress' is not null and pg_catalog.jsonb_typeof(p_facts->'billingAddress') not in ('object','null'))
  then raise exception using errcode='22023',message='verified checkout facts do not match accepted terms'; end if;
  foreach v_key in array array['line1','line2','city','state','postal_code','country'] loop
    if (p_facts->'shippingAddress'->v_key is not null and pg_catalog.jsonb_typeof(p_facts->'shippingAddress'->v_key) not in ('string','null'))
      or (p_facts->'billingAddress'->v_key is not null and pg_catalog.jsonb_typeof(p_facts->'billingAddress'->v_key) not in ('string','null')) then
      raise exception using errcode='22023',message='verified checkout address fields invalid';
    end if;
  end loop;
  -- Persist only the address contract, never an expanded/raw provider object.
  select pg_catalog.jsonb_object_agg(field,p_facts->'shippingAddress'->field) into v_shipping_address
    from pg_catalog.unnest(array['line1','line2','city','state','postal_code','country']) field;
  if p_facts->'billingAddress' is not null and p_facts->'billingAddress'<>'null'::jsonb then
    select pg_catalog.jsonb_object_agg(field,p_facts->'billingAddress'->field) into v_billing_address
      from pg_catalog.unnest(array['line1','line2','city','state','postal_code','country']) field;
  end if;
  foreach v_key in array array['merchandiseSubtotalCents','discountCents','shippingCents','taxCents','totalCents'] loop
    if p_facts->>v_key is null or p_facts->>v_key !~ '^[0-9]{1,10}$'
      or (p_facts->>v_key)::bigint>2147483647 then
      raise exception using errcode='22023',message='verified checkout amount invalid';
    end if;
  end loop;
  if (p_facts->>'totalCents')::bigint<>(v_terms->>'preTaxTotalCents')::bigint+(p_facts->>'taxCents')::bigint
    or (p_facts->>'totalCents')::integer<=0
    or ((v_terms->>'automaticTaxEnabled')='false' and (p_facts->>'taxCents')::integer<>0)
    or pg_catalog.jsonb_array_length(p_facts->'taxBreakdown')>1000
  then raise exception using errcode='22023',message='verified checkout arithmetic invalid'; end if;
  for v_tax_component in select value from pg_catalog.jsonb_array_elements(p_facts->'taxBreakdown') loop
    if pg_catalog.jsonb_typeof(v_tax_component)<>'object'
      or v_tax_component-array['source','lineId','rateId','amountCents','taxableAmountCents','inclusive','reason']<>'{}'::jsonb
      or v_tax_component->>'source' not in ('line','shipping') or v_tax_component->>'source' is null
      or v_tax_component->'inclusive' is distinct from 'false'::jsonb
      or v_tax_component->>'rateId' is null or v_tax_component->>'rateId' !~ '^txr_[A-Za-z0-9_]{1,200}$'
      or v_tax_component->>'amountCents' is null or v_tax_component->>'amountCents' !~ '^[0-9]{1,10}$'
      or (v_tax_component->>'amountCents')::bigint>2147483647
      or (v_tax_component->>'lineId' is not null and v_tax_component->>'lineId' !~ '^li_[A-Za-z0-9_]{1,200}$')
      or (v_tax_component->>'reason' is not null and v_tax_component->>'reason' !~ '^[a-z_]{1,100}$')
      or (v_tax_component->>'taxableAmountCents' is not null and
        (v_tax_component->>'taxableAmountCents' !~ '^[0-9]{1,10}$' or (v_tax_component->>'taxableAmountCents')::bigint>2147483647))
    then raise exception using errcode='22023',message='verified checkout tax breakdown invalid'; end if;
    v_tax_sum:=v_tax_sum+(v_tax_component->>'amountCents')::bigint;
  end loop;
  if v_tax_sum<>(p_facts->>'taxCents')::bigint then
    raise exception using errcode='22023',message='verified checkout tax breakdown differs from tax';
  end if;
  select * into v_previous from private.checkout_verified_payments where order_id=p_order_id and session_id=p_session_id;
  if found and (v_previous.payment_intent_id is distinct from p_facts->>'paymentIntentId'
    or v_previous.discount_cents<>(p_facts->>'discountCents')::integer
    or v_previous.shipping_cents<>(p_facts->>'shippingCents')::integer
    or v_previous.tax_cents<>(p_facts->>'taxCents')::integer
    or v_previous.total_cents<>(p_facts->>'totalCents')::integer
    or v_previous.tax_breakdown is distinct from p_facts->'taxBreakdown'
    or v_previous.shipping_name is distinct from p_facts->>'shippingName'
    or v_previous.shipping_address is distinct from v_shipping_address
    or v_previous.billing_address is distinct from v_billing_address) then
    raise exception using errcode='22023',message='verified payment facts are immutable';
  end if;
  select * into v_order from private.finalize_paid_checkout_order_effects(
    p_order_id,p_session_id,p_facts->>'customerEmail',(p_facts->>'discountCents')::integer,
    (p_facts->>'shippingCents')::integer,(p_facts->>'taxCents')::integer,(p_facts->>'totalCents')::integer,
    p_facts->>'paymentIntentId',p_facts->>'customerId',p_reward_points_earned,
    p_facts->>'shippingName',v_shipping_address,v_billing_address,
    p_facts->>'paymentMethodType','paid');
  if not found then return; end if;
  insert into private.checkout_verified_payments(order_id,session_id,attempt_id,contract_version,payment_intent_id,
    discount_cents,shipping_cents,tax_cents,total_cents,tax_breakdown,shipping_name,shipping_address,billing_address)
  values(p_order_id,p_session_id,p_attempt_id,p_contract_version,p_facts->>'paymentIntentId',
    (p_facts->>'discountCents')::integer,(p_facts->>'shippingCents')::integer,(p_facts->>'taxCents')::integer,
    (p_facts->>'totalCents')::integer,p_facts->'taxBreakdown',p_facts->>'shippingName',v_shipping_address,v_billing_address) on conflict do nothing;
  return next v_order;
end $$;

-- This service-only projection is read only after the application proves receipt ownership.
-- Old paid Order address fields remain historical; the receipt uses the independently verified delivery.
create function public.read_verified_checkout_delivery(p_order_id uuid,p_session_id text) returns jsonb
language sql stable security invoker set search_path='' as $$
  select pg_catalog.jsonb_build_object('shippingName',v.shipping_name,'shippingAddress',v.shipping_address,
    'billingAddress',v.billing_address)
  from private.checkout_verified_payments v join public.orders o on o.id=v.order_id
  where v.order_id=p_order_id and v.session_id=p_session_id and o.stripe_checkout_session_id=p_session_id
    and o.checkout_environment='sandbox' and o.status in ('paid','refunded');
$$;

-- Keep recovery eligibility even where an old provider response was lost before Session attachment.
create table private.checkout_legacy_order_origins (
  order_id uuid primary key references public.orders(id),
  stripe_idempotency_key text,
  terms jsonb not null,
  created_at timestamptz not null default pg_catalog.now()
);
alter table private.checkout_legacy_order_origins enable row level security;
alter table private.checkout_legacy_order_origins force row level security;
revoke all on private.checkout_legacy_order_origins from public,anon,authenticated,service_role;
grant select on private.checkout_legacy_order_origins to service_role;
insert into private.checkout_legacy_order_origins(order_id,stripe_idempotency_key,terms)
select o.id,o.metadata->>'stripe_idempotency_key',pg_catalog.jsonb_build_object(
  'version','checkout_v1','legacyEligible',true,'orderId',o.id,'attemptId',null,'sessionId',o.stripe_checkout_session_id,
  'accountId','acct_1Tm9WRFEzyaKzdmq','apiVersion','2026-06-24.dahlia','environment','sandbox','currency',o.currency,
  'customerId',o.stripe_customer_id,'lines',private.checkout_order_lines(o.id),
  'merchandiseSubtotalCents',o.merchandise_subtotal_cents,'discountCents',o.discount_cents,'shippingCents',o.shipping_cents,
  'preTaxTotalCents',o.merchandise_subtotal_cents-o.discount_cents+o.shipping_cents,
  'couponId',null,'shippingRateId',null,'freeShipping',o.shipping_cents=0,'automaticTaxEnabled',null,'taxBehavior',null)
from public.orders o where o.checkout_environment='sandbox';
create trigger checkout_legacy_order_origins_immutable before update or delete on private.checkout_legacy_order_origins
for each row execute function private.checkout_contract_immutable();
create function public.is_legacy_checkout_order(p_order_id uuid) returns boolean language sql stable
security invoker set search_path='' as $$
 select exists(select 1 from private.checkout_legacy_order_origins l join public.orders o on o.id=l.order_id
   where l.order_id=p_order_id and l.stripe_idempotency_key is not distinct from o.metadata->>'stripe_idempotency_key')
   and not exists(select 1 from public.payment_attempts p join public.orders o on o.id=p.order_id
     where p.order_id=p_order_id and p.contract_version='checkout_v2'
       and p.stripe_idempotency_key=o.metadata->>'stripe_idempotency_key');
$$;

revoke all on function public.is_legacy_checkout_session(uuid,text),public.is_legacy_checkout_order(uuid),
  public.prepare_checkout_payment_contract(uuid,uuid,text,jsonb),public.bind_checkout_payment_session(uuid,uuid,text,text),
  public.read_checkout_payment_contract(uuid,text),public.read_verified_checkout_delivery(uuid,text),public.record_checkout_payment_exception(uuid,uuid,text,text,text,text,integer),
  public.read_checkout_payment_exception(uuid,text),public.resolve_checkout_payment_exceptions(uuid,text,text),
  public.finalize_verified_checkout_payment(uuid,uuid,text,text,jsonb,integer),
  public.finalize_paid_checkout_order(uuid,text,text,integer,integer,integer,integer,text,text,integer,text,jsonb,jsonb,text,text),
  private.finalize_paid_checkout_order_effects(uuid,text,text,integer,integer,integer,integer,text,text,integer,text,jsonb,jsonb,text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.is_legacy_checkout_session(uuid,text),public.is_legacy_checkout_order(uuid),
  public.prepare_checkout_payment_contract(uuid,uuid,text,jsonb),public.bind_checkout_payment_session(uuid,uuid,text,text),
  public.read_checkout_payment_contract(uuid,text),public.read_verified_checkout_delivery(uuid,text),public.record_checkout_payment_exception(uuid,uuid,text,text,text,text,integer),
  public.read_checkout_payment_exception(uuid,text),public.resolve_checkout_payment_exceptions(uuid,text,text),
  public.finalize_verified_checkout_payment(uuid,uuid,text,text,jsonb,integer),
  public.finalize_paid_checkout_order(uuid,text,text,integer,integer,integer,integer,text,text,integer,text,jsonb,jsonb,text,text),
  private.finalize_paid_checkout_order_effects(uuid,text,text,integer,integer,integer,integer,text,text,integer,text,jsonb,jsonb,text,text)
  to service_role;

create function private.guard_checkout_payment_attempt_identity() returns trigger
language plpgsql security invoker set search_path='' as $$ begin
  if old.contract_version='checkout_v2' and (
    new.id is distinct from old.id or new.order_id is distinct from old.order_id
    or new.contract_version is distinct from old.contract_version
    or new.stripe_idempotency_key is distinct from old.stripe_idempotency_key
    or new.idempotency_key is distinct from old.idempotency_key
    or new.currency is distinct from old.currency
    or new.checkout_environment is distinct from old.checkout_environment
    or (old.stripe_checkout_session_id is not null and new.stripe_checkout_session_id is distinct from old.stripe_checkout_session_id)
  ) then raise exception using errcode='55000',message='checkout payment attempt identity is immutable'; end if;
  return new;
end $$;
create trigger checkout_payment_attempt_identity before update on public.payment_attempts
for each row execute function private.guard_checkout_payment_attempt_identity();
revoke all on function private.guard_checkout_payment_attempt_identity() from public,anon,authenticated,service_role;
