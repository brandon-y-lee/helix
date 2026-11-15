-- Optional versioned cross-Spec contract. No producer objects, writes or activation.
create function private.public_review_offer_notice(p_user_id uuid,p_product_id uuid,p_environment text)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare contract regprocedure; result boolean;
begin
 contract:=pg_catalog.to_regprocedure('public.has_review_winback_offer_v1(uuid,uuid,text)');
 if contract is null then
   if pg_catalog.to_regclass('private.lifecycle_offers') is null
      and not exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='has_review_winback_offer_v1')
   then return false; end if;
   raise exception 'Review disclosure unavailable' using errcode='55000';
 end if;
 if not exists(select 1 from pg_catalog.pg_proc where oid=contract and prorettype='pg_catalog.bool'::regtype and not proretset and prokind='f') then
   raise exception 'Review disclosure unavailable' using errcode='55000';
 end if;
 begin
   execute 'select public.has_review_winback_offer_v1($1,$2,$3)' into result using p_user_id,p_product_id,p_environment;
 exception when others then raise exception 'Review disclosure unavailable' using errcode='55000'; end;
 if result is null then raise exception 'Review disclosure unavailable' using errcode='55000'; end if;
 return result;
end $$;
revoke all on function private.public_review_offer_notice(uuid,uuid,text) from public,anon,authenticated,service_role;

create or replace function public.read_public_product_reviews(p_slug text,p_after uuid default null,p_limit integer default 5)
returns jsonb language sql stable security definer set search_path='' as $$
 with visible as (
 select r.id,v.display_name,v.rating,v.title,v.body,v.created_at,case when private.public_review_offer_notice(r.user_id,r.product_id,r.environment) then true else r.offer_notice end as offer_notice from private.product_reviews r
 join private.product_review_revisions v on v.review_id=r.id and v.revision=r.published_revision
 join public.products p on p.id=r.product_id
 where p.slug=p_slug and r.environment='live' and r.status<>'withdrawn'
 and exists(select 1 from public.order_items oi join public.orders o on o.id=oi.order_id where oi.id=r.order_item_id and oi.product_id=r.product_id and o.user_id=r.user_id and o.checkout_environment::text='live' and exists(select 1 from private.checkout_verified_payments vp where vp.order_id=o.id and vp.session_id=o.stripe_checkout_session_id))
 and (select publication_enabled from private.product_review_control where singleton)
 ), page as (select * from visible where p_after is null or id>p_after order by id limit greatest(1,least(coalesce(p_limit,5),20)))
 select jsonb_build_object('count',(select count(*) from visible),'average',coalesce((select avg(rating) from visible),0),
 'reviews',coalesce((select jsonb_agg(jsonb_build_object('id',id,'displayName',display_name,'rating',rating,'title',title,'body',body,'date',to_char(created_at at time zone 'UTC','YYYY-MM-DD'),'verifiedPurchase',true,'offerNotice',offer_notice) order by id) from page),'[]'::jsonb),
 'nextCursor',case when exists(select 1 from visible where id>(select max(id::text)::uuid from page)) then (select max(id::text) from page) else null end);
$$;

