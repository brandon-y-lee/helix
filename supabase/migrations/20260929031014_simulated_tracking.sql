-- Development-only, service-owned fulfillment simulation. Installation is inactive.
create table private.simulated_shipments (
  id uuid primary key default extensions.gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  number integer not null check(number between 1 and 100),
  state text not null check(state in ('dispatched','in_transit','delivered','exception')),
  version integer not null check(version between 1 and 100),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  unique(order_id,number), unique(id,order_id)
);
create table private.simulated_shipment_allocations (
  shipment_id uuid not null references private.simulated_shipments(id),
  order_item_id uuid not null references public.order_items(id),
  quantity integer not null check(quantity between 1 and 99),
  product_name text not null,
  variant_label text,
  primary key(shipment_id,order_item_id)
);
create index simulated_allocations_line_idx on private.simulated_shipment_allocations(order_item_id);
create table private.simulated_shipment_events (
  id uuid primary key default extensions.gen_random_uuid(),
  shipment_id uuid not null references private.simulated_shipments(id),
  version integer not null check(version between 1 and 100),
  state text not null check(state in ('dispatched','in_transit','delivered','exception')),
  actor_id uuid not null,
  resolution_reason text check(resolution_reason is null or pg_catalog.length(resolution_reason) between 1 and 500),
  occurred_at timestamptz not null default pg_catalog.clock_timestamp(),
  unique(shipment_id,version)
);
create table private.simulated_shipment_commands (
  id uuid primary key,
  order_id uuid not null references public.orders(id),
  payload_hash text not null check(payload_hash ~ '^[0-9a-f]{64}$'),
  event_id uuid not null unique references private.simulated_shipment_events(id),
  created_at timestamptz not null default pg_catalog.clock_timestamp()
);
create table private.simulation_refund_freezes (
  order_id uuid primary key references public.orders(id),
  frozen_at timestamptz not null default pg_catalog.clock_timestamp()
);

alter table private.simulated_shipments enable row level security;
alter table private.simulated_shipments force row level security;
alter table private.simulated_shipment_allocations enable row level security;
alter table private.simulated_shipment_allocations force row level security;
alter table private.simulated_shipment_events enable row level security;
alter table private.simulated_shipment_events force row level security;
alter table private.simulated_shipment_commands enable row level security;
alter table private.simulated_shipment_commands force row level security;
alter table private.simulation_refund_freezes enable row level security;
alter table private.simulation_refund_freezes force row level security;
revoke all on private.simulated_shipments,private.simulated_shipment_allocations,
  private.simulated_shipment_events,private.simulated_shipment_commands,private.simulation_refund_freezes
  from public,anon,authenticated,service_role;
grant select,insert on private.simulated_shipment_allocations,private.simulated_shipment_events,
  private.simulated_shipment_commands,private.simulation_refund_freezes to service_role;
grant select,insert,update on private.simulated_shipments to service_role;

create function private.preserve_simulated_history() returns trigger language plpgsql
security invoker set search_path='' as $$
begin
  raise exception using errcode='55000',message='simulated shipment history must be retained';
end $$;
create trigger preserve_simulated_allocations before update or delete on private.simulated_shipment_allocations
  for each row execute function private.preserve_simulated_history();
create trigger preserve_simulated_events before update or delete on private.simulated_shipment_events
  for each row execute function private.preserve_simulated_history();
create trigger preserve_simulated_commands before update or delete on private.simulated_shipment_commands
  for each row execute function private.preserve_simulated_history();
create trigger preserve_simulation_freezes before update or delete on private.simulation_refund_freezes
  for each row execute function private.preserve_simulated_history();
create function private.preserve_simulated_shipment_identity() returns trigger language plpgsql
security invoker set search_path='' as $$
begin
  if tg_op='DELETE' or row(new.id,new.order_id,new.number,new.created_at)
    is distinct from row(old.id,old.order_id,old.number,old.created_at)
    or new.version<>old.version+1 or old.state='delivered' or new.state=old.state
  then raise exception using errcode='55000',message='simulated shipment identity must be retained'; end if;
  return new;
