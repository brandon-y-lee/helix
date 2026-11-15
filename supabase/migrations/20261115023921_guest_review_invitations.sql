-- Guest review invitations; no activation or provider truth is introduced.
-- A signature alone is insufficient: optional contracts must be scalar boolean functions.
create function private.guest_review_contracts_ready() returns boolean
language sql stable security invoker set search_path='' as $$
 select count(*)=2 from pg_catalog.pg_proc p
 where p.oid in (to_regprocedure('public.issue_guest_review_link_v1(uuid,text,text,timestamp with time zone)'),
   to_regprocedure('public.guest_review_link_valid_v1(uuid,text,text)'))
   and p.prorettype='pg_catalog.bool'::regtype and not p.proretset and p.prokind='f';
$$;
revoke all on function private.guest_review_contracts_ready() from public,anon,authenticated;
grant execute on function private.guest_review_contracts_ready() to service_role;
create function private.review_guest_capability_valid(p_order_id uuid,p_email text,p_token text) returns boolean
language plpgsql volatile security invoker set search_path='' as $$
declare valid boolean;
begin
 if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' or not private.guest_review_contracts_ready() then return false; end if;
 execute 'select public.guest_review_link_valid_v1($1,$2,$3)' into valid using p_order_id,p_email,p_token;
 return coalesce(valid,false);
end $$;
revoke all on function private.review_guest_capability_valid(uuid,text,text) from public,anon,authenticated;
grant execute on function private.review_guest_capability_valid(uuid,text,text) to service_role;

alter table private.lifecycle_offers drop constraint lifecycle_review_offer_provenance;
alter table private.lifecycle_offers add constraint lifecycle_review_offer_provenance check(
 (kind='review_winback' and source_order_id is not null
  and (source_user_id is null or user_id is not distinct from source_user_id)
  and source_key='review_winback:'||source_order_id::text and delivery_evidence_id is not null and delivery_revision is not null
  and risk_evidence_id is not null and risk_revision is not null)
 or (kind<>'review_winback' and source_order_id is null and source_user_id is null and delivery_evidence_id is null
  and delivery_revision is null and risk_evidence_id is null and risk_revision is null));
-- Original guest/account identity and email are checked against Order on issuance.
create function private.validate_review_offer_owner() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.kind='review_winback' and not exists(select 1 from public.orders o where o.id=new.source_order_id
   and o.user_id is not distinct from new.source_user_id and lower(btrim(o.customer_email))=new.email
   and o.checkout_environment::text=new.environment
   and (o.user_id is not null or new.user_id is null)) then raise exception 'Review offer owner differs'; end if;
 return new;
end $$;
create trigger validate_review_offer_owner before insert on private.lifecycle_offers for each row execute function private.validate_review_offer_owner();
revoke all on function private.validate_review_offer_owner() from public,anon,authenticated;
grant execute on function private.validate_review_offer_owner() to service_role;
create or replace function private.review_winback_eligibility(p_order_id uuid,p_user_id uuid,p_email text) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare o public.orders; d jsonb; r jsonb; t timestamptz:=clock_timestamp();
begin
 select * into o from public.orders where id=p_order_id;
 if not found or o.user_id is distinct from p_user_id or o.status<>'paid'
   or lower(btrim(o.customer_email)) is distinct from p_email
   or (p_user_id is not null and private.lifecycle_verified_email(p_user_id) is distinct from p_email)
   or o.paid_at is null or o.paid_at>t
   or not exists(select 1 from private.checkout_verified_payments v where v.order_id=o.id and v.session_id=o.stripe_checkout_session_id)
   then return null; end if;
 d:=private.verified_order_delivery(o.id);
 r:=private.verified_order_payment_risk(o.id,p_user_id,o.checkout_environment::text);
 if d is null or r is null or d->>'orderId' is distinct from o.id::text
   or d->>'status' is distinct from 'complete' or d->>'genuine' is distinct from 'true'
   or nullif(d->>'evidenceId','') is null or nullif(d->>'revision','') is null
   or (d->>'deliveredAt')::timestamptz<o.paid_at or (d->>'deliveredAt')::timestamptz>t or d->>'deliveredAt' is null
   or r->>'orderId' is distinct from o.id::text or r->>'userId' is distinct from p_user_id::text
   or r->>'mode' is distinct from o.checkout_environment::text or r->>'status' is distinct from 'safe'
   or nullif(r->>'evidenceId','') is null or nullif(r->>'revision','') is null
   or (r->>'observedAt')::timestamptz<=t-interval '5 minutes' or (r->>'observedAt')::timestamptz>t or r->>'observedAt' is null
   then return null; end if;
 return jsonb_build_object('orderId',o.id,'userId',p_user_id,'email',p_email,'paidAt',o.paid_at,
   'deliveryEvidenceId',d->>'evidenceId','deliveryRevision',d->>'revision','deliveredAt',d->>'deliveredAt',
   'riskEvidenceId',r->>'evidenceId','riskRevision',r->>'revision');
exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then return null;
end $$;

create or replace function private.review_winback_source(p_subscriber_id uuid,p_order_id uuid) returns jsonb
language plpgsql volatile security invoker set search_path='' as $$
declare s private.marketing_subscribers; g private.marketing_generations; o public.orders; e jsonb; due timestamptz; cutoff timestamptz;
begin
 select * into s from private.marketing_subscribers where id=p_subscriber_id;
 select * into g from private.marketing_generations where subscriber_id=s.id and generation=s.generation;
 if s.status is distinct from 'confirmed' or not s.global_allowed or not s.topic_allowed
   or g.template_contract->>'version' is distinct from 'lifecycle_v2' or g.wording_version is distinct from '2026-11-13-lifecycle-v2'
   or g.confirmed_at is null or g.withdrawn_at is not null or not (g.template_contract->'templates' ? 'lifecycle_review_winback')
   or not exists(select 1 from private.lifecycle_control where enabled)
   then return null; end if;
 select accepted_after into cutoff from private.email_controls where environment='sandbox' and purpose='lifecycle_review_winback' and enabled and accepted_after<=g.requested_at;
 if cutoff is null then return null; end if;
 select * into o from public.orders where id=p_order_id and lower(btrim(customer_email))=s.normalized_email;
 if not found or o.created_at<greatest(cutoff,g.confirmed_at) or o.paid_at<greatest(cutoff,g.confirmed_at) then return null; end if;
 if o.user_id is null and not private.guest_review_contracts_ready() then return null; end if;
 e:=private.review_winback_eligibility(o.id,o.user_id,s.normalized_email);
 if e is null or (e->>'deliveredAt')::timestamptz<greatest(cutoff,g.confirmed_at) then return null; end if;
 due:=(e->>'deliveredAt')::timestamptz+interval '14 days';
 if due>clock_timestamp() then return null; end if;
 -- Frozen terminal grants cannot be delivered or replaced, even if admission was interrupted.
 if exists(select 1 from private.lifecycle_offers f where f.kind='review_winback' and f.source_order_id=o.id
   and (f.expires_at<=clock_timestamp() or f.consumed_at is not null)) then return null; end if;
 if private.lifecycle_unresolved_checkout(s.normalized_email) then return null; end if;
 return e||jsonb_build_object('kind','review_winback','sourceKey','review_winback:'||o.id,'dueAt',due,'productSlug',null,'productName',null);
end $$;

create or replace function private.reserve_marketing_capacity(p_subscriber_id uuid,p_generation bigint,p_revision bigint,
  p_intent_id uuid,p_purpose text,p_due_at timestamptz,p_first_attempt_at timestamptz,p_initial_accepted boolean)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_subscriber private.marketing_subscribers%rowtype; v_sync private.marketing_provider_sync%rowtype;
  v_reservation private.marketing_send_reservations%rowtype;
  v_now timestamptz; v_daily integer; v_weekly integer; v_retry_at timestamptz;
