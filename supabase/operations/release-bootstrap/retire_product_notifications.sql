create function private.retire_helix_product_notifications()
returns void language plpgsql security definer
set search_path = pg_catalog, pg_temp
set lock_timeout = '3s'
as $capability$
declare
  claim_definition text;
  retry_definition text;
  claim_boundary constant text := 'and content_deleted_at is null and provider_email_id is null and attempt_count<5';
  retry_boundary constant text := 'where id=p_id and updated_at=p_expected_updated_at and state in (';
  fence constant text := 'and purpose not in (''product_availability'', ''product_waitlist_recovery'')';
begin
  if pg_catalog.to_regprocedure('public.enroll_product_waitlist(uuid,text,boolean,text,text,text)') is not null then
    revoke execute on function public.enroll_product_waitlist(uuid,text,boolean,text,text,text)
      from public, anon, authenticated, service_role;
  end if;

  if pg_catalog.to_regclass('private.product_notification_transitions') is not null then
    claim_definition := pg_catalog.pg_get_functiondef('public.claim_email_intents(text,uuid,integer)'::regprocedure);
    retry_definition := pg_catalog.pg_get_functiondef('public.retry_email_delivery(uuid,timestamptz)'::regprocedure);

    if length(claim_definition) - length(replace(claim_definition, claim_boundary, '')) <> length(claim_boundary)
      or length(retry_definition) - length(replace(retry_definition, retry_boundary, '')) <> length(retry_boundary) then
      raise exception 'Email work selection changed; Product notification retirement requires review';
    end if;
    execute replace(claim_definition, claim_boundary, claim_boundary || E'\n      ' || fence);
    execute replace(retry_definition, retry_boundary,
      'where id=p_id and updated_at=p_expected_updated_at ' || fence || ' and state in (');

    alter table private.email_controls
      add constraint retired_product_notification_controls
      check (purpose not in ('product_availability', 'product_waitlist_recovery') or not enabled) not valid;
    update private.email_controls
      set enabled = false, updated_at = pg_catalog.clock_timestamp()
      where purpose in ('product_availability', 'product_waitlist_recovery') and enabled;
    alter table private.email_controls validate constraint retired_product_notification_controls;

    revoke execute on function
      public.enroll_product_waitlist(uuid,text,boolean,text,text,text,uuid,text,jsonb),
      public.configure_product_notification_email(boolean,jsonb),
      public.materialize_product_notifications(integer),
      public.request_product_notification_recovery(text,text,jsonb,boolean,uuid),
      public.cancel_product_notification(text),
      public.refresh_product_notification_email(uuid,uuid)
    from public, anon, authenticated, service_role;

    -- Catalog publication still owns its existing validation and lock order.
    -- Its retired observer no longer writes notification facts.
    create or replace function private.record_product_notification_transition(
      p_product_id uuid, p_was_purchasable boolean, p_observed_at timestamptz, p_revision_id uuid
    ) returns void language plpgsql security definer set search_path = '' as $observer$
    begin
      return;
    end;
    $observer$;
  end if;

  execute pg_catalog.format('revoke execute on function private.retire_helix_product_notifications() from %I', session_user);
end;
$capability$;