end $$;
create trigger preserve_simulated_shipment_identity before update or delete on private.simulated_shipments
  for each row execute function private.preserve_simulated_shipment_identity();
revoke all on function private.preserve_simulated_history(),private.preserve_simulated_shipment_identity()
  from public,anon,authenticated,service_role;

alter table private.email_controls drop constraint email_controls_purpose_check;
alter table private.email_controls add constraint email_controls_purpose_check
  check(purpose in ('order_confirmation','order_tracking'));
alter table private.email_controls add column tracking_activated_at timestamptz;
alter table private.email_controls add constraint tracking_activation_matches_cutoff
  check(tracking_activated_at is null or (purpose='order_tracking' and accepted_after=tracking_activated_at));
insert into private.email_controls(environment,purpose) values('sandbox','order_tracking');
create function private.preserve_tracking_activation() returns trigger language plpgsql
security invoker set search_path='' as $$
begin
  if old.tracking_activated_at is not null and (new.tracking_activated_at is distinct from old.tracking_activated_at
    or new.accepted_after is distinct from old.accepted_after) then
    raise exception using errcode='55000',message='tracking activation boundary must be retained';
  end if;
  return new;
end $$;
create trigger preserve_tracking_activation before update on private.email_controls
  for each row execute function private.preserve_tracking_activation();
revoke all on function private.preserve_tracking_activation() from public,anon,authenticated,service_role;
alter table private.email_intents drop constraint email_intents_purpose_check;
alter table private.email_intents add constraint email_intents_purpose_check
  check(purpose in ('order_confirmation','order_tracking'));
alter table private.email_intents add column tracking_event_id uuid references private.simulated_shipment_events(id);
alter table private.email_intents add constraint email_intents_tracking_event_check
  check((purpose='order_tracking')=(tracking_event_id is not null));
alter table private.email_intents drop constraint email_intents_environment_purpose_order_id_key;
create unique index email_intents_confirmation_identity on private.email_intents(environment,purpose,order_id)
  where purpose='order_confirmation';
create unique index email_intents_tracking_identity on private.email_intents(environment,purpose,tracking_event_id)
  where purpose='order_tracking';

create function public.read_simulated_tracking_control() returns jsonb language sql stable
security invoker set search_path='' as $$
  select pg_catalog.jsonb_build_object('environment',environment,'purpose',purpose,'enabled',enabled,
    'acceptedAfter',accepted_after,'activatedAt',tracking_activated_at,'updatedAt',updated_at)
  from private.email_controls where environment='sandbox' and purpose='order_tracking';
$$;
create function public.configure_simulated_tracking(p_enabled boolean,p_expected_updated_at timestamptz)
returns boolean language plpgsql security invoker set search_path='' as $$
declare v_now timestamptz;
begin
  if p_enabled is null then return false; end if;
  perform 1 from private.email_controls where environment='sandbox' and purpose='order_tracking'
    and updated_at=p_expected_updated_at for update;
  if not found then return false; end if;
  v_now:=pg_catalog.clock_timestamp();
  update private.email_controls set enabled=p_enabled,updated_at=v_now,
    tracking_activated_at=case when p_enabled then coalesce(tracking_activated_at,v_now) else tracking_activated_at end,
    accepted_after=case when p_enabled and tracking_activated_at is null then v_now else accepted_after end
    where environment='sandbox' and purpose='order_tracking' and updated_at=p_expected_updated_at;
  return found;
end $$;

-- Call after the application's fresh provider verification, before refund effects.
-- This is intentionally independent of email configuration and sender credentials.
-- Legacy refunds also bind to immutable Order/session/payment/amount facts even when
-- they predate checkout_verified_payments; simulation admission still requires that proof.
create function public.record_verified_refund_simulation_freeze(
  p_order_id uuid,p_session_id text,p_payment_intent_id text,p_amount_cents integer
) returns boolean language plpgsql security invoker set search_path='' as $$
declare v_order public.orders%rowtype;
begin
  select * into v_order from public.orders where id=p_order_id for update;
  if not found or v_order.checkout_environment<>'sandbox' or v_order.status not in ('paid','refunded')
    or p_session_id is null or p_payment_intent_id is null or p_amount_cents is null
    or v_order.stripe_checkout_session_id is distinct from p_session_id
    or v_order.stripe_payment_intent_id is distinct from p_payment_intent_id
    or v_order.total_cents is distinct from p_amount_cents or p_amount_cents<=0
  then return false; end if;
  insert into private.simulation_refund_freezes(order_id) values(p_order_id) on conflict do nothing;
  return true;
