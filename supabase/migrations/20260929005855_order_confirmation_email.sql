-- Service-owned durable email work. Installation never activates sending or backfills Orders.
create table private.email_controls (
  environment text not null check (environment='sandbox'),
  purpose text not null check (purpose='order_confirmation'),
  enabled boolean not null default false,
  accepted_after timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key(environment,purpose)
);
insert into private.email_controls(environment,purpose) values('sandbox','order_confirmation');

create table private.email_intents (
  id uuid primary key default extensions.gen_random_uuid(),
  environment text not null check(environment='sandbox'),
  purpose text not null check(purpose='order_confirmation'),
  order_id uuid not null references public.orders(id),
  recipient text,
  receipt jsonb check(receipt is null or pg_catalog.jsonb_typeof(receipt)='object'),
  state text not null check(state in ('queued','leased','retry','accepted','blocked','unsendable','uncertain','failed')),
  idempotency_key text not null unique,
  request_payload jsonb check(request_payload is null or pg_catalog.jsonb_typeof(request_payload)='object'),
  first_attempt_at timestamptz,
  attempt_count integer not null default 0 check(attempt_count between 0 and 5),
  lease_token uuid,
  lease_expires_at timestamptz,
  next_attempt_at timestamptz not null default pg_catalog.clock_timestamp(),
  provider_email_id text unique,
  delivery_status text check(delivery_status in ('sent','delayed','delivered','bounced','complained','suppressed','failed')),
  delivery_occurred_at timestamptz,
  error_code text check(error_code is null or error_code ~ '^[a-z][a-z0-9_]{0,63}$'),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  content_deleted_at timestamptz,
  unique(environment,purpose,order_id),
  check((lease_token is null)=(lease_expires_at is null)),
  check((first_attempt_at is null)=(request_payload is null) or content_deleted_at is not null),
  check(content_deleted_at is null or (recipient is null and receipt is null and request_payload is null))
);
create index email_intents_dispatch_idx on private.email_intents(environment,next_attempt_at,created_at)
  where state in ('queued','retry','uncertain','leased') and content_deleted_at is null;
create index email_intents_lease_idx on private.email_intents(lease_expires_at) where lease_token is not null;

-- Store only correlation/delivery facts; never persist an unfiltered provider payload or address here.
create table private.email_event_receipts (
  event_id text primary key check(pg_catalog.length(event_id) between 1 and 200),
  environment text not null check(environment='sandbox'),
  message_id uuid,
  provider_email_id text not null check(pg_catalog.length(provider_email_id) between 1 and 200),
  event_type text not null check(event_type in ('email.sent','email.delivery_delayed','email.delivered',
    'email.bounced','email.complained','email.suppressed','email.failed')),
  occurred_at timestamptz not null,
  received_at timestamptz not null default pg_catalog.clock_timestamp(),
  disposition text not null check(disposition in ('matched','unmatched','conflict'))
);
create index email_event_receipts_message_idx on private.email_event_receipts(message_id,received_at);

alter table private.email_controls enable row level security;
alter table private.email_controls force row level security;
alter table private.email_intents enable row level security;
alter table private.email_intents force row level security;
alter table private.email_event_receipts enable row level security;
alter table private.email_event_receipts force row level security;
revoke all on private.email_controls,private.email_intents,private.email_event_receipts from public,anon,authenticated,service_role;
grant select,update on private.email_controls to service_role;
grant select,insert,update on private.email_intents to service_role;
grant select,insert on private.email_event_receipts to service_role;

create function private.preserve_email_identity() returns trigger language plpgsql
security invoker set search_path='' as $$
begin
  if tg_op='DELETE' then
    raise exception using errcode='55000',message='email logical identity must be retained';
  end if;
  if row(new.id,new.environment,new.purpose,new.order_id,new.idempotency_key,new.created_at)
    is distinct from row(old.id,old.environment,old.purpose,old.order_id,old.idempotency_key,old.created_at)
    or (old.first_attempt_at is not null and new.first_attempt_at is distinct from old.first_attempt_at)
    or new.attempt_count<old.attempt_count
    or (old.provider_email_id is not null and new.provider_email_id is distinct from old.provider_email_id)
    or (old.content_deleted_at is not null and new.content_deleted_at is distinct from old.content_deleted_at)
  then raise exception using errcode='55000',message='email identity and attempt history are immutable'; end if;
  if new.content_deleted_at is null and (
    new.recipient is distinct from old.recipient or new.receipt is distinct from old.receipt
    or (old.request_payload is not null and new.request_payload is distinct from old.request_payload))
  then raise exception using errcode='55000',message='email receipt and prepared request are immutable'; end if;
  if new.content_deleted_at is not null and (new.state in ('queued','leased','retry') or new.lease_token is not null) then
    raise exception using errcode='55000',message='active email content cannot be deleted';
  end if;
  return new;
