-- Product-specific notification requests remain independent of marketing consent.
-- Installation preserves historical requests, starts no delivery, and emits no catalog events.
alter table private.email_controls drop constraint email_controls_purpose_check;
alter table private.email_controls add constraint email_controls_purpose_check check(purpose in (
  'order_confirmation','order_tracking','support_acknowledgement','support_reply',
  'marketing_confirmation','welcome_initial','welcome_education','product_availability','product_waitlist_recovery'));
alter table private.email_intents drop constraint email_intents_purpose_check;
alter table private.email_intents add constraint email_intents_purpose_check check(purpose in (
  'order_confirmation','order_tracking','support_acknowledgement','support_reply',
  'marketing_confirmation','welcome_initial','welcome_education','product_availability','product_waitlist_recovery'));
insert into private.email_controls(environment,purpose) values
  ('sandbox','product_availability'),('sandbox','product_waitlist_recovery');

create function public.read_product_notification_email_control() returns jsonb
language sql stable security invoker set search_path='' as $$
  select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('purpose',purpose,'enabled',enabled,
    'acceptedAfter',accepted_after,'updatedAt',updated_at) order by purpose)
  from private.email_controls where environment='sandbox' and purpose in ('product_availability','product_waitlist_recovery');
$$;
create function public.configure_product_notification_email(p_enabled boolean,p_expected_updated_at jsonb)
returns boolean language plpgsql security invoker set search_path='' as $$
declare v_now timestamptz;
begin
  if p_enabled is null or pg_catalog.jsonb_typeof(p_expected_updated_at) is distinct from 'object'
    or p_expected_updated_at-array['product_availability','product_waitlist_recovery']<>'{}'::jsonb
    or not p_expected_updated_at ?& array['product_availability','product_waitlist_recovery'] then return false; end if;
  perform 1 from private.email_controls where environment='sandbox'
    and purpose in ('product_availability','product_waitlist_recovery') order by purpose for update;
  if (select count(*) from private.email_controls where environment='sandbox'
    and purpose in ('product_availability','product_waitlist_recovery')
    and pg_catalog.to_jsonb(updated_at)=p_expected_updated_at->purpose)<>2 then return false; end if;
  v_now:=pg_catalog.clock_timestamp();
  update private.email_controls set enabled=p_enabled,
    accepted_after=case when p_enabled and not enabled then greatest(accepted_after,v_now) else accepted_after end,
    updated_at=v_now where environment='sandbox' and purpose in ('product_availability','product_waitlist_recovery');
  return true;
end $$;

alter table private.product_waitlist_enrollments add column generation bigint not null default 1 check(generation>0);
create index product_waitlist_email_idx on private.product_waitlist_enrollments(normalized_email,id);
create table private.product_notification_transitions (
  id bigint generated always as identity primary key,
  product_id uuid not null references public.products(id),
  occurred_at timestamptz not null,
  revision_id uuid
);
create index product_notification_transitions_product_idx on private.product_notification_transitions(product_id,id);
create index product_notification_transitions_time_idx on private.product_notification_transitions(occurred_at,id);
create table private.product_notification_state (
  product_id uuid primary key references public.products(id),
  purchasable boolean not null,
  transition_id bigint not null default 0 check(transition_id>=0)
);
create table private.product_notification_generations (
  enrollment_id bigint not null references private.product_waitlist_enrollments(id),
  generation bigint not null check(generation>0),
  requested_at timestamptz not null,
  expires_at timestamptz not null,
  withdrawn_at timestamptz,
  after_transition_id bigint not null default 0 check(after_transition_id>=0),
  consumed_transition_id bigint references private.product_notification_transitions(id),
  last_recovery_at timestamptz,
  primary key(enrollment_id,generation),
  check(expires_at>requested_at),
  check(consumed_transition_id is null or consumed_transition_id>after_transition_id)
);
create index product_notification_generations_pending_idx on private.product_notification_generations(expires_at,enrollment_id,generation)
  where withdrawn_at is null and consumed_transition_id is null;
create table private.product_notification_tokens (
  token_hash text primary key check(token_hash ~ '^[0-9a-f]{64}$'),
  enrollment_id bigint not null,
  generation bigint not null,
  expires_at timestamptz not null,
  recovery_intent_id uuid not null references private.email_intents(id),
  foreign key(enrollment_id,generation) references private.product_notification_generations(enrollment_id,generation)
);
create index product_notification_tokens_generation_idx on private.product_notification_tokens(enrollment_id,generation,expires_at);
create table private.product_notification_requests (
  request_id uuid primary key,
  purpose text not null check(purpose in ('enrollment','recovery')),
  request_hash text not null check(request_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default pg_catalog.clock_timestamp()
);
create table private.product_notification_recovery_limits (
  key text primary key,
  occurrences timestamptz[] not null,
  updated_at timestamptz not null
);
create table private.product_notification_recovery_addresses (
  address_hash text primary key check(address_hash ~ '^[0-9a-f]{64}$'),
  last_bundle_at timestamptz not null
);
create index product_notification_recovery_limits_cleanup_idx on private.product_notification_recovery_limits(updated_at);
create unique index product_availability_intent_identity_idx on private.email_intents(
  (receipt->>'enrollmentId'),(receipt->>'generation'),(receipt->>'transitionId')) where purpose='product_availability';
create index product_waitlist_recovery_recipient_idx on private.email_intents(recipient,created_at)
  where purpose='product_waitlist_recovery' and content_deleted_at is null;
create unique index product_waitlist_recovery_outstanding_idx on private.email_intents(recipient)
  where purpose='product_waitlist_recovery' and provider_email_id is null and content_deleted_at is null
    and state in ('queued','leased','retry','uncertain');

create function private.product_is_purchasable(p_product_id uuid,p_observed_at timestamptz default pg_catalog.clock_timestamp())
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.products p where p.id=p_product_id and p.catalog_status='active'
    and p.published_at<=p_observed_at and p.status='available' and exists(
      select 1 from public.product_variants v where v.product_id=p.id and v.archived_at is null
        and v.available and v.inventory_status in ('in_stock','low_stock')));
