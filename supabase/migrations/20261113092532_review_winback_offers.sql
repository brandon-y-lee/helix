-- Private unconditional next-purchase entitlement, once per genuine original order.
alter table private.lifecycle_offers drop constraint lifecycle_offers_kind_check;
alter table private.lifecycle_offers add constraint lifecycle_offers_kind_check check(kind in ('welcome','cart','review_winback'));
alter table private.lifecycle_offers drop constraint lifecycle_offers_check;
alter table private.lifecycle_offers add constraint lifecycle_offers_check check((kind='welcome' and percent_off=15) or (kind in ('cart','review_winback') and percent_off=10));
alter table private.lifecycle_offers add column source_order_id uuid references public.orders(id),
 add column source_user_id uuid references auth.users(id), add column delivery_evidence_id text, add column delivery_revision text,
 add column risk_evidence_id text, add column risk_revision text;
alter table private.lifecycle_offers add constraint lifecycle_review_offer_provenance check(
 (kind='review_winback' and source_order_id is not null and source_user_id is not null and user_id is not distinct from source_user_id
   and source_key='review_winback:'||source_order_id::text and delivery_evidence_id is not null and delivery_revision is not null
   and risk_evidence_id is not null and risk_revision is not null)
 or (kind<>'review_winback' and source_order_id is null and source_user_id is null and delivery_evidence_id is null
   and delivery_revision is null and risk_evidence_id is null and risk_revision is null));
create unique index lifecycle_review_order_once on private.lifecycle_offers(source_order_id) where kind='review_winback';

create function private.freeze_review_offer_provenance() returns trigger language plpgsql security invoker set search_path='' as $$ begin
 if row(new.source_order_id,new.source_user_id,new.delivery_evidence_id,new.delivery_revision,new.risk_evidence_id,new.risk_revision)
   is distinct from row(old.source_order_id,old.source_user_id,old.delivery_evidence_id,old.delivery_revision,old.risk_evidence_id,old.risk_revision)
 then raise exception 'Offer source is immutable'; end if;
 return new;
end $$;
create trigger freeze_review_offer_provenance before update on private.lifecycle_offers for each row execute function private.freeze_review_offer_provenance();

create function public.grant_review_winback_offer(p_subscriber_id uuid,p_order_id uuid,p_coupon_id text) returns uuid
language plpgsql security invoker set search_path='' as $$
declare src jsonb; s private.marketing_subscribers; existing private.lifecycle_offers; result uuid;
begin
 if not exists(select 1 from private.lifecycle_offer_control where enabled) then return null; end if;
 if p_order_id is null or p_subscriber_id is null or p_coupon_id is null or p_coupon_id !~ '^[A-Za-z0-9_-]{1,255}$' then raise exception 'Invalid offer'; end if;
 -- Match dispatcher ordering: original order, recipient/subscriber, then entitlement.
 perform 1 from public.orders where id=p_order_id for update;
 if not found then return null; end if;
 select * into s from private.marketing_subscribers where id=p_subscriber_id;
 if not found then return null; end if;
 perform private.marketing_address_lock(s.normalized_email);
 perform 1 from private.marketing_subscribers where id=p_subscriber_id for update;
 src:=private.review_winback_source(p_subscriber_id,p_order_id);
 if src is null then return null; end if;
 perform pg_advisory_xact_lock(hashtextextended('lifecycle-offer:'||(src->>'email'),0));
 select * into existing from private.lifecycle_offers where source_order_id=p_order_id for update;
 if found then
   if existing.email is distinct from src->>'email' or existing.source_user_id::text is distinct from src->>'userId'
      or existing.coupon_id is distinct from p_coupon_id or not private.review_winback_offer_eligible(existing) then return null; end if;
   return existing.id;
 end if;
 insert into private.lifecycle_offers(kind,email,user_id,source_key,percent_off,coupon_id,source_order_id,source_user_id,
   delivery_evidence_id,delivery_revision,risk_evidence_id,risk_revision)
 values('review_winback',src->>'email',(src->>'userId')::uuid,src->>'sourceKey',10,p_coupon_id,p_order_id,(src->>'userId')::uuid,
   src->>'deliveryEvidenceId',src->>'deliveryRevision',src->>'riskEvidenceId',src->>'riskRevision') returning id into result;
 return result;
end $$;
revoke all on function public.grant_review_winback_offer(uuid,uuid,text),private.freeze_review_offer_provenance() from public,anon,authenticated;
grant execute on function public.grant_review_winback_offer(uuid,uuid,text),private.freeze_review_offer_provenance() to service_role;

