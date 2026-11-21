-- Disposable PG17 only. The runner installs the repository checkpoint and #560
-- forward migration as their actual owner and restricted Catalog writer.
begin;
create function pg_temp.expect_capability(name text, expected boolean, reason text) returns void
language plpgsql as $$
begin
  if (public.read_helix_release_observations()->>name)::boolean is distinct from expected then
    raise exception 'Wrong % observation: %', name, reason;
  end if;
end;
$$;

-- Keep the owner's introspection bound to native catalogs regardless of the
-- calling session's relation search order. The temporary fixture holds no data.
do $$ begin
  if (select proconfig from pg_catalog.pg_proc
      where oid = 'private.read_helix_release_observations()'::regprocedure)
      is distinct from array['search_path=pg_catalog, pg_temp'] then
    raise exception 'The release observer must use its reviewed catalog search order';
  end if;
end $$;
set local role service_role;
create temporary table pg_constraint (fixture boolean);
select pg_temp.expect_capability('catalogSchema',true,'authentic reviewed Catalog contract with session-local relation');
select pg_temp.expect_capability('waitlist',false,'missing Product notification RPC');
do $$ begin
  if public.read_helix_release_observations()->'support' is distinct from 'null'::jsonb then
    raise exception 'Absent support package incorrectly qualified';
  end if;
end $$;
reset role;
savepoint authentic_catalog;
grant execute on function private.is_bound_catalog_product_media_url(text) to unexpected_reader;
select pg_temp.expect_capability('catalogSchema',false,'unexpected validator grant');
rollback to authentic_catalog;
revoke execute on function public.cutover_catalog_product_media(jsonb) from service_role;
select pg_temp.expect_capability('catalogSchema',false,'missing service-side cutover contract');
rollback to authentic_catalog;
create or replace function private.is_bound_catalog_product_media_url(p_url text)
  returns boolean language sql stable security definer set search_path='' as $$select true$$;
select pg_temp.expect_capability('catalogSchema',false,'allows any media origin');
rollback to authentic_catalog;
create or replace function private.enforce_bound_catalog_media_origin() returns trigger
  language plpgsql security definer set search_path='' as $$begin return new; end$$;
select pg_temp.expect_capability('catalogSchema',false,'inert trigger with right name, signature and events');
rollback to authentic_catalog;
drop trigger product_media_bound_catalog_origin on public.product_media;
create trigger product_media_bound_catalog_origin before insert on public.product_media
  for each row execute function private.enforce_bound_catalog_media_origin();
select pg_temp.expect_capability('catalogSchema',false,'trigger omits updates');
rollback to authentic_catalog;
alter table public.product_content_drafts disable trigger product_content_drafts_current_media;
select pg_temp.expect_capability('catalogSchema',false,'disabled draft validation');
rollback to authentic_catalog;
alter table public.product_media drop constraint product_media_core_routine_editorial_shape_check,
  add constraint product_media_core_routine_editorial_shape_check check (private.is_bound_catalog_product_media_url(url));
select pg_temp.expect_capability('catalogSchema',false,'editorial shape constraint lost its other checks');
rollback to authentic_catalog;
select pg_temp.expect_capability('catalogSchema',true,'restored authentic schema');

-- Synthetic signatures only. Every body fails if the observer invokes it.
create function public.enroll_product_waitlist(uuid,text,boolean,text,text,text) returns jsonb
  language plpgsql as $$begin raise exception 'waitlist RPC invoked'; end$$;
revoke all on function public.enroll_product_waitlist(uuid,text,boolean,text,text,text) from public;
grant execute on function public.enroll_product_waitlist(uuid,text,boolean,text,text,text) to service_role;
select pg_temp.expect_capability('waitlist',false,'obsolete six-argument RPC has a service grant');

create function public.enroll_product_waitlist(
  p_product_id uuid,p_normalized_email text,p_marketing_consent boolean,p_policy_version text,p_source text,p_abuse_key text,
  p_request_id uuid,p_confirmation_token text,p_marketing_template_contract jsonb)
  returns jsonb language plpgsql as $$begin raise exception 'waitlist RPC invoked'; end$$;
revoke all on function public.enroll_product_waitlist(uuid,text,boolean,text,text,text,uuid,text,jsonb) from public;
select pg_temp.expect_capability('waitlist',false,'current signature lacks service access');
grant execute on function public.enroll_product_waitlist(uuid,text,boolean,text,text,text,uuid,text,jsonb) to service_role;
select pg_temp.expect_capability('waitlist',true,'named current RPC with JSONB response and service access');
drop function public.enroll_product_waitlist(uuid,text,boolean,text,text,text,uuid,text,jsonb);
create function public.enroll_product_waitlist(
  p_product_id uuid,p_normalized_email text,p_marketing_consent boolean,p_policy_version text,p_source text,p_abuse_key text,
  p_request_id uuid,p_confirmation_token text,wrong_arg_name jsonb)
  returns jsonb language plpgsql as $$begin raise exception 'waitlist RPC invoked'; end$$;
revoke all on function public.enroll_product_waitlist(uuid,text,boolean,text,text,text,uuid,text,jsonb) from public;
grant execute on function public.enroll_product_waitlist(uuid,text,boolean,text,text,text,uuid,text,jsonb) to service_role;
select pg_temp.expect_capability('waitlist',false,'PostgREST cannot resolve these named arguments');
drop function public.enroll_product_waitlist(uuid,text,boolean,text,text,text,uuid,text,jsonb);
create function public.enroll_product_waitlist(
  p_product_id uuid,p_normalized_email text,p_marketing_consent boolean,p_policy_version text,p_source text,p_abuse_key text,
  p_request_id uuid,p_confirmation_token text,p_marketing_template_contract jsonb)
  returns integer language plpgsql as $$begin raise exception 'waitlist RPC invoked'; end$$;
revoke all on function public.enroll_product_waitlist(uuid,text,boolean,text,text,text,uuid,text,jsonb) from public;
grant execute on function public.enroll_product_waitlist(uuid,text,boolean,text,text,text,uuid,text,jsonb) to service_role;
select pg_temp.expect_capability('waitlist',false,'bad result type');

create schema support_production_private;
create table support_production_private.contract(singleton boolean primary key,admission_enabled boolean,worker_enabled boolean,
 full_media_qualified boolean,isolation_qualified boolean,operations_qualified boolean);
insert into support_production_private.contract values(true,false,true,false,false,false);
create table private.production_marketing_controls(singleton boolean primary key,enrollment_enabled boolean,dispatch_enabled boolean);
insert into private.production_marketing_controls values(true,false,false);
set local role service_role;
do $$ declare obs jsonb; begin
  obs := public.read_helix_release_observations();
  if obs->>'environment' is distinct from 'production' or obs->'support'->>'worker' is distinct from 'true'
     or obs->'marketing' is distinct from '{"enrollment":false,"dispatch":false}'::jsonb then
    raise exception 'Incorrect release capability observation';
  end if;
end $$;
reset role;
delete from support_production_private.contract;
do $$ begin
  begin perform public.read_helix_release_observations(); raise exception 'Missing contract accepted';
  exception when no_data_found then null; end;
end $$;
rollback;
