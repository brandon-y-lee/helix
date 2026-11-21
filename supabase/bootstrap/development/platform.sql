-- The release installer uses the postgres object owner. Supabase owns auth/storage.
-- All privileges on app_ops below apply only to the new, empty cleanup metadata table.
SET LOCAL search_path = pg_catalog, public, extensions;
SET LOCAL check_function_bodies = on;

create schema app_ops;

revoke all on schema app_ops from public, anon, authenticated, service_role;
grant usage on schema app_ops to service_role;

create table app_ops.data_cleanup_runs (
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

revoke all on table app_ops.data_cleanup_runs from public, anon, authenticated, service_role;
grant select, insert, update on table app_ops.data_cleanup_runs to service_role;

comment on schema app_ops is
  'Private operational metadata for Mei Pelle database maintenance. Not exposed to browser roles.';
comment on table app_ops.data_cleanup_runs is
  'Non-PII cleanup run metadata: table-level counts, natural keys, and reason codes only.';

CREATE POLICY data_cleanup_runs_service_role_all ON app_ops.data_cleanup_runs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- The catalog bucket must be provisioned independently with verified dev-owned objects.
-- No storage rows, platform triggers, Vault secrets or network hooks are installed here.
create policy "Public read helix catalog assets"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'helix-catalog');

create policy "Service role manages helix catalog assets"
  on storage.objects for all to service_role
  using (bucket_id = 'helix-catalog')
  with check (bucket_id = 'helix-catalog');

-- Seed governed reference rows and disabled controls. Provider credentials,
-- offers, historical messages, customer records and jobs have no bootstrap rows.
INSERT INTO public.system_steps(name, position, routine_group) VALUES
  ('CLEANSE', 1, 'core'), ('REFINE', 2, 'beyond_core'), ('TREAT', 3, 'core'),
  ('FRAME', 4, 'beyond_core'), ('SEAL', 5, 'core'), ('PROTECT', 6, 'beyond_core'),
  ('LIFT', 7, 'beyond_core');
INSERT INTO private.catalog_media_policy(singleton) VALUES (true);
INSERT INTO private.support_controls(environment) VALUES ('sandbox');
INSERT INTO private.email_controls(environment, purpose) VALUES
  ('sandbox', 'order_confirmation'), ('sandbox', 'order_tracking'),
  ('sandbox', 'support_acknowledgement'), ('sandbox', 'support_reply'),
  ('sandbox', 'marketing_confirmation'), ('sandbox', 'welcome_initial'),
  ('sandbox', 'welcome_education'), ('sandbox', 'product_availability'),
  ('sandbox', 'product_waitlist_recovery');
