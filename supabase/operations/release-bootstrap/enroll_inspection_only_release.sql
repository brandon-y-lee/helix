-- Install once after enroll_deployment_authorization.sql as the same authenticated owner.
-- Existing release history was admitted under the original, fully observed procedure.
begin;
set local search_path = pg_catalog, pg_temp;

lock table helix_release_control.transitions in share row exclusive mode;
do $owner$
declare
  owner_id constant oid := current_user::regrole;
  controller constant oid := 'helix_release_controller'::regrole;
begin
  if current_user <> session_user
     or not exists (select from pg_class where oid='private.helix_environment'::regclass and relowner=owner_id and relrowsecurity)
     or not exists (select from private.helix_environment where singleton and
       (environment,project_ref)=('production','erasogmsqpgiirovubjh'))
     or not exists (select from pg_namespace where oid='helix_release_control'::regnamespace and nspowner=owner_id)
     or not exists (select from pg_class where oid='helix_release_control.transitions'::regclass
       and relkind='r' and relowner=owner_id and relrowsecurity)
     or exists (select from pg_trigger where tgrelid='helix_release_control.transitions'::regclass and not tgisinternal)
     or exists (select from pg_rewrite where ev_class='helix_release_control.transitions'::regclass)
     or not exists (select from pg_roles where oid=controller and rolcanlogin
       and not (rolsuper or rolcreaterole or rolcreatedb or rolreplication or rolbypassrls))
     or exists (select from pg_auth_members where member=controller or (roleid=controller and not (
       member=owner_id and grantor=10::oid and admin_option and not inherit_option and not set_option
       and exists (select from pg_roles creator where creator.oid=owner_id and creator.rolcreaterole and not creator.rolsuper))))
     or has_database_privilege(controller,current_database(),'CREATE')
     or (select count(*) from pg_proc where pronamespace='helix_release_control'::regnamespace)<>4
     or exists (select from (values
       ('helix_release_control.read_environment()'::regprocedure,'sql','s',
         '9d3e854491e082043f3c9a72ebf3a023b932bb09526515b688ef912f637410df'),
       ('helix_release_control.read_release_pair(text,text)'::regprocedure,'sql','s',
         '8e682fa62523ab4ce12ff3b1d0d6ee508a3c9560d95febc9946ed754d8439469'),
       ('helix_release_control.transition_helix_release_authorization(text,text,text,text,text,text)'::regprocedure,'plpgsql','v',
         '042c1c228f6c2f8df934fb77f1938248f24806d36eba64e685cf8f09e824b3fb'),
       ('helix_release_control.reserve_rollback_retry(text,text,text,text,text,bigint)'::regprocedure,'plpgsql','v',
         '0a03d84d9ceb7c29fd831dc097780aafe38c30be87ae22551445d02f810456be')
     ) expected(routine,language,volatility,digest) join pg_proc p on p.oid=expected.routine
       join pg_language l on l.oid=p.prolang
       where p.proowner<>owner_id or not p.prosecdef or not has_function_privilege(controller,p.oid,'EXECUTE')
         or p.prokind<>'f' or l.lanname<>expected.language or p.provolatile<>expected.volatility::"char"
         or p.proconfig is distinct from array['search_path=""']
         or encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')<>expected.digest) then
    raise exception 'The authenticated production owner and reviewed release registry are required';
  end if;
end;
$owner$;

-- candidate_id is immutable in the existing release registry. Retain the entire
-- tuple even when no migration runs or a later cancellation ends staging.
create table helix_release_control.release_admissions (
  candidate_id text primary key,
  candidate_sha text not null,
  previous_id text not null,
  previous_sha text not null,
  inspection_only boolean not null
);
alter table helix_release_control.release_admissions enable row level security;
revoke all on helix_release_control.release_admissions from public,anon,authenticated,service_role,helix_release_controller;
insert into helix_release_control.release_admissions (candidate_id,candidate_sha,previous_id,previous_sha,inspection_only)
  select candidate_id,candidate_sha,previous_id,previous_sha,false from helix_release_control.transitions;

create function helix_release_control.admit_release(
  p_action text,p_inspection_only boolean,p_project_id text,p_previous_id text,p_previous_sha text,p_candidate_id text,p_candidate_sha text
) returns boolean language plpgsql security definer set search_path = '' as $admission$
declare
  admission helix_release_control.release_admissions%rowtype;
  latest helix_release_control.transitions%rowtype;
  same_latest boolean;
begin
  if session_user<>'helix_release_controller' or current_setting('transaction_isolation')<>'read committed'
    or p_action is null or p_action not in ('verify','promote','cancel','rollback') or p_inspection_only is null
    or p_project_id is distinct from 'prj_N9nyPL9SixJHOROIovS8PDQ9aKny'
    or p_previous_id is null or p_previous_id !~ '^dpl_[A-Za-z0-9]{1,96}$'
    or p_candidate_id is null or p_candidate_id !~ '^dpl_[A-Za-z0-9]{1,96}$' or p_previous_id=p_candidate_id
    or p_previous_sha is null or p_previous_sha !~ '^[0-9a-f]{40}$'
    or p_candidate_sha is null or p_candidate_sha !~ '^[0-9a-f]{40}$'
    or not exists (select from private.helix_environment where singleton and
      (environment,project_ref)=('production','erasogmsqpgiirovubjh')) then
    raise exception 'Invalid release admission identity';
  end if;
  if p_inspection_only and (p_action not in ('verify','cancel')
    or (p_previous_id,p_previous_sha)<>('dpl_91HXTZGJXtUp9P4Us9edBvC73CmC','4d45e0d3e14271513fb887592faadf6c2c24fede')) then
    raise exception 'Inspection-only admission requires the original Catalog predecessor and a staging operation';
  end if;

  -- This is the same serialization boundary that protects all registry transitions.
  lock table helix_release_control.transitions in share row exclusive mode;
  select * into admission from helix_release_control.release_admissions where candidate_id=p_candidate_id;
  if admission.candidate_id is not null and
    (admission.previous_id,admission.previous_sha,admission.candidate_sha,admission.inspection_only)
       is distinct from (p_previous_id,p_previous_sha,p_candidate_sha,p_inspection_only) then
    raise exception 'The candidate already has a different release admission';
  end if;
  if exists (select from helix_release_control.release_admissions where candidate_id=p_previous_id and inspection_only) then
    raise exception 'An inspection-only candidate cannot become the serving predecessor';
  end if;
  select * into latest from helix_release_control.transitions order by sequence_id desc limit 1;
  same_latest := (latest.previous_id,latest.previous_sha,latest.candidate_id,latest.candidate_sha)
    is not distinct from (p_previous_id,p_previous_sha,p_candidate_id,p_candidate_sha);

  if p_action in ('cancel','rollback') then
    if admission.candidate_id is null or not same_latest or (p_action='cancel' and latest.phase not in ('prepared','cancelled'))
      or (p_action='rollback' and latest.phase not in ('promoting','promoted','rolling_back','rolled_back','cancelled')) then
      raise exception 'Recovery requires the exact recorded release and a compatible phase';
    end if;
  elsif same_latest then
    if latest.phase not in ('prepared','promoting','promoted') then
      raise exception 'A terminal or rolling-back release cannot be prepared again';
    end if;
  else
    if latest.phase in ('prepared','promoting','rolling_back') or exists (
      select from helix_release_control.transitions where candidate_id=p_candidate_id or previous_id=p_candidate_id
    ) then raise exception 'The release is unresolved or the candidate has already been used'; end if;
    if latest.sequence_id is not null and (
      case when latest.phase='promoted' then (latest.candidate_id,latest.candidate_sha)<>(p_previous_id,p_previous_sha)
        else (latest.previous_id,latest.previous_sha)<>(p_previous_id,p_previous_sha) end
    ) then raise exception 'The serving predecessor does not match the release registry'; end if;
  end if;
  if admission.candidate_id is null then
    insert into helix_release_control.release_admissions (candidate_id,candidate_sha,previous_id,previous_sha,inspection_only)
      values (p_candidate_id,p_candidate_sha,p_previous_id,p_previous_sha,p_inspection_only);
  end if;
  return true;
end;
$admission$;

-- Both original transition functions write this table under the same lock.
-- Enforce the hold at the write even when an old controller calls them directly.
create function helix_release_control.enforce_release_admission()
returns trigger language plpgsql security invoker set search_path = '' as $guard$
declare
  held boolean;
begin
  select inspection_only into held from helix_release_control.release_admissions
    where (candidate_id,candidate_sha,previous_id,previous_sha)=
      (new.candidate_id,new.candidate_sha,new.previous_id,new.previous_sha);
  if held is null then raise exception 'Missing admission for the exact release pair'; end if;
  -- A different pair could have been admitted before its alleged predecessor
  -- became inspection-only. Recheck that identity at the authorization write.
  if exists (select from helix_release_control.release_admissions
    where inspection_only and candidate_id in (new.previous_id,new.retained_id)) then
    raise exception 'An inspection-only candidate cannot become a serving or retained build';
  end if;
  if held and new.phase not in ('prepared','cancelled') then
    raise exception 'Inspection-only release cannot change production routing';
  end if;
  return new;
end;
$guard$;
revoke all on function helix_release_control.enforce_release_admission(),
  helix_release_control.admit_release(text,boolean,text,text,text,text,text)
  from public,anon,authenticated,service_role,helix_release_controller;
grant execute on function helix_release_control.admit_release(text,boolean,text,text,text,text,text)
  to helix_release_controller;
create trigger enforce_release_admission before insert or update on helix_release_control.transitions
  for each row execute function helix_release_control.enforce_release_admission();

do $acl$
begin
  if exists (select from pg_class c cross join lateral aclexplode(c.relacl) a
    where c.relnamespace='helix_release_control'::regnamespace and a.grantee<>c.relowner)
    or exists (select from pg_class c join pg_attribute col on col.attrelid=c.oid
      cross join lateral aclexplode(col.attacl) a
      where c.relnamespace='helix_release_control'::regnamespace and a.grantee<>c.relowner)
    or exists (select from pg_namespace n cross join lateral aclexplode(n.nspacl) a
      where n.oid='helix_release_control'::regnamespace and a.grantee<>n.nspowner and
        (a.grantee<>'helix_release_controller'::regrole or a.privilege_type<>'USAGE' or a.is_grantable))
    or exists (select from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
      where p.pronamespace='helix_release_control'::regnamespace and a.grantee<>p.proowner and
        (a.grantee<>'helix_release_controller'::regrole or a.is_grantable or a.grantor<>p.proowner
         or p.oid='helix_release_control.enforce_release_admission()'::regprocedure)) then
    raise exception 'Unexpected release admission grants';
  end if;
end;
$acl$;
commit;
