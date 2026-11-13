-- Manual records only: no provider events, mail, delivery eligibility or activation.
create table private.manual_shipment_control (singleton boolean primary key default true check(singleton), enabled boolean not null default false);
insert into private.manual_shipment_control default values;
create table private.manual_shipments (
 id uuid primary key default extensions.gen_random_uuid(), order_id uuid not null references public.orders(id),
 state text not null check(state in ('preparing','dispatched','delivered','exception','cancelled')),
 version integer not null check(version between 1 and 100),
 carrier text not null check(length(carrier)<=100 and carrier !~ '[[:cntrl:]]'),
 tracking_reference text not null check(length(tracking_reference)<=200 and tracking_reference !~ '[[:cntrl:]]'),
 ever_dispatched boolean not null default false, released boolean not null default false,
 dispatched_at timestamptz, delivered_at timestamptz, created_at timestamptz not null default clock_timestamp(),
 check(not released or (state='cancelled' and not ever_dispatched))
);
create index manual_shipments_order_idx on private.manual_shipments(order_id);
create table private.manual_shipment_allocations (
 shipment_id uuid not null references private.manual_shipments(id), order_item_id uuid not null references public.order_items(id),
 quantity integer not null check(quantity between 1 and 99), primary key(shipment_id,order_item_id)
);
create index manual_shipment_line_idx on private.manual_shipment_allocations(order_item_id);
create table private.manual_shipment_audit (
 command_id uuid primary key, actor_id uuid not null, order_id uuid not null references public.orders(id),
 shipment_id uuid not null references private.manual_shipments(id), payload jsonb not null,
 prior_state text, state text not null, version integer not null, reason text,
 occurred_at timestamptz not null default clock_timestamp(), result jsonb not null,
 unique(shipment_id,version)
);
alter table private.manual_shipment_control enable row level security;
alter table private.manual_shipments enable row level security;
alter table private.manual_shipment_allocations enable row level security;
alter table private.manual_shipment_audit enable row level security;
revoke all on private.manual_shipment_control,private.manual_shipments,private.manual_shipment_allocations,private.manual_shipment_audit from public,anon,authenticated,service_role;
-- Control has no public configuration endpoint. Activation remains a separate operation.
grant select,update on private.manual_shipment_control to service_role;

create function private.manual_shipment_eligible(p_order_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.orders o
 join private.checkout_verified_payments v on v.order_id=o.id and v.session_id=o.stripe_checkout_session_id
 and v.payment_intent_id=o.stripe_payment_intent_id and v.total_cents=o.total_cents
 join public.payment_attempts a on a.id=v.attempt_id and a.order_id=o.id and a.status='paid'
 and a.checkout_environment='sandbox' and a.contract_version='checkout_v2'
 and a.stripe_checkout_session_id=v.session_id and a.stripe_payment_intent_id=v.payment_intent_id
 and a.stripe_idempotency_key=o.metadata->>'stripe_idempotency_key'
 join private.checkout_payment_contracts c on c.attempt_id=a.id and c.order_id=o.id
 and c.terms->>'environment'='sandbox' and c.terms->>'accountId'='acct_1Tm9WRFEzyaKzdmq'
 where o.id=p_order_id and o.status='paid' and o.checkout_environment='sandbox'
 and not exists(select 1 from private.checkout_payment_exceptions e where e.order_id=o.id));