begin
  if p_intent_id is null or p_purpose is null or p_purpose not in ('welcome_initial','welcome_education','lifecycle_welcome','lifecycle_cart','lifecycle_browse','lifecycle_review_winback') or p_due_at is null then
    raise exception using errcode='22023',message='invalid promotional reservation'; end if;
  select * into v_subscriber from private.marketing_subscribers where id=p_subscriber_id;
  if not found then return '{"eligible":false,"reason":"consent_ineligible"}'::jsonb; end if;
  perform private.marketing_address_lock(v_subscriber.normalized_email);
  select * into v_subscriber from private.marketing_subscribers where id=p_subscriber_id for update;
  v_now:=pg_catalog.clock_timestamp();
  if v_subscriber.generation is distinct from p_generation or v_subscriber.revision is distinct from p_revision
    or v_subscriber.status<>'confirmed' or not v_subscriber.global_allowed or not v_subscriber.topic_allowed then
    return '{"eligible":false,"reason":"consent_ineligible"}'::jsonb; end if;
  if p_purpose<>'lifecycle_review_winback' and p_first_attempt_at is null and p_due_at+interval '24 hours'<=v_now then
    return '{"eligible":false,"reason":"expired"}'::jsonb; end if;
  if p_due_at>v_now then return pg_catalog.jsonb_build_object('eligible',false,'reason','not_due','retryAt',p_due_at); end if;
  if p_purpose='welcome_education' and p_initial_accepted is distinct from true then
    return '{"eligible":false,"reason":"initial_not_accepted"}'::jsonb; end if;
  if exists(select 1 from private.marketing_contact_imports m where m.subscriber_id=p_subscriber_id
    and m.state in ('admitted','submitted','uncertain')) then
    return '{"eligible":false,"reason":"preferences_unverified"}'::jsonb; end if;
  select * into v_sync from private.marketing_provider_sync where subscriber_id=p_subscriber_id;
  if not found or v_sync.state<>'synced' or v_sync.generation is distinct from p_generation
    or v_sync.revision is distinct from p_revision or v_sync.observation_generation is distinct from p_generation
    or v_sync.observation_revision is distinct from p_revision
    or v_sync.contact_id is distinct from v_sync.observation_contact_id
    or v_sync.topic_id is distinct from v_sync.observation_topic_id
    or v_sync.contact_id is null or v_sync.observation_global_allowed is distinct from true
    or v_sync.observation_topic_allowed is distinct from true or v_sync.observed_at is null
    or v_sync.observed_at<=v_now-interval '30 seconds' or v_sync.observed_at>v_now then
    return '{"eligible":false,"reason":"preferences_unverified"}'::jsonb; end if;
  select * into v_reservation from private.marketing_send_reservations where intent_id=p_intent_id;
  if found then
    if row(v_reservation.subscriber_id,v_reservation.generation,v_reservation.purpose)
      is distinct from row(p_subscriber_id,p_generation,p_purpose) then
      raise exception using errcode='22023',message='promotional reservation identity differs'; end if;
    update private.marketing_send_reservations set last_handoff_at=v_now where intent_id=p_intent_id;
    return '{"eligible":true}'::jsonb;
  end if;
  select count(*) filter(where coalesce(last_handoff_at,reserved_at)>v_now-interval '24 hours'),count(*) into v_daily,v_weekly
    from private.marketing_send_reservations where subscriber_id=p_subscriber_id and coalesce(last_handoff_at,reserved_at)>v_now-interval '7 days';
  if v_daily>=1 or v_weekly>=3 then
    select greatest(
      coalesce((select max(coalesce(last_handoff_at,reserved_at))+interval '24 hours' from private.marketing_send_reservations
        where subscriber_id=p_subscriber_id and coalesce(last_handoff_at,reserved_at)>v_now-interval '24 hours'),v_now),
      coalesce((select coalesce(last_handoff_at,reserved_at)+interval '7 days' from private.marketing_send_reservations
        where subscriber_id=p_subscriber_id and coalesce(last_handoff_at,reserved_at)>v_now-interval '7 days'
        order by coalesce(last_handoff_at,reserved_at) desc offset 2 limit 1),v_now)) into v_retry_at;
    return pg_catalog.jsonb_build_object('eligible',false,'reason','frequency_limited','retryAt',v_retry_at);
  end if;
  insert into private.marketing_send_reservations(intent_id,subscriber_id,generation,purpose,reserved_at)
    values(p_intent_id,p_subscriber_id,p_generation,p_purpose,v_now);
  return '{"eligible":true}'::jsonb;
end $$;

