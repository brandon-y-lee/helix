-- Translate active rewards-interface balance errors into the approved domain
-- language while the loyalty-named implementation remains underneath.

create or replace function public.reserve_rewards_points(
  p_user_id uuid,
  p_points integer,
  p_amount_cents integer,
  p_source_key text,
  p_description text,
  p_order_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
begin
  return public.redeem_loyalty_points(
    p_user_id,
    p_points,
    p_amount_cents,
    p_source_key,
    p_description,
    p_order_id
  );
exception
  when raise_exception then
    if sqlerrm = 'Insufficient loyalty balance' then
      raise exception using
        errcode = 'P0001',
        message = 'Insufficient Available Points Balance';
    end if;
    raise;
end;
$$;

create or replace function public.record_rewards_points_adjustment(
  p_user_id uuid,
  p_points integer,
  p_entry_type public.loyalty_ledger_entry_type,
  p_source_key text,
  p_description text,
  p_order_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_existing public.loyalty_ledger_entries%rowtype;
  v_entry_id uuid;
  v_balance integer;
begin
  if p_user_id is null then
    raise exception using errcode = '22023', message = 'user id is required';
  end if;
  if p_points is null or p_points = 0 then
    raise exception using errcode = '22023', message = 'non-zero points are required';
  end if;
  if p_entry_type not in (
    'purchase_refund'::public.loyalty_ledger_entry_type,
    'redemption_reversal'::public.loyalty_ledger_entry_type,
    'manual_adjustment'::public.loyalty_ledger_entry_type
  ) then
    raise exception using errcode = '22023', message = 'unsupported adjustment entry type';
  end if;
  if p_entry_type = 'purchase_refund' and p_points > 0 then
    raise exception using errcode = '22023', message = 'purchase refund adjustments must remove Points';
  end if;
  if p_entry_type = 'redemption_reversal' and p_points < 0 then
    raise exception using errcode = '22023', message = 'redemption reversals must restore Points';
  end if;
  if p_source_key is null or pg_catalog.char_length(p_source_key) <= 8 then
    raise exception using errcode = '22023', message = 'stable source key is required';
  end if;
  if p_description is null or pg_catalog.char_length(pg_catalog.btrim(p_description)) = 0 then
    raise exception using errcode = '22023', message = 'description is required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('rewards-adjustment:' || p_source_key, 0)
  );

  select entry.*
  into v_existing
  from public.loyalty_ledger_entries as entry
  where entry.source_key = p_source_key;

  if found then
    if v_existing.user_id is distinct from p_user_id
      or v_existing.order_id is distinct from p_order_id
      or v_existing.entry_type is distinct from p_entry_type
      or v_existing.points is distinct from p_points
      or v_existing.description is distinct from p_description
      or v_existing.metadata is distinct from coalesce(p_metadata, '{}'::jsonb)
    then
      raise exception using errcode = '23505', message = 'adjustment idempotency source mismatch';
    end if;
    return v_existing.id;
  end if;

  perform public.ensure_loyalty_account(p_user_id);

  select account.points_balance
  into v_balance
  from public.loyalty_accounts as account
  where account.user_id = p_user_id
  for update;

  if v_balance + p_points < 0 then
    raise exception using
      errcode = 'P0001',
      message = 'Insufficient Available Points Balance';
  end if;

  insert into public.loyalty_ledger_entries (
    user_id,
    order_id,
    entry_type,
    status,
    points,
    description,
    source_key,
    metadata
  ) values (
    p_user_id,
    p_order_id,
    p_entry_type,
    'posted',
    p_points,
    p_description,
    p_source_key,
    coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (source_key) do nothing
  returning id into v_entry_id;

  if v_entry_id is null then
    raise exception using errcode = '40001', message = 'adjustment retry required';
  end if;

  update public.loyalty_accounts
  set points_balance = points_balance + p_points
  where user_id = p_user_id;

  return v_entry_id;
end;
$$;
