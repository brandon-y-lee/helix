-- One committed permission to invoke Session.create. SDK retries belong to that
-- single invocation; a later request never replays an uncertain provider call.
create table private.checkout_provider_sends (
  attempt_id uuid primary key references public.payment_attempts(id),
  first_send_at timestamptz,
  legacy boolean not null
);
alter table private.checkout_provider_sends enable row level security;
alter table private.checkout_provider_sends force row level security;
revoke all on private.checkout_provider_sends from public,anon,authenticated,service_role;
grant select,insert,update on private.checkout_provider_sends to service_role;
insert into private.checkout_provider_sends(attempt_id,legacy) select id,true from public.payment_attempts;
create function private.checkout_send_identity_immutable() returns trigger language plpgsql security invoker set search_path='' as $$ begin
  if new.attempt_id is distinct from old.attempt_id or new.legacy is distinct from old.legacy
    or (old.first_send_at is not null and new.first_send_at is distinct from old.first_send_at)
  then raise exception using errcode='55000',message='Checkout send identity is immutable'; end if;
  return new;
end $$;
create trigger checkout_send_identity_immutable before update on private.checkout_provider_sends
for each row execute function private.checkout_send_identity_immutable();

create function private.checkout_provider_call_possible(p_order_id uuid) returns boolean
language sql stable security invoker set search_path='' as $$
  select exists(select 1 from public.payment_attempts a join private.checkout_provider_sends s on s.attempt_id=a.id
    where a.order_id=p_order_id and (s.legacy or s.first_send_at is not null))
    or exists(select 1 from private.checkout_legacy_order_origins where order_id=p_order_id)
$$;
create function private.lock_checkout_cart_creation(p_cart_id uuid) returns void language plpgsql security invoker set search_path='' as $$ begin
  -- Merge takes this short guard exclusively. Checkout paths otherwise contend
  -- only on their own cart, with no provider request inside the transaction.
  perform pg_advisory_xact_lock_shared(hashtextextended('checkout-cart-creation',0));
  perform pg_advisory_xact_lock(hashtextextended('checkout-cart-creation:'||p_cart_id::text,0));
end $$;
create function public.find_unresolved_checkout_order(p_cart_id uuid) returns uuid
language sql stable security invoker set search_path='' as $$
  select o.id from public.orders o where o.cart_id=p_cart_id and o.checkout_environment='sandbox'
    and o.status not in ('paid','refunded') and (
      (o.status in ('pending_payment','payment_failed') and o.stripe_checkout_session_id is not null)
      or (o.stripe_checkout_session_id is null and private.checkout_provider_call_possible(o.id)))
  order by o.created_at,o.id limit 1
$$;
create function public.read_pending_checkout_attempt(p_order_id uuid,p_attempt_id uuid default null) returns jsonb
language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('attemptId',a.id,'orderId',a.order_id,'stripeIdempotencyKey',a.stripe_idempotency_key,
    'contract',c.terms||jsonb_build_object('attemptId',a.id,'sessionId',a.stripe_checkout_session_id),
    'sendStarted',s.first_send_at is not null,'legacy',s.legacy)
  from public.payment_attempts a join private.checkout_payment_contracts c on c.attempt_id=a.id
    join private.checkout_provider_sends s on s.attempt_id=a.id join public.orders o on o.id=a.order_id
  where a.order_id=p_order_id and (p_attempt_id is null or a.id=p_attempt_id)
    and a.contract_version='checkout_v2' and a.stripe_idempotency_key=o.metadata->>'stripe_idempotency_key'
    and o.checkout_environment='sandbox' order by a.created_at desc,a.id limit 1
$$;