create or replace function public.admit_lifecycle_campaign(p_subscriber_id uuid,p_kind text,p_source_key text,p_offer_id uuid default null) returns boolean
language plpgsql security invoker set search_path='' as $$
declare s private.marketing_subscribers%rowtype; g private.marketing_generations%rowtype; src jsonb; preference text; offer jsonb; token text; issued boolean;
begin
 if p_kind='review_winback' then
   if p_source_key !~ '^review_winback:[0-9a-f-]{36}$' then return false; end if;
   perform 1 from public.orders where id=substring(p_source_key from 16)::uuid for update;
 end if;
 select * into s from private.marketing_subscribers where id=p_subscriber_id;
 if not found then return false; end if;
 perform private.marketing_address_lock(s.normalized_email);
 select * into s from private.marketing_subscribers where id=p_subscriber_id for update;
 src:=case when p_kind='review_winback' then private.review_winback_source(s.id,substring(p_source_key from 16)::uuid) else private.lifecycle_source(s.id,p_kind) end;
 if src is null or src->>'sourceKey' is distinct from p_source_key then return false; end if;
 if p_kind<>'welcome' and private.lifecycle_source(s.id,'welcome') is not null and not exists(select 1 from private.email_intents where idempotency_key='helix:sandbox:lifecycle:welcome:'||s.id) then return false; end if;
 if p_kind in ('browse','review_winback') and private.lifecycle_source(s.id,'cart') is not null then return false; end if;
 if exists(select 1 from private.email_intents where recipient=s.normalized_email and purpose in ('lifecycle_welcome','lifecycle_cart','lifecycle_browse','lifecycle_review_winback')
   and state in ('queued','retry','leased','uncertain') and provider_email_id is null and idempotency_key<>'helix:sandbox:lifecycle:'||p_source_key) then return false; end if;
 if p_kind='browse' and private.lifecycle_source(s.id,'review_winback') is not null then return false; end if;
 select * into g from private.marketing_generations where subscriber_id=s.id and generation=s.generation;
 select preference_token into preference from private.lifecycle_preference_bindings where subscriber_id=s.id and generation=s.generation;
 if preference is null then return false; end if;
 if p_kind<>'browse' then
   offer:=public.read_lifecycle_offer_for_delivery(p_offer_id,s.normalized_email);
   if offer is null or offer->>'kind' is distinct from p_kind or not exists(select 1 from private.lifecycle_offers where id=p_offer_id and source_key=p_source_key) then return false; end if;
 elsif p_offer_id is not null then return false; end if;
 -- Never mint/rotate capabilities on replay, including terminal or uncertain intents.
 if exists(select 1 from private.email_intents where idempotency_key='helix:sandbox:lifecycle:'||p_source_key) then return false; end if;
 if p_kind='review_winback' and src->>'userId' is null then
   if not private.guest_review_contracts_ready() then return false; end if;
   token:=translate(rtrim(encode(extensions.gen_random_bytes(32),'base64'),'='),'+/','-_');
   execute 'select public.issue_guest_review_link_v1($1,$2,$3,$4)' into issued
     using (src->>'orderId')::uuid,s.normalized_email,token,clock_timestamp()+interval '30 days';
   if issued is distinct from true then raise exception 'Guest review capability unavailable'; end if;
   if not private.review_guest_capability_valid((src->>'orderId')::uuid,s.normalized_email,token) then
     raise exception 'Guest review capability unavailable'; end if;
   src:=src||jsonb_build_object('guestReviewToken',token);
 end if;
 src:=src||jsonb_build_object('offerId',p_offer_id,'offerExpiresAt',offer->>'expiresAt');
 insert into private.email_intents(environment,purpose,recipient,receipt,state,idempotency_key)
 values('sandbox','lifecycle_'||p_kind,s.normalized_email,jsonb_build_object('schemaVersion',1,'subscriberId',s.id,'generation',s.generation,'revision',s.revision,
   'templateContract',g.template_contract,'preferenceToken',preference,'lifecycle',src),'queued','helix:sandbox:lifecycle:'||p_source_key)
 on conflict do nothing;
 return found;
end $$;

create or replace function private.lifecycle_intent_eligible(e private.email_intents) returns boolean
language plpgsql security invoker set search_path='' as $$
declare src jsonb; saved jsonb:=e.receipt->'lifecycle'; offer jsonb;
begin
 src:=case when saved->>'kind'='review_winback' then private.review_winback_source((e.receipt->>'subscriberId')::uuid,(saved->>'orderId')::uuid) else private.lifecycle_source((e.receipt->>'subscriberId')::uuid,saved->>'kind') end;
 if saved->>'kind'='review_winback' and (src->>'orderId' is distinct from saved->>'orderId' or src->>'userId' is distinct from saved->>'userId' or src->>'email' is distinct from e.recipient or src->>'deliveryEvidenceId' is distinct from saved->>'deliveryEvidenceId' or src->>'deliveryRevision' is distinct from saved->>'deliveryRevision' or src->>'riskEvidenceId' is distinct from saved->>'riskEvidenceId' or src->>'riskRevision' is distinct from saved->>'riskRevision') then return false; end if;
 if saved->>'kind'='review_winback' and saved->>'userId' is null and not private.review_guest_capability_valid((saved->>'orderId')::uuid,e.recipient,saved->>'guestReviewToken') then return false; end if;
 if src is null or src->>'sourceKey' is distinct from saved->>'sourceKey' or src->>'productSlug' is distinct from saved->>'productSlug'
   or src->>'productName' is distinct from saved->>'productName' then return false; end if;
 if saved->>'kind'<>'browse' then
   offer:=public.read_lifecycle_offer_for_delivery((saved->>'offerId')::uuid,e.recipient);
   if offer is null or offer->>'kind' is distinct from saved->>'kind' then return false; end if;
 end if;
 return true;
