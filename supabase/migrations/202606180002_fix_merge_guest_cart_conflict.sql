-- Fix active user cart upsert inference for the partial unique index.
-- Non-destructive: replaces only the cart merge function body.

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
  on conflict (user_id) where status = 'active' and user_id is not null
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
