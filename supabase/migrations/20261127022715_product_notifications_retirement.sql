DO $migration$
begin
  if pg_catalog.to_regclass('private.product_notification_transitions') is null then
    if not (pg_catalog.to_regprocedure('public.enroll_product_waitlist(uuid,text,boolean,text,text,text,uuid,text,jsonb)') is null
    and pg_catalog.to_regprocedure('public.configure_product_notification_email(boolean,jsonb)') is null
    and pg_catalog.to_regprocedure('public.materialize_product_notifications(integer)') is null
    and pg_catalog.to_regprocedure('public.request_product_notification_recovery(text,text,jsonb,boolean,uuid)') is null
    and pg_catalog.to_regprocedure('public.cancel_product_notification(text)') is null
    and pg_catalog.to_regprocedure('public.refresh_product_notification_email(uuid,uuid)') is null) then
      raise exception 'Partial Product notification contract';
    end if;
    if pg_catalog.to_regprocedure('public.enroll_product_waitlist(uuid,text,boolean,text,text,text)') is null then
      return;
    end if;
  end if;

  if current_user <> session_user or not exists (
    select from pg_catalog.pg_proc p
    where p.oid = pg_catalog.to_regprocedure('private.retire_helix_product_notifications()')
      and p.proowner = (select relowner from pg_catalog.pg_class
        where oid = pg_catalog.to_regclass('private.helix_environment'))
      and p.proowner <> session_user::pg_catalog.regrole
      and p.prosecdef and p.prolang = (select oid from pg_catalog.pg_language where lanname = 'plpgsql')
      and p.proconfig = array['search_path=pg_catalog, pg_temp','lock_timeout=3s']
      and pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p.prosrc,'UTF8')),'hex') = '1c702b8f3afb64c2187afb8006b5bb0fcb9752396f40acd75dc03229f4ebb7e1'
      and exists (select from pg_catalog.aclexplode(p.proacl) a
        where a.grantee = session_user::pg_catalog.regrole and a.grantor = p.proowner
          and a.privilege_type = 'EXECUTE' and not a.is_grantable)
      and not exists (select from pg_catalog.aclexplode(p.proacl) a
        where a.grantee <> p.proowner
          and (a.grantee <> session_user::pg_catalog.regrole or a.grantor <> p.proowner or a.is_grantable))
  ) then
    raise exception 'Install the reviewed Product retirement capability for the restricted release writer';
  end if;
  perform private.retire_helix_product_notifications();
end;
$migration$;
