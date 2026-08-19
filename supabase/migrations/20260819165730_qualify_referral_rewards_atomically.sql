-- Ticket #185: issue a Referral Reward and qualify its attribution in one
-- retry-safe transaction after the server has verified a Paid Order.

create function public.qualify_referral_for_paid_order(p_order_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_attribution public.referral_attributions%rowtype;
  v_reward_id uuid;
begin
  select attribution.*
  into v_attribution
  from public.referral_attributions as attribution
  join public.orders as checkout_order
    on checkout_order.id = attribution.order_id
  where attribution.order_id = p_order_id
    and checkout_order.status = 'paid'
  for update of attribution;

  if not found or v_attribution.status = 'void' then
    return null;
  end if;

  if v_attribution.status = 'rewarded' then
    select reward.id
    into v_reward_id
    from public.referral_rewards as reward
    where reward.referral_attribution_id = v_attribution.id;
    return v_reward_id;
  end if;

  insert into public.referral_rewards (
    user_id,
    referral_attribution_id,
    status,
    source_key
  ) values (
    v_attribution.referrer_user_id,
    v_attribution.id,
    'available',
    'referral-reward:' || v_attribution.id::text
  )
  on conflict (source_key) do update
    set source_key = excluded.source_key
  returning id into v_reward_id;

  update public.referral_attributions
  set
    status = case
      when status = 'pending' then 'qualified'::public.referral_status
      else status
    end,
    qualified_at = coalesce(qualified_at, now())
  where id = v_attribution.id;

  return v_reward_id;
end;
$$;

revoke all on function public.qualify_referral_for_paid_order(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.qualify_referral_for_paid_order(uuid)
  to service_role;

comment on function public.qualify_referral_for_paid_order(uuid) is
  'Atomically and idempotently qualifies a paid Referral Attribution and issues its Referral Reward.';
