set lock_timeout = '10s';
set statement_timeout = '120s';

do $migration$
declare
  change record;
  v_definition text;
begin
  for change in
    select *
    from (
      values
        (
          'public.publish_catalog_product_draft(uuid,bigint,uuid,text,jsonb)'::regprocedure,
          'mei-pelle-product-family:',
          'helix-product-family:'
        ),
        (
          'public.publish_catalog_product_draft_v4(uuid,bigint,uuid,text,jsonb)'::regprocedure,
          'mei-pelle-product-family:',
          'helix-product-family:'
        ),
        (
          'public.publish_catalog_product_draft_without_family_lock_order(uuid,bigint,uuid,text,jsonb)'::regprocedure,
          'mei_pelle.catalog_actor_id',
          'helix.catalog_actor_id'
        ),
        (
          'public.replace_catalog_product_slug_v1(uuid,uuid,uuid)'::regprocedure,
          'mei-pelle-product-slug-routes',
          'helix-product-slug-routes'
        )
    ) as changes(function_identity, previous_value, current_value)
  loop
    select pg_catalog.pg_get_functiondef(change.function_identity::oid)
    into strict v_definition;

    if pg_catalog.strpos(v_definition, change.previous_value) = 0 then
      if pg_catalog.strpos(v_definition, change.current_value) = 0 then
        raise exception 'Expected identifier is absent from %', change.function_identity;
      end if;
      continue;
    end if;

    execute pg_catalog.replace(
      v_definition,
      change.previous_value,
      change.current_value
    );

    select pg_catalog.pg_get_functiondef(change.function_identity::oid)
    into strict v_definition;
    if pg_catalog.strpos(v_definition, change.previous_value) > 0
       or pg_catalog.strpos(v_definition, change.current_value) = 0
    then
      raise exception 'Identifier replacement failed for %', change.function_identity;
    end if;
  end loop;
end;
$migration$;

do $trustpilot_default$
declare
  v_default text;
begin
  select pg_catalog.pg_get_expr(default_record.adbin, default_record.adrelid)
  into strict v_default
  from pg_catalog.pg_attrdef as default_record
  join pg_catalog.pg_attribute as attribute
    on attribute.attrelid = default_record.adrelid
   and attribute.attnum = default_record.adnum
  where default_record.adrelid =
      'public.trustpilot_invitation_attempts'::regclass
    and attribute.attname = 'blocked_reason';

  if pg_catalog.strpos(
    v_default,
    'Mei Pelle does not incentivize or send Trustpilot review invitations from rewards flows.'
  ) > 0 then
    alter table public.trustpilot_invitation_attempts
      alter column blocked_reason set default
        'helix does not incentivize or send Trustpilot review invitations from rewards flows.';
  elsif pg_catalog.strpos(
    v_default,
    'helix does not incentivize or send Trustpilot review invitations from rewards flows.'
  ) = 0 then
    raise exception 'Unexpected Trustpilot invitation default';
  end if;
end;
$trustpilot_default$;

comment on table public.admin_memberships is
  'Server-resolved helix Admin role memberships. No browser access.';