end $$;
create trigger preserve_email_identity before update or delete on private.email_intents
  for each row execute function private.preserve_email_identity();
revoke all on function private.preserve_email_identity() from public,anon,authenticated,service_role;

create function public.configure_order_confirmation_email(
  p_enabled boolean,p_accepted_after timestamptz,p_expected_updated_at timestamptz
) returns boolean language plpgsql security invoker set search_path='' as $$
declare v_control private.email_controls%rowtype;
begin
  select * into v_control from private.email_controls
    where environment='sandbox' and purpose='order_confirmation' for update;
  if not found or p_enabled is null or p_accepted_after is null
    or v_control.updated_at is distinct from p_expected_updated_at
    or p_accepted_after<v_control.accepted_after then return false; end if;
  update private.email_controls set enabled=p_enabled,
    accepted_after=case when p_enabled and not v_control.enabled
      then greatest(p_accepted_after,pg_catalog.clock_timestamp()) else p_accepted_after end,
    updated_at=pg_catalog.clock_timestamp()
    where environment='sandbox' and purpose='order_confirmation';
  return true;
end $$;

create function public.read_order_confirmation_email_control() returns jsonb
language sql stable security invoker set search_path='' as $$
  select pg_catalog.jsonb_build_object('environment',environment,'purpose',purpose,'enabled',enabled,
    'acceptedAfter',accepted_after,'updatedAt',updated_at)
  from private.email_controls where environment='sandbox' and purpose='order_confirmation';
$$;

create function private.email_intent_work(p_intent private.email_intents) returns jsonb
language sql immutable security invoker set search_path='' as $$
  select pg_catalog.jsonb_build_object('id',p_intent.id,'environment',p_intent.environment,
    'purpose',p_intent.purpose,'recipient',p_intent.recipient,'receipt',p_intent.receipt,
    'requestPayload',p_intent.request_payload,'idempotencyKey',p_intent.idempotency_key,
    'firstAttemptAt',p_intent.first_attempt_at,'attemptCount',p_intent.attempt_count,'leaseToken',p_intent.lease_token);
$$;