-- Existing held original-checkout recovery remains unchanged; fresh use rechecks proof.
create or replace function public.read_lifecycle_offers(p_user_id uuid,p_cart_id uuid default null,p_new_admission boolean default true) returns jsonb language sql volatile security invoker set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'kind',o.kind,'percentOff',o.percent_off,'expiresAt',o.expires_at,'couponId',o.coupon_id,'recovering',o.reserved_order_id is not null) order by o.percent_off desc,o.issued_at),'[]'::jsonb)
  from private.lifecycle_offers o join (select p_user_id as id,private.lifecycle_offer_verified_email(p_user_id,false) as email) u on u.email=o.email
  where (o.user_id is null or o.user_id=u.id) and o.consumed_at is null and ((o.reserved_order_id is null and (o.kind<>'review_winback' or private.review_winback_offer_eligible(o)) and o.expires_at>now() and p_new_admission and exists(select 1 from private.lifecycle_offer_control where enabled)) or exists(
      select 1 from public.orders held where held.id=o.reserved_order_id and held.user_id=u.id and held.cart_id=p_cart_id
        and held.status in ('pending_payment','payment_failed') and held.stripe_checkout_session_id is null
        and not private.checkout_provider_call_possible(held.id)))
    and (o.kind<>'welcome' or (not exists(select 1 from public.orders p where (p.user_id=u.id or lower(btrim(p.customer_email))=o.email) and p.status in ('paid','refunded'))
      and not exists(select 1 from private.lifecycle_offers w where w.kind='welcome' and w.user_id=u.id and w.id<>o.id)))
$$;

-- All existing Order rows precede Cart/auth/offer locks, in the same UUID order
-- as lifecycle email preparation. Outer entrypoints must call this before locking
-- the consuming order: reordering only reserve_lifecycle_offer would be too late.
create function private.lock_lifecycle_offer_orders(p_order_id uuid,p_offer_id uuid) returns void
language plpgsql security invoker set search_path='' as $$ begin
  perform 1 from public.orders where id=p_order_id
    or id=(select source_order_id from private.lifecycle_offers where id=p_offer_id)
    order by id for update;
end $$;
revoke all on function private.lock_lifecycle_offer_orders(uuid,uuid) from public,anon,authenticated;
grant execute on function private.lock_lifecycle_offer_orders(uuid,uuid) to service_role;

create or replace function private.reserve_lifecycle_offer(p_order_id uuid,p_offer_id uuid) returns void language plpgsql security invoker set search_path='' as $$
declare v_order public.orders; v_offer private.lifecycle_offers; v_email text;
begin
  perform private.lock_lifecycle_offer_orders(p_order_id,p_offer_id);
  select * into v_order from public.orders where id=p_order_id for update;
  if not found or v_order.checkout_environment<>'sandbox' or v_order.status not in ('pending_payment','payment_failed') or v_order.user_id is null then raise exception 'Offer unavailable'; end if;
  v_email:=private.lifecycle_offer_verified_email(v_order.user_id,true);
  if v_email is null then raise exception 'Offer requires a verified account'; end if;
  select * into v_offer from private.lifecycle_offers where id=p_offer_id for update;
  if not found or v_offer.email<>v_email or lower(btrim(v_order.customer_email)) is distinct from v_email
    or (v_offer.user_id is not null and v_offer.user_id<>v_order.user_id) or v_offer.consumed_at is not null
    or (v_offer.reserved_order_id is not null and v_offer.reserved_order_id<>p_order_id)
    or v_order.reward_points_redeemed<>0 or v_order.reward_discount_cents<>0 or v_order.referral_code is not null
    or v_order.discount_cents<>floor((v_order.merchandise_subtotal_cents::bigint*v_offer.percent_off+50)/100)::integer
    or v_order.metadata->>'offer_id' is distinct from p_offer_id::text
    or v_order.metadata->>'offer_coupon_id' is distinct from v_offer.coupon_id
  then raise exception 'Offer unavailable'; end if;
  -- A held original reservation survives expiry and configuration pause for recovery.
  if v_offer.reserved_order_id is null then
    if v_offer.kind='review_winback' and not private.review_winback_offer_eligible(v_offer) then raise exception 'Offer source unavailable'; end if;
    if v_offer.expires_at<=clock_timestamp() or not exists(select 1 from private.lifecycle_offer_control where enabled) then raise exception 'Offer expired or paused'; end if;
    if v_offer.kind='welcome' and (exists(select 1 from public.orders where id<>p_order_id and (user_id=v_order.user_id or lower(btrim(customer_email))=v_email) and status in ('paid','refunded'))
      or exists(select 1 from private.lifecycle_offers where kind='welcome' and user_id=v_order.user_id and id<>p_offer_id)) then raise exception 'Welcome offer unavailable'; end if;
  end if;
  update private.lifecycle_offers set user_id=v_order.user_id,reserved_order_id=p_order_id where id=p_offer_id;