$$;
-- Existing available Products establish a baseline only. No revisions are replayed.
insert into private.product_notification_state(product_id,purchasable)
  select id,private.product_is_purchasable(id,pg_catalog.clock_timestamp()) from public.products;
insert into private.product_notification_generations(enrollment_id,generation,requested_at,expires_at)
  select id,1,created_at,created_at+interval '12 months' from private.product_waitlist_enrollments;

create function private.preserve_product_notification_generation() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='DELETE' then raise exception using errcode='55000',message='Product request identity must be retained'; end if;
  if row(new.enrollment_id,new.generation,new.requested_at,new.expires_at,new.after_transition_id)
    is distinct from row(old.enrollment_id,old.generation,old.requested_at,old.expires_at,old.after_transition_id)
    or (old.withdrawn_at is not null and new.withdrawn_at is distinct from old.withdrawn_at)
    or (old.consumed_transition_id is not null and new.consumed_transition_id is distinct from old.consumed_transition_id)
    or (old.last_recovery_at is not null and (new.last_recovery_at is null or new.last_recovery_at<old.last_recovery_at))
  then raise exception using errcode='55000',message='Product request facts and terminal choices are immutable'; end if;
  return new;
end $$;
create trigger preserve_product_notification_generation before update or delete on private.product_notification_generations
  for each row execute function private.preserve_product_notification_generation();
create function private.preserve_product_notification_fact() returns trigger
language plpgsql security invoker set search_path='' as $$ begin
  raise exception using errcode='55000',message='Product notification identity is immutable';
end $$;
create trigger preserve_product_notification_transition before update or delete on private.product_notification_transitions
  for each row execute function private.preserve_product_notification_fact();
create trigger preserve_product_notification_request before update or delete on private.product_notification_requests
  for each row execute function private.preserve_product_notification_fact();
create trigger preserve_product_notification_token before update on private.product_notification_tokens
  for each row execute function private.preserve_product_notification_fact();

-- Replace the obsolete six-argument path: affirmative checkbox handling must use confirmed marketing admission.
drop function public.enroll_product_waitlist(uuid,text,boolean,text,text,text);
create function public.enroll_product_waitlist(
  p_product_id uuid,p_normalized_email text,p_marketing_consent boolean,p_policy_version text,p_source text,p_abuse_key text,
  p_request_id uuid,p_confirmation_token text default null,p_marketing_template_contract jsonb default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_now timestamptz; v_count integer; v_enrollment private.product_waitlist_enrollments%rowtype;
  v_generation private.product_notification_generations%rowtype; v_hash text; v_previous private.product_notification_requests%rowtype;
  v_result jsonb;
begin
  if p_product_id is null or p_normalized_email is null or p_normalized_email<>lower(btrim(p_normalized_email))
    or length(p_normalized_email) not between 3 and 254
    or p_normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or p_marketing_consent is null or nullif(btrim(p_policy_version),'') is null or length(p_policy_version)>64
    or nullif(btrim(p_source),'') is null or length(p_source)>64
    or p_abuse_key is null or p_abuse_key !~ '^[0-9a-f]{64}$' or p_request_id is null
  then raise exception using errcode='22023',message='invalid Product notification request'; end if;
  -- Serialize replay IDs independently from the Product lock, before any identity lookup.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('product-request:'||p_request_id::text,0));
  v_hash:=pg_catalog.encode(extensions.digest(pg_catalog.jsonb_build_array(
    p_product_id,p_normalized_email,p_marketing_consent,p_policy_version,p_source)::text,'sha256'),'hex');
  select * into v_previous from private.product_notification_requests where request_id=p_request_id;
  if found then
    if v_previous.purpose<>'enrollment' or v_previous.request_hash<>v_hash then
      raise exception using errcode='22023',message='Product notification request identity mismatch'; end if;
    return '{"ok":true}'::jsonb;
  end if;
  v_now:=pg_catalog.clock_timestamp();
  delete from private.product_waitlist_rate_limits where abuse_key in (
    select abuse_key from private.product_waitlist_rate_limits where updated_at<v_now-interval '24 hours'
    order by updated_at limit 100 for update skip locked);
  insert into private.product_waitlist_rate_limits(abuse_key,window_started_at,request_count,updated_at)
    values(p_abuse_key,v_now,1,v_now) on conflict(abuse_key) do update set
    window_started_at=case when private.product_waitlist_rate_limits.window_started_at<=v_now-interval '10 minutes'
      then v_now else private.product_waitlist_rate_limits.window_started_at end,
    request_count=case when private.product_waitlist_rate_limits.window_started_at<=v_now-interval '10 minutes'
      then 1 else private.product_waitlist_rate_limits.request_count+1 end,updated_at=v_now
    returning request_count into v_count;
  if v_count>5 then return '{"ok":false,"code":"rate_limited"}'::jsonb; end if;
  -- Canonical publisher takes its Family locks before this same Product lock.
  perform 1 from public.products where id=p_product_id for update;
  v_now:=pg_catalog.clock_timestamp();
  if not exists(select 1 from public.products where id=p_product_id and catalog_status='active'
    and published_at<=v_now and status='waitlist') then
    return '{"ok":false,"code":"product_unavailable"}'::jsonb; end if;
  select * into v_enrollment from private.product_waitlist_enrollments
    where product_id=p_product_id and normalized_email=p_normalized_email for update;
  if not found then
    insert into private.product_waitlist_enrollments(product_id,normalized_email,created_at,updated_at)
      values(p_product_id,p_normalized_email,v_now,v_now) returning * into v_enrollment;
  else
    select * into strict v_generation from private.product_notification_generations
      where enrollment_id=v_enrollment.id and generation=v_enrollment.generation;
    if v_generation.withdrawn_at is not null or v_generation.expires_at<=v_now or v_generation.consumed_transition_id is not null then
      update private.product_waitlist_enrollments set generation=generation+1,updated_at=v_now
        where id=v_enrollment.id returning * into v_enrollment;
    end if;
  end if;
  insert into private.product_notification_generations(enrollment_id,generation,requested_at,expires_at,after_transition_id)
    values(v_enrollment.id,v_enrollment.generation,v_now,v_now+interval '12 months',
      coalesce((select max(id) from private.product_notification_transitions where product_id=p_product_id),0))
    on conflict(enrollment_id,generation) do nothing;
  if p_marketing_consent then
    v_result:=private.request_marketing_subscription(p_normalized_email,p_source,p_policy_version,
      p_confirmation_token,p_abuse_key,true,p_marketing_template_contract);
    if v_result->>'status' is distinct from 'accepted' then
      -- Raising rolls back both enrollment and consent; the HTTP boundary returns a truthful unavailable result.
      raise exception using errcode='P0001',message='marketing_subscription_unavailable'; end if;
    insert into private.product_waitlist_consent_events(enrollment_id,policy_version,source,created_at)
      values(v_enrollment.id,p_policy_version,p_source,v_now) on conflict(enrollment_id,policy_version,source) do nothing;
  end if;
  insert into private.product_notification_requests(request_id,purpose,request_hash) values(p_request_id,'enrollment',v_hash);
  return '{"ok":true}'::jsonb;
