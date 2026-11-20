-- One-time prerequisite, installed by the verified database owner. An empty
-- table deliberately identifies no target. Populate the row only after checking
-- the provider connection independently. Never derive it from an app request.
begin;
create table private.helix_environment (
  singleton boolean primary key default true check (singleton),
  environment text not null,
  project_ref text not null,
  check ((environment, project_ref) in (
    ('development','zyfkunnpnlmgvrojmrbg'),
    ('production','erasogmsqpgiirovubjh')
  ))
);
alter table private.helix_environment enable row level security;
revoke all on private.helix_environment from public, anon, authenticated, service_role;

create function private.keep_helix_environment_identity()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Helix environment marker is immutable' using errcode = '23514';
end;
$$;
revoke all on function private.keep_helix_environment_identity() from public, anon, authenticated, service_role;
create trigger keep_helix_environment_identity before update or delete or truncate
on private.helix_environment for each statement execute function private.keep_helix_environment_identity();

create function private.read_helix_environment()
returns table(environment text, project_ref text)
language sql stable security definer set search_path = '' as $$
  select e.environment, e.project_ref from private.helix_environment e where e.singleton;
$$;
revoke all on function private.read_helix_environment() from public, anon, authenticated, service_role;
grant execute on function private.read_helix_environment() to service_role;

-- The API wrapper adds no table rights. Its only caller has USAGE on private
-- from the reviewed Checkout migrations; no schema grant is widened here.
create function public.read_helix_environment()
returns table(environment text, project_ref text)
language sql stable security invoker set search_path = '' as $$
  select e.environment, e.project_ref from private.read_helix_environment() e;
$$;
revoke all on function public.read_helix_environment() from public, anon, authenticated, service_role;
grant execute on function public.read_helix_environment() to service_role;
commit;