-- Stale deployments must stop before making an unfenced provider request.
alter function public.prepare_checkout_payment_contract(uuid,uuid,text,jsonb) set schema private;
alter function private.prepare_checkout_payment_contract(uuid,uuid,text,jsonb) rename to prepare_checkout_payment_contract_once;
create function public.prepare_checkout_payment_contract(p_order_id uuid,p_attempt_token uuid,p_stripe_idempotency_key text,p_terms jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$ begin
  raise exception using errcode='55000',message='Checkout deployment upgrade required';
end $$;
create or replace function public.prepare_checkout_attempt(p_order_id uuid,p_attempt_token uuid,p_expected_session_id text,p_detach_session boolean,p_stripe_idempotency_key text)
returns boolean language sql security invoker set search_path='' as $$ select false $$;
create or replace function public.attach_checkout_session(p_order_id uuid,p_attempt_token uuid,p_session_id text,p_customer_id text,p_stripe_idempotency_key text)
returns boolean language sql security invoker set search_path='' as $$ select false $$;
create function public.prepare_checkout_attempt_once(p_order_id uuid,p_attempt_token uuid,p_stripe_idempotency_key text,p_terms jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_order public.orders; v_cart uuid; v_terms jsonb; v_existing jsonb;
begin
  select cart_id into v_cart from public.orders where id=p_order_id;
  perform private.lock_checkout_cart_creation(v_cart);
  select * into v_order from public.orders where id=p_order_id for update;
  if not found or p_attempt_token is null or v_order.checkout_attempt_token is distinct from p_attempt_token
    or v_order.checkout_attempt_started_at is null or v_order.checkout_attempt_started_at<=clock_timestamp()-interval '5 minutes'
    or v_order.status not in ('pending_payment','payment_failed') or v_order.checkout_environment<>'sandbox'
    or not exists(select 1 from public.carts where id=v_cart and status='active')
    or p_stripe_idempotency_key is null or p_stripe_idempotency_key not like 'stripe-session:'||p_order_id::text||':%'
  then raise exception using errcode='22023',message='Checkout preparation unavailable'; end if;
  v_existing:=public.read_pending_checkout_attempt(p_order_id);
  if v_existing is not null then return v_existing; end if;
  if private.checkout_provider_call_possible(p_order_id) or v_order.stripe_checkout_session_id is not null
    or exists(select 1 from public.payment_attempts where order_id=p_order_id)
    or exists(select 1 from public.orders o where o.cart_id=v_cart and o.id<>p_order_id and o.status not in ('paid','refunded')
      and ((o.status in ('pending_payment','payment_failed') and exists(select 1 from public.payment_attempts where order_id=o.id))
        or (o.stripe_checkout_session_id is null and private.checkout_provider_call_possible(o.id))))
  then raise exception using errcode='55000',message='Existing checkout requires verification'; end if;
  update public.orders set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('stripe_idempotency_key',p_stripe_idempotency_key,'stripe_creation_outcome','creating') where id=p_order_id;
  v_terms:=private.prepare_checkout_payment_contract_once(p_order_id,p_attempt_token,p_stripe_idempotency_key,p_terms);
  insert into private.checkout_provider_sends(attempt_id,legacy) values((v_terms->>'attemptId')::uuid,false);
  return public.read_pending_checkout_attempt(p_order_id,(v_terms->>'attemptId')::uuid);
end $$;
create function public.start_checkout_attempt_send(p_order_id uuid,p_attempt_id uuid,p_attempt_token uuid,p_stripe_idempotency_key text)
returns boolean language plpgsql security invoker set search_path='' as $$ declare v_order public.orders; v_cart uuid;
begin
  select cart_id into v_cart from public.orders where id=p_order_id;
  perform private.lock_checkout_cart_creation(v_cart);
  select * into v_order from public.orders where id=p_order_id for update;
  if not found or p_attempt_token is null or v_order.checkout_attempt_token is distinct from p_attempt_token
    or v_order.checkout_attempt_started_at is null or v_order.checkout_attempt_started_at<=clock_timestamp()-interval '5 minutes'
    or v_order.status not in ('pending_payment','payment_failed') or v_order.stripe_checkout_session_id is not null
    or v_order.metadata->>'stripe_idempotency_key' is distinct from p_stripe_idempotency_key
    or not exists(select 1 from public.carts where id=v_cart and status='active')
    or not exists(select 1 from private.checkout_create_receipts where order_id=p_order_id and idempotency_key=p_stripe_idempotency_key and account_id='acct_1Tm9WRFEzyaKzdmq')
    or exists(select 1 from public.orders o where o.cart_id=v_cart and o.id<>p_order_id and o.status not in ('paid','refunded')
      and ((o.status in ('pending_payment','payment_failed') and o.stripe_checkout_session_id is not null)
        or (o.stripe_checkout_session_id is null and private.checkout_provider_call_possible(o.id))))
  then return false; end if;
  perform 1 from public.payment_attempts a join private.checkout_payment_contracts c on c.attempt_id=a.id
    where a.id=p_attempt_id and a.order_id=p_order_id and a.contract_version='checkout_v2' and a.stripe_idempotency_key=p_stripe_idempotency_key for update of a;
  if not found then return false; end if;
  update private.checkout_provider_sends set first_send_at=clock_timestamp()
    where attempt_id=p_attempt_id and not legacy and first_send_at is null;
  if not found then return false; end if;
  update public.orders set metadata=metadata||jsonb_build_object('stripe_creation_outcome','unknown') where id=p_order_id;
  return true;
end $$;
create function public.bind_checkout_attempt_session(p_order_id uuid,p_attempt_id uuid,p_stripe_idempotency_key text,p_session_id text,p_customer_id text)
returns boolean language plpgsql security invoker set search_path='' as $$ declare v_order public.orders; v_attempt public.payment_attempts;
begin
  if p_session_id is null or p_session_id !~ '^cs_test_[A-Za-z0-9_]{1,200}$'
    or (p_customer_id is not null and p_customer_id !~ '^cus_[A-Za-z0-9_]{1,200}$') then return false; end if;
  select * into v_order from public.orders where id=p_order_id for update;
  select * into v_attempt from public.payment_attempts where id=p_attempt_id and order_id=p_order_id for update;
  if not found or v_order.checkout_environment<>'sandbox' or v_attempt.contract_version is distinct from 'checkout_v2'
    or v_attempt.stripe_idempotency_key is distinct from p_stripe_idempotency_key
    or v_order.metadata->>'stripe_idempotency_key' is distinct from p_stripe_idempotency_key
    or not exists(select 1 from private.checkout_payment_contracts where attempt_id=p_attempt_id)
    or not exists(select 1 from private.checkout_provider_sends where attempt_id=p_attempt_id and (legacy or first_send_at is not null))
    or (v_order.stripe_checkout_session_id is not null and v_order.stripe_checkout_session_id<>p_session_id)
    or (v_attempt.stripe_checkout_session_id is not null and v_attempt.stripe_checkout_session_id<>p_session_id)
    or (v_order.stripe_customer_id is not null and p_customer_id is not null and v_order.stripe_customer_id<>p_customer_id)
    or exists(select 1 from public.orders where stripe_checkout_session_id=p_session_id and id<>p_order_id)
    or exists(select 1 from public.payment_attempts where stripe_checkout_session_id=p_session_id and id<>p_attempt_id)
  then return false; end if;
  if v_order.stripe_checkout_session_id=p_session_id and v_attempt.stripe_checkout_session_id=p_session_id then return true; end if;
  if v_order.status in ('paid','refunded') then return false; end if;
  update public.orders set stripe_checkout_session_id=p_session_id,stripe_customer_id=coalesce(stripe_customer_id,p_customer_id),
    metadata=metadata||jsonb_build_object('stripe_creation_outcome','attached') where id=p_order_id;
  update public.payment_attempts set stripe_checkout_session_id=p_session_id where id=p_attempt_id;
  return true;
end $$;

-- Reuse the established reward-release effects, guarding them under the same
-- rewards-account -> Order locks as before. Unknown sends cannot be cancelled.
alter function public.cancel_checkout_order_without_session(uuid,text) set schema private;
alter function private.cancel_checkout_order_without_session(uuid,text) rename to cancel_checkout_order_unsent;
alter function public.fail_checkout_attempt(uuid,uuid,text,boolean) set schema private;
alter function private.fail_checkout_attempt(uuid,uuid,text,boolean) rename to fail_checkout_attempt_unsent;
create function private.lock_checkout_order_rewards(p_order_id uuid) returns void language plpgsql security invoker set search_path='' as $$ declare v_user uuid; begin
  select user_id into v_user from public.orders where id=p_order_id;
  if v_user is not null then perform public.ensure_rewards_account(v_user); perform 1 from public.rewards_accounts where user_id=v_user for update; end if;
  perform 1 from public.orders where id=p_order_id for update;
end $$;
create function public.cancel_checkout_order_without_session(p_order_id uuid,p_reason text) returns boolean
language plpgsql security invoker set search_path='' as $$ begin
  perform private.lock_checkout_order_rewards(p_order_id);
  if private.checkout_provider_call_possible(p_order_id) then return false; end if;
  return private.cancel_checkout_order_unsent(p_order_id,p_reason);
end $$;
create function public.fail_checkout_attempt(p_order_id uuid,p_attempt_token uuid,p_reason text,p_release_rewards boolean) returns boolean
language plpgsql security invoker set search_path='' as $$ begin
  perform private.lock_checkout_order_rewards(p_order_id);
  if private.checkout_provider_call_possible(p_order_id) then return false; end if;
  return private.fail_checkout_attempt_unsent(p_order_id,p_attempt_token,p_reason,p_release_rewards);
end $$;

-- Block a guest merge while an original provider outcome is unknown. This avoids
-- creating a second payable checkout through a new cart identity.
alter function public.merge_guest_cart(uuid,text) set schema private;
alter function private.merge_guest_cart(uuid,text) rename to merge_guest_cart_without_checkout;
create function public.merge_guest_cart(p_user_id uuid,p_guest_token_hash text) returns uuid
language plpgsql security invoker set search_path='' as $$ declare v_cart uuid; begin
  perform pg_advisory_xact_lock(hashtextextended('checkout-cart-creation',0));
  select id into v_cart from public.carts where guest_token_hash=p_guest_token_hash and user_id is null and status='active';
  if public.find_unresolved_checkout_order(v_cart) is not null then
    raise exception using errcode='55000',message='Checkout must be verified before merging this cart'; end if;
  return private.merge_guest_cart_without_checkout(p_user_id,p_guest_token_hash);
end $$;
-- Preserve every existing snapshot check, adding the same short guard before
-- any Order/cart row lock. Both public reservation entry points are protected.
do $$ declare v_function regprocedure; v_definition text; begin
  foreach v_function in array array[
    'public.reserve_checkout_order_snapshot(text,uuid,uuid,text,text,integer,integer,integer,integer,integer,text,integer,integer,text,jsonb,jsonb)'::regprocedure,
    'public.reserve_checkout_order_snapshot_v2(text,uuid,uuid,uuid,text,text,integer,integer,integer,integer,integer,text,integer,integer,text,jsonb,jsonb)'::regprocedure
  ] loop
    v_definition:=pg_get_functiondef(v_function);
    if substring(v_definition from '(?i)\mbegin\M') is null then raise exception 'Checkout reservation guard anchor missing'; end if;
    v_definition:=regexp_replace(v_definition,'(?i)\mbegin\M',E'begin\n  perform private.lock_checkout_cart_creation(p_cart_id);\n  if exists(select 1 from public.orders o where o.id=public.find_unresolved_checkout_order(p_cart_id) and o.idempotency_key is distinct from p_idempotency_key) then\n    raise exception using errcode=\'55000\',message=\'Existing checkout requires verification\';\n  end if;');
    execute v_definition;
  end loop;
end $$;

do $$ declare v_function regprocedure; begin
  for v_function in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where (n.nspname='public' and p.proname in ('find_unresolved_checkout_order','read_pending_checkout_attempt','prepare_checkout_payment_contract',
      'prepare_checkout_attempt','attach_checkout_session','prepare_checkout_attempt_once','start_checkout_attempt_send','bind_checkout_attempt_session',
      'cancel_checkout_order_without_session','fail_checkout_attempt','merge_guest_cart'))
    or (n.nspname='private' and p.proname in ('checkout_provider_call_possible','lock_checkout_cart_creation','prepare_checkout_payment_contract_once',
      'lock_checkout_order_rewards','cancel_checkout_order_unsent','fail_checkout_attempt_unsent','merge_guest_cart_without_checkout'))
  loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role',v_function);
    execute format('grant execute on function %s to service_role',v_function);
  end loop;
end $$;
revoke all on function private.checkout_send_identity_immutable() from public,anon,authenticated,service_role;
