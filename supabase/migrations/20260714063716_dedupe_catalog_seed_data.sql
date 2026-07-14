-- Dedupe old migration-generated catalog seed data and harden future data ops.
-- Target project verified before push: erasogmsqpgiirovubjh.
-- This migration deliberately touches only catalog/current-state data and
-- operational metadata. It does not mutate auth, profiles, carts, orders,
-- payments, rewards, referrals, feedback, or webhook history.

set lock_timeout = '5s';
set statement_timeout = '30s';

create extension if not exists pgcrypto;

create schema if not exists app_ops;

revoke all on schema app_ops from public;
revoke all on schema app_ops from anon;
revoke all on schema app_ops from authenticated;
grant usage on schema app_ops to service_role;

create table if not exists app_ops.data_cleanup_runs (
  id uuid primary key default gen_random_uuid(),
  run_key text not null unique,
  migration_name text not null,
  project_ref text not null,
  reason_code text not null,
  protected_tables_skipped text[] not null default '{}'::text[],
  candidate_slugs text[] not null default '{}'::text[],
  product_rows_deleted integer not null default 0 check (product_rows_deleted >= 0),
  variant_rows_deleted integer not null default 0 check (variant_rows_deleted >= 0),
  protected_reference_count integer not null default 0 check (protected_reference_count >= 0),
  other_reference_count integer not null default 0 check (other_reference_count >= 0),
  metadata jsonb not null default '{}'::jsonb,
  ran_at timestamptz not null default now()
);

alter table app_ops.data_cleanup_runs enable row level security;

revoke all on table app_ops.data_cleanup_runs from public;
revoke all on table app_ops.data_cleanup_runs from anon;
revoke all on table app_ops.data_cleanup_runs from authenticated;
grant select, insert, update on table app_ops.data_cleanup_runs to service_role;

comment on schema app_ops is
  'Private operational metadata for Mei Pelle database maintenance. Not exposed to browser roles.';
comment on table app_ops.data_cleanup_runs is
  'Non-PII cleanup run metadata: table-level counts, natural keys, and reason codes only.';

create unique index if not exists product_variants_sku_unique_idx
  on public.product_variants (sku)
  where sku is not null;

create index if not exists product_media_variant_id_idx
  on public.product_media (variant_id)
  where variant_id is not null;

create index if not exists referral_attributions_referral_code_id_idx
  on public.referral_attributions (referral_code_id);

create index if not exists referral_rewards_consumed_order_id_idx
  on public.referral_rewards (consumed_order_id)
  where consumed_order_id is not null;

create index if not exists referral_rewards_referral_attribution_id_idx
  on public.referral_rewards (referral_attribution_id);

create index if not exists trustpilot_invitation_attempts_order_id_idx
  on public.trustpilot_invitation_attempts (order_id)
  where order_id is not null;

create index if not exists trustpilot_invitation_attempts_user_id_idx
  on public.trustpilot_invitation_attempts (user_id)
  where user_id is not null;

-- Security-definer RPCs are internal/server-owned APIs. Keep merge_guest_cart
-- available to authenticated users because the server session client calls it
-- after auth.getUser(); keep rewards/profile trigger helpers service-owned.
revoke execute on function public.merge_guest_cart(text) from public;
revoke execute on function public.merge_guest_cart(text) from anon;
revoke execute on function public.merge_guest_cart(text) from authenticated;
grant execute on function public.merge_guest_cart(text) to authenticated;
grant execute on function public.merge_guest_cart(text) to service_role;

revoke execute on function public.handle_new_user_profile() from public;
revoke execute on function public.handle_new_user_profile() from anon;
revoke execute on function public.handle_new_user_profile() from authenticated;
grant execute on function public.handle_new_user_profile() to service_role;

revoke execute on function public.ensure_loyalty_account(uuid) from public;
revoke execute on function public.ensure_loyalty_account(uuid) from anon;
revoke execute on function public.ensure_loyalty_account(uuid) from authenticated;
grant execute on function public.ensure_loyalty_account(uuid) to service_role;

