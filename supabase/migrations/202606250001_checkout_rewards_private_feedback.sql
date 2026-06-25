-- Sandbox checkout, orders, rewards, referrals, and private feedback.
-- Additive only: no catalog, account, or cart data is dropped or rewritten.
-- Live payments, fulfillment, labels, marketing email, and Trustpilot invitations
-- are intentionally outside this migration.

create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'checkout_environment') then
    create type public.checkout_environment as enum ('sandbox');
  end if;

  if not exists (select 1 from pg_type where typname = 'order_status') then
    create type public.order_status as enum (
      'draft',
      'pending_payment',
      'paid',
      'payment_failed',
      'cancelled',
      'refunded'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'payment_attempt_status') then
    create type public.payment_attempt_status as enum (
      'requires_payment',
      'processing',
      'paid',
      'failed',
      'cancelled',
      'refunded'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'loyalty_ledger_entry_type') then
    create type public.loyalty_ledger_entry_type as enum (
      'welcome',
      'purchase_earn',
      'purchase_refund',
      'redemption_reserved',
      'redemption_captured',
      'redemption_released',
      'redemption_reversal',
      'referral_entitlement_issued',
      'referral_entitlement_reserved',
      'referral_entitlement_consumed',
      'referral_entitlement_released',
      'private_feedback',
      'manual_adjustment'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'loyalty_ledger_status') then
    create type public.loyalty_ledger_status as enum ('pending', 'posted', 'void');
  end if;

  if not exists (select 1 from pg_type where typname = 'loyalty_redemption_status') then
    create type public.loyalty_redemption_status as enum ('pending', 'applied', 'void', 'reversed');
  end if;

  if not exists (select 1 from pg_type where typname = 'referral_status') then
    create type public.referral_status as enum ('pending', 'qualified', 'rewarded', 'void');
  end if;

  if not exists (select 1 from pg_type where typname = 'referral_reward_status') then
    create type public.referral_reward_status as enum ('available', 'reserved', 'consumed', 'void');
  end if;

  if not exists (select 1 from pg_type where typname = 'private_feedback_status') then
    create type public.private_feedback_status as enum ('available', 'submitted', 'rewarded', 'void');
  end if;

  if not exists (select 1 from pg_type where typname = 'trustpilot_invitation_status') then
    create type public.trustpilot_invitation_status as enum ('blocked_private_feedback_only');
  end if;
end $$;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  user_id uuid references auth.users(id) on delete set null,
  cart_id uuid references public.carts(id) on delete set null,
  status public.order_status not null default 'pending_payment',
  checkout_environment public.checkout_environment not null default 'sandbox',
  currency text not null default 'USD',
  customer_email text,
  merchandise_subtotal_cents integer not null,
  discount_cents integer not null default 0,
  shipping_cents integer not null default 0,
  tax_cents integer not null default 0,
  total_cents integer not null,
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text unique,
  stripe_customer_id text,
  referral_code text,
  reward_points_redeemed integer not null default 0,
  reward_discount_cents integer not null default 0,
  reward_points_earned integer not null default 0,
  shipping_name text,
  shipping_address jsonb not null default '{}'::jsonb,
  billing_address jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz,
  cancelled_at timestamptz,
  refunded_at timestamptz,
  constraint orders_currency_usd check (currency = 'USD'),
  constraint orders_sandbox_only check (checkout_environment = 'sandbox'),
  constraint orders_amounts_nonnegative check (
    merchandise_subtotal_cents >= 0 and
    discount_cents >= 0 and
    shipping_cents >= 0 and
    tax_cents >= 0 and
    total_cents >= 0 and
    reward_points_redeemed >= 0 and
    reward_discount_cents >= 0 and
    reward_points_earned >= 0
  ),
  constraint orders_total_matches_components check (
    total_cents = greatest(0, merchandise_subtotal_cents - discount_cents) + shipping_cents + tax_cents
  )
);

