-- One-time enrollment by the independent production database owner. The
-- protected release login is separately provisioned. Installation authorizes
-- zero builds. Run only after the T2 environment marker has been verified.
begin;
set local search_path = pg_catalog, pg_temp;
do $enrollment$
declare
  writer oid;
  bootstrap_superuser constant oid := 10; -- PostgreSQL BOOTSTRAP_SUPERUSERID
begin
  if current_user <> session_user
     or (select relowner from pg_class where oid='private.helix_environment'::regclass) <> current_user::regrole
     or not exists (select from private.helix_environment
       where singleton and environment='production' and project_ref='erasogmsqpgiirovubjh') then
    raise exception 'The independent owner and verified production environment marker are required';
  end if;
  select oid into writer from pg_roles where rolname='helix_release_controller' and rolcanlogin
    and oid <> current_user::regrole and not rolsuper and not rolbypassrls and not rolcreaterole
    and not rolcreatedb and not rolreplication;
  -- PostgreSQL 17 grants a nonsuperuser creator ADMIN on its new login. Only
  -- the bootstrap-issued creator grant to the authenticated owner is expected.
  if writer is null or exists (
       select from pg_auth_members m where m.member=writer
         or (m.roleid=writer and not (
           m.member=current_user::regrole and m.grantor=bootstrap_superuser
           and m.admin_option and not m.inherit_option and not m.set_option
           and exists (select from pg_roles creator where creator.oid=m.member
             and creator.rolcreaterole and not creator.rolsuper)
         ))
     )
     or has_database_privilege(writer,current_database(),'CREATE')
     or exists (select from pg_namespace n where n.nspname in ('public','private','supabase_migrations')
       and has_schema_privilege(writer,n.oid,'CREATE'))
     or exists (select from pg_class c join pg_namespace n on n.oid=c.relnamespace
       where n.nspname in ('public','private','supabase_migrations') and c.relkind in ('r','p','v','m','f')
         and (has_table_privilege(writer,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER')
           or has_any_column_privilege(writer,c.oid,'INSERT,UPDATE'))) then
    raise exception 'A restricted independent release login with only the expected privileges and memberships is required';
  end if;
end;
$enrollment$;

-- The controller gains no access to the application's private schema. The
-- public runtime credential can ask only whether an exact tuple is authorized.
create schema helix_release_control;
revoke all on schema helix_release_control from public, anon, authenticated, service_role, helix_release_controller;
grant usage on schema helix_release_control to helix_release_controller;
create table helix_release_control.transitions (
  sequence_id bigint generated always as identity primary key,
  previous_id text not null,
  previous_sha text not null,
  candidate_id text not null unique,
  candidate_sha text not null,
  retained_id text,
  retained_sha text,
  last_failed_rollback_request_at bigint,
  phase text not null check (phase in ('prepared','promoting','promoted','rolling_back','rolled_back','cancelled')),
  check ((retained_id is null) = (retained_sha is null))
);
alter table helix_release_control.transitions enable row level security;
revoke all on helix_release_control.transitions from public, anon, authenticated, service_role, helix_release_controller;
revoke all on all sequences in schema helix_release_control from public, anon, authenticated, service_role, helix_release_controller;

create function helix_release_control.read_environment()
returns table(environment text, project_ref text)
language sql stable security definer set search_path = '' as $$
  select e.environment,e.project_ref from private.helix_environment e where e.singleton;
$$;

-- Rollback and cancellation recover the previous build from the controller's
-- latest record. Filtering after LIMIT prevents selection of a superseded pair.
create function helix_release_control.read_release_pair(p_candidate_id text,p_candidate_sha text)
returns table(previous_id text,previous_sha text,candidate_id text,candidate_sha text,phase text)
language sql stable security definer set search_path = '' as $$
  select s.previous_id,s.previous_sha,s.candidate_id,s.candidate_sha,s.phase
  from (select * from helix_release_control.transitions order by sequence_id desc limit 1) s
  where session_user='helix_release_controller' and (p_candidate_id is not null or p_candidate_sha is not null)
    and (p_candidate_id is null or s.candidate_id=p_candidate_id)
    and (p_candidate_sha is null or s.candidate_sha=p_candidate_sha);
$$;

create function private.read_helix_release_authorization(p_project_id text,p_deployment_id text,p_git_sha text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select from (select * from helix_release_control.transitions order by sequence_id desc limit 1) s
    where p_project_id='prj_N9nyPL9SixJHOROIovS8PDQ9aKny'
      and exists (select from private.helix_environment where singleton
        and environment='production' and project_ref='erasogmsqpgiirovubjh')
      and ((p_deployment_id,p_git_sha)=(s.previous_id,s.previous_sha)
        or (s.phase not in ('rolled_back','cancelled') and (p_deployment_id,p_git_sha)=(s.candidate_id,s.candidate_sha))
        or (s.phase <> 'promoted' and (p_deployment_id,p_git_sha)=(s.retained_id,s.retained_sha)))
  );
$$;
create function public.read_helix_release_authorization(p_project_id text,p_deployment_id text,p_git_sha text)
returns boolean language sql stable security invoker set search_path = ''
-- Resolve the narrow helper at installation. anon needs EXECUTE on it but no
-- USAGE on private, and callers cannot supply a relation, routine or SQL text.
return private.read_helix_release_authorization(p_project_id,p_deployment_id,p_git_sha);

-- The controller independently verifies the provider's aliases, Git source and
-- database marker before calling. An action that can cause a provider POST is
-- reserved durably only once. Retries can observe and reconcile the same pair;
-- a timeout never grants permission to submit another provider mutation.
create function helix_release_control.transition_helix_release_authorization(
  p_action text,p_project_id text,p_previous_id text,p_previous_sha text,p_candidate_id text,p_candidate_sha text
) returns boolean language plpgsql security definer set search_path = '' as $$
declare
  prior helix_release_control.transitions%rowtype;
  same_pair boolean;
  retained_id text;
  retained_sha text;
  next_phase text;
begin
  if session_user <> 'helix_release_controller' or current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'Use the direct protected release login and read-committed transaction isolation';
  end if;
  if p_project_id is distinct from 'prj_N9nyPL9SixJHOROIovS8PDQ9aKny'
      or p_previous_id is null or p_previous_id !~ '^dpl_[A-Za-z0-9]{1,96}$'
      or p_candidate_id is null or p_candidate_id !~ '^dpl_[A-Za-z0-9]{1,96}$'
      or p_previous_sha is null or p_previous_sha !~ '^[0-9a-f]{40}$'
      or p_candidate_sha is null or p_candidate_sha !~ '^[0-9a-f]{40}$'
      or p_candidate_id=p_previous_id or not exists (select from private.helix_environment
        where singleton and environment='production' and project_ref='erasogmsqpgiirovubjh') then
    raise exception 'Invalid release identity';
  end if;
  -- Every release to this project shares one state machine, including the
  -- first enrollment when the table is empty. Runtime reads remain available.
  lock table helix_release_control.transitions in share row exclusive mode;
  select * into prior from helix_release_control.transitions order by sequence_id desc limit 1;
  same_pair := (p_previous_id,p_previous_sha,p_candidate_id,p_candidate_sha)
    = (prior.previous_id,prior.previous_sha,prior.candidate_id,prior.candidate_sha);
  if p_action='prepare' then
    if same_pair then
      if prior.phase in ('prepared','promoting','promoted') then return true; end if;
      raise exception 'Cannot rearm a terminal or rolling-back release';
    end if;
    if prior.phase in ('prepared','promoting','rolling_back') then
      raise exception 'Unresolved release operation';
    end if;
    if prior.phase='promoted' then
      if (p_previous_id,p_previous_sha) <> (prior.candidate_id,prior.candidate_sha) then
        raise exception 'Expected serving deployment changed';
      end if;
      retained_id := prior.previous_id;
      retained_sha := prior.previous_sha;
    elsif prior.sequence_id is not null then
      if (p_previous_id,p_previous_sha) <> (prior.previous_id,prior.previous_sha) then
        raise exception 'Expected serving deployment changed';
      end if;
      retained_id := prior.retained_id;
      retained_sha := prior.retained_sha;
    end if;
    if exists (select from helix_release_control.transitions r
               where r.candidate_id=p_candidate_id or r.previous_id=p_candidate_id) then
      raise exception 'A previously seen deployment cannot be reused as a new candidate';
    end if;
    insert into helix_release_control.transitions
      (previous_id,previous_sha,candidate_id,candidate_sha,retained_id,retained_sha,phase)
      values (p_previous_id,p_previous_sha,p_candidate_id,p_candidate_sha,retained_id,retained_sha,'prepared');
    return true;
  end if;
  if same_pair is not true then raise exception 'Release identity does not match the latest pair'; end if;
  case p_action
    when 'start_promote' then
      if prior.phase in ('promoting','promoted','rolling_back','rolled_back') then return false; end if;
      if prior.phase='prepared' then next_phase := 'promoting'; end if;
    when 'promoted' then
      if prior.phase in ('promoted','rolling_back') then return true; end if;
      if prior.phase='promoting' then next_phase := 'promoted'; end if;
    when 'start_rollback' then
      if prior.phase in ('rolling_back','rolled_back') then return false; end if;
      if prior.phase in ('promoting','promoted') then next_phase := 'rolling_back'; end if;
    when 'rolled_back' then
      if prior.phase='rolled_back' then return true; end if;
      if prior.phase='rolling_back' then next_phase := 'rolled_back'; end if;
    when 'cancel' then
      if prior.phase='cancelled' then return true; end if;
      if prior.phase='prepared' then next_phase := 'cancelled'; end if;
    when 'failed_promotion' then
      -- The protected caller checked a definitive failed/skipped provider job
      -- for this pair and re-read every alias on the prior deployment.
      if prior.phase='cancelled' then return true; end if;
      if prior.phase='promoting' then next_phase := 'cancelled'; end if;
    else raise exception 'Unknown release transition';
  end case;
  if next_phase is null then raise exception 'Release phase does not permit this transition'; end if;
  update helix_release_control.transitions set phase=next_phase where sequence_id=prior.sequence_id;
  return true;
end;
$$;

-- Called only after the controller reads a terminal failed rollback job with
-- these exact identities from Vercel. A timeout or an unknown outcome cannot
-- supply that evidence. Concurrent controllers can consume each receipt once.
create function helix_release_control.reserve_rollback_retry(
  p_project_id text,p_previous_id text,p_previous_sha text,p_candidate_id text,p_candidate_sha text,p_failed_request_at bigint
) returns boolean language plpgsql security definer set search_path = '' as $$
declare
  prior helix_release_control.transitions%rowtype;
begin
  if session_user <> 'helix_release_controller' or current_setting('transaction_isolation') <> 'read committed'
     or p_project_id is distinct from 'prj_N9nyPL9SixJHOROIovS8PDQ9aKny'
     or p_failed_request_at is null or p_failed_request_at not between 1 and 9007199254740991
     or not exists (select from private.helix_environment where singleton and environment='production'
       and project_ref='erasogmsqpgiirovubjh') then
    raise exception 'Invalid rollback retry identity';
  end if;
  lock table helix_release_control.transitions in share row exclusive mode;
  select * into prior from helix_release_control.transitions order by sequence_id desc limit 1;
  if prior.phase is distinct from 'rolling_back'
     or (prior.previous_id,prior.previous_sha,prior.candidate_id,prior.candidate_sha)
        is distinct from (p_previous_id,p_previous_sha,p_candidate_id,p_candidate_sha) then
    raise exception 'Expected the exact latest rolling-back pair';
  end if;
  if p_failed_request_at <= prior.last_failed_rollback_request_at then return false; end if;
  update helix_release_control.transitions set last_failed_rollback_request_at=p_failed_request_at
    where sequence_id=prior.sequence_id;
  return true;
end;
$$;

revoke all on all functions in schema helix_release_control from public, anon, authenticated, service_role, helix_release_controller;
grant execute on function helix_release_control.read_environment(),
  helix_release_control.read_release_pair(text,text),
  helix_release_control.reserve_rollback_retry(text,text,text,text,text,bigint),
  helix_release_control.transition_helix_release_authorization(text,text,text,text,text,text) to helix_release_controller;
revoke all on function private.read_helix_release_authorization(text,text,text),
  public.read_helix_release_authorization(text,text,text) from public, anon, authenticated, service_role, helix_release_controller;
grant execute on function private.read_helix_release_authorization(text,text,text),
  public.read_helix_release_authorization(text,text,text) to anon, service_role;

-- Ambient ALTER DEFAULT PRIVILEGES may grant roles beyond the Supabase
-- defaults. Roll enrollment back rather than expose these new capabilities.
do $acl$
begin
  if exists (
    select from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
    where (p.pronamespace='helix_release_control'::regnamespace or p.oid in
      ('public.read_helix_release_authorization(text,text,text)'::regprocedure,
       'private.read_helix_release_authorization(text,text,text)'::regprocedure))
    and a.grantee <> p.proowner and (a.is_grantable or case
      when p.pronamespace='helix_release_control'::regnamespace then a.grantee <> 'helix_release_controller'::regrole
      else a.grantee not in ('service_role'::regrole,'anon'::regrole) end)
  ) or exists (
    select from pg_namespace n cross join lateral aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a
    where n.oid='helix_release_control'::regnamespace and a.grantee <> n.nspowner
      and (a.grantee <> 'helix_release_controller'::regrole or a.privilege_type <> 'USAGE' or a.is_grantable)
  ) or exists (
    select from pg_class c cross join lateral aclexplode(c.relacl) a
    where c.relnamespace='helix_release_control'::regnamespace and a.grantee <> c.relowner
  ) then raise exception 'Unexpected release authorization grants'; end if;
end;
$acl$;
commit;