end $$;

-- Private tables have no browser grants. Public entry points are service-only; all access remains server-authorized.
do $$ declare v_table text; begin
  foreach v_table in array array['product_notification_transitions','product_notification_state','product_notification_generations',
    'product_notification_tokens','product_notification_requests','product_notification_recovery_limits','product_notification_recovery_addresses'] loop
    execute pg_catalog.format('alter table private.%I enable row level security',v_table);
    execute pg_catalog.format('alter table private.%I force row level security',v_table);
    execute pg_catalog.format('revoke all on private.%I from public,anon,authenticated,service_role',v_table);
  end loop;
end $$;
revoke all on sequence private.product_notification_transitions_id_seq from public,anon,authenticated,service_role;
revoke all on function private.preserve_product_notification_generation(),private.preserve_product_notification_fact()
  from public,anon,authenticated,service_role;
revoke all on function public.read_product_notification_email_control(),public.configure_product_notification_email(boolean,jsonb),
  public.enroll_product_waitlist(uuid,text,boolean,text,text,text,uuid,text,jsonb),private.product_is_purchasable(uuid,timestamptz)
  from public,anon,authenticated,service_role;
grant execute on function public.read_product_notification_email_control(),public.configure_product_notification_email(boolean,jsonb),
  public.enroll_product_waitlist(uuid,text,boolean,text,text,text,uuid,text,jsonb),private.product_is_purchasable(uuid,timestamptz) to service_role;

-- The caller already owns the canonical Product lock. Observe the complete publication,
-- never the temporary Variant archive/replace steps inside V4.
create function private.record_product_notification_transition(
  p_product_id uuid,p_was_purchasable boolean,p_observed_at timestamptz,p_revision_id uuid
) returns void language plpgsql security definer set search_path='' as $$
declare v_current boolean; v_transition_id bigint;
begin
  v_current:=private.product_is_purchasable(p_product_id,p_observed_at);
  insert into private.product_notification_state(product_id,purchasable)
    values(p_product_id,p_was_purchasable) on conflict(product_id) do nothing;
  if not p_was_purchasable and v_current then
    insert into private.product_notification_transitions(product_id,occurred_at,revision_id)
      values(p_product_id,p_observed_at,p_revision_id) returning id into v_transition_id;
  end if;
  update private.product_notification_state set purchasable=v_current,
    transition_id=coalesce(v_transition_id,transition_id) where product_id=p_product_id;
end $$;
revoke all on function private.record_product_notification_transition(uuid,boolean,timestamptz,uuid)
  from public,anon,authenticated,service_role;

-- Preserve the existing outer Family-before-Product lock boundary and every V4 validation.
-- Fail closed if its inner slug-aware wrapper no longer has the reviewed structure.
do $publication_observation$
declare v_source text; v_updated text;
begin
  v_source:=pg_catalog.pg_get_functiondef(
    'public.publish_catalog_product_draft_without_family_lock_order(uuid,bigint,uuid,text,jsonb)'::regprocedure);
  if (length(v_source)-length(replace(v_source,'  v_result jsonb;','')))/length('  v_result jsonb;')<>1
    or (length(v_source)-length(replace(v_source,'  v_result := public.publish_catalog_product_draft_v4(',''))) /
      length('  v_result := public.publish_catalog_product_draft_v4(')<>1
    or (length(v_source)-length(replace(v_source,'  return v_result;','')))/length('  return v_result;')<>1 then
    raise exception using errcode='55000',message='Catalog publication boundary changed; review required'; end if;
  v_updated:=replace(v_source,'  v_result jsonb;','  v_result jsonb;'||chr(10)||'  v_was_purchasable boolean;');
  v_updated:=replace(v_updated,'  v_result := public.publish_catalog_product_draft_v4(',
    '  v_was_purchasable := private.product_is_purchasable(v_draft.product_id,pg_catalog.clock_timestamp());'||chr(10)||
    '  v_result := public.publish_catalog_product_draft_v4(');
  v_updated:=replace(v_updated,'  return v_result;',
    '  if v_result ->> ''ok'' = ''true'' then'||chr(10)||
    '    perform private.record_product_notification_transition(v_draft.product_id,v_was_purchasable,'||chr(10)||
    '      pg_catalog.clock_timestamp(),(v_result #>> ''{revision,id}'')::uuid);'||chr(10)||
    '  end if;'||chr(10)||'  return v_result;');
  execute v_updated;