create index if not exists orders_user_created_idx on public.orders (user_id, created_at desc);
create index if not exists orders_cart_idx on public.orders (cart_id);
create index if not exists orders_status_idx on public.orders (status);

drop trigger if exists orders_set_updated_at on public.orders;
create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

alter table public.orders enable row level security;

drop policy if exists "orders_select_own" on public.orders;
create policy "orders_select_own"
  on public.orders for select
  using (auth.uid() = user_id);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_slug text not null,
  product_name text not null,
  variant_key text not null,
  variant_label text not null,
  unit_price_cents integer not null,
  quantity integer not null,
  line_subtotal_cents integer not null,
  product_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint order_items_price_nonnegative check (unit_price_cents >= 0 and line_subtotal_cents >= 0),
  constraint order_items_quantity_bounds check (quantity between 1 and 99),
  constraint order_items_line_total check (line_subtotal_cents = unit_price_cents * quantity)
);

create index if not exists order_items_order_idx on public.order_items (order_id);
create index if not exists order_items_product_idx on public.order_items (product_id);

alter table public.order_items enable row level security;

drop policy if exists "order_items_select_own_order" on public.order_items;
create policy "order_items_select_own_order"
  on public.order_items for select
  using (
    exists (
      select 1 from public.orders
      where orders.id = order_items.order_id
        and orders.user_id = auth.uid()
    )
  );

create table if not exists public.payment_attempts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  provider text not null default 'stripe',
  checkout_environment public.checkout_environment not null default 'sandbox',
  status public.payment_attempt_status not null default 'requires_payment',
  amount_cents integer not null,
  currency text not null default 'USD',
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text,
  idempotency_key text not null unique,
  raw_status text,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_attempts_provider_stripe check (provider = 'stripe'),
  constraint payment_attempts_sandbox_only check (checkout_environment = 'sandbox'),
  constraint payment_attempts_currency_usd check (currency = 'USD'),
  constraint payment_attempts_amount_nonnegative check (amount_cents >= 0)
);

create index if not exists payment_attempts_order_idx on public.payment_attempts (order_id);
create index if not exists payment_attempts_status_idx on public.payment_attempts (status);

drop trigger if exists payment_attempts_set_updated_at on public.payment_attempts;
create trigger payment_attempts_set_updated_at
  before update on public.payment_attempts
  for each row execute function public.set_updated_at();

alter table public.payment_attempts enable row level security;

drop policy if exists "payment_attempts_select_own_order" on public.payment_attempts;
create policy "payment_attempts_select_own_order"
  on public.payment_attempts for select
  using (
    exists (
      select 1 from public.orders
      where orders.id = payment_attempts.order_id
        and orders.user_id = auth.uid()
    )
  );

create table if not exists public.stripe_customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  stripe_customer_id text not null unique,
  checkout_environment public.checkout_environment not null default 'sandbox',
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stripe_customers_sandbox_only check (checkout_environment = 'sandbox'),
  unique (user_id, checkout_environment)
);

drop trigger if exists stripe_customers_set_updated_at on public.stripe_customers;
create trigger stripe_customers_set_updated_at
  before update on public.stripe_customers
  for each row execute function public.set_updated_at();

alter table public.stripe_customers enable row level security;

drop policy if exists "stripe_customers_select_own" on public.stripe_customers;
create policy "stripe_customers_select_own"
  on public.stripe_customers for select
  using (auth.uid() = user_id);

create table if not exists public.stripe_webhook_events (
  stripe_event_id text primary key,
  type text not null,
  livemode boolean not null default false,
  checkout_environment public.checkout_environment not null default 'sandbox',
  payload jsonb not null,
  processed_at timestamptz,
  processing_error text,
  created_at timestamptz not null default now(),
  constraint stripe_webhook_events_sandbox_only check (checkout_environment = 'sandbox'),
  constraint stripe_webhook_events_no_live_events check (livemode = false)
);

