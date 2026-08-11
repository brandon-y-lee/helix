-- Bound durable abuse-control state while preserving transactional throttling.

create index product_waitlist_rate_limits_updated_at_idx
  on private.product_waitlist_rate_limits(updated_at);

create or replace function public.enroll_product_waitlist(
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

  delete from private.product_waitlist_rate_limits
  where abuse_key in (
    select abuse_key
    from private.product_waitlist_rate_limits
    where updated_at < v_now - interval '24 hours'
    order by updated_at
    limit 100
    for update skip locked
  );

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
) is 'Service-role-only, retry-safe Product waitlist enrollment boundary with bounded abuse-control retention.';