end $publication_observation$;

create function public.materialize_product_notifications(p_limit integer default 20)
returns integer language plpgsql security definer set search_path='' as $$
declare v_candidate record; v_enrollment private.product_waitlist_enrollments%rowtype;
  v_generation private.product_notification_generations%rowtype; v_transition private.product_notification_transitions%rowtype;
  v_product public.products%rowtype; v_cutoff timestamptz; v_count integer:=0; v_now timestamptz; v_candidate_ids bigint[];
begin
  if p_limit is null or p_limit not between 1 and 100 then
    raise exception using errcode='22023',message='invalid Product notification batch size'; end if;
  select accepted_after into v_cutoff from private.email_controls
    where environment='sandbox' and purpose='product_availability' and enabled;
  if not found then return 0; end if;
  select coalesce(pg_catalog.array_agg(candidate.id),'{}'::bigint[]) into v_candidate_ids from (
    select e.id,e.product_id,t.id as transition_id from private.product_waitlist_enrollments e
      join private.product_notification_generations g on g.enrollment_id=e.id and g.generation=e.generation
      cross join lateral(select id from private.product_notification_transitions t where t.product_id=e.product_id
        and t.id>g.after_transition_id and t.occurred_at>=v_cutoff order by t.id limit 1) t
      where g.withdrawn_at is null and g.expires_at>pg_catalog.clock_timestamp() and g.consumed_transition_id is null
      order by e.product_id,e.id limit p_limit
  ) candidate;
  -- Batch locks are acquired once in a total order, never while traversing fairness order.
  perform 1 from public.products p where p.id in (
    select e.product_id from private.product_waitlist_enrollments e where e.id=any(v_candidate_ids)) order by p.id for update;
  perform 1 from private.product_waitlist_enrollments where id=any(v_candidate_ids) order by id for update;
  select accepted_after into v_cutoff from private.email_controls
    where environment='sandbox' and purpose='product_availability' and enabled for share;
  if not found then return 0; end if;
  for v_candidate in select id,product_id from private.product_waitlist_enrollments where id=any(v_candidate_ids) order by id
  loop
    -- Products/enrollments are already held; no later work acquires them in reverse order.
    select * into v_product from public.products where id=v_candidate.product_id for update;
    select * into v_enrollment from private.product_waitlist_enrollments where id=v_candidate.id for update;
    select * into strict v_generation from private.product_notification_generations
      where enrollment_id=v_enrollment.id and generation=v_enrollment.generation;
    v_now:=pg_catalog.clock_timestamp();
    if v_generation.withdrawn_at is not null or v_generation.expires_at<=v_now or v_generation.consumed_transition_id is not null then
      continue; end if;
    select * into v_transition from private.product_notification_transitions
      where product_id=v_enrollment.product_id and id>v_generation.after_transition_id and occurred_at>=v_cutoff order by id limit 1;
    if not found then continue; end if;
    update private.product_notification_generations set consumed_transition_id=v_transition.id
      where enrollment_id=v_enrollment.id and generation=v_enrollment.generation;
    -- A delayed worker may observe that the fresh Offer has already gone away.
    -- Retain the consumed transition identity; do not generate a later duplicate notice.
    insert into private.email_intents(environment,purpose,recipient,receipt,state,error_code,idempotency_key,created_at)
      values('sandbox','product_availability',v_enrollment.normalized_email,pg_catalog.jsonb_build_object(
        'schemaVersion',1,'enrollmentId',v_enrollment.id,'generation',v_enrollment.generation,'transitionId',v_transition.id,
        'productId',v_product.id,'productName',case when v_product.catalog_status='active' and v_product.published_at<=v_now
          then v_product.display_name else 'Product notification' end,'productSlug',v_product.slug),
        case when private.product_is_purchasable(v_product.id,v_now) then 'queued' else 'blocked' end,
        case when private.product_is_purchasable(v_product.id,v_now) then null else 'product_not_purchasable' end,
        'helix:sandbox:product_availability:'||v_enrollment.id::text||':'||v_enrollment.generation::text||':'||v_transition.id::text,
        v_transition.occurred_at) on conflict(idempotency_key) do nothing;
    v_count:=v_count+1;
  end loop;
  return v_count;
end $$;
revoke all on function public.materialize_product_notifications(integer) from public,anon,authenticated,service_role;
grant execute on function public.materialize_product_notifications(integer) to service_role;

