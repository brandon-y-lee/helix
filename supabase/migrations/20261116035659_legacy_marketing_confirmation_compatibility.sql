-- Source-only compatibility for the already deployed welcome schema. This does
-- not install or enable lifecycle/review features, or alter an existing scoped
-- implementation. Future lifecycle catch-up replaces this shim explicitly.
do $migration$
begin
  if pg_catalog.to_regprocedure('public.confirm_marketing_subscription_scoped(text,text,text)') is null then
    if pg_catalog.to_regprocedure('public.confirm_marketing_subscription(text,text)') is null
      or pg_catalog.to_regclass('private.marketing_confirmation_tokens') is null
      or pg_catalog.to_regclass('private.marketing_generations') is null then
      raise exception 'Legacy marketing confirmation prerequisites are missing';
    end if;
    execute $definition$
      create function public.confirm_marketing_subscription_scoped(
        p_confirmation_token text, p_preference_token text, p_scope text
      ) returns jsonb language plpgsql security invoker set search_path='' as $body$
      declare version text;
      begin
        if p_scope is distinct from 'welcome'
          or p_confirmation_token is null or p_confirmation_token !~ '^[A-Za-z0-9_-]{43,128}$'
          or p_preference_token is null or p_preference_token !~ '^[A-Za-z0-9_-]{43,128}$' then
          return '{"status":"invalid"}'::jsonb;
        end if;
        select g.template_contract->>'version' into version
          from private.marketing_confirmation_tokens t
          join private.marketing_generations g
            on g.subscriber_id=t.subscriber_id and g.generation=t.generation
          where t.token_hash=pg_catalog.encode(extensions.digest(p_confirmation_token,'sha256'),'hex');
        if version is distinct from 'welcome_v1' then return '{"status":"invalid"}'::jsonb; end if;
        -- The existing boundary owns expiry, address/subscriber locks, current
        -- generation, replay safety, consent evidence and restricted outbox work.
        return public.confirm_marketing_subscription(p_confirmation_token,p_preference_token);
      end $body$;
    $definition$;
    revoke all on function public.confirm_marketing_subscription_scoped(text,text,text)
      from public,anon,authenticated;
    grant execute on function public.confirm_marketing_subscription_scoped(text,text,text) to service_role;
  end if;
end $migration$;
