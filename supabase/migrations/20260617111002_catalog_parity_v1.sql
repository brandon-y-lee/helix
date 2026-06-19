-- Storefront parity v1: availability status + non-claim structured metadata.
alter table public.products
  add column status text not null default 'available'
    check (status in ('available','coming_soon','sold_out')),
  add column made_for text,
  add column good_for text,
  add column texture text;;