end $$;

create function private.simulation_is_frozen(p_order_id uuid) returns boolean language sql volatile
security invoker set search_path='' as $$
  select exists(select 1 from public.orders o where o.id=p_order_id and (
    o.status='refunded' or exists(select 1 from private.simulation_refund_freezes f where f.order_id=o.id)
    or exists(select 1 from public.payment_attempts a where a.order_id=o.id and a.checkout_environment='sandbox'
      and a.stripe_checkout_session_id=o.stripe_checkout_session_id
      and a.stripe_payment_intent_id=o.stripe_payment_intent_id and a.status='refunded')
    or exists(select 1 from private.checkout_payment_exceptions e where e.order_id=o.id
      and e.session_id=o.stripe_checkout_session_id and e.payment_intent_id=o.stripe_payment_intent_id
      and e.amount_cents=o.total_cents and e.environment='sandbox'
      and e.code='full_refund_reconciliation_failed' and e.payment_status='refunded')));
$$;
create function private.simulation_lines_displayable(p_order_id uuid) returns boolean language sql volatile
security invoker set search_path='' as $$
  select (select pg_catalog.count(*) from public.order_items i where i.order_id=p_order_id) between 1 and 100
    and not exists(select 1 from public.order_items i where i.order_id=p_order_id and (
      pg_catalog.length(i.product_name) not between 1 and 200 or pg_catalog.btrim(i.product_name)=''
      or i.product_name ~ '[[:cntrl:]]' or pg_catalog.length(i.variant_label)>200
      or i.variant_label ~ '[[:cntrl:]]' or i.quantity not between 1 and 99));
$$;
create function private.simulation_order_eligible(p_order_id uuid) returns boolean language sql volatile
security invoker set search_path='' as $$
  select exists(select 1 from public.orders o
    join private.checkout_verified_payments v on v.order_id=o.id and v.session_id=o.stripe_checkout_session_id
      and v.payment_intent_id=o.stripe_payment_intent_id and v.total_cents=o.total_cents
    join public.payment_attempts a on a.id=v.attempt_id and a.order_id=o.id
      and a.stripe_checkout_session_id=v.session_id and a.stripe_payment_intent_id=v.payment_intent_id
      and a.checkout_environment='sandbox' and a.status='paid' and a.contract_version='checkout_v2'
      and a.stripe_idempotency_key=o.metadata->>'stripe_idempotency_key'
    join private.checkout_payment_contracts c on c.attempt_id=a.id and c.order_id=o.id
      and c.terms->>'environment'='sandbox' and c.terms->>'accountId'='acct_1Tm9WRFEzyaKzdmq'
    join private.email_intents i on i.order_id=o.id and i.environment='sandbox'
      and i.purpose='order_confirmation' and i.content_deleted_at is null and i.receipt is not null
      and pg_catalog.length(i.receipt->>'orderNumber') between 1 and 64
      and i.receipt->>'orderNumber' !~ '[[:cntrl:]]'
    join private.email_controls ctl on ctl.environment='sandbox' and ctl.purpose='order_tracking'
      and ctl.tracking_activated_at is not null and o.created_at>=ctl.accepted_after
    where o.id=p_order_id and o.checkout_environment='sandbox' and o.status='paid'
      and not private.simulation_is_frozen(o.id)
      and private.simulation_lines_displayable(o.id));
$$;

create function public.read_simulated_tracking(p_order_id uuid) returns jsonb language sql
security invoker set search_path='' as $$
  select pg_catalog.jsonb_build_object('frozen',private.simulation_is_frozen(p_order_id),
    'shipments',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id',s.id,'number',s.number,'state',s.state,'version',s.version,
      'items',(select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('name',a.product_name,
        'variantLabel',coalesce(a.variant_label,''),'quantity',a.quantity) order by a.order_item_id)
        from private.simulated_shipment_allocations a where a.shipment_id=s.id),
      'events',(select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('state',e.state,'occurredAt',e.occurred_at)
        order by e.version) from private.simulated_shipment_events e where e.shipment_id=s.id)) order by s.number)
      from private.simulated_shipments s where s.order_id=p_order_id),'[]'::jsonb))
  where exists(select 1 from public.orders where id=p_order_id and checkout_environment='sandbox');