-- Admission and cancellation share enrollment locks. The common dispatcher invokes
-- the lock helper BEFORE locking its intent, then checks eligibility inside that transaction.
create function private.lock_product_notification_intent(p_intent_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare v_intent private.email_intents%rowtype; v_product_id uuid;
begin
  select * into v_intent from private.email_intents where id=p_intent_id;
  if v_intent.purpose='product_availability' then
    select product_id into v_product_id from private.product_waitlist_enrollments
      where id=(v_intent.receipt->>'enrollmentId')::bigint;
    perform 1 from public.products where id=v_product_id for update;
    perform 1 from private.product_waitlist_enrollments where id=(v_intent.receipt->>'enrollmentId')::bigint for update;
  elsif v_intent.purpose='product_waitlist_recovery' then
    perform 1 from private.product_waitlist_enrollments e where e.id in (
      select (link->>'enrollmentId')::bigint from pg_catalog.jsonb_array_elements(v_intent.receipt->'links') link)
      order by e.id for update;
  end if;
end $$;
create function private.product_notification_intent_eligible(p_intent private.email_intents) returns boolean
language plpgsql security definer set search_path='' as $$
declare v_now timestamptz:=pg_catalog.clock_timestamp(); v_cutoff timestamptz;
begin
  if p_intent.purpose not in ('product_availability','product_waitlist_recovery')
    or p_intent.content_deleted_at is not null or p_intent.receipt->'schemaVersion' is distinct from '1'::jsonb then return false; end if;
  select accepted_after into v_cutoff from private.email_controls
    where environment=p_intent.environment and purpose=p_intent.purpose and enabled for share;
  if not found or p_intent.created_at<v_cutoff then return false; end if;
  if p_intent.purpose='product_availability' then
    return exists(select 1 from private.product_waitlist_enrollments e
      join private.product_notification_generations g on g.enrollment_id=e.id and g.generation=e.generation
      join private.product_notification_transitions t on t.id=g.consumed_transition_id
      join public.products p on p.id=e.product_id
      where e.id=(p_intent.receipt->>'enrollmentId')::bigint and e.normalized_email=p_intent.recipient
        and g.generation=(p_intent.receipt->>'generation')::bigint
        and t.id=(p_intent.receipt->>'transitionId')::bigint and t.product_id=p.id and t.occurred_at>=v_cutoff
        and p.id::text=p_intent.receipt->>'productId'
        and g.withdrawn_at is null and g.expires_at>v_now and private.product_is_purchasable(p.id,v_now));
  end if;
  if pg_catalog.jsonb_typeof(p_intent.receipt->'links') is distinct from 'array'
    or pg_catalog.jsonb_array_length(p_intent.receipt->'links') not between 1 and 20 then return false; end if;
  -- Every frozen link must still manage its exact current request. A partially stale
  -- never-attempted bundle is discarded; already handed-off content is reconciled unchanged.
  return not exists(select 1 from pg_catalog.jsonb_array_elements(p_intent.receipt->'links') link where not exists(
    select 1 from private.product_notification_tokens t
      join private.product_waitlist_enrollments e on e.id=t.enrollment_id and e.generation=t.generation
      join private.product_notification_generations g on g.enrollment_id=e.id and g.generation=e.generation
      where t.token_hash=pg_catalog.encode(extensions.digest(link->>'token','sha256'),'hex')
        and t.enrollment_id=(link->>'enrollmentId')::bigint and t.generation=(link->>'generation')::bigint
        and e.product_id::text=link->>'productId' and e.normalized_email=p_intent.recipient
        and t.expires_at=(link->>'expiresAt')::timestamptz and t.expires_at>v_now
        and g.withdrawn_at is null and g.expires_at>v_now));
end $$;

create function private.product_notification_recovery_allowed(p_email text,p_abuse_key text) returns boolean
language plpgsql security definer set search_path='' as $$
declare v_now timestamptz:=pg_catalog.clock_timestamp(); v_key text; v_limit integer; v_times timestamptz[];
  v_keys text[]:=array['global','source:'||p_abuse_key,'address:'||pg_catalog.encode(extensions.digest(p_email,'sha256'),'hex')];
begin
  -- Development delivery is deliberately capped, including nonexistent addresses.
  -- This lock serializes the bounded sliding-window accounting across all processes.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('product-recovery-limit',0));
  delete from private.product_notification_recovery_limits where key in (
    select key from private.product_notification_recovery_limits where updated_at<v_now-interval '24 hours'
    order by updated_at limit 100 for update skip locked);
  foreach v_key in array v_keys loop
    v_limit:=case when v_key='global' then 30 when v_key like 'source:%' then 10 else 3 end;
    select coalesce(pg_catalog.array_agg(t order by t),'{}'::timestamptz[]) into v_times
      from private.product_notification_recovery_limits l cross join lateral pg_catalog.unnest(l.occurrences) t
      where l.key=v_key and t>v_now-interval '1 hour';
    if pg_catalog.cardinality(v_times)>=v_limit then return false; end if;
  end loop;
  foreach v_key in array v_keys loop
    select coalesce(pg_catalog.array_agg(t order by t),'{}'::timestamptz[]) into v_times
      from private.product_notification_recovery_limits l cross join lateral pg_catalog.unnest(l.occurrences) t
      where l.key=v_key and t>v_now-interval '1 hour';
    insert into private.product_notification_recovery_limits(key,occurrences,updated_at)
      values(v_key,pg_catalog.array_append(v_times,v_now),v_now)
      on conflict(key) do update set occurrences=excluded.occurrences,updated_at=excluded.updated_at;
  end loop;
  return true;
end $$;

