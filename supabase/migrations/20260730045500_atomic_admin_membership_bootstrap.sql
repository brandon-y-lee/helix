-- Keep explicit admin bootstrapping and its audit event in one transaction.

create or replace function public.bootstrap_catalog_admin_membership(
  p_user_id uuid,
  p_role text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.admin_memberships%rowtype;
  v_membership public.admin_memberships%rowtype;
  v_action text;
begin
  if p_role not in ('admin', 'catalog_publisher', 'catalog_editor') then
    raise exception 'invalid admin role'
      using errcode = '22023';
  end if;

  perform 1
  from auth.users
  where id = p_user_id
    and email is not null
    and email_confirmed_at is not null
  for update;

  if not found then
    raise exception 'verified admin user not found'
      using errcode = 'P0002';
  end if;

  select *
  into v_existing
  from public.admin_memberships
  where user_id = p_user_id
  for update;

  v_action := case
    when found then 'membership.updated'
    else 'membership.created'
  end;

  insert into public.admin_memberships (
    user_id,
    role,
    active,
    created_by
  )
  values (
    p_user_id,
    p_role,
    true,
    p_user_id
  )
  on conflict (user_id) do update
  set
    role = excluded.role,
    active = true
  returning * into v_membership;

  insert into public.catalog_editor_audit_log (
    action,
    actor_id,
    metadata
  )
  values (
    v_action,
    p_user_id,
    jsonb_build_object(
      'role', p_role,
      'previousRole', v_existing.role,
      'previousActive', v_existing.active
    )
  );

  return jsonb_build_object(
    'ok', true,
    'userId', v_membership.user_id,
    'role', v_membership.role,
    'action', case
      when v_action = 'membership.created' then 'created'
      else 'updated'
    end
  );
end;
$$;

revoke all on function public.bootstrap_catalog_admin_membership(uuid, text)
  from public, anon, authenticated;
grant execute on function public.bootstrap_catalog_admin_membership(uuid, text)
  to service_role;