$$;
create function public.read_simulated_order(p_order_number text,p_actor_id uuid) returns jsonb language plpgsql
security invoker set search_path='' as $$
declare v_order public.orders%rowtype; v_view jsonb;
begin
  if p_order_number is null or pg_catalog.length(p_order_number) not between 1 and 100
    or not exists(select 1 from public.admin_memberships where user_id=p_actor_id and active and role='admin')
  then return null; end if;
  select * into v_order from public.orders where order_number=p_order_number and checkout_environment='sandbox';
  if not found then return null; end if;
  v_view:=public.read_simulated_tracking(v_order.id);
  return v_view || pg_catalog.jsonb_build_object('orderId',v_order.id,'orderNumber',v_order.order_number,
    'eligible',private.simulation_order_eligible(v_order.id)
      and exists(select 1 from private.email_controls where environment='sandbox' and purpose='order_tracking' and enabled)
      and (select pg_catalog.count(*) from private.simulated_shipment_events e join private.simulated_shipments sh
        on sh.id=e.shipment_id where sh.order_id=v_order.id)<100,'lines',case when private.simulation_lines_displayable(v_order.id) then coalesce((select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object('id',i.id,'name',i.product_name,'variantLabel',coalesce(i.variant_label,''),'quantity',i.quantity,
        'allocatedQuantity',(select coalesce(pg_catalog.sum(a.quantity),0)
          from private.simulated_shipment_allocations a where a.order_item_id=i.id)) order by i.id)
      from public.order_items i where i.order_id=v_order.id),'[]'::jsonb) else '[]'::jsonb end);
end $$;