create function public.request_product_notification_recovery(
  p_normalized_email text,p_abuse_key text,p_tokens jsonb,p_delivery_allowed boolean,p_request_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_hash text; v_previous private.product_notification_requests%rowtype; v_intent private.email_intents%rowtype;
  v_row record; v_now timestamptz; v_token text; v_expires_at timestamptz; v_index integer:=0;
  v_links jsonb:='[]'::jsonb; v_new_tokens jsonb:='[]'::jsonb; v_link jsonb;
  v_intent_id uuid:=extensions.gen_random_uuid(); v_candidate_ids bigint[];
begin
  if p_normalized_email is null or p_normalized_email<>lower(btrim(p_normalized_email))
    or length(p_normalized_email) not between 3 and 254
    or p_normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or p_abuse_key is null or p_abuse_key !~ '^[0-9a-f]{64}$' or p_request_id is null
    or p_delivery_allowed is null or pg_catalog.jsonb_typeof(p_tokens) is distinct from 'array'
    or pg_catalog.jsonb_array_length(p_tokens)<>20
    or exists(select 1 from pg_catalog.jsonb_array_elements(p_tokens) t
      where pg_catalog.jsonb_typeof(t)<>'string' or (t#>>'{}') !~ '^[A-Za-z0-9_-]{43}$')
    or (select count(distinct t) from pg_catalog.jsonb_array_elements(p_tokens) t)<>20
  then raise exception using errcode='22023',message='invalid Product notification recovery request'; end if;
  -- Every well-formed attempt meets the same limits before request/enrollment lookup.
  if not private.product_notification_recovery_allowed(p_normalized_email,p_abuse_key) then return '{"ok":true}'::jsonb; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('product-request:'||p_request_id::text,0));
  v_hash:=pg_catalog.encode(extensions.digest(p_normalized_email,'sha256'),'hex');
  select * into v_previous from private.product_notification_requests where request_id=p_request_id;
  if found then return '{"ok":true}'::jsonb; end if;
  insert into private.product_notification_requests(request_id,purpose,request_hash) values(p_request_id,'recovery',v_hash);
  if not p_delivery_allowed then return '{"ok":true}'::jsonb; end if;
  perform 1 from private.email_controls where environment='sandbox' and purpose='product_waitlist_recovery'
    and enabled and accepted_after<=pg_catalog.clock_timestamp();
  if not found then return '{"ok":true}'::jsonb; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('product-recovery-address:'||p_normalized_email,0));
  v_now:=pg_catalog.clock_timestamp();
  if exists(select 1 from private.product_notification_recovery_addresses
    where address_hash=v_hash and last_bundle_at>v_now-interval '60 seconds') then return '{"ok":true}'::jsonb; end if;
  select coalesce(pg_catalog.array_agg(candidate.id),'{}'::bigint[]) into v_candidate_ids from (
    select e.id from private.product_waitlist_enrollments e join private.product_notification_generations g
      on g.enrollment_id=e.id and g.generation=e.generation
    where e.normalized_email=p_normalized_email and g.withdrawn_at is null and g.expires_at>v_now
    order by g.last_recovery_at nulls first,g.requested_at,e.id limit 20
  ) candidate;
  -- Include existing bundle rows before taking ANY enrollment lock. All admission,
  -- cancellation and materialization paths acquire these rows in ascending ID order.
  perform 1 from private.product_waitlist_enrollments e where e.id=any(v_candidate_ids) or e.id in (
    select (link->>'enrollmentId')::bigint from private.email_intents i
      cross join lateral pg_catalog.jsonb_array_elements(i.receipt->'links') link
    where i.purpose='product_waitlist_recovery' and i.recipient=p_normalized_email and i.provider_email_id is null
      and i.content_deleted_at is null and i.state in ('queued','leased','retry','uncertain')) order by e.id for update;
  -- Coalesce retries even after the original HTTP response was lost. An uncertain
  -- provider handoff cannot be replaced by another email simply because a lease expired.
  for v_intent in select * from private.email_intents where purpose='product_waitlist_recovery'
    and recipient=p_normalized_email and provider_email_id is null and state in ('queued','leased','retry','uncertain')
    and content_deleted_at is null order by created_at,id limit 30
  loop
    select * into v_intent from private.email_intents where id=v_intent.id for update;
    if v_intent.provider_email_id is not null or v_intent.state not in ('queued','leased','retry','uncertain') then continue; end if;
    if v_intent.first_attempt_at is not null or private.product_notification_intent_eligible(v_intent) then
      return '{"ok":true}'::jsonb;
    end if;
    update private.email_intents set state='blocked',error_code='product_request_not_eligible',lease_token=null,
      lease_expires_at=null,updated_at=pg_catalog.clock_timestamp() where id=v_intent.id;
  end loop;
  perform 1 from private.email_controls where environment='sandbox' and purpose='product_waitlist_recovery'
    and enabled and accepted_after<=pg_catalog.clock_timestamp() for share;
  if not found then return '{"ok":true}'::jsonb; end if;
  v_now:=pg_catalog.clock_timestamp();
  -- Oldest served requests rotate fairly. Repeated accepted requests can reach all
  -- current generations, including an address with more than twenty legacy Products.
  for v_row in select e.id,e.product_id,e.generation,g.expires_at,
      case when p.catalog_status='active' and p.published_at<=v_now then p.display_name else 'Product notification' end as product_name
    from private.product_waitlist_enrollments e
      join private.product_notification_generations g on g.enrollment_id=e.id and g.generation=e.generation
      join public.products p on p.id=e.product_id
    where e.id=any(v_candidate_ids) and e.normalized_email=p_normalized_email and g.withdrawn_at is null and g.expires_at>v_now
    order by g.last_recovery_at nulls first,g.requested_at,e.id
  loop
    perform 1 from private.product_waitlist_enrollments where id=v_row.id for update;
    -- Enrollment/cancellation may have advanced while this request waited for a row.
    if not exists(select 1 from private.product_waitlist_enrollments e join private.product_notification_generations g
      on g.enrollment_id=e.id and g.generation=e.generation where e.id=v_row.id and e.generation=v_row.generation
      and g.withdrawn_at is null and g.expires_at>pg_catalog.clock_timestamp()) then continue; end if;
    v_token:=null; v_expires_at:=null;
    -- Reuse valid issued capabilities without exposing them to the requesting browser.
    select link->>'token',t.expires_at into v_token,v_expires_at
      from private.product_notification_tokens t join private.email_intents i on i.id=t.recovery_intent_id
      cross join lateral pg_catalog.jsonb_array_elements(i.receipt->'links') link
      where t.enrollment_id=v_row.id and t.generation=v_row.generation and t.expires_at>v_now
        and t.token_hash=pg_catalog.encode(extensions.digest(link->>'token','sha256'),'hex')
        and i.content_deleted_at is null order by t.expires_at desc limit 1;
    if v_token is null then
      v_token:=p_tokens->>v_index;
      v_expires_at:=least(v_now+interval '24 hours',v_row.expires_at);
      v_new_tokens:=v_new_tokens||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'token',v_token,'enrollmentId',v_row.id,'generation',v_row.generation,'expiresAt',v_expires_at));
    end if;
    v_links:=v_links||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'enrollmentId',v_row.id,'generation',v_row.generation,'productId',v_row.product_id,
      'productName',v_row.product_name,'token',v_token,'expiresAt',v_expires_at));
    update private.product_notification_generations set last_recovery_at=v_now
      where enrollment_id=v_row.id and generation=v_row.generation;
    v_index:=v_index+1;
  end loop;
  if pg_catalog.jsonb_array_length(v_links)=0 then return '{"ok":true}'::jsonb; end if;
  insert into private.email_intents(id,environment,purpose,recipient,receipt,state,idempotency_key)
    values(v_intent_id,'sandbox','product_waitlist_recovery',p_normalized_email,
      pg_catalog.jsonb_build_object('schemaVersion',1,'links',v_links),'queued',
      'helix:sandbox:product_waitlist_recovery:'||p_request_id::text);
  insert into private.product_notification_recovery_addresses(address_hash,last_bundle_at) values(v_hash,v_now)
    on conflict(address_hash) do update set last_bundle_at=excluded.last_bundle_at;
  for v_link in select value from pg_catalog.jsonb_array_elements(v_new_tokens) loop
    insert into private.product_notification_tokens(token_hash,enrollment_id,generation,expires_at,recovery_intent_id)
      values(pg_catalog.encode(extensions.digest(v_link->>'token','sha256'),'hex'),
        (v_link->>'enrollmentId')::bigint,(v_link->>'generation')::bigint,(v_link->>'expiresAt')::timestamptz,v_intent_id);
  end loop;
  return '{"ok":true}'::jsonb;