create index if not exists stripe_webhook_events_type_idx on public.stripe_webhook_events (type);
create index if not exists stripe_webhook_events_processed_idx on public.stripe_webhook_events (processed_at);

alter table public.stripe_webhook_events enable row level security;

create table if not exists public.loyalty_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  points_balance integer not null default 0,
  lifetime_points integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint loyalty_accounts_points_nonnegative check (points_balance >= 0 and lifetime_points >= 0)
);

drop trigger if exists loyalty_accounts_set_updated_at on public.loyalty_accounts;
create trigger loyalty_accounts_set_updated_at
  before update on public.loyalty_accounts
  for each row execute function public.set_updated_at();

alter table public.loyalty_accounts enable row level security;

drop policy if exists "loyalty_accounts_select_own" on public.loyalty_accounts;
create policy "loyalty_accounts_select_own"
  on public.loyalty_accounts for select
  using (auth.uid() = user_id);

create table if not exists public.loyalty_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  entry_type public.loyalty_ledger_entry_type not null,
  status public.loyalty_ledger_status not null default 'posted',
  points integer not null,
  description text not null,
  source_key text not null unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint loyalty_ledger_points_not_zero check (points <> 0),
  constraint loyalty_ledger_posted_source_present check (char_length(source_key) > 8)
);

create index if not exists loyalty_ledger_user_created_idx on public.loyalty_ledger_entries (user_id, created_at desc);
create index if not exists loyalty_ledger_order_idx on public.loyalty_ledger_entries (order_id);

alter table public.loyalty_ledger_entries enable row level security;

drop policy if exists "loyalty_ledger_entries_select_own" on public.loyalty_ledger_entries;
create policy "loyalty_ledger_entries_select_own"
  on public.loyalty_ledger_entries for select
  using (auth.uid() = user_id);

create table if not exists public.loyalty_redemptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  status public.loyalty_redemption_status not null default 'pending',
  points integer not null,
  amount_cents integer not null,
  source_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint loyalty_redemptions_amounts_positive check (points > 0 and amount_cents > 0)
);

create index if not exists loyalty_redemptions_user_created_idx on public.loyalty_redemptions (user_id, created_at desc);
create index if not exists loyalty_redemptions_order_idx on public.loyalty_redemptions (order_id);

drop trigger if exists loyalty_redemptions_set_updated_at on public.loyalty_redemptions;
create trigger loyalty_redemptions_set_updated_at
  before update on public.loyalty_redemptions
  for each row execute function public.set_updated_at();

alter table public.loyalty_redemptions enable row level security;

drop policy if exists "loyalty_redemptions_select_own" on public.loyalty_redemptions;
create policy "loyalty_redemptions_select_own"
  on public.loyalty_redemptions for select
  using (auth.uid() = user_id);

create table if not exists public.referral_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  code text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint referral_codes_format check (code ~ '^[A-Z0-9]{6,16}$'),
  unique (user_id)
);

drop trigger if exists referral_codes_set_updated_at on public.referral_codes;
create trigger referral_codes_set_updated_at
  before update on public.referral_codes
  for each row execute function public.set_updated_at();

alter table public.referral_codes enable row level security;

drop policy if exists "referral_codes_select_own" on public.referral_codes;
create policy "referral_codes_select_own"
  on public.referral_codes for select
  using (auth.uid() = user_id);