end $$;

create function public.has_guest_review_winback_offer_v1(p_order_id uuid,p_product_id uuid,p_environment text)
returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(p_order_id is not null and p_product_id is not null and p_environment in ('sandbox','live') and exists(
  select 1 from public.orders reviewed join public.orders original
    on lower(btrim(original.customer_email))=lower(btrim(reviewed.customer_email))
    and original.checkout_environment=reviewed.checkout_environment and original.user_id is null
  join private.lifecycle_offers benefit on benefit.source_order_id=original.id
  join public.order_items item on item.order_id=original.id and item.product_id=p_product_id
  join private.checkout_verified_payments payment on payment.order_id=original.id and payment.session_id=original.stripe_checkout_session_id
  where reviewed.id=p_order_id and reviewed.user_id is null and reviewed.checkout_environment::text=p_environment
    and benefit.kind='review_winback' and benefit.percent_off=10 and benefit.source_user_id is null
    and benefit.email=lower(btrim(original.customer_email)) and benefit.environment=p_environment
    and benefit.source_key='review_winback:'||original.id::text
    and nullif(benefit.delivery_evidence_id,'') is not null and nullif(benefit.delivery_revision,'') is not null
    and nullif(benefit.risk_evidence_id,'') is not null and nullif(benefit.risk_revision,'') is not null
    and original.paid_at is not null and payment.payment_intent_id is not null and payment.contract_version in ('checkout_v1','checkout_v2')
 ),false);