$$;
create function private.manual_shipment_view(p_order_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('environment','sandbox','shipments',coalesce((select jsonb_agg(jsonb_build_object(
 'id',s.id,'state',s.state,'version',s.version,'carrier',s.carrier,'trackingReference',s.tracking_reference,
 'dispatchedAt',s.dispatched_at,'deliveredAt',s.delivered_at,
 'items',(select jsonb_agg(jsonb_build_object('name',i.product_name,'quantity',a.quantity) order by i.id)
 from private.manual_shipment_allocations a join public.order_items i on i.id=a.order_item_id where a.shipment_id=s.id)) order by s.created_at,s.id)
 from private.manual_shipments s where s.order_id=p_order_id),'[]'::jsonb))
 where exists(select 1 from public.orders where id=p_order_id and checkout_environment='sandbox');
$$;
create function public.read_manual_shipments(p_order_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select private.manual_shipment_view(p_order_id);
$$;
create function public.read_manual_shipment_order(p_order_number text,p_actor_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.orders%rowtype;
begin
 if not exists(select 1 from public.admin_memberships where user_id=p_actor_id and active and role='admin') then return null;end if;
 select * into o from public.orders where order_number=p_order_number and checkout_environment='sandbox';
 if not found then return null;end if;
 return private.manual_shipment_view(o.id)||jsonb_build_object('orderId',o.id,'orderNumber',o.order_number,'eligible',private.manual_shipment_eligible(o.id),
 'lines',(select jsonb_agg(jsonb_build_object('id',i.id,'name',i.product_name,'quantity',i.quantity,'allocatedQuantity',
 coalesce((select sum(a.quantity) from private.manual_shipment_allocations a join private.manual_shipments s on s.id=a.shipment_id
 where a.order_item_id=i.id and not s.released),0)) order by i.id) from public.order_items i where i.order_id=o.id));
end $$;
create function public.apply_manual_shipment(p_actor_id uuid,p_command jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.orders%rowtype;s private.manual_shipments%rowtype; prior private.manual_shipment_audit%rowtype;
 oid uuid;cid uuid;sid uuid;v integer;st text;why text;line jsonb;qty integer;capacity integer;total integer;payload jsonb;result jsonb;old_state text;
begin
 if not exists(select 1 from public.admin_memberships where user_id=p_actor_id and active and role='admin') then return jsonb_build_object('status','forbidden');end if;
 if not coalesce((select enabled from private.manual_shipment_control where singleton),false) then return jsonb_build_object('status','disabled');end if;
 if jsonb_typeof(p_command)<>'object' or (select array_agg(k order by k) from jsonb_object_keys(p_command) k)
 <>array['carrier','commandId','correctionReason','expectedVersion','lines','orderId','shipmentId','state','trackingReference'] then return jsonb_build_object('status','invalid');end if;
 begin
 oid:=(p_command->>'orderId')::uuid;cid:=(p_command->>'commandId')::uuid;sid:=(p_command->>'shipmentId')::uuid;v:=(p_command->>'expectedVersion')::integer;
 exception when invalid_text_representation or numeric_value_out_of_range then return jsonb_build_object('status','invalid');end;
 st:=p_command->>'state';why:=p_command->>'correctionReason';payload:=p_command||jsonb_build_object('actorId',p_actor_id);
 if jsonb_typeof(p_command->'expectedVersion')<>'number' or (p_command->>'expectedVersion') !~ '^[0-9]+$'
 or jsonb_typeof(p_command->'correctionReason') not in ('null','string')
 or oid is null or cid is null or v is null or v<0 or v>100 or st is null or st not in ('preparing','dispatched','delivered','exception','cancelled')
 or jsonb_typeof(p_command->'carrier')<>'string' or length(p_command->>'carrier')>100 or p_command->>'carrier' ~ '[[:cntrl:]]'
 or jsonb_typeof(p_command->'trackingReference')<>'string' or length(p_command->>'trackingReference')>200 or p_command->>'trackingReference' ~ '[[:cntrl:]]'
 or (why is not null and (length(trim(why))<1 or length(why)>500 or why ~ '[[:cntrl:]]'))
 or jsonb_typeof(p_command->'lines')<>'array' or jsonb_array_length(p_command->'lines')>100 then return jsonb_build_object('status','invalid');end if;
 -- Global command lock precedes order lock, so a reused command across Orders cannot race.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(cid::text,491));
 select * into o from public.orders where id=oid for update;
 if not found or o.checkout_environment<>'sandbox' then return jsonb_build_object('status','ineligible');end if;
 select * into prior from private.manual_shipment_audit where command_id=cid;
 if found then
 if prior.payload=payload then return prior.result||jsonb_build_object('status','replayed');end if;
 return jsonb_build_object('status','conflict');end if;
 if sid is null then
 if not private.manual_shipment_eligible(oid) or st<>'preparing' or v<>0 or why is not null or jsonb_array_length(p_command->'lines')<1
 or (select count(distinct x->>'orderItemId') from jsonb_array_elements(p_command->'lines') x)<>jsonb_array_length(p_command->'lines')
 or (select count(*) from private.manual_shipments where order_id=oid)>=100 then return jsonb_build_object('status','ineligible');end if;
 for line in select * from jsonb_array_elements(p_command->'lines') loop
 if jsonb_typeof(line)<>'object' or (select array_agg(k order by k) from jsonb_object_keys(line) k)<>array['orderItemId','quantity']
 or coalesce(line->>'quantity','') !~ '^[1-9][0-9]?$' then return jsonb_build_object('status','invalid');end if;
 begin sid:=(line->>'orderItemId')::uuid;exception when invalid_text_representation then return jsonb_build_object('status','invalid');end;
 select quantity into capacity from public.order_items where id=sid and order_id=oid;
 if not found then return jsonb_build_object('status','invalid');end if;
 select coalesce(sum(a.quantity),0) into total from private.manual_shipment_allocations a join private.manual_shipments ms on ms.id=a.shipment_id where a.order_item_id=sid and not ms.released;
 qty:=(line->>'quantity')::integer;if total+qty>capacity then return jsonb_build_object('status','conflict');end if;
 end loop;
 insert into private.manual_shipments(order_id,state,version,carrier,tracking_reference) values(oid,'preparing',1,p_command->>'carrier',p_command->>'trackingReference') returning * into s;
 insert into private.manual_shipment_allocations(shipment_id,order_item_id,quantity) select s.id,(x->>'orderItemId')::uuid,(x->>'quantity')::integer from jsonb_array_elements(p_command->'lines') x;
 else
 select * into s from private.manual_shipments where id=sid and order_id=oid for update;
 if not found or s.version<>v or s.version>=100 or s.state='cancelled' or s.state=st or jsonb_array_length(p_command->'lines')<>0 then return jsonb_build_object('status','conflict');end if;
 if not ((s.state='preparing' and st in ('dispatched','exception','cancelled')) or (s.state='dispatched' and st in ('delivered','exception','cancelled'))
 or (s.state='exception' and st in ('dispatched','delivered','cancelled')) or (s.state='delivered' and st in ('exception','cancelled') and why is not null))
 then return jsonb_build_object('status','invalid');end if;
 if st in ('dispatched','delivered') and not private.manual_shipment_eligible(oid) then return jsonb_build_object('status','ineligible');end if;
 old_state:=s.state;
 update private.manual_shipments set state=st,version=version+1,carrier=p_command->>'carrier',tracking_reference=p_command->>'trackingReference',
 ever_dispatched=ever_dispatched or st in ('dispatched','delivered'),released=(st='cancelled' and state='preparing' and not ever_dispatched),
 dispatched_at=case when st in ('dispatched','delivered') then coalesce(dispatched_at,clock_timestamp()) else dispatched_at end,
 delivered_at=case when st='delivered' then clock_timestamp() when state='delivered' then null else delivered_at end where id=s.id returning * into s;
 end if;
 result:=jsonb_build_object('status','applied','shipmentId',s.id,'version',s.version);
 insert into private.manual_shipment_audit(command_id,actor_id,order_id,shipment_id,payload,prior_state,state,version,reason,result)
 values(cid,p_actor_id,oid,s.id,payload,old_state,s.state,s.version,why,result);
 return result;
end $$;
revoke all on function private.manual_shipment_eligible(uuid),private.manual_shipment_view(uuid),public.read_manual_shipments(uuid),public.read_manual_shipment_order(text,uuid),public.apply_manual_shipment(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.read_manual_shipments(uuid),public.read_manual_shipment_order(text,uuid),public.apply_manual_shipment(uuid,jsonb) to service_role;