end $$;

create or replace function public.read_lifecycle_offer_for_delivery(p_offer_id uuid,p_email text) returns jsonb
language sql volatile security invoker set search_path='' as $$
  select jsonb_build_object('id',id,'kind',kind,'percentOff',percent_off,'expiresAt',expires_at,'couponId',coupon_id)
  from private.lifecycle_offers o where id=p_offer_id and email=lower(btrim(p_email)) and consumed_at is null
    and (user_id is null or private.lifecycle_offer_verified_email(user_id)=email)
    and reserved_order_id is null and expires_at>now() and exists(select 1 from private.lifecycle_offer_control where enabled)
    and (kind<>'review_winback' or private.review_winback_offer_eligible(o))
    and (kind<>'welcome' or private.lifecycle_welcome_recipient_eligible(email,id))
$$;

create or replace function public.reserve_checkout_order_with_offer(
  p_idempotency_key text,p_user_id uuid,p_cart_id uuid,p_checkout_generation uuid,p_customer_email text,p_currency text,
  p_merchandise_subtotal_cents integer,p_discount_cents integer,p_shipping_cents integer,p_tax_cents integer,p_total_cents integer,
  p_referral_code text,p_reward_points_redeemed integer,p_reward_discount_cents integer,p_checkout_environment text,p_metadata jsonb,p_items jsonb,p_offer_id uuid
) returns setof public.orders language plpgsql security invoker set search_path='' as $$ declare v_order public.orders; v_coupon text;
begin
  -- Preserve the single-send predecessor guard before snapshot advisories/rows.
  perform private.lock_checkout_cart_creation(p_cart_id);
  -- Acquire snapshot's advisory locks before its row locks, including replay.
  perform pg_advisory_xact_lock(hashtextextended('checkout-cart:'||p_cart_id::text||':'||p_checkout_generation::text,0));
  perform pg_advisory_xact_lock(hashtextextended('checkout:'||p_idempotency_key,0));
  perform private.lock_lifecycle_offer_orders((select id from public.orders where idempotency_key=p_idempotency_key),p_offer_id);
  select coupon_id into v_coupon from private.lifecycle_offers where id=p_offer_id;
  if not found then raise exception 'Offer unavailable'; end if;
  select * into v_order from public.reserve_checkout_order_snapshot_v2(p_idempotency_key,p_user_id,p_cart_id,p_checkout_generation,p_customer_email,p_currency,
    p_merchandise_subtotal_cents,p_discount_cents,p_shipping_cents,p_tax_cents,p_total_cents,p_referral_code,p_reward_points_redeemed,p_reward_discount_cents,
    p_checkout_environment,p_metadata||jsonb_build_object('offer_id',p_offer_id,'offer_coupon_id',v_coupon),p_items);
  perform private.reserve_lifecycle_offer(v_order.id,p_offer_id);
  return next v_order;
end $$;

create or replace function public.prepare_checkout_attempt_once(p_order_id uuid,p_attempt_token uuid,p_stripe_idempotency_key text,p_terms jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$ declare v_offer text; begin
  -- The single-send predecessor acquires this before Order locks.
  perform private.lock_checkout_cart_creation((select cart_id from public.orders where id=p_order_id));
  -- Metadata binding is immutable; read it without a lock to discover the pair.
  select metadata->>'offer_id' into v_offer from public.orders where id=p_order_id;
  perform private.lock_lifecycle_offer_orders(p_order_id,v_offer::uuid);
  select metadata->>'offer_id' into v_offer from public.orders where id=p_order_id for update;
  if v_offer is not null then
    if p_terms->>'offerId' is distinct from v_offer then raise exception 'Offer terms differ'; end if;
    perform private.reserve_lifecycle_offer(p_order_id,v_offer::uuid);
  elsif p_terms->>'offerId' is not null then raise exception 'Unexpected offer'; end if;
  return private.prepare_checkout_attempt_without_offer(p_order_id,p_attempt_token,p_stripe_idempotency_key,p_terms-'offerId');
end $$;