revoke execute on function public.handle_new_user_loyalty() from public;
revoke execute on function public.handle_new_user_loyalty() from anon;
revoke execute on function public.handle_new_user_loyalty() from authenticated;
grant execute on function public.handle_new_user_loyalty() to service_role;

revoke execute on function public.award_loyalty_points(
  uuid,
  integer,
  public.loyalty_ledger_entry_type,
  text,
  text,
  uuid,
  jsonb
) from public;
revoke execute on function public.award_loyalty_points(
  uuid,
  integer,
  public.loyalty_ledger_entry_type,
  text,
  text,
  uuid,
  jsonb
) from anon;
revoke execute on function public.award_loyalty_points(
  uuid,
  integer,
  public.loyalty_ledger_entry_type,
  text,
  text,
  uuid,
  jsonb
) from authenticated;
grant execute on function public.award_loyalty_points(
  uuid,
  integer,
  public.loyalty_ledger_entry_type,
  text,
  text,
  uuid,
  jsonb
) to service_role;

revoke execute on function public.redeem_loyalty_points(
  uuid,
  integer,
  integer,
  text,
  text,
  uuid
) from public;
revoke execute on function public.redeem_loyalty_points(
  uuid,
  integer,
  integer,
  text,
  text,
  uuid
) from anon;
revoke execute on function public.redeem_loyalty_points(
  uuid,
  integer,
  integer,
  text,
  text,
  uuid
) from authenticated;
grant execute on function public.redeem_loyalty_points(
  uuid,
  integer,
  integer,
  text,
  text,
  uuid
) to service_role;

do $$
declare
  v_canonical_slugs text[] := array[
    'cleanse-01-calming-gel-cleanser',
    'treat-03-pdrn-5-ampoule',
    'seal-05-green-collagen-cream',
    'refine-02-pore-treatment-pads',
    'frame-04-pdrn-eye-cream',
    'lift-06-pdrn-mask-system'
  ];
  v_seed_slugs text[] := array[
    'groundwork-gel-cleanser',
    'meridian-daily-moisturizer',
    'northpoint-renewal-serum',
    'summit-mineral-spf',
    'lowtide-recovery-cream',
    'clearview-eye-concentrate'
  ];
  v_candidate_count integer;
  v_archived_candidate_count integer;
  v_missing_canonical_count integer;
  v_protect_active_count integer;
  v_protected_reference_count integer;
  v_other_reference_count integer;
  v_variant_count integer;
  v_deleted_product_count integer;
