-- Private Product waitlist persistence, consent evidence, and abuse controls.

alter table public.products
  drop constraint if exists products_status_check;

alter table public.products
  add constraint products_status_check
  check (status in ('available', 'coming_soon', 'sold_out', 'waitlist'));

create table private.product_waitlist_enrollments (
  id bigint generated always as identity primary key,
  product_id uuid not null references public.products(id) on delete restrict,
  normalized_email text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_waitlist_enrollments_normalized_email_check check (
    normalized_email = lower(btrim(normalized_email))
    and char_length(normalized_email) between 3 and 254
    and normalized_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  constraint product_waitlist_enrollments_product_email_key
    unique (product_id, normalized_email)
);

create table private.product_waitlist_consent_events (
  id bigint generated always as identity primary key,
  enrollment_id bigint not null
    references private.product_waitlist_enrollments(id) on delete restrict,
  policy_version text not null check (char_length(policy_version) between 1 and 64),
  source text not null check (char_length(source) between 1 and 64),
  created_at timestamptz not null default now(),
  constraint product_waitlist_consent_events_evidence_key
    unique (enrollment_id, policy_version, source)
);

create table private.product_waitlist_rate_limits (
  abuse_key text primary key check (abuse_key ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null,
  request_count integer not null check (request_count > 0),
  updated_at timestamptz not null default now()
);

alter table private.product_waitlist_enrollments enable row level security;
alter table private.product_waitlist_enrollments force row level security;
alter table private.product_waitlist_consent_events enable row level security;
alter table private.product_waitlist_consent_events force row level security;
alter table private.product_waitlist_rate_limits enable row level security;
alter table private.product_waitlist_rate_limits force row level security;

revoke all on table private.product_waitlist_enrollments
  from public, anon, authenticated, service_role;
revoke all on table private.product_waitlist_consent_events
  from public, anon, authenticated, service_role;
revoke all on table private.product_waitlist_rate_limits
  from public, anon, authenticated, service_role;
revoke all on sequence private.product_waitlist_enrollments_id_seq
  from public, anon, authenticated, service_role;
revoke all on sequence private.product_waitlist_consent_events_id_seq
  from public, anon, authenticated, service_role;

create function private.reject_product_waitlist_consent_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Product waitlist consent evidence is append-only'
    using errcode = '55000';
end;
$$;

create trigger product_waitlist_consent_events_append_only
before update or delete on private.product_waitlist_consent_events
for each row execute function private.reject_product_waitlist_consent_mutation();

revoke all on function private.reject_product_waitlist_consent_mutation()
  from public, anon, authenticated, service_role;

create function public.enroll_product_waitlist(
  p_product_id uuid,
  p_normalized_email text,
  p_marketing_consent boolean,
  p_policy_version text,
  p_source text,
  p_abuse_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_request_count integer;
  v_enrollment_id bigint;
begin
  if p_product_id is null
     or p_normalized_email is null
     or p_normalized_email <> lower(btrim(p_normalized_email))
     or char_length(p_normalized_email) not between 3 and 254
     or p_normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     or p_marketing_consent is null
     or nullif(btrim(p_policy_version), '') is null
     or char_length(p_policy_version) > 64
     or nullif(btrim(p_source), '') is null
     or char_length(p_source) > 64
     or p_abuse_key is null
     or p_abuse_key !~ '^[0-9a-f]{64}$'
  then
    raise exception 'invalid Product waitlist enrollment'
      using errcode = '22023';
  end if;

  insert into private.product_waitlist_rate_limits (
    abuse_key,
    window_started_at,
    request_count,
    updated_at
  ) values (
    p_abuse_key,
    v_now,
    1,
    v_now
  )
  on conflict (abuse_key) do update set
    window_started_at = case
      when private.product_waitlist_rate_limits.window_started_at
        <= excluded.window_started_at - interval '10 minutes'
      then excluded.window_started_at
      else private.product_waitlist_rate_limits.window_started_at
    end,
    request_count = case
      when private.product_waitlist_rate_limits.window_started_at
        <= excluded.window_started_at - interval '10 minutes'
      then 1
      else private.product_waitlist_rate_limits.request_count + 1
    end,
    updated_at = excluded.updated_at
  returning request_count into v_request_count;

  if v_request_count > 5 then
    return jsonb_build_object('ok', false, 'code', 'rate_limited');
  end if;

  if not exists (
    select 1
    from public.products p
    where p.id = p_product_id
      and p.catalog_status = 'active'
      and p.status = 'waitlist'
  ) then
    return jsonb_build_object('ok', false, 'code', 'product_unavailable');
  end if;

  insert into private.product_waitlist_enrollments (
    product_id,
    normalized_email,
    created_at,
    updated_at
  ) values (
    p_product_id,
    p_normalized_email,
    v_now,
    v_now
  )
  on conflict (product_id, normalized_email) do update set
    updated_at = excluded.updated_at
  returning id into v_enrollment_id;

  if p_marketing_consent then
    insert into private.product_waitlist_consent_events (
      enrollment_id,
      policy_version,
      source,
      created_at
    ) values (
      v_enrollment_id,
      p_policy_version,
      p_source,
      v_now
    )
    on conflict (enrollment_id, policy_version, source) do nothing;
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.enroll_product_waitlist(
  uuid, text, boolean, text, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.enroll_product_waitlist(
  uuid, text, boolean, text, text, text
) to service_role;

comment on function public.enroll_product_waitlist(
  uuid, text, boolean, text, text, text
) is 'Service-role-only, retry-safe Product waitlist enrollment boundary.';

-- The V4 publisher is the canonical content writer wrapped by the current
-- slug-aware publisher. Extend its fail-closed validation without duplicating
-- the full function body in a second source of truth.
do $waitlist$
declare
  v_definition text;
  v_updated text;
  v_old text := $$or v_product.status not in ('available', 'coming_soon', 'sold_out')$$;
  v_new text := $$or v_product.status not in ('available', 'coming_soon', 'sold_out', 'waitlist')
     or (
       v_product.status = 'waitlist'
       and jsonb_array_length(v_document -> 'variants') <> 0
     )$$;
begin
  select pg_get_functiondef(
    'public.publish_catalog_product_draft_v4(uuid,bigint,uuid,text,jsonb)'::regprocedure
  ) into v_definition;

  if position(v_old in v_definition) = 0 then
    raise exception 'canonical V4 Product status validation was not found';
  end if;

  v_updated := replace(v_definition, v_old, v_new);
  if v_updated = v_definition then
    raise exception 'canonical V4 Product status validation was not updated';
  end if;
  execute v_updated;
end;
$waitlist$;

revoke all on function public.publish_catalog_product_draft_v4(
  uuid, bigint, uuid, text, jsonb
) from public, anon, authenticated, service_role;