create function public.apply_simulated_shipment_event(
  p_actor_id uuid,p_order_id uuid,p_command_id uuid,p_shipment_id uuid,p_expected_version integer,
  p_state text,p_lines jsonb,p_resolution_reason text
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  v_order public.orders%rowtype; v_shipment private.simulated_shipments%rowtype;
  v_previous private.simulated_shipment_commands%rowtype; v_event private.simulated_shipment_events%rowtype;
  v_confirmation private.email_intents%rowtype; v_lines jsonb; v_line jsonb; v_payload jsonb; v_payload_hash text;
  v_number integer; v_state text; v_recipient_valid boolean; v_reason text:=nullif(pg_catalog.btrim(p_resolution_reason),'');
begin
  perform 1 from public.admin_memberships where user_id=p_actor_id and active and role='admin' for share;
  if not found then return pg_catalog.jsonb_build_object('status','forbidden','order',null); end if;
  if p_order_id is null or p_command_id is null or p_expected_version is null
    or p_state is null or p_state not in ('dispatched','in_transit','delivered','exception')
    or p_expected_version not between 0 and 99
    or pg_catalog.jsonb_typeof(p_lines) is distinct from 'array'
    or pg_catalog.jsonb_array_length(p_lines)>100
    or (p_resolution_reason is not null and (pg_catalog.length(p_resolution_reason)>500
      or p_resolution_reason ~ '[[:cntrl:]]'))
  then return pg_catalog.jsonb_build_object('status','conflict','order',null); end if;
  for v_line in select value from pg_catalog.jsonb_array_elements(p_lines) loop
    if pg_catalog.jsonb_typeof(v_line) is distinct from 'object'
      or v_line-array['orderItemId','quantity']<>'{}'::jsonb
      or v_line->>'orderItemId' is null or v_line->>'orderItemId' !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      or pg_catalog.jsonb_typeof(v_line->'quantity') is distinct from 'number'
      or v_line->>'quantity' !~ '^[1-9][0-9]?$'
    then return pg_catalog.jsonb_build_object('status','conflict','order',null); end if;
  end loop;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('orderItemId',(value->>'orderItemId')::uuid,
    'quantity',(value->>'quantity')::integer) order by (value->>'orderItemId')::uuid),'[]'::jsonb)
    into v_lines from pg_catalog.jsonb_array_elements(p_lines);
  v_payload:=pg_catalog.jsonb_build_object('actorId',p_actor_id,'orderId',p_order_id,'shipmentId',p_shipment_id,
    'expectedVersion',p_expected_version,'state',p_state,'lines',v_lines,'resolutionReason',v_reason);
  v_payload_hash:=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(v_payload::text,'UTF8')),'hex');
  -- Stable command identity also serializes concurrent reuse against different Orders.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('simulation-command:'||p_command_id::text,0));
  select * into v_order from public.orders where id=p_order_id for update;
  if not found then return pg_catalog.jsonb_build_object('status','ineligible','order',null); end if;
  select * into v_previous from private.simulated_shipment_commands where id=p_command_id;
  if found then
    if v_previous.order_id=p_order_id and v_previous.payload_hash=v_payload_hash then
      select * into v_event from private.simulated_shipment_events where id=v_previous.event_id;
      return pg_catalog.jsonb_build_object('status','replayed','shipmentId',v_event.shipment_id,'version',v_event.version,
        'order',public.read_simulated_order(v_order.order_number,p_actor_id));
    end if;
    return pg_catalog.jsonb_build_object('status','conflict','order',public.read_simulated_order(v_order.order_number,p_actor_id));
  end if;
  perform 1 from private.email_controls where environment='sandbox' and purpose='order_tracking' and enabled for share;
  if not found or not private.simulation_order_eligible(p_order_id) then
    return pg_catalog.jsonb_build_object('status','ineligible','order',public.read_simulated_order(v_order.order_number,p_actor_id));
  end if;
  select * into v_confirmation from private.email_intents where order_id=p_order_id
    and environment='sandbox' and purpose='order_confirmation' for share;
  if v_confirmation.content_deleted_at is not null or v_confirmation.receipt is null then
    return pg_catalog.jsonb_build_object('status','ineligible','order',public.read_simulated_order(v_order.order_number,p_actor_id));
  end if;
  if (select pg_catalog.count(*) from private.simulated_shipment_events e
    join private.simulated_shipments s on s.id=e.shipment_id where s.order_id=p_order_id)>=100 then
    return pg_catalog.jsonb_build_object('status','ineligible','order',public.read_simulated_order(v_order.order_number,p_actor_id));
  end if;
  if p_shipment_id is null then
    if p_state<>'dispatched' or p_expected_version<>0 or pg_catalog.jsonb_array_length(v_lines)=0 or v_reason is not null
      or (select pg_catalog.count(distinct value->>'orderItemId') from pg_catalog.jsonb_array_elements(v_lines))<>pg_catalog.jsonb_array_length(v_lines)
      or exists(select 1 from pg_catalog.jsonb_array_elements(v_lines) l
        left join public.order_items i on i.id=(l->>'orderItemId')::uuid and i.order_id=p_order_id
        where i.id is null or i.quantity>99 or (l->>'quantity')::integer+
          (select coalesce(pg_catalog.sum(a.quantity),0) from private.simulated_shipment_allocations a where a.order_item_id=i.id)>i.quantity)
    then return pg_catalog.jsonb_build_object('status','conflict','order',public.read_simulated_order(v_order.order_number,p_actor_id)); end if;
    select coalesce(pg_catalog.max(number),0)+1 into v_number from private.simulated_shipments where order_id=p_order_id;
    if v_number>100 then return pg_catalog.jsonb_build_object('status','conflict','order',public.read_simulated_order(v_order.order_number,p_actor_id)); end if;
    insert into private.simulated_shipments(order_id,number,state,version) values(p_order_id,v_number,'dispatched',1)
      returning * into v_shipment;
    insert into private.simulated_shipment_allocations(shipment_id,order_item_id,quantity,product_name,variant_label)
      select v_shipment.id,i.id,(l->>'quantity')::integer,i.product_name,i.variant_label
      from pg_catalog.jsonb_array_elements(v_lines) l join public.order_items i on i.id=(l->>'orderItemId')::uuid;
  else
    select * into v_shipment from private.simulated_shipments where id=p_shipment_id and order_id=p_order_id for update;
    if not found or v_shipment.version is distinct from p_expected_version or v_shipment.version>=100
      or pg_catalog.jsonb_array_length(v_lines)<>0
      or not ((v_shipment.state='dispatched' and p_state in ('in_transit','delivered','exception'))
        or (v_shipment.state='in_transit' and p_state in ('delivered','exception'))
        or (v_shipment.state='exception' and p_state in ('in_transit','delivered') and v_reason is not null))
      or (v_shipment.state<>'exception' and v_reason is not null)
    then return pg_catalog.jsonb_build_object('status','conflict','order',public.read_simulated_order(v_order.order_number,p_actor_id)); end if;
    update private.simulated_shipments set state=p_state,version=version+1 where id=v_shipment.id returning * into v_shipment;
  end if;
  insert into private.simulated_shipment_events(shipment_id,version,state,actor_id,resolution_reason)
    values(v_shipment.id,v_shipment.version,v_shipment.state,p_actor_id,v_reason) returning * into v_event;
  insert into private.simulated_shipment_commands(id,order_id,payload_hash,event_id) values(p_command_id,p_order_id,v_payload_hash,v_event.id);
  if v_event.state in ('dispatched','delivered','exception') then
    v_recipient_valid:=v_confirmation.recipient is not null and pg_catalog.length(v_confirmation.recipient)<=254
      and v_confirmation.recipient ~* '^[A-Z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?)+$';
    v_state:=case when v_recipient_valid then 'queued' else 'unsendable' end;
    insert into private.email_intents(environment,purpose,order_id,tracking_event_id,recipient,receipt,state,idempotency_key,error_code)
    values('sandbox','order_tracking',p_order_id,v_event.id,v_confirmation.recipient,
      pg_catalog.jsonb_build_object('orderNumber',v_confirmation.receipt->>'orderNumber','shipmentNumber',v_shipment.number,
        'status',v_event.state,'occurredAt',v_event.occurred_at,'items',(select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object('name',product_name,'variantLabel',coalesce(variant_label,''),'quantity',quantity) order by order_item_id)
          from private.simulated_shipment_allocations where shipment_id=v_shipment.id)),v_state,
      'sandbox:order_tracking:'||v_event.id::text,case when v_state='unsendable' then 'invalid_recipient' else null end);
  end if;
  return pg_catalog.jsonb_build_object('status','applied','shipmentId',v_shipment.id,'version',v_shipment.version,
    'order',public.read_simulated_order(v_order.order_number,p_actor_id));
