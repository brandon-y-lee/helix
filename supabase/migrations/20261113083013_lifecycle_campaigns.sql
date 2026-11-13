-- Default-off lifecycle campaigns; native template approvals belong to immutable consent generations.
alter table private.email_controls drop constraint email_controls_purpose_check;
alter table private.email_controls add constraint email_controls_purpose_check check(purpose in ('order_confirmation','order_tracking','support_acknowledgement','support_reply','marketing_confirmation','welcome_initial','welcome_education','product_availability','product_waitlist_recovery','lifecycle_welcome','lifecycle_cart','lifecycle_browse'));
alter table private.email_intents drop constraint email_intents_purpose_check;
alter table private.email_intents add constraint email_intents_purpose_check check(purpose in ('order_confirmation','order_tracking','support_acknowledgement','support_reply','marketing_confirmation','welcome_initial','welcome_education','product_availability','product_waitlist_recovery','lifecycle_welcome','lifecycle_cart','lifecycle_browse'));
insert into private.email_controls(environment,purpose,enabled) values ('sandbox','lifecycle_welcome',false),('sandbox','lifecycle_cart',false),('sandbox','lifecycle_browse',false);
alter table private.marketing_send_reservations drop constraint marketing_send_reservations_purpose_check;
alter table private.marketing_send_reservations add constraint marketing_send_reservations_purpose_check check(purpose in ('welcome_initial','welcome_education','lifecycle_welcome','lifecycle_cart','lifecycle_browse'));
create or replace function private.valid_marketing_template_contract(p_contract jsonb) returns boolean
language sql immutable security invoker set search_path='' as $$
  select coalesce(pg_catalog.jsonb_typeof(p_contract)='object' and p_contract->>'version' in ('welcome_v1','lifecycle_v1')
    and p_contract-array['version','siteOrigin','from','replyTo','postalAddress','topicId','templates']='{}'::jsonb
    and pg_catalog.length(p_contract->>'siteOrigin') between 8 and 2048
    and pg_catalog.length(p_contract->>'from') between 3 and 320
    and pg_catalog.length(p_contract->>'replyTo') between 3 and 254
    and pg_catalog.length(p_contract->>'postalAddress') between 1 and 1000
    and pg_catalog.length(p_contract->>'topicId') between 1 and 200
    and pg_catalog.jsonb_typeof(p_contract->'templates')='object'
    and (p_contract->'templates')-(case when p_contract->>'version'='lifecycle_v1' then array['marketing_confirmation','welcome_initial','welcome_education','lifecycle_welcome','lifecycle_cart','lifecycle_browse'] else array['marketing_confirmation','welcome_initial','welcome_education'] end)='{}'::jsonb
    and not exists(select 1 from pg_catalog.unnest(array['marketing_confirmation','welcome_initial','welcome_education'] || (case when (p_contract->'templates') ?| array['lifecycle_welcome','lifecycle_cart','lifecycle_browse'] then array['lifecycle_welcome','lifecycle_cart','lifecycle_browse'] else array[]::text[] end)) p
      where pg_catalog.jsonb_typeof(p_contract->'templates'->p) is distinct from 'object'
        or pg_catalog.length(p_contract->'templates'->p->>'id') not between 1 and 200
        or p_contract->'templates'->p->>'id' is null
        or p_contract->'templates'->p->>'sha256' is null
        or p_contract->'templates'->p->>'sha256' !~ '^[0-9a-f]{64}$'
        or (p_contract->'templates'->p)-array['id','sha256']<>'{}'::jsonb),false);
$$;
create or replace function private.reserve_marketing_capacity(p_subscriber_id uuid,p_generation bigint,p_revision bigint,
  p_intent_id uuid,p_purpose text,p_due_at timestamptz,p_first_attempt_at timestamptz,p_initial_accepted boolean)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_subscriber private.marketing_subscribers%rowtype; v_sync private.marketing_provider_sync%rowtype;
  v_reservation private.marketing_send_reservations%rowtype;
  v_now timestamptz; v_daily integer; v_weekly integer; v_retry_at timestamptz;