create table if not exists public.referral_attributions (
  id uuid primary key default gen_random_uuid(),
  referral_code_id uuid not null references public.referral_codes(id) on delete restrict,
  referrer_user_id uuid not null references auth.users(id) on delete cascade,
  referee_user_id uuid references auth.users(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  status public.referral_status not null default 'pending',
  source_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  qualified_at timestamptz,
  constraint referral_attributions_not_self check (
    referee_user_id is null or referee_user_id <> referrer_user_id
  )
);

create index if not exists referral_attributions_referrer_idx on public.referral_attributions (referrer_user_id, created_at desc);
create index if not exists referral_attributions_referee_idx on public.referral_attributions (referee_user_id);
create unique index if not exists referral_attributions_one_order
  on public.referral_attributions (order_id)
  where order_id is not null;

drop trigger if exists referral_attributions_set_updated_at on public.referral_attributions;
create trigger referral_attributions_set_updated_at
  before update on public.referral_attributions
  for each row execute function public.set_updated_at();

alter table public.referral_attributions enable row level security;

drop policy if exists "referral_attributions_select_own" on public.referral_attributions;
create policy "referral_attributions_select_own"
  on public.referral_attributions for select
  using (auth.uid() = referrer_user_id or auth.uid() = referee_user_id);

create table if not exists public.referral_rewards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  referral_attribution_id uuid not null references public.referral_attributions(id) on delete cascade,
  status public.referral_reward_status not null default 'available',
  discount_percent integer not null default 15,
  minimum_subtotal_cents integer not null default 5000,
  source_key text not null unique,
  consumed_order_id uuid references public.orders(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  consumed_at timestamptz,
  constraint referral_rewards_discount check (discount_percent = 15),
  constraint referral_rewards_minimum check (minimum_subtotal_cents = 5000)
);

create index if not exists referral_rewards_user_status_idx on public.referral_rewards (user_id, status, created_at desc);

drop trigger if exists referral_rewards_set_updated_at on public.referral_rewards;
create trigger referral_rewards_set_updated_at
  before update on public.referral_rewards
  for each row execute function public.set_updated_at();

alter table public.referral_rewards enable row level security;

drop policy if exists "referral_rewards_select_own" on public.referral_rewards;
create policy "referral_rewards_select_own"
  on public.referral_rewards for select
  using (auth.uid() = user_id);

create table if not exists public.private_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  status public.private_feedback_status not null default 'available',
  rating integer,
  comments text,
  points_awarded integer not null default 0,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint private_feedback_rating_range check (rating is null or rating between 1 and 5),
  constraint private_feedback_comments_length check (comments is null or char_length(comments) <= 2000),
  constraint private_feedback_points_nonnegative check (points_awarded >= 0),
  unique (order_id)
);

create index if not exists private_feedback_user_created_idx on public.private_feedback (user_id, created_at desc);

drop trigger if exists private_feedback_set_updated_at on public.private_feedback;
create trigger private_feedback_set_updated_at
  before update on public.private_feedback
  for each row execute function public.set_updated_at();

alter table public.private_feedback enable row level security;

drop policy if exists "private_feedback_select_own" on public.private_feedback;
create policy "private_feedback_select_own"
  on public.private_feedback for select
  using (auth.uid() = user_id);

create table if not exists public.trustpilot_invitation_attempts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  status public.trustpilot_invitation_status not null default 'blocked_private_feedback_only',
  blocked_reason text not null default 'Mei Pelle does not incentivize or send Trustpilot review invitations from rewards flows.',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint trustpilot_invitation_attempts_blocked_only check (status = 'blocked_private_feedback_only')
);

alter table public.trustpilot_invitation_attempts enable row level security;

drop policy if exists "trustpilot_invitation_attempts_select_own" on public.trustpilot_invitation_attempts;
create policy "trustpilot_invitation_attempts_select_own"
  on public.trustpilot_invitation_attempts for select
  using (auth.uid() = user_id);