end $$;

revoke all on function public.read_simulated_tracking_control(),public.configure_simulated_tracking(boolean,timestamptz),
  public.record_verified_refund_simulation_freeze(uuid,text,text,integer),private.simulation_is_frozen(uuid),
  private.simulation_lines_displayable(uuid),private.simulation_order_eligible(uuid),public.read_simulated_tracking(uuid),public.read_simulated_order(text,uuid),
  public.apply_simulated_shipment_event(uuid,uuid,uuid,uuid,integer,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.read_simulated_tracking_control(),public.configure_simulated_tracking(boolean,timestamptz),
  public.record_verified_refund_simulation_freeze(uuid,text,text,integer),private.simulation_is_frozen(uuid),
  private.simulation_lines_displayable(uuid),private.simulation_order_eligible(uuid),public.read_simulated_tracking(uuid),public.read_simulated_order(text,uuid),
  public.apply_simulated_shipment_event(uuid,uuid,uuid,uuid,integer,text,jsonb,text) to service_role;

-- Preserve both confirmation and committed-transition logical identities.
create or replace function private.preserve_email_identity() returns trigger language plpgsql
security invoker set search_path='' as $$
begin
  if tg_op='DELETE' then
    raise exception using errcode='55000',message='email logical identity must be retained';
  end if;
  if row(new.id,new.environment,new.purpose,new.order_id,new.tracking_event_id,new.idempotency_key,new.created_at)
    is distinct from row(old.id,old.environment,old.purpose,old.order_id,old.tracking_event_id,old.idempotency_key,old.created_at)
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

-- Retain all existing lease, frozen-envelope and safe-retry validation.
create or replace function public.prepare_email_attempt(p_id uuid,p_lease_token uuid,p_request_payload jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_intent private.email_intents%rowtype; v_order_id uuid; v_purpose text;
begin
  -- Identity fields are immutable. Lock Order before intent for all tracking handoffs.
  select order_id,purpose into v_order_id,v_purpose from private.email_intents where id=p_id;
  if v_purpose='order_tracking' then
    perform 1 from public.orders where id=v_order_id for update;
  end if;
  select * into v_intent from private.email_intents where id=p_id for update;
  if not found or v_intent.state<>'leased' or v_intent.lease_token is distinct from p_lease_token
    or p_lease_token is null or v_intent.lease_expires_at<=pg_catalog.clock_timestamp()
    or v_intent.attempt_count>=5 or v_intent.content_deleted_at is not null
    or v_intent.provider_email_id is not null
    or (v_intent.first_attempt_at is not null and v_intent.first_attempt_at<=pg_catalog.clock_timestamp()-interval '23 hours')
  then return null; end if;
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


-- Only conflict inference changes: the confirmation identity is now a partial index.
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
    on conflict(environment,purpose,order_id) where purpose='order_confirmation' do nothing;
  end if;
  return next v_order;
end $$;

-- A later unknown reconciliation result cannot erase a previously verified refund.
create or replace function public.record_checkout_payment_exception(
  p_order_id uuid,p_attempt_id uuid,p_session_id text,p_code text,p_payment_intent_id text,
  p_payment_status text,p_amount_cents integer
) returns boolean language plpgsql security invoker set search_path='' as $$
declare v_previous private.checkout_payment_exceptions%rowtype;
begin
  if not exists(select 1 from public.orders where id=p_order_id and checkout_environment='sandbox')
    or (p_attempt_id is not null and not exists(select 1 from public.payment_attempts where id=p_attempt_id and order_id=p_order_id))
  then raise exception using errcode='22023',message='invalid checkout exception identity'; end if;
  if p_code='full_refund_reconciliation_failed' then
    -- The fallback RPC can succeed after a lost/failed standalone freeze response.
    -- Serialize it with simulation before upserting mutable reconciliation status.
    perform 1 from public.orders where id=p_order_id for update;
    select * into v_previous from private.checkout_payment_exceptions where order_id=p_order_id
      and session_id=p_session_id and code=p_code and payment_status='refunded';
    if found then
      perform public.record_verified_refund_simulation_freeze(p_order_id,v_previous.session_id,
        v_previous.payment_intent_id,v_previous.amount_cents);
    end if;
    if p_payment_status='refunded' then
      perform public.record_verified_refund_simulation_freeze(p_order_id,p_session_id,p_payment_intent_id,p_amount_cents);
    end if;
  end if;
  insert into private.checkout_payment_exceptions(order_id,attempt_id,session_id,code,payment_intent_id,payment_status,amount_cents)
  values(p_order_id,p_attempt_id,p_session_id,p_code,p_payment_intent_id,p_payment_status,p_amount_cents)
  on conflict(order_id,session_id,code) do update set
    attempt_id=excluded.attempt_id,payment_intent_id=excluded.payment_intent_id,payment_status=excluded.payment_status,
    amount_cents=excluded.amount_cents,updated_at=pg_catalog.now(),resolved_at=null;
  return true;
end $$;

-- Durable capability evidence for the existing refund path. Append projection metadata
-- only after all tracking guards exist; never change accepted terms or verified facts.
create or replace function public.read_checkout_payment_contract(p_order_id uuid,p_session_id text) returns jsonb
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
  if found then return v_terms||pg_catalog.jsonb_build_object('trackingSchemaVersion',1); end if;
  if public.is_legacy_checkout_session(p_order_id,p_session_id) then
    select terms into v_terms from private.checkout_legacy_contracts where order_id=p_order_id and session_id=p_session_id;
    return v_terms||pg_catalog.jsonb_build_object('trackingSchemaVersion',1);
  end if;
  return null;
end $$;