create function public.claim_email_intents(p_environment text,p_lease_token uuid,p_limit integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_work jsonb;
begin
  if p_environment is distinct from 'sandbox' or p_lease_token is null or p_limit is null or p_limit not between 1 and 5 then
    raise exception using errcode='22023',message='invalid email claim';
  end if;
  -- An expired worker may already have sent. Once provider idempotency is near expiry,
  -- preserve uncertainty for human reconciliation instead of issuing another send.
  with expired as (
    select id from private.email_intents where environment=p_environment and state in ('leased','retry','uncertain')
      and (lease_expires_at is null or lease_expires_at<=pg_catalog.clock_timestamp())
      and first_attempt_at is not null and (first_attempt_at<=pg_catalog.clock_timestamp()-interval '23 hours' or attempt_count>=5)
      and (state<>'uncertain' or error_code is distinct from 'reconciliation_required')
    order by created_at,id for update skip locked limit p_limit
  ) update private.email_intents i set state='uncertain',lease_token=null,lease_expires_at=null,
    error_code='reconciliation_required',updated_at=pg_catalog.clock_timestamp()
    from expired where i.id=expired.id;
  with accepted as (
    select id from private.email_intents where environment=p_environment and state='accepted'
      and lease_expires_at<=pg_catalog.clock_timestamp()
    order by lease_expires_at,id for update skip locked limit p_limit
  ) update private.email_intents i set lease_token=null,lease_expires_at=null,updated_at=pg_catalog.clock_timestamp()
    from accepted where i.id=accepted.id;
  with candidates as (
    select id from private.email_intents where environment=p_environment
      and content_deleted_at is null and provider_email_id is null and attempt_count<5
      and (first_attempt_at is null or first_attempt_at>pg_catalog.clock_timestamp()-interval '23 hours')
      and (state in ('queued','retry','uncertain') or (state='leased' and lease_expires_at<=pg_catalog.clock_timestamp()))
      and next_attempt_at<=pg_catalog.clock_timestamp()
      and delivery_status is null
    order by next_attempt_at,created_at,id for update skip locked limit p_limit
  ), claimed as (
    update private.email_intents i set state='leased',lease_token=p_lease_token,
      lease_expires_at=pg_catalog.clock_timestamp()+interval '5 minutes',updated_at=pg_catalog.clock_timestamp()
    from candidates c where i.id=c.id returning i.*
  ) select coalesce(pg_catalog.jsonb_agg(private.email_intent_work(claimed)),'[]'::jsonb) into v_work from claimed;
  return v_work;
end $$;

create function public.prepare_email_attempt(p_id uuid,p_lease_token uuid,p_request_payload jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_intent private.email_intents%rowtype;
begin
  select * into v_intent from private.email_intents where id=p_id for update;
  if not found or v_intent.state<>'leased' or v_intent.lease_token is distinct from p_lease_token
    or p_lease_token is null or v_intent.lease_expires_at<=pg_catalog.clock_timestamp()
    or v_intent.attempt_count>=5 or v_intent.content_deleted_at is not null
    or v_intent.provider_email_id is not null
    or (v_intent.first_attempt_at is not null and v_intent.first_attempt_at<=pg_catalog.clock_timestamp()-interval '23 hours')
  then return null; end if;
  if p_request_payload is null or pg_catalog.jsonb_typeof(p_request_payload)<>'object'
    or p_request_payload->'to' is distinct from pg_catalog.jsonb_build_array(v_intent.recipient)
    or pg_catalog.jsonb_typeof(p_request_payload->'from') is distinct from 'string'
    or pg_catalog.length(p_request_payload->>'from') not between 3 and 320
    or pg_catalog.jsonb_typeof(p_request_payload->'subject') is distinct from 'string'
    or pg_catalog.length(p_request_payload->>'subject') not between 1 and 300
    or pg_catalog.jsonb_typeof(p_request_payload->'reply_to') is distinct from 'string'
    or pg_catalog.length(p_request_payload->>'reply_to') not between 3 and 254
    or pg_catalog.jsonb_typeof(p_request_payload->'html') is distinct from 'string'
    or pg_catalog.length(p_request_payload->>'html') not between 1 and 1000000
    or pg_catalog.jsonb_typeof(p_request_payload->'text') is distinct from 'string'
    or pg_catalog.length(p_request_payload->>'text') not between 1 and 1000000
    or p_request_payload->'tags' is distinct from pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('name','helix_environment','value',v_intent.environment),
      pg_catalog.jsonb_build_object('name','helix_message_id','value',v_intent.id::text))
    or p_request_payload-array['from','to','reply_to','subject','html','text','tags']<>'{}'::jsonb
    or (v_intent.request_payload is not null and v_intent.request_payload is distinct from p_request_payload)
  then raise exception using errcode='22023',message='email request does not match frozen envelope'; end if;
  update private.email_intents set request_payload=coalesce(request_payload,p_request_payload),
    first_attempt_at=coalesce(first_attempt_at,pg_catalog.clock_timestamp()),attempt_count=attempt_count+1,
    updated_at=pg_catalog.clock_timestamp() where id=p_id returning * into v_intent;
  return private.email_intent_work(v_intent);
end $$;

create function public.finish_email_attempt(
  p_id uuid,p_lease_token uuid,p_outcome text,p_provider_email_id text,p_error_code text
) returns boolean language plpgsql security invoker set search_path='' as $$
declare v_intent private.email_intents%rowtype;
begin
  if p_outcome is null or p_outcome not in ('accepted','retry','uncertain','blocked','failed')
    or (p_error_code is not null and p_error_code !~ '^[a-z][a-z0-9_]{0,63}$')
    or (p_provider_email_id is not null and pg_catalog.length(p_provider_email_id) not between 1 and 200)
    or (p_outcome<>'accepted' and p_provider_email_id is not null)
  then raise exception using errcode='22023',message='invalid email attempt result'; end if;
  select * into v_intent from private.email_intents where id=p_id for update;
  if not found or p_lease_token is null or v_intent.lease_token is distinct from p_lease_token
    or v_intent.state not in ('leased','accepted')
    or v_intent.lease_expires_at<=pg_catalog.clock_timestamp() then return false; end if;
  if p_outcome='accepted' and (p_provider_email_id is null or v_intent.first_attempt_at is null) then return false; end if;
  if p_provider_email_id is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('email-provider:'||p_provider_email_id,0));
  end if;
  if p_provider_email_id is not null and (v_intent.provider_email_id is not null and v_intent.provider_email_id<>p_provider_email_id
    or exists(select 1 from private.email_intents where provider_email_id=p_provider_email_id and id<>p_id)) then
    update private.email_intents set error_code='provider_identity_conflict',updated_at=pg_catalog.clock_timestamp() where id=p_id;
    return false;
  end if;
  update private.email_intents set
    state=case when provider_email_id is not null then 'accepted'
      when p_outcome in ('retry','uncertain') and first_attempt_at is not null
        and (first_attempt_at<=pg_catalog.clock_timestamp()-interval '23 hours' or attempt_count>=5) then 'uncertain'
      else p_outcome end,
    provider_email_id=coalesce(provider_email_id,p_provider_email_id),
    error_code=case when provider_email_id is not null then null else p_error_code end,
    next_attempt_at=pg_catalog.clock_timestamp()+pg_catalog.make_interval(secs=>least(3600,60*(2^greatest(attempt_count-1,0)))::integer),
    lease_token=null,lease_expires_at=null,updated_at=pg_catalog.clock_timestamp()
  where id=p_id;
  return true;