begin
  select count(*) into v_missing_canonical_count
  from unnest(v_canonical_slugs) as expected(slug)
  where not exists (
    select 1
    from public.products p
    where p.slug = expected.slug
      and p.catalog_status = 'active'
  );

  if v_missing_canonical_count > 0 then
    raise exception 'catalog cleanup refused: % canonical active product(s) missing', v_missing_canonical_count;
  end if;

  select count(*) into v_protect_active_count
  from public.products
  where catalog_status = 'active'
    and lower(coalesce(slug, '') || ' ' || coalesce(name, '') || ' ' || coalesce(display_name, '')) like '%protect%';

  if v_protect_active_count > 0 then
    raise exception 'catalog cleanup refused: PROTECT must not be an active commerce product';
  end if;

  select count(*) into v_candidate_count
  from public.products
  where slug = any(v_seed_slugs);

  if v_candidate_count not in (0, cardinality(v_seed_slugs)) then
    raise exception 'catalog cleanup refused: expected 0 or % legacy seed rows, found %',
      cardinality(v_seed_slugs),
      v_candidate_count;
  end if;

  if v_candidate_count = 0 then
    insert into app_ops.data_cleanup_runs (
      run_key,
      migration_name,
      project_ref,
      reason_code,
      protected_tables_skipped,
      candidate_slugs,
      product_rows_deleted,
      variant_rows_deleted,
      protected_reference_count,
      other_reference_count,
      metadata
    )
    values (
      '20260714_dedupe_legacy_seed_catalog_products',
      '20260714063716_dedupe_catalog_seed_data',
      'erasogmsqpgiirovubjh',
      'superseded_catalog_iteration',
      array['auth.users', 'public.profiles', 'public.carts', 'public.cart_items', 'public.orders', 'public.order_items', 'public.payment_attempts', 'public.loyalty_ledger_entries', 'public.stripe_webhook_events'],
      v_seed_slugs,
      0,
      0,
      0,
      0,
      jsonb_build_object('status', 'already_clean')
    )
    on conflict (run_key) do update set
      metadata = app_ops.data_cleanup_runs.metadata || excluded.metadata,
      ran_at = now();
    return;
  end if;

  select count(*) into v_archived_candidate_count
  from public.products
  where slug = any(v_seed_slugs)
    and catalog_status = 'archived';

  if v_archived_candidate_count <> cardinality(v_seed_slugs) then
    raise exception 'catalog cleanup refused: all legacy seed candidates must already be archived';
  end if;

  with candidates as (
    select id
    from public.products
    where slug = any(v_seed_slugs)
      and catalog_status = 'archived'
  ),
  protected_refs as (
    select 1 from public.cart_items c
    join candidates p on p.id = c.product_id
    union all
    select 1 from public.order_items o
    join candidates p on p.id = o.product_id
  )
  select count(*) into v_protected_reference_count
  from protected_refs;

  if v_protected_reference_count > 0 then
    raise exception 'catalog cleanup refused: % protected cart/order reference(s) found', v_protected_reference_count;
  end if;

  with candidates as (
    select id
    from public.products
    where slug = any(v_seed_slugs)
      and catalog_status = 'archived'
  ),
  other_refs as (
    select 1 from public.product_media m
    join candidates p on p.id = m.product_id
    union all
    select 1 from public.product_sources s
    join candidates p on p.id = s.product_id
    union all
    select 1 from public.product_relationships r
    join candidates p on p.id = r.product_id or p.id = r.related_product_id
  )
  select count(*) into v_other_reference_count
  from other_refs;

  if v_other_reference_count > 0 then
    raise exception 'catalog cleanup refused: % non-variant catalog reference(s) require manual review', v_other_reference_count;
  end if;

  select count(*) into v_variant_count
  from public.product_variants v
  join public.products p on p.id = v.product_id
  where p.slug = any(v_seed_slugs)
    and p.catalog_status = 'archived';

  with deleted as (
    delete from public.products p
    where p.slug = any(v_seed_slugs)
      and p.catalog_status = 'archived'
    returning p.id
  )
  select count(*) into v_deleted_product_count
  from deleted;

  if v_deleted_product_count <> cardinality(v_seed_slugs) then
    raise exception 'catalog cleanup refused: expected to delete % products, deleted %',
      cardinality(v_seed_slugs),
      v_deleted_product_count;
  end if;

  insert into app_ops.data_cleanup_runs (
    run_key,
    migration_name,
    project_ref,
    reason_code,
    protected_tables_skipped,
    candidate_slugs,
    product_rows_deleted,
    variant_rows_deleted,
    protected_reference_count,
    other_reference_count,
    metadata
  )
  values (
    '20260714_dedupe_legacy_seed_catalog_products',
    '20260714063716_dedupe_catalog_seed_data',
    'erasogmsqpgiirovubjh',
    'superseded_catalog_iteration',
    array['auth.users', 'public.profiles', 'public.carts', 'public.cart_items', 'public.orders', 'public.order_items', 'public.payment_attempts', 'public.loyalty_ledger_entries', 'public.stripe_webhook_events'],
    v_seed_slugs,
    v_deleted_product_count,
    v_variant_count,
    v_protected_reference_count,
    v_other_reference_count,
    jsonb_build_object(
      'cascade', 'product_variants only',
      'hard_delete_reason', 'archived original development seed rows with no protected or non-variant references'
    )
  )
  on conflict (run_key) do update set
    product_rows_deleted = excluded.product_rows_deleted,
    variant_rows_deleted = excluded.variant_rows_deleted,
    protected_reference_count = excluded.protected_reference_count,
    other_reference_count = excluded.other_reference_count,
    metadata = app_ops.data_cleanup_runs.metadata || excluded.metadata,
    ran_at = now();
end $$;