end $$;

create function public.cancel_product_notification(p_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_token private.product_notification_tokens%rowtype; v_enrollment private.product_waitlist_enrollments%rowtype;
  v_now timestamptz;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then return '{"ok":true}'::jsonb; end if;
  select * into v_token from private.product_notification_tokens
    where token_hash=pg_catalog.encode(extensions.digest(p_token,'sha256'),'hex');
  if not found then return '{"ok":true}'::jsonb; end if;
  select * into v_enrollment from private.product_waitlist_enrollments where id=v_token.enrollment_id for update;
  v_now:=pg_catalog.clock_timestamp();
  if v_token.expires_at<=v_now or v_enrollment.generation<>v_token.generation then return '{"ok":true}'::jsonb; end if;
  update private.product_notification_generations set withdrawn_at=v_now
    where enrollment_id=v_token.enrollment_id and generation=v_token.generation and withdrawn_at is null and expires_at>v_now;
  -- A worker admitted before withdrawal may already have delivered. Preserve its exact
  -- prepared request and provider reconciliation; never call cancellation a recall.
  update private.email_intents e set
    state=case when first_attempt_at is null then 'blocked' when lease_token is not null then state else 'uncertain' end,
    error_code=case when first_attempt_at is null then 'product_request_cancelled' else 'reconciliation_required' end,
    lease_token=case when first_attempt_at is null then null else lease_token end,
    lease_expires_at=case when first_attempt_at is null then null else lease_expires_at end,updated_at=v_now
    where e.provider_email_id is null and e.state in ('queued','leased','retry','uncertain') and (
      (e.purpose='product_availability' and e.receipt->>'enrollmentId'=v_token.enrollment_id::text
        and e.receipt->>'generation'=v_token.generation::text)
      or (e.purpose='product_waitlist_recovery' and exists(select 1 from pg_catalog.jsonb_array_elements(e.receipt->'links') link
        where link->>'enrollmentId'=v_token.enrollment_id::text and link->>'generation'=v_token.generation::text)));
  return '{"ok":true}'::jsonb;
end $$;
revoke all on function private.lock_product_notification_intent(uuid),private.product_notification_intent_eligible(private.email_intents),
  private.product_notification_recovery_allowed(text,text),public.request_product_notification_recovery(text,text,jsonb,boolean,uuid),
  public.cancel_product_notification(text) from public,anon,authenticated,service_role;
grant execute on function private.lock_product_notification_intent(uuid),private.product_notification_intent_eligible(private.email_intents),
  public.request_product_notification_recovery(text,text,jsonb,boolean,uuid),public.cancel_product_notification(text) to service_role;


-- Refresh only public presentation before the first provider handoff. The same logical
-- intent, request generation and transition survive a rename; prepared retries stay exact.
create function public.refresh_product_notification_email(p_id uuid,p_lease_token uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_intent private.email_intents%rowtype; v_product public.products%rowtype; v_receipt jsonb;
begin
  perform private.lock_product_notification_intent(p_id);
  select * into v_intent from private.email_intents where id=p_id for update;
  if not found or v_intent.purpose<>'product_availability' or v_intent.environment<>'sandbox'
    or v_intent.state<>'leased' or p_lease_token is null or v_intent.lease_token is distinct from p_lease_token
    or v_intent.lease_expires_at<=pg_catalog.clock_timestamp() or v_intent.content_deleted_at is not null
    or v_intent.provider_email_id is not null then return null; end if;
  if v_intent.first_attempt_at is null and v_intent.request_payload is null
    and private.product_notification_intent_eligible(v_intent) then
    select * into v_product from public.products where id=(v_intent.receipt->>'productId')::uuid;
    v_receipt:=v_intent.receipt||pg_catalog.jsonb_build_object('productName',v_product.display_name,'productSlug',v_product.slug);
    if v_receipt is distinct from v_intent.receipt then
      update private.email_intents set receipt=v_receipt,updated_at=pg_catalog.clock_timestamp()
        where id=p_id returning * into v_intent;
    end if;
  end if;
  return private.email_intent_work(v_intent);
end $$;
revoke all on function public.refresh_product_notification_email(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.refresh_product_notification_email(uuid,uuid) to service_role;


-- Only public presentation may be refreshed before a Product availability handoff.
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
    new.recipient is distinct from old.recipient or (new.receipt is distinct from old.receipt and not (
      old.purpose='product_availability' and old.first_attempt_at is null and new.first_attempt_at is null
      and old.request_payload is null and new.request_payload is null
      and old.content_deleted_at is null and old.state='leased' and new.state='leased'
      and old.receipt-array['productName','productSlug']=new.receipt-array['productName','productSlug']
      and exists(select 1 from public.products p where p.id::text=old.receipt->>'productId'
        and private.product_is_purchasable(p.id,pg_catalog.clock_timestamp())
        and new.receipt->>'productName'=p.display_name and new.receipt->>'productSlug'=p.slug)))
    or (old.request_payload is not null and new.request_payload is distinct from old.request_payload))
  then raise exception using errcode='55000',message='email receipt and prepared request are immutable'; end if;
  if new.content_deleted_at is not null and (new.state in ('queued','leased','retry') or new.lease_token is not null) then
    raise exception using errcode='55000',message='active email content cannot be deleted';
  end if;
  return new;
end $$;

-- Extend the integrated support RFC/context, marketing, and tracking admission contracts.
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
  v_marketing:=v_purpose in ('marketing_confirmation','welcome_initial','welcome_education');
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
      where subscriber_id=v_subscriber.id and generation=v_subscriber.generation;
    perform 1 from private.email_controls where environment=v_intent.environment
      and purpose=v_intent.purpose and enabled and accepted_after<=v_generation.requested_at for share;
    if not found or not private.marketing_intent_current(v_intent,v_subscriber)
      or v_intent.receipt->'templateContract' is distinct from v_generation.template_contract
      or v_intent.receipt->'schemaVersion' is distinct from '1'::jsonb
      or (v_intent.purpose in ('welcome_initial','welcome_education') and not exists (
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
      or (v_intent.purpose in ('welcome_initial','welcome_education') and (
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
    or p_request_payload-(case when v_intent.purpose in ('welcome_initial','welcome_education')
      then array['from','to','reply_to','subject','html','text','tags','headers','topic_id']
      when v_intent.purpose in ('support_acknowledgement','support_reply')
        and v_intent.receipt->>'renderVersion' in ('support-text-v2','support-ack-v2')
      then array['from','to','reply_to','subject','html','text','tags','headers']
      else array['from','to','reply_to','subject','html','text','tags'] end)<>'{}'::jsonb
    or (v_intent.request_payload is not null and v_intent.request_payload is distinct from p_request_payload)
  then raise exception using errcode='22023',message='email request does not match frozen envelope'; end if;
  if v_intent.purpose in ('welcome_initial','welcome_education') then
    v_due:=v_generation.confirmed_at+case when v_intent.purpose='welcome_education' then interval '72 hours' else interval '0' end;
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
      and not (purpose in ('marketing_confirmation','welcome_initial','welcome_education','product_availability','product_waitlist_recovery')
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
    and not (purpose in ('marketing_confirmation','welcome_initial','welcome_education')
      and coalesce(error_code,'') in ('reconciliation_required','marketing_not_eligible','marketing_expired'))
    and not (purpose in ('product_availability','product_waitlist_recovery')
      and coalesce(error_code,'') in ('reconciliation_required','product_request_not_eligible','product_request_cancelled'))
    and lease_token is null and attempt_count<5
    and (first_attempt_at is null or first_attempt_at>pg_catalog.clock_timestamp()-interval '23 hours');
  return found;
end $$;

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
      when purpose in ('marketing_confirmation','welcome_initial','welcome_education','product_availability','product_waitlist_recovery') and first_attempt_at is not null then 'uncertain'
      when p_outcome in ('retry','uncertain') and first_attempt_at is not null
        and (first_attempt_at<=pg_catalog.clock_timestamp()-interval '23 hours' or attempt_count>=5) then 'uncertain'
      else p_outcome end,
    provider_email_id=coalesce(provider_email_id,p_provider_email_id),
    error_code=case when provider_email_id is not null or p_outcome='accepted' then null
      when purpose in ('marketing_confirmation','welcome_initial','welcome_education','product_availability','product_waitlist_recovery') and first_attempt_at is not null
        and (p_outcome in ('blocked','failed') or error_code='reconciliation_required'
          or first_attempt_at<=pg_catalog.clock_timestamp()-interval '23 hours' or attempt_count>=5)
        then 'reconciliation_required' else p_error_code end,
    next_attempt_at=pg_catalog.clock_timestamp()+pg_catalog.make_interval(secs=>least(3600,60*(2^greatest(attempt_count-1,0)))::integer),
    lease_token=null,lease_expires_at=null,updated_at=pg_catalog.clock_timestamp()
  where id=p_id;
  return true;
end $$;