begin
  if p_intent_id is null or p_purpose is null or p_purpose not in ('welcome_initial','welcome_education','lifecycle_welcome','lifecycle_cart','lifecycle_browse') or p_due_at is null then
    raise exception using errcode='22023',message='invalid promotional reservation'; end if;
  select * into v_subscriber from private.marketing_subscribers where id=p_subscriber_id;
  if not found then return '{"eligible":false,"reason":"consent_ineligible"}'::jsonb; end if;
  perform private.marketing_address_lock(v_subscriber.normalized_email);
  select * into v_subscriber from private.marketing_subscribers where id=p_subscriber_id for update;
  v_now:=pg_catalog.clock_timestamp();
  if v_subscriber.generation is distinct from p_generation or v_subscriber.revision is distinct from p_revision
    or v_subscriber.status<>'confirmed' or not v_subscriber.global_allowed or not v_subscriber.topic_allowed then
    return '{"eligible":false,"reason":"consent_ineligible"}'::jsonb; end if;
  if p_first_attempt_at is null and p_due_at+interval '24 hours'<=v_now then
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

-- Narrow identity lookup prevents an email change hiding an unresolved account checkout.
create function private.lifecycle_unresolved_checkout(p_email text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.orders o where (lower(btrim(o.customer_email))=p_email
   or o.user_id in (select id from auth.users where lower(btrim(email))=p_email and email_confirmed_at is not null and deleted_at is null))
   and (o.status='pending_payment' or (o.status='payment_failed' and (o.stripe_checkout_session_id is not null or private.checkout_provider_call_possible(o.id)))))