$$;
revoke all on function public.has_guest_review_winback_offer_v1(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.has_guest_review_winback_offer_v1(uuid,uuid,text) to service_role;


-- Review capacity deferrals must not clamp retry time to an elapsed admission window.
create or replace function public.prepare_email_attempt(p_id uuid,p_lease_token uuid,p_request_payload jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_intent private.email_intents%rowtype; v_order_id uuid; v_purpose text; v_inquiry_id uuid;
  v_subscriber private.marketing_subscribers%rowtype; v_generation private.marketing_generations%rowtype;
  v_product public.products%rowtype; v_product_url text; v_marketing boolean; v_capacity jsonb; v_due timestamptz; v_retry_at timestamptz; v_reason text;
begin
  -- Identity fields are immutable. Lock Order before intent for all tracking handoffs.
  select order_id,purpose into v_order_id,v_purpose from private.email_intents where id=p_id;
  if v_purpose='order_tracking' then
    perform 1 from public.orders where id=v_order_id for update;
  end if;
  if v_purpose='support_reply' then
    select a.inquiry_id into v_inquiry_id from private.support_reply_approvals a where a.email_intent_id=p_id;
    perform 1 from private.support_inquiries where id=v_inquiry_id for update;
  end if;
  v_marketing:=v_purpose in ('marketing_confirmation','welcome_initial','welcome_education','lifecycle_welcome','lifecycle_cart','lifecycle_browse','lifecycle_review_winback');
  if v_purpose in ('lifecycle_welcome','lifecycle_cart','lifecycle_browse','lifecycle_review_winback') then
    -- Payment locks precede cart/marketing locks. A verified purchase already
    -- finalizing must commit before the source recheck, even for an empty cart.
    perform 1 from public.orders where user_id=(select (receipt->'lifecycle'->>'userId')::uuid from private.email_intents where id=p_id)
      or lower(btrim(customer_email))=(select recipient from private.email_intents where id=p_id) order by id for share;
    -- Cart locks precede marketing locks, matching meaningful cart mutation.
    perform 1 from public.carts where user_id=(select (receipt->'lifecycle'->>'userId')::uuid from private.email_intents where id=p_id) and status='active' order by id for update;
  end if;
  if v_marketing then
    -- All recipient transitions take address, subscriber, then intent locks in this order.
    select s.* into v_subscriber from private.marketing_subscribers s join private.email_intents e
      on e.receipt->>'subscriberId'=s.id::text where e.id=p_id;
    if not found then return null; end if;
    perform private.marketing_address_lock(v_subscriber.normalized_email);
    select * into v_subscriber from private.marketing_subscribers where id=v_subscriber.id for update;
  end if;
  if v_purpose in ('product_availability','product_waitlist_recovery') then
    perform private.lock_product_notification_intent(p_id);
  end if;
  select * into v_intent from private.email_intents where id=p_id for update;
  if not found or v_intent.state<>'leased' or v_intent.lease_token is distinct from p_lease_token
    or p_lease_token is null or v_intent.lease_expires_at<=pg_catalog.clock_timestamp()
    or v_intent.attempt_count>=5 or v_intent.content_deleted_at is not null
    or v_intent.provider_email_id is not null
    or (v_intent.first_attempt_at is not null and v_intent.first_attempt_at<=pg_catalog.clock_timestamp()-interval '23 hours')
  then return null; end if;
  if v_intent.purpose in ('lifecycle_welcome','lifecycle_cart','lifecycle_review_winback') and v_intent.first_attempt_at is null then
    perform 1 from private.lifecycle_offers where id=(v_intent.receipt->'lifecycle'->>'offerId')::uuid for update;
  end if;
  if v_intent.purpose in ('lifecycle_welcome','lifecycle_cart','lifecycle_browse','lifecycle_review_winback') and v_intent.first_attempt_at is null and not private.lifecycle_intent_eligible(v_intent) then
    update private.email_intents set state='blocked',error_code='marketing_not_eligible',lease_token=null,lease_expires_at=null where id=p_id;
    return null;
  end if;
  if v_intent.purpose in ('product_availability','product_waitlist_recovery') then
    if not private.product_notification_intent_eligible(v_intent) then
      update private.email_intents set state=case when first_attempt_at is null then 'blocked' else 'uncertain' end,
        error_code=case when first_attempt_at is null then 'product_request_not_eligible' else 'reconciliation_required' end,
        lease_token=null,lease_expires_at=null,updated_at=pg_catalog.clock_timestamp() where id=p_id;
      return null;
    end if;
    if v_intent.purpose='product_availability' and v_intent.first_attempt_at is null then
      select * into v_product from public.products where id=(v_intent.receipt->>'productId')::uuid;
      -- A rename between refresh, rendering and handoff retries the same intent.
      -- Match both rendered links as well as the current public receipt to reject
      -- an older render even if another worker refreshed this same lease.
      v_product_url:=pg_catalog.substring(p_request_payload->>'html',
        'href="(https://[^"[:space:]]+/products/'||v_product.slug||')"');
      if v_intent.receipt->>'productSlug' is distinct from v_product.slug
        or v_intent.receipt->>'productName' is distinct from v_product.display_name
        or p_request_payload->>'subject' is distinct from '[DEMO] helix — '||v_product.display_name||' is ready for Checkout'
        or v_product_url is null
        or pg_catalog.strpos(coalesce(p_request_payload->>'text',''),
          'View '||v_product.display_name||': '||v_product_url||E'\n\n')=0
      then
        update private.email_intents set state='retry',error_code='product_context_changed',
          next_attempt_at=pg_catalog.clock_timestamp(),lease_token=null,lease_expires_at=null,
          updated_at=pg_catalog.clock_timestamp() where id=p_id;
        return null;
      end if;
    end if;
  end if;
  if v_intent.purpose='order_tracking' then
    if private.simulation_is_frozen(v_intent.order_id) then
      update private.email_intents set state='blocked',error_code='order_refunded',lease_token=null,
        lease_expires_at=null,updated_at=pg_catalog.clock_timestamp() where id=p_id;
      return null;
    end if;
    perform 1 from private.email_controls
      where environment='sandbox' and purpose='order_tracking' and enabled for share;
    if not found or not private.simulation_order_eligible(v_intent.order_id) then
      update private.email_intents set state='blocked',error_code='simulation_unavailable',lease_token=null,
        lease_expires_at=null,updated_at=pg_catalog.clock_timestamp() where id=p_id;
      return null;
    end if;
  end if;
  if v_intent.purpose in ('support_acknowledgement','support_reply') then
    perform 1 from private.email_controls where environment=v_intent.environment
      and purpose=v_intent.purpose and enabled for share;
    if not found then
      update private.email_intents set state='blocked',error_code='support_delivery_disabled',
        lease_token=null,lease_expires_at=null,updated_at=pg_catalog.clock_timestamp() where id=p_id;
      return null;
    end if;
  end if;
  if v_intent.purpose='support_reply' and private.support_pending_context(v_inquiry_id)>0 then
    update private.email_intents set state=case when first_attempt_at is null then 'blocked' else 'uncertain' end,
      error_code=case when first_attempt_at is null then 'approval_stale' else 'reconciliation_required' end,
      lease_token=null,lease_expires_at=null,updated_at=pg_catalog.clock_timestamp() where id=p_id;
    return null;
  end if;
  if v_intent.purpose='support_reply' and not exists (
    select 1 from private.support_reply_approvals a
    join private.support_inquiries i on i.id=a.inquiry_id
    join private.support_drafts d on d.id=a.draft_id
    join private.support_messages m on m.id=a.message_id
    where a.email_intent_id=v_intent.id and a.inquiry_revision=i.revision
      and exists(select 1 from public.admin_memberships where user_id=a.actor_id and active and role='admin')
      and d.inquiry_revision=i.revision and d.version=i.current_draft_version
      and d.recipient=v_intent.recipient and d.subject=m.subject and d.body=m.body
      and m.kind='reply' and m.email_intent_id=v_intent.id and m.inquiry_id=i.id
      and (v_intent.receipt=private.support_reply_receipt(i,d,m.id)
        or v_intent.receipt=pg_catalog.jsonb_build_object(
        'renderVersion','support-text-v1','inquiryId',i.id,'messageId',m.id,
        'inquiryRevision',i.revision,'draftVersion',d.version,'subject',d.subject,
        'body',d.body,'html',private.support_plain_html(d.body),'attachments','[]'::jsonb))
  ) then
    update private.email_intents set state=case when first_attempt_at is null then 'blocked' else 'uncertain' end,
      error_code=case when first_attempt_at is null then 'approval_stale' else 'reconciliation_required' end,
      lease_token=null,lease_expires_at=null,updated_at=pg_catalog.clock_timestamp() where id=p_id;
    return null;
  end if;
  if v_marketing then
    select * into v_generation from private.marketing_generations
      where subscriber_id=v_subscriber.id and generation=case when v_intent.purpose='marketing_confirmation' then (v_intent.receipt->>'generation')::bigint else v_subscriber.generation end;
    perform 1 from private.email_controls where environment=v_intent.environment
      and purpose=v_intent.purpose and enabled and accepted_after<=v_generation.requested_at for share;
    if not found or not private.marketing_intent_current(v_intent,v_subscriber)
      or v_intent.receipt->'templateContract' is distinct from v_generation.template_contract
      or v_intent.receipt->'schemaVersion' is distinct from '1'::jsonb
      or (v_intent.purpose in ('welcome_initial','welcome_education','lifecycle_welcome','lifecycle_cart','lifecycle_browse','lifecycle_review_winback') and not exists (
        select 1 from private.marketing_preference_tokens t where t.subscriber_id=v_subscriber.id
          and t.generation=v_subscriber.generation and t.token_hash=pg_catalog.encode(
            extensions.digest(v_intent.receipt->>'preferenceToken','sha256'),'hex')))
    then
      update private.email_intents set state=case when first_attempt_at is null then 'blocked' else 'uncertain' end,
        error_code=case when first_attempt_at is null then 'marketing_not_eligible' else 'reconciliation_required' end,
        lease_token=null,lease_expires_at=null,updated_at=pg_catalog.clock_timestamp() where id=p_id;
      return null;
    end if;
    if p_request_payload->>'from' is distinct from v_generation.template_contract->>'from'
      or p_request_payload->>'reply_to' is distinct from v_generation.template_contract->>'replyTo'
      or (v_intent.purpose='marketing_confirmation' and (p_request_payload ? 'headers' or p_request_payload ? 'topic_id'))
      or (v_intent.purpose in ('welcome_initial','welcome_education','lifecycle_welcome','lifecycle_cart','lifecycle_browse','lifecycle_review_winback') and (
        p_request_payload->>'topic_id' is distinct from v_generation.template_contract->>'topicId'
        or p_request_payload->'headers' is distinct from pg_catalog.jsonb_build_object(
          'List-Unsubscribe','<'||(v_generation.template_contract->>'siteOrigin')||
            '/api/marketing/unsubscribe?token='||(v_intent.receipt->>'preferenceToken')||'>',
          'List-Unsubscribe-Post','List-Unsubscribe=One-Click')))
    then raise exception using errcode='22023',message='marketing request does not match frozen contract'; end if;
  end if;
  if v_intent.purpose in ('support_acknowledgement','support_reply') and (
    p_request_payload->>'subject' is distinct from v_intent.receipt->>'subject'
    or p_request_payload->>'text' is distinct from v_intent.receipt->>'body'
    or p_request_payload->>'html' is distinct from v_intent.receipt->>'html'
    or v_intent.receipt->'attachments' is distinct from '[]'::jsonb
    or not coalesce(case when v_intent.purpose='support_reply'
      then v_intent.receipt->>'renderVersion' in ('support-text-v1','support-text-v2')
      else v_intent.receipt->>'renderVersion' in ('support-ack-v1','support-ack-v2') end,false)
    or (v_intent.receipt->>'renderVersion' in ('support-text-v2','support-ack-v2') and (
      p_request_payload->>'reply_to' is distinct from v_intent.receipt->>'replyTo'
      or p_request_payload->'headers' is distinct from v_intent.receipt->'headers'
      or not exists(select 1 from private.support_reply_routes where inquiry_id=(v_intent.receipt->>'inquiryId')::uuid
        and address=v_intent.receipt->>'replyTo')))
  ) then raise exception using errcode='22023',message='support request does not match approval'; end if;
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
    or p_request_payload-(case when v_intent.purpose in ('welcome_initial','welcome_education','lifecycle_welcome','lifecycle_cart','lifecycle_browse','lifecycle_review_winback')
      then array['from','to','reply_to','subject','html','text','tags','headers','topic_id']
      when v_intent.purpose in ('support_acknowledgement','support_reply')
        and v_intent.receipt->>'renderVersion' in ('support-text-v2','support-ack-v2')
      then array['from','to','reply_to','subject','html','text','tags','headers']
      else array['from','to','reply_to','subject','html','text','tags'] end)<>'{}'::jsonb
    or (v_intent.request_payload is not null and v_intent.request_payload is distinct from p_request_payload)
  then raise exception using errcode='22023',message='email request does not match frozen envelope'; end if;
  if v_intent.purpose in ('welcome_initial','welcome_education','lifecycle_welcome','lifecycle_cart','lifecycle_browse','lifecycle_review_winback') then
    v_due:=case when v_intent.purpose in ('lifecycle_welcome','lifecycle_cart','lifecycle_browse','lifecycle_review_winback') then (v_intent.receipt->'lifecycle'->>'dueAt')::timestamptz else v_generation.confirmed_at+case when v_intent.purpose='welcome_education' then interval '72 hours' else interval '0' end end;
    v_capacity:=private.reserve_marketing_capacity(v_subscriber.id,v_subscriber.generation,v_subscriber.revision,
      v_intent.id,v_intent.purpose,v_due,v_intent.first_attempt_at,exists(select 1 from private.email_intents e
        where e.purpose='welcome_initial' and e.receipt->>'subscriberId'=v_subscriber.id::text
          and e.receipt->>'generation'=v_subscriber.generation::text and e.provider_email_id is not null));
    if (v_capacity->>'eligible')::boolean is distinct from true then
      v_reason:=v_capacity->>'reason';
      v_retry_at:=coalesce((v_capacity->>'retryAt')::timestamptz,pg_catalog.clock_timestamp()+interval '1 minute');
      if v_intent.first_attempt_at is null and v_intent.purpose<>'lifecycle_review_winback' then v_retry_at:=least(v_retry_at,v_due+interval '24 hours'); end if;
      update private.email_intents set
        state=case when first_attempt_at is not null then 'uncertain'
          when v_reason in ('consent_ineligible','expired') then 'blocked' else 'retry' end,
        error_code=case when first_attempt_at is not null and v_reason='consent_ineligible' then 'reconciliation_required'
          when v_reason='preferences_unverified' then 'marketing_preferences_unavailable'
          when v_reason='expired' then 'marketing_expired' else 'marketing_'||v_reason end,
        next_attempt_at=v_retry_at,lease_token=null,lease_expires_at=null,updated_at=pg_catalog.clock_timestamp() where id=p_id;
      return null;
    end if;
  end if;
  update private.email_intents set request_payload=coalesce(request_payload,p_request_payload),
    first_attempt_at=coalesce(first_attempt_at,pg_catalog.clock_timestamp()),attempt_count=attempt_count+1,
    updated_at=pg_catalog.clock_timestamp() where id=p_id returning * into v_intent;
  return private.email_intent_work(v_intent);
end $$;
