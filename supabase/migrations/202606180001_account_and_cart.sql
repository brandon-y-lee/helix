-- Account profiles and persistent carts for the Mei-Pelle development storefront.
-- Additive only: no existing catalog data is dropped or rewritten.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  first_name text,
  last_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_first_name_length check (first_name is null or char_length(first_name) <= 80),
  constraint profiles_last_name_length check (last_name is null or char_length(last_name) <= 80)
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = user_id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = user_id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  insert into public.profiles (user_id, first_name, last_name)
  values (
    new.id,
    nullif(left(coalesce(new.raw_user_meta_data ->> 'first_name', ''), 80), ''),
    nullif(left(coalesce(new.raw_user_meta_data ->> 'last_name', ''), 80), '')
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute function public.handle_new_user_profile();

do $$
begin
  if not exists (select 1 from pg_type where typname = 'cart_status') then
    create type public.cart_status as enum ('active', 'merged', 'abandoned');
  end if;
end $$;

create table if not exists public.carts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  guest_token_hash text,
  status public.cart_status not null default 'active',
  currency text not null default 'USD',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz,
  constraint carts_owner_identity check (
    (user_id is not null and guest_token_hash is null) or
    (user_id is null and guest_token_hash is not null)
  ),
  constraint carts_currency_usd check (currency = 'USD'),
  constraint carts_guest_token_hash_length check (
    guest_token_hash is null or char_length(guest_token_hash) between 32 and 128
  )
);

create unique index if not exists carts_one_active_user
  on public.carts (user_id)
  where status = 'active' and user_id is not null;

create unique index if not exists carts_one_active_guest
  on public.carts (guest_token_hash)
  where status = 'active' and guest_token_hash is not null;

create index if not exists carts_user_status_idx on public.carts (user_id, status);
create index if not exists carts_guest_status_idx on public.carts (guest_token_hash, status);

alter table public.carts enable row level security;

drop policy if exists "carts_select_own_user" on public.carts;
create policy "carts_select_own_user"
  on public.carts for select
  using (auth.uid() = user_id);

drop policy if exists "carts_insert_own_user" on public.carts;
create policy "carts_insert_own_user"
  on public.carts for insert
  with check (auth.uid() = user_id and guest_token_hash is null);

drop policy if exists "carts_update_own_user" on public.carts;
create policy "carts_update_own_user"
  on public.carts for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id and guest_token_hash is null);

drop trigger if exists carts_set_updated_at on public.carts;
create trigger carts_set_updated_at
  before update on public.carts
  for each row execute function public.set_updated_at();

create table if not exists public.cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references public.carts(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  variant_key text not null,
  quantity integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cart_items_quantity_bounds check (quantity between 1 and 99),
  constraint cart_items_variant_key_present check (char_length(variant_key) > 0)
);

create unique index if not exists cart_items_cart_product_variant
  on public.cart_items (cart_id, product_id, variant_key);

create index if not exists cart_items_cart_id_idx on public.cart_items (cart_id);
create index if not exists cart_items_product_id_idx on public.cart_items (product_id);

alter table public.cart_items enable row level security;

drop policy if exists "cart_items_select_own_user_cart" on public.cart_items;
create policy "cart_items_select_own_user_cart"
  on public.cart_items for select
  using (
    exists (
      select 1 from public.carts
      where carts.id = cart_items.cart_id
        and carts.user_id = auth.uid()
    )
  );

drop policy if exists "cart_items_insert_own_user_cart" on public.cart_items;
create policy "cart_items_insert_own_user_cart"
  on public.cart_items for insert
  with check (
    exists (
      select 1 from public.carts
      where carts.id = cart_items.cart_id
        and carts.user_id = auth.uid()
        and carts.status = 'active'
    )
  );

drop policy if exists "cart_items_update_own_user_cart" on public.cart_items;
create policy "cart_items_update_own_user_cart"
  on public.cart_items for update
  using (
    exists (
      select 1 from public.carts
      where carts.id = cart_items.cart_id
        and carts.user_id = auth.uid()
        and carts.status = 'active'
    )
  )
  with check (
    exists (
      select 1 from public.carts
      where carts.id = cart_items.cart_id
        and carts.user_id = auth.uid()
        and carts.status = 'active'
    )
  );

drop policy if exists "cart_items_delete_own_user_cart" on public.cart_items;
create policy "cart_items_delete_own_user_cart"
  on public.cart_items for delete
  using (
    exists (
      select 1 from public.carts
      where carts.id = cart_items.cart_id
        and carts.user_id = auth.uid()
        and carts.status = 'active'
    )
  );

drop trigger if exists cart_items_set_updated_at on public.cart_items;
create trigger cart_items_set_updated_at
  before update on public.cart_items
  for each row execute function public.set_updated_at();

create or replace function public.merge_guest_cart(p_guest_token_hash text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_user_cart_id uuid;
  v_guest_cart_id uuid;
begin
  if v_user_id is null then
    raise exception 'merge_guest_cart requires an authenticated user';
  end if;

  if p_guest_token_hash is null or char_length(p_guest_token_hash) < 32 then
    return null;
  end if;

  insert into public.carts (user_id, status)
  values (v_user_id, 'active')
  on conflict (user_id) where status = 'active'
  do update set updated_at = now()
  returning id into v_user_cart_id;

  select id into v_guest_cart_id
  from public.carts
  where guest_token_hash = p_guest_token_hash
    and user_id is null
    and status = 'active'
  limit 1;

  if v_guest_cart_id is null then
    return v_user_cart_id;
  end if;

  insert into public.cart_items (cart_id, product_id, variant_key, quantity)
  select v_user_cart_id, product_id, variant_key, quantity
  from public.cart_items
  where cart_id = v_guest_cart_id
  on conflict (cart_id, product_id, variant_key)
  do update set
    quantity = least(99, public.cart_items.quantity + excluded.quantity),
    updated_at = now();

  update public.carts
  set status = 'merged', expires_at = now()
  where id = v_guest_cart_id;

  return v_user_cart_id;
end;
$$;

revoke all on function public.merge_guest_cart(text) from public;
grant execute on function public.merge_guest_cart(text) to authenticated;
