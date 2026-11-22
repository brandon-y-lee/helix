-- Run as the original database owner, in a transaction whose
-- helix.newsletter_project_ref setting names the independently verified target.
do $target$
begin
  if current_user <> session_user or not exists (
    select from private.helix_environment
    where singleton and project_ref = current_setting('helix.newsletter_project_ref', true)
      and (environment, project_ref) in (
        ('development', 'zyfkunnpnlmgvrojmrbg'), ('production', 'erasogmsqpgiirovubjh')
      )
  ) or not exists (
    select from pg_catalog.pg_class
    where oid = 'private.helix_environment'::regclass and relowner = current_user::regrole
  ) then
    raise exception 'The verified Helix environment owner is required';
  end if;
end;
$target$;

create table private.newsletter_signups (
  email text primary key check (length(email) <= 254 and email = lower(btrim(email))),
  signed_up_at timestamptz not null default now()
);

create table private.newsletter_signup_limits (
  requester_key text primary key,
  window_start timestamptz not null,
  request_count integer not null check (request_count between 1 and 600)
);

alter table private.newsletter_signups enable row level security;
alter table private.newsletter_signups force row level security;
alter table private.newsletter_signup_limits enable row level security;
alter table private.newsletter_signup_limits force row level security;
revoke all on private.newsletter_signups, private.newsletter_signup_limits
  from public, anon, authenticated, service_role;

create function public.sign_up_for_newsletter(p_email text, p_requester_hash text)
returns text language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $signup$
declare
  current_window constant timestamptz := date_bin(interval '10 minutes', clock_timestamp(), 'epoch'::timestamptz);
  updated_count integer;
begin
  if p_email is null or length(p_email) > 254 or p_email <> lower(btrim(p_email)) or
    p_email !~ '^[a-z0-9.!#$%&''*+/=?^_`{|}~-]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)+$' or
    p_requester_hash is null or p_requester_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid newsletter request' using errcode = '22023';
  end if;

  -- Reserve both budgets together. The total budget limits the number of
  -- requester buckets an attacker can create by rotating source addresses.
  begin
    insert into private.newsletter_signup_limits as limits (requester_key, window_start, request_count)
      values ('total', current_window, 1), (p_requester_hash, current_window, 1)
      on conflict (requester_key) do update
      set window_start = excluded.window_start,
        request_count = case when limits.window_start < excluded.window_start
          then 1 else limits.request_count + 1 end
      where limits.window_start < excluded.window_start or (
        limits.window_start = excluded.window_start and
        limits.request_count < case when limits.requester_key = 'total' then 600 else 10 end
      );
    get diagnostics updated_count = row_count;
    if updated_count <> 2 then
      raise sqlstate 'P1001';
    end if;
  exception when sqlstate 'P1001' then
    return 'limited';
  end;

  delete from private.newsletter_signup_limits where window_start < current_window;
  insert into private.newsletter_signups (email) values (p_email) on conflict (email) do nothing;
  return case when found then 'added' else 'already_added' end;
end;
$signup$;

revoke all on function public.sign_up_for_newsletter(text,text) from public, anon, authenticated, service_role;
grant execute on function public.sign_up_for_newsletter(text,text) to service_role;
notify pgrst, 'reload schema';