end $$;

create function private.email_delivery_rank(p_status text) returns integer language sql immutable
security invoker set search_path='' as $$
 select case p_status when 'sent' then 1 when 'delayed' then 2 when 'failed' then 3 when 'delivered' then 4
   when 'bounced' then 5 when 'suppressed' then 6 when 'complained' then 7 else 0 end;
$$;

create function public.record_email_delivery_event(
  p_event_id text,p_environment text,p_message_id uuid,p_provider_email_id text,p_event_type text,
  p_occurred_at timestamptz,p_sender text,p_recipient text
) returns text language plpgsql security invoker set search_path='' as $$
declare v_intent private.email_intents%rowtype; v_disposition text:='unmatched'; v_status text;
begin
  if p_environment is distinct from 'sandbox' or p_event_id is null or pg_catalog.length(p_event_id) not between 1 and 200
    or p_provider_email_id is null or pg_catalog.length(p_provider_email_id) not between 1 and 200
    or p_event_type is null or p_event_type not in ('email.sent','email.delivery_delayed','email.delivered',
      'email.bounced','email.complained','email.suppressed','email.failed') or p_occurred_at is null
  then raise exception using errcode='22023',message='invalid email delivery event'; end if;
  -- Serialize the event identity even when no local intent matches it.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('email-event:'||p_event_id,0));
  if exists(select 1 from private.email_event_receipts where event_id=p_event_id) then return 'duplicate'; end if;
  select * into v_intent from private.email_intents where id=p_message_id and environment=p_environment for update;
  if found and v_intent.first_attempt_at is not null and (
    (v_intent.content_deleted_at is not null and v_intent.provider_email_id=p_provider_email_id)
    or (v_intent.request_payload is not null
      and pg_catalog.lower(pg_catalog.btrim(p_sender))=pg_catalog.lower(pg_catalog.btrim(v_intent.request_payload->>'from'))
      and p_recipient=v_intent.recipient
      and v_intent.request_payload->'to'=pg_catalog.jsonb_build_array(p_recipient))) then
    -- Different intents cannot race to bind the same provider message.
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('email-provider:'||p_provider_email_id,0));
    if (v_intent.provider_email_id is not null and v_intent.provider_email_id<>p_provider_email_id)
      or exists(select 1 from private.email_intents where provider_email_id=p_provider_email_id and id<>p_message_id)
    then v_disposition:='conflict'; else v_disposition:='matched'; end if;
  end if;
  insert into private.email_event_receipts(event_id,environment,message_id,provider_email_id,event_type,occurred_at,disposition)
    values(p_event_id,p_environment,p_message_id,p_provider_email_id,p_event_type,p_occurred_at,v_disposition);
  if v_disposition='matched' then
    v_status:=case p_event_type when 'email.delivery_delayed' then 'delayed' else pg_catalog.substr(p_event_type,7) end;
    update private.email_intents set provider_email_id=p_provider_email_id,state='accepted',
      delivery_status=case when private.email_delivery_rank(v_status)>private.email_delivery_rank(delivery_status)
        then v_status else delivery_status end,
      delivery_occurred_at=case when private.email_delivery_rank(v_status)>private.email_delivery_rank(delivery_status)
        then p_occurred_at else delivery_occurred_at end,
      error_code=null,updated_at=pg_catalog.clock_timestamp() where id=p_message_id;
  end if;
  return v_disposition;
end $$;

create function public.inspect_email_deliveries(p_id uuid default null) returns jsonb
language sql stable security invoker set search_path='' as $$
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',i.id,'orderId',i.order_id,
    'environment',i.environment,'purpose',i.purpose,'state',i.state,'attemptCount',i.attempt_count,
    'firstAttemptAt',i.first_attempt_at,'providerEmailId',i.provider_email_id,'deliveryStatus',i.delivery_status,
    'errorCode',i.error_code,'createdAt',i.created_at,'updatedAt',i.updated_at,'nextAttemptAt',i.next_attempt_at,
    'contentDeletedAt',i.content_deleted_at,
    'conflictCount',(select pg_catalog.count(*) from private.email_event_receipts r
      where r.message_id=i.id and r.disposition='conflict')) order by i.created_at desc),'[]'::jsonb)
  from (select * from private.email_intents where p_id is null or id=p_id order by created_at desc limit 100) i;