$$;
revoke all on function private.lifecycle_unresolved_checkout(text) from public,anon,authenticated;
grant execute on function private.lifecycle_unresolved_checkout(text) to service_role;
create function private.lifecycle_source(p_subscriber_id uuid,p_kind text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare s private.marketing_subscribers%rowtype; g private.marketing_generations%rowtype;
 a private.lifecycle_activity%rowtype; due timestamptz; source text; product public.products%rowtype; result jsonb; t timestamptz:=clock_timestamp();
begin
 select * into s from private.marketing_subscribers where id=p_subscriber_id;
 select * into g from private.marketing_generations where subscriber_id=s.id and generation=s.generation;
 if s.status is distinct from 'confirmed' or not s.global_allowed or not s.topic_allowed or g.template_contract->>'version' is distinct from 'lifecycle_v1'
   or not exists(select 1 from private.lifecycle_control where enabled)
   or not exists(select 1 from private.email_controls where purpose='lifecycle_'||p_kind and enabled and accepted_after<=g.requested_at)
   or not (g.template_contract->'templates' ? ('lifecycle_'||p_kind)) then return null; end if;
 if p_kind in ('welcome','cart') and private.lifecycle_unresolved_checkout(s.normalized_email) then return null; end if;
 if p_kind='welcome' then
   due:=g.confirmed_at; source:='welcome:'||s.id;
   if not private.lifecycle_welcome_recipient_eligible(s.normalized_email,(select id from private.lifecycle_offers where kind='welcome' and email=s.normalized_email)) then return null; end if;
 elsif p_kind in ('cart','browse') then
   select * into a from private.lifecycle_activity where subscriber_id=s.id and generation=s.generation;
   if not found or private.lifecycle_verified_email(a.user_id) is distinct from s.normalized_email then return null; end if;
   if p_kind='cart' then
     due:=a.cart_changed_at+interval '24 hours'; source:='cart:'||a.cart_id||':'||a.cart_revision;
     if a.cart_id is null or not exists(select 1 from public.carts where id=a.cart_id and user_id=a.user_id and status='active')
       or not exists(select 1 from public.cart_items where cart_id=a.cart_id)
       or exists(select 1 from public.cart_items i left join public.products p on p.id=i.product_id
         left join public.product_variants v on v.product_id=i.product_id and v.variant_key=i.variant_key
         where i.cart_id=a.cart_id and (p.status is distinct from 'available' or p.catalog_status is distinct from 'active'
           or v.archived_at is not null or v.available is distinct from true or v.inventory_status in ('out_of_stock','unavailable')))
       or exists(select 1 from public.orders where cart_id=a.cart_id and status in ('paid','refunded'))
       or exists(select 1 from private.email_intents where purpose='lifecycle_cart' and receipt->'lifecycle'->>'cartId'=a.cart_id::text
         and first_attempt_at>t-interval '7 days' and receipt->'lifecycle'->>'sourceKey'<>source)
       then return null; end if;
   else
     due:=a.product_seen_at+interval '24 hours'; source:='browse:'||a.user_id||':'||extract(epoch from a.product_seen_at)::text;
     if a.product_id is null or a.cart_changed_at>=a.product_seen_at
       or exists(select 1 from public.cart_items i join public.carts c on c.id=i.cart_id where c.user_id=a.user_id and c.status='active') then return null; end if;
     select * into product from public.products where id=a.product_id and status='available' and catalog_status='active';
     if not found or not exists(select 1 from public.product_variants where product_id=product.id and available and archived_at is null and inventory_status not in ('out_of_stock','unavailable')) then return null; end if;
   end if;
   if exists(select 1 from public.orders where (user_id=a.user_id or lower(btrim(customer_email))=s.normalized_email)
     and status in ('paid','refunded') and coalesce(paid_at,updated_at,created_at)>=case when p_kind='cart' then a.cart_changed_at else a.product_seen_at end) then return null; end if;
 else return null; end if;
 if due is null or due>t or due+interval '24 hours'<=t then return null; end if;
 result:=jsonb_build_object('kind',p_kind,'sourceKey',source,'dueAt',due,'userId',a.user_id,'cartId',a.cart_id,'cartRevision',a.cart_revision,
   'productId',case when p_kind='browse' then product.id else null end,'productSlug',case when p_kind='browse' then product.slug else null end,
   'productName',case when p_kind='browse' then product.display_name else null end);
 return result;
end $$;
-- Short admission backoff makes a rejected/unavailable address yield to the next.
create table private.lifecycle_campaign_scan (
 subscriber_id uuid not null references private.marketing_subscribers(id),kind text not null check(kind in ('welcome','cart','browse')),
 next_check_at timestamptz not null,primary key(subscriber_id,kind)
);
alter table private.lifecycle_campaign_scan enable row level security;
alter table private.lifecycle_campaign_scan force row level security;
revoke all on private.lifecycle_campaign_scan from public,anon,authenticated;
grant select,insert,update,delete on private.lifecycle_campaign_scan to service_role;
create function public.list_lifecycle_campaigns(p_limit integer default 1) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare result jsonb; item jsonb;
begin
 if p_limit is null or p_limit not between 1 and 5 then raise exception 'invalid limit'; end if;
 perform pg_advisory_xact_lock(hashtextextended('lifecycle-campaign-scan',0));
 delete from private.lifecycle_campaign_scan where (subscriber_id,kind) in (select subscriber_id,kind from private.lifecycle_campaign_scan where next_check_at<clock_timestamp()-interval '30 days' limit 100);
 select coalesce(jsonb_agg(candidate),'[]') into result from (
   select jsonb_build_object('subscriberId',s.id,'email',s.normalized_email,'kind',k.kind,'sourceKey',src.value->>'sourceKey') candidate
   from private.marketing_subscribers s cross join (values ('welcome',1),('cart',2),('browse',3)) k(kind,priority)
   cross join lateral (select private.lifecycle_source(s.id,k.kind) value) src
   where src.value is not null
     and not exists(select 1 from private.lifecycle_campaign_scan b where b.subscriber_id=s.id and b.kind=k.kind and b.next_check_at>clock_timestamp())
     and not exists(select 1 from private.email_intents e where e.idempotency_key='helix:sandbox:lifecycle:'||(src.value->>'sourceKey'))
     and not exists(select 1 from private.email_intents e where e.recipient=s.normalized_email and e.purpose in ('lifecycle_welcome','lifecycle_cart','lifecycle_browse')
       and e.state in ('queued','retry','leased','uncertain') and e.provider_email_id is null)
   order by k.priority,s.id limit p_limit
 ) q;
 for item in select value from jsonb_array_elements(result) loop
   insert into private.lifecycle_campaign_scan(subscriber_id,kind,next_check_at) values((item->>'subscriberId')::uuid,item->>'kind',clock_timestamp()+interval '5 minutes')
   on conflict(subscriber_id,kind) do update set next_check_at=excluded.next_check_at;
 end loop;
 return result;
end $$;
create function public.admit_lifecycle_campaign(p_subscriber_id uuid,p_kind text,p_source_key text,p_offer_id uuid default null) returns boolean
language plpgsql security invoker set search_path='' as $$
declare s private.marketing_subscribers%rowtype; g private.marketing_generations%rowtype; src jsonb; preference text; offer jsonb;
begin
 select * into s from private.marketing_subscribers where id=p_subscriber_id;
 if not found then return false; end if;
 perform private.marketing_address_lock(s.normalized_email);
 select * into s from private.marketing_subscribers where id=p_subscriber_id for update;
 src:=private.lifecycle_source(s.id,p_kind);
 if src is null or src->>'sourceKey' is distinct from p_source_key then return false; end if;
 if p_kind<>'welcome' and private.lifecycle_source(s.id,'welcome') is not null and not exists(select 1 from private.email_intents where idempotency_key='helix:sandbox:lifecycle:welcome:'||s.id) then return false; end if;
 if p_kind='browse' and private.lifecycle_source(s.id,'cart') is not null then return false; end if;
 if exists(select 1 from private.email_intents where recipient=s.normalized_email and purpose in ('lifecycle_welcome','lifecycle_cart','lifecycle_browse')
   and state in ('queued','retry','leased','uncertain') and provider_email_id is null and idempotency_key<>'helix:sandbox:lifecycle:'||p_source_key) then return false; end if;
 select * into g from private.marketing_generations where subscriber_id=s.id and generation=s.generation;
 select preference_token into preference from private.lifecycle_preference_bindings where subscriber_id=s.id and generation=s.generation;
 if preference is null then return false; end if;
 if p_kind<>'browse' then
   offer:=public.read_lifecycle_offer_for_delivery(p_offer_id,s.normalized_email);
   if offer is null or offer->>'kind' is distinct from p_kind or not exists(select 1 from private.lifecycle_offers where id=p_offer_id and source_key=p_source_key) then return false; end if;
 elsif p_offer_id is not null then return false; end if;
 src:=src||jsonb_build_object('offerId',p_offer_id,'offerExpiresAt',offer->>'expiresAt');
 insert into private.email_intents(environment,purpose,recipient,receipt,state,idempotency_key)
 values('sandbox','lifecycle_'||p_kind,s.normalized_email,jsonb_build_object('schemaVersion',1,'subscriberId',s.id,'generation',s.generation,'revision',s.revision,
   'templateContract',g.template_contract,'preferenceToken',preference,'lifecycle',src),'queued','helix:sandbox:lifecycle:'||p_source_key)
 on conflict do nothing;
 return found;
end $$;
create function private.lifecycle_intent_eligible(e private.email_intents) returns boolean
language plpgsql security invoker set search_path='' as $$
declare src jsonb; saved jsonb:=e.receipt->'lifecycle'; offer jsonb;
begin
 src:=private.lifecycle_source((e.receipt->>'subscriberId')::uuid,saved->>'kind');
 if src is null or src->>'sourceKey' is distinct from saved->>'sourceKey' or src->>'productSlug' is distinct from saved->>'productSlug'
   or src->>'productName' is distinct from saved->>'productName' then return false; end if;
 if saved->>'kind'<>'browse' then
   offer:=public.read_lifecycle_offer_for_delivery((saved->>'offerId')::uuid,e.recipient);
   if offer is null or offer->>'kind' is distinct from saved->>'kind' then return false; end if;
 end if;
 return true;
end $$;
create function public.lifecycle_campaign_readiness() returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from private.lifecycle_control where enabled)
   and exists(select 1 from private.lifecycle_offer_control where enabled)
   and exists(select 1 from private.email_controls where purpose='lifecycle_welcome' and enabled)