create or replace function public.ensure_loyalty_account(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_code text;
begin
  if p_user_id is null then
    raise exception 'ensure_loyalty_account requires a user id';
  end if;

  insert into public.loyalty_accounts (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  select upper(substr(md5(p_user_id::text || ':mei-pelle-referral'), 1, 10))
  into v_code;

  insert into public.referral_codes (user_id, code)
  values (p_user_id, v_code)
  on conflict (user_id) do nothing;
end;
$$;

revoke all on function public.ensure_loyalty_account(uuid) from public;
grant execute on function public.ensure_loyalty_account(uuid) to service_role;

create or replace function public.handle_new_user_loyalty()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  perform public.ensure_loyalty_account(new.id);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_loyalty on auth.users;
create trigger on_auth_user_created_loyalty
  after insert on auth.users
  for each row execute function public.handle_new_user_loyalty();

insert into public.loyalty_accounts (user_id)
select id from auth.users
on conflict (user_id) do nothing;

insert into public.referral_codes (user_id, code)
select
  id,
  upper(substr(md5(id::text || ':mei-pelle-referral'), 1, 10))
from auth.users
on conflict (user_id) do nothing;

create or replace function public.award_loyalty_points(
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
security definer
set search_path = public
as $$
declare
  v_entry_id uuid;
begin
  if p_user_id is null then
    raise exception 'award_loyalty_points requires a user id';
  end if;
  if p_points <= 0 then
    raise exception 'award_loyalty_points requires positive points';
  end if;
  if p_source_key is null or char_length(p_source_key) <= 8 then
    raise exception 'award_loyalty_points requires a stable source key';
  end if;

  perform public.ensure_loyalty_account(p_user_id);

  insert into public.loyalty_ledger_entries (
    user_id,
    order_id,
    entry_type,
    status,
    points,
    description,
    source_key,
    metadata
  )
  values (
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

  if v_entry_id is not null then
    update public.loyalty_accounts
    set
      points_balance = points_balance + p_points,
      lifetime_points = lifetime_points + p_points
    where user_id = p_user_id;
  end if;

  select id into v_entry_id
  from public.loyalty_ledger_entries
  where source_key = p_source_key;

  return v_entry_id;
end;
$$;

revoke all on function public.award_loyalty_points(uuid, integer, public.loyalty_ledger_entry_type, text, text, uuid, jsonb) from public;
grant execute on function public.award_loyalty_points(uuid, integer, public.loyalty_ledger_entry_type, text, text, uuid, jsonb) to service_role;

create or replace function public.redeem_loyalty_points(
  p_user_id uuid,
  p_points integer,
  p_amount_cents integer,
  p_source_key text,
  p_description text,
  p_order_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry_id uuid;
  v_balance integer;
begin
  if p_user_id is null then
    raise exception 'redeem_loyalty_points requires a user id';
  end if;
  if p_points <= 0 or p_amount_cents <= 0 then
    raise exception 'redeem_loyalty_points requires positive points and amount';
  end if;
  if p_source_key is null or char_length(p_source_key) <= 8 then
    raise exception 'redeem_loyalty_points requires a stable source key';
  end if;

  perform public.ensure_loyalty_account(p_user_id);

  select points_balance
  into v_balance
  from public.loyalty_accounts
  where user_id = p_user_id
  for update;

  if v_balance < p_points then
    raise exception 'Insufficient loyalty balance';
  end if;

  insert into public.loyalty_ledger_entries (
    user_id,
    order_id,
    entry_type,
    status,
    points,
    description,
    source_key
  )
  values (
    p_user_id,
    p_order_id,
    'redemption_reserved',
    'posted',
    -p_points,
    p_description,
    p_source_key
  )
  on conflict (source_key) do nothing
  returning id into v_entry_id;

  if v_entry_id is not null then
    update public.loyalty_accounts
    set points_balance = points_balance - p_points
    where user_id = p_user_id;

    insert into public.loyalty_redemptions (
      user_id,
      order_id,
      status,
      points,
      amount_cents,
      source_key
    )
    values (
      p_user_id,
      p_order_id,
      'applied',
      p_points,
      p_amount_cents,
      p_source_key
    )
    on conflict (source_key) do nothing;
  end if;

  select id into v_entry_id
  from public.loyalty_ledger_entries
  where source_key = p_source_key;

  return v_entry_id;
end;
$$;

revoke all on function public.redeem_loyalty_points(uuid, integer, integer, text, text, uuid) from public;
grant execute on function public.redeem_loyalty_points(uuid, integer, integer, text, text, uuid) to service_role;