$$;

create function public.retry_email_delivery(p_id uuid,p_expected_updated_at timestamptz) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
  update private.email_intents set state='queued',next_attempt_at=pg_catalog.clock_timestamp(),
    error_code=null,updated_at=pg_catalog.clock_timestamp()
  where id=p_id and updated_at=p_expected_updated_at and state in ('blocked','failed','retry','uncertain')
    and provider_email_id is null and delivery_status is null and content_deleted_at is null
    and lease_token is null and attempt_count<5
    and (first_attempt_at is null or first_attempt_at>pg_catalog.clock_timestamp()-interval '23 hours');
  return found;
end $$;

revoke all on function private.email_intent_work(private.email_intents),private.email_delivery_rank(text),
  public.read_order_confirmation_email_control(),
  public.configure_order_confirmation_email(boolean,timestamptz,timestamptz),
  public.claim_email_intents(text,uuid,integer),public.prepare_email_attempt(uuid,uuid,jsonb),
  public.finish_email_attempt(uuid,uuid,text,text,text),
  public.record_email_delivery_event(text,text,uuid,text,text,timestamptz,text,text),
  public.inspect_email_deliveries(uuid),public.retry_email_delivery(uuid,timestamptz) from public,anon,authenticated;
grant execute on function private.email_intent_work(private.email_intents),private.email_delivery_rank(text),
  public.read_order_confirmation_email_control(),
  public.configure_order_confirmation_email(boolean,timestamptz,timestamptz),
  public.claim_email_intents(text,uuid,integer),public.prepare_email_attempt(uuid,uuid,jsonb),
  public.finish_email_attempt(uuid,uuid,text,text,text),
  public.record_email_delivery_event(text,text,uuid,text,text,timestamptz,text,text),
  public.inspect_email_deliveries(uuid),public.retry_email_delivery(uuid,timestamptz) to service_role;

-- Keep all existing financial guards and effects in the shared finalizer.
create or replace function public.finalize_verified_checkout_payment(
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
  v_first_paid boolean;
  v_email_enabled boolean;
  v_accepted_after timestamptz;
  v_recipient text;
  v_recipient_valid boolean;
  v_receipt jsonb;
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
  v_first_paid:=v_order.status<>'paid';
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
  -- This insertion is part of the verified-payment transaction. A storage failure
  -- rolls the paid transition and proof back together; delivery never runs here.
  select enabled,accepted_after into v_email_enabled,v_accepted_after from private.email_controls
    where environment='sandbox' and purpose='order_confirmation' for share;
  if v_first_paid and v_order.status='paid' and v_email_enabled
    and v_order.created_at>=v_accepted_after and v_terms->>'environment'='sandbox' then
    v_recipient:=p_facts->>'customerEmail';
    v_recipient_valid:=v_recipient is not null and pg_catalog.length(v_recipient)<=254
      and v_recipient ~* '^[A-Z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?)+$';
    select pg_catalog.jsonb_build_object('orderNumber',v_order.order_number,'currency',p_facts->>'currency',
      'items',coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'name',i.product_name || case when coalesce(i.variant_label,'')<>'' then ' — ' || i.variant_label else '' end,
        'quantity',i.quantity,'unitPriceCents',i.unit_price_cents,'lineSubtotalCents',i.line_subtotal_cents)
        order by i.id),'[]'::jsonb),
      'merchandiseSubtotalCents',(p_facts->>'merchandiseSubtotalCents')::integer,
      'discountCents',(p_facts->>'discountCents')::integer,'shippingCents',(p_facts->>'shippingCents')::integer,
      'taxCents',(p_facts->>'taxCents')::integer,'totalCents',(p_facts->>'totalCents')::integer,
      'shippingName',p_facts->>'shippingName','shippingAddress',v_shipping_address)
      into v_receipt from public.order_items i where i.order_id=p_order_id;
    insert into private.email_intents(environment,purpose,order_id,recipient,receipt,state,idempotency_key,error_code)
    values('sandbox','order_confirmation',p_order_id,v_recipient,v_receipt,
      case when v_recipient_valid then 'queued' else 'unsendable' end,
      'sandbox:order_confirmation:'||p_order_id::text,
      case when v_recipient_valid then null else 'invalid_recipient' end)
    on conflict(environment,purpose,order_id) do nothing;
  end if;
  return next v_order;
end $$;