$$;
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
  v_marketing:=v_purpose in ('marketing_confirmation','welcome_initial','welcome_education','lifecycle_welcome','lifecycle_cart','lifecycle_browse');
  if v_purpose in ('lifecycle_welcome','lifecycle_cart','lifecycle_browse') then
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
  if v_intent.purpose in ('lifecycle_welcome','lifecycle_cart') and v_intent.first_attempt_at is null then
    perform 1 from private.lifecycle_offers where id=(v_intent.receipt->'lifecycle'->>'offerId')::uuid for update;
  end if;
  if v_intent.purpose in ('lifecycle_welcome','lifecycle_cart','lifecycle_browse') and v_intent.first_attempt_at is null and not private.lifecycle_intent_eligible(v_intent) then
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
      or (v_intent.purpose in ('welcome_initial','welcome_education','lifecycle_welcome','lifecycle_cart','lifecycle_browse') and not exists (
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
      or (v_intent.purpose in ('welcome_initial','welcome_education','lifecycle_welcome','lifecycle_cart','lifecycle_browse') and (
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
    or p_request_payload-(case when v_intent.purpose in ('welcome_initial','welcome_education','lifecycle_welcome','lifecycle_cart','lifecycle_browse')
      then array['from','to','reply_to','subject','html','text','tags','headers','topic_id']
      when v_intent.purpose in ('support_acknowledgement','support_reply')
        and v_intent.receipt->>'renderVersion' in ('support-text-v2','support-ack-v2')
      then array['from','to','reply_to','subject','html','text','tags','headers']
      else array['from','to','reply_to','subject','html','text','tags'] end)<>'{}'::jsonb
    or (v_intent.request_payload is not null and v_intent.request_payload is distinct from p_request_payload)
  then raise exception using errcode='22023',message='email request does not match frozen envelope'; end if;
  if v_intent.purpose in ('welcome_initial','welcome_education','lifecycle_welcome','lifecycle_cart','lifecycle_browse') then
    v_due:=case when v_intent.purpose in ('lifecycle_welcome','lifecycle_cart','lifecycle_browse') then (v_intent.receipt->'lifecycle'->>'dueAt')::timestamptz else v_generation.confirmed_at+case when v_intent.purpose='welcome_education' then interval '72 hours' else interval '0' end end;
    v_capacity:=private.reserve_marketing_capacity(v_subscriber.id,v_subscriber.generation,v_subscriber.revision,
      v_intent.id,v_intent.purpose,v_due,v_intent.first_attempt_at,exists(select 1 from private.email_intents e
        where e.purpose='welcome_initial' and e.receipt->>'subscriberId'=v_subscriber.id::text
          and e.receipt->>'generation'=v_subscriber.generation::text and e.provider_email_id is not null));
    if (v_capacity->>'eligible')::boolean is distinct from true then
      v_reason:=v_capacity->>'reason';
      v_retry_at:=coalesce((v_capacity->>'retryAt')::timestamptz,pg_catalog.clock_timestamp()+interval '1 minute');
      if v_intent.first_attempt_at is null then v_retry_at:=least(v_retry_at,v_due+interval '24 hours'); end if;
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
create or replace function private.cancel_ineligible_marketing_intents(p_subscriber private.marketing_subscribers) returns void
language sql security invoker set search_path='' as $$
  update private.email_intents e set
    state=case when e.first_attempt_at is null then 'blocked' when e.lease_token is not null then e.state else 'uncertain' end,
    error_code=case when e.first_attempt_at is null then 'marketing_not_eligible' else 'reconciliation_required' end,
    lease_token=case when e.first_attempt_at is null then null else e.lease_token end,
    lease_expires_at=case when e.first_attempt_at is null then null else e.lease_expires_at end,
    updated_at=pg_catalog.clock_timestamp()
  where e.purpose in ('marketing_confirmation','welcome_initial','welcome_education','lifecycle_welcome','lifecycle_cart','lifecycle_browse')
    and e.receipt->>'subscriberId'=p_subscriber.id::text and e.provider_email_id is null
    and e.state in ('queued','leased','retry','uncertain')
    and not private.marketing_intent_current(e,p_subscriber);
$$;
create or replace function public.claim_email_intents(p_environment text,p_lease_token uuid,p_limit integer)
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
      and not (purpose='support_reply' and coalesce(error_code,'') in
        ('approval_stale','approval_revoked','reconciliation_required'))
      and not (purpose in ('marketing_confirmation','welcome_initial','welcome_education','product_availability','product_waitlist_recovery','lifecycle_welcome','lifecycle_cart','lifecycle_browse')
        and coalesce(error_code,'')='reconciliation_required')
    order by next_attempt_at,created_at,id for update skip locked limit p_limit
  ), claimed as (
    update private.email_intents i set state='leased',lease_token=p_lease_token,
      lease_expires_at=pg_catalog.clock_timestamp()+interval '5 minutes',updated_at=pg_catalog.clock_timestamp()
    from candidates c where i.id=c.id returning i.*
  ) select coalesce(pg_catalog.jsonb_agg(private.email_intent_work(claimed)),'[]'::jsonb) into v_work from claimed;
  return v_work;
end $$;
create or replace function public.retry_email_delivery(p_id uuid,p_expected_updated_at timestamptz) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
  update private.email_intents set state='queued',next_attempt_at=pg_catalog.clock_timestamp(),
    error_code=null,updated_at=pg_catalog.clock_timestamp()
  where id=p_id and updated_at=p_expected_updated_at and state in ('blocked','failed','retry','uncertain')
    and provider_email_id is null and delivery_status is null and content_deleted_at is null
    and not (purpose='support_reply' and coalesce(error_code,'') in
      ('approval_stale','approval_revoked','reconciliation_required'))
    and not (purpose in ('marketing_confirmation','welcome_initial','welcome_education','lifecycle_welcome','lifecycle_cart','lifecycle_browse')
      and coalesce(error_code,'') in ('reconciliation_required','marketing_not_eligible','marketing_expired'))
    and not (purpose in ('product_availability','product_waitlist_recovery')
      and coalesce(error_code,'') in ('reconciliation_required','product_request_not_eligible','product_request_cancelled'))
    and lease_token is null and attempt_count<5
    and (first_attempt_at is null or first_attempt_at>pg_catalog.clock_timestamp()-interval '23 hours');
  return found;
end $$;
revoke all on function private.lifecycle_source(uuid,text) from public,anon,authenticated;
grant execute on function private.lifecycle_source(uuid,text) to service_role;
revoke all on function public.list_lifecycle_campaigns(integer) from public,anon,authenticated;
grant execute on function public.list_lifecycle_campaigns(integer) to service_role;
revoke all on function public.admit_lifecycle_campaign(uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function public.admit_lifecycle_campaign(uuid,text,text,uuid) to service_role;
revoke all on function private.lifecycle_intent_eligible(private.email_intents) from public,anon,authenticated;
grant execute on function private.lifecycle_intent_eligible(private.email_intents) to service_role;
revoke all on function public.lifecycle_campaign_readiness() from public,anon,authenticated;
grant execute on function public.lifecycle_campaign_readiness() to service_role;

create or replace function public.finish_email_attempt(
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
    state=case when provider_email_id is not null or p_outcome='accepted' then 'accepted'
      when purpose in ('marketing_confirmation','welcome_initial','welcome_education','product_availability','product_waitlist_recovery','lifecycle_welcome','lifecycle_cart','lifecycle_browse') and first_attempt_at is not null then 'uncertain'
      when p_outcome in ('retry','uncertain') and first_attempt_at is not null
        and (first_attempt_at<=pg_catalog.clock_timestamp()-interval '23 hours' or attempt_count>=5) then 'uncertain'
      else p_outcome end,
    provider_email_id=coalesce(provider_email_id,p_provider_email_id),
    error_code=case when provider_email_id is not null or p_outcome='accepted' then null
      when purpose in ('marketing_confirmation','welcome_initial','welcome_education','product_availability','product_waitlist_recovery','lifecycle_welcome','lifecycle_cart','lifecycle_browse') and first_attempt_at is not null
        and (p_outcome in ('blocked','failed') or error_code='reconciliation_required'
          or first_attempt_at<=pg_catalog.clock_timestamp()-interval '23 hours' or attempt_count>=5)
        then 'reconciliation_required' else p_error_code end,
    next_attempt_at=pg_catalog.clock_timestamp()+pg_catalog.make_interval(secs=>least(3600,60*(2^greatest(attempt_count-1,0)))::integer),
    lease_token=null,lease_expires_at=null,updated_at=pg_catalog.clock_timestamp()
  where id=p_id;
  return true;
end $$;

-- A verified matched suppression event dominates every future lifecycle generation.
-- Take the marketing lock before the original event recorder's intent lock.
alter function public.record_email_delivery_event(text,text,uuid,text,text,timestamptz,text,text) rename to record_email_delivery_event_before_lifecycle;
create function public.record_email_delivery_event(p_event_id text,p_environment text,p_message_id uuid,p_provider_email_id text,p_event_type text,
 p_occurred_at timestamptz,p_sender text,p_recipient text) returns text language plpgsql security invoker set search_path='' as $$
declare result text; s private.marketing_subscribers%rowtype; g private.marketing_generations%rowtype; t timestamptz:=clock_timestamp();
begin
 perform private.marketing_address_lock(lower(btrim(p_recipient)));
 result:=public.record_email_delivery_event_before_lifecycle(p_event_id,p_environment,p_message_id,p_provider_email_id,p_event_type,p_occurred_at,p_sender,p_recipient);
 if result='matched' and p_event_type in ('email.bounced','email.complained','email.suppressed') then
   select * into s from private.marketing_subscribers where normalized_email=lower(btrim(p_recipient)) for update;
   if found and (s.global_allowed or s.status<>'withdrawn') then
     update private.marketing_subscribers set status='withdrawn',global_allowed=false,topic_allowed=false,revision=revision+1,withdrawn_at=t,updated_at=t where id=s.id returning * into s;
     update private.marketing_generations set withdrawn_at=coalesce(withdrawn_at,t) where subscriber_id=s.id and generation=s.generation returning * into g;
     insert into private.marketing_consent_evidence(subscriber_id,generation,revision,event,source,wording_version,occurred_at)
       values(s.id,s.generation,s.revision,'provider_denied',g.source,g.wording_version,t);
     perform private.refresh_marketing_sync(s);
     perform private.cancel_ineligible_marketing_intents(s);
   end if;
 end if;
 return result;
end $$;
revoke all on function public.record_email_delivery_event(text,text,uuid,text,text,timestamptz,text,text) from public,anon,authenticated;
grant execute on function public.record_email_delivery_event(text,text,uuid,text,text,timestamptz,text,text) to service_role;
