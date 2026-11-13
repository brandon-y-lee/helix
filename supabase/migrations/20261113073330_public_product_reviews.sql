-- Public reviews are separate from confidential feedback. No activation or backfill.
create table private.product_review_control (singleton boolean primary key default true check(singleton), publication_enabled boolean not null default false);
insert into private.product_review_control values(true,false);
create table private.product_reviews (
 id uuid primary key default extensions.gen_random_uuid(), user_id uuid not null references auth.users(id),
 product_id uuid not null references public.products(id), order_item_id uuid not null references public.order_items(id),
 environment text not null check(environment in ('sandbox','live')), revision integer not null default 0,
 published_revision integer, status text not null check(status in ('pending','published','rejected','withdrawn')),
 offer_notice boolean not null default false, created_at timestamptz not null default now(), unique(user_id,product_id,environment)
);
-- Provenance is captured from the verified purchase once and can never be promoted.
create function private.protect_product_review_provenance()
returns trigger language plpgsql set search_path='' as $$
begin
 if (new.user_id,new.product_id,new.order_item_id,new.environment) is distinct from
    (old.user_id,old.product_id,old.order_item_id,old.environment) then
 raise exception 'review provenance is immutable' using errcode='23514'; end if;
 return new;
end $$;
revoke all on function private.protect_product_review_provenance() from public,anon,authenticated,service_role;
create trigger product_review_provenance_immutable before update on private.product_reviews
for each row execute function private.protect_product_review_provenance();
create table private.product_review_revisions (
 review_id uuid not null references private.product_reviews(id), revision integer not null,
 display_name text not null check(length(display_name) between 1 and 60), rating integer not null check(rating between 1 and 5),
 title text not null check(length(title) between 1 and 120), body text not null check(length(body) between 10 and 2000),
 consent_version text not null check(consent_version='public-review-v1'), created_at timestamptz not null default now(),
 primary key(review_id,revision)
);
create table private.product_review_audit (
 id bigint generated always as identity primary key, review_id uuid not null references private.product_reviews(id),
 revision integer not null, actor_id uuid not null, action text not null check(action in ('submitted','published','rejected','removed','withdrawn')),
 reason text check(reason is null or reason in ('spam','personal_data','threats','unrelated','promotional_claims')),
 created_at timestamptz not null default now()
);
create index product_review_audit_actor_time on private.product_review_audit(actor_id,created_at);
create index product_reviews_public on private.product_reviews(product_id,id) where published_revision is not null and environment='live';
alter table private.product_review_control enable row level security;
alter table private.product_reviews enable row level security;
alter table private.product_review_revisions enable row level security;
alter table private.product_review_audit enable row level security;
revoke all on private.product_review_control,private.product_reviews,private.product_review_revisions,private.product_review_audit from public,anon,authenticated,service_role;

create function public.submit_product_review(p_user_id uuid,p_order_item_id uuid,p_expected_revision integer,p_display_name text,p_rating integer,p_title text,p_body text,p_consent boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_item record; v_review private.product_reviews; v_revision integer;
begin
 if p_consent is distinct from true or p_expected_revision<0 or p_expected_revision is null
 or p_display_name is null or length(trim(p_display_name)) not between 1 and 60
 or p_title is null or length(trim(p_title)) not between 1 and 120
 or p_body is null or length(trim(p_body)) not between 10 and 2000 or p_rating is null or p_rating not between 1 and 5
 or (p_display_name||p_title||regexp_replace(p_body,E'[\n\r\t]','','g')) ~ '[[:cntrl:]]' then raise exception 'invalid review' using errcode='22023'; end if;
 if not exists(select 1 from auth.users where id=p_user_id and email_confirmed_at is not null) then raise exception 'verified account required' using errcode='42501'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('review:'||p_user_id::text,0));
 select i.product_id,o.checkout_environment::text as environment into v_item from public.order_items i join public.orders o on o.id=i.order_id
 where i.id=p_order_item_id and i.product_id is not null and o.user_id=p_user_id and o.status in ('paid','refunded')
 and exists(select 1 from private.checkout_verified_payments v where v.order_id=o.id and v.session_id=o.stripe_checkout_session_id);
 if not found then raise exception 'verified purchase required' using errcode='42501'; end if;
 select * into v_review from private.product_reviews where user_id=p_user_id and product_id=v_item.product_id and environment=v_item.environment for update;
 if coalesce(v_review.revision,0)<>p_expected_revision then raise exception 'review revision conflict' using errcode='40001'; end if;
 if (select count(*) from private.product_review_audit where actor_id=p_user_id and action='submitted' and created_at>now()-interval '1 minute')>=5 then raise exception 'review rate limited' using errcode='54000'; end if;
 if v_review.id is null then
 insert into private.product_reviews(user_id,product_id,order_item_id,environment,status) values(p_user_id,v_item.product_id,p_order_item_id,v_item.environment,'pending') returning * into v_review;
 end if;
 v_revision:=v_review.revision+1;
 insert into private.product_review_revisions values(v_review.id,v_revision,trim(p_display_name),p_rating,trim(p_title),trim(p_body),'public-review-v1',now());
 update private.product_reviews set revision=v_revision,status='pending' where id=v_review.id;
 insert into private.product_review_audit(review_id,revision,actor_id,action) values(v_review.id,v_revision,p_user_id,'submitted');
 return jsonb_build_object('id',v_review.id,'revision',v_revision,'status','pending');
end $$;

create function public.withdraw_product_review(p_user_id uuid,p_review_id uuid,p_expected_revision integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r private.product_reviews;
begin
 select * into r from private.product_reviews where id=p_review_id and user_id=p_user_id for update;
 if not found then raise exception 'review unavailable' using errcode='42501'; end if;
 if p_expected_revision is null or p_expected_revision<1 or r.revision<>p_expected_revision then raise exception 'review revision conflict' using errcode='40001'; end if;
 update private.product_reviews set revision=revision+1,published_revision=null,status='withdrawn' where id=r.id;
 insert into private.product_review_audit(review_id,revision,actor_id,action) values(r.id,r.revision+1,p_user_id,'withdrawn');
 return jsonb_build_object('id',r.id,'revision',r.revision+1,'status','withdrawn');
end $$;

create function public.moderate_product_review(p_actor_id uuid,p_review_id uuid,p_expected_revision integer,p_decision text,p_reason text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r private.product_reviews;
begin
 if not exists(select 1 from public.admin_memberships where user_id=p_actor_id and active and role='admin') then raise exception 'moderation forbidden' using errcode='42501'; end if;
 if p_decision not in ('published','rejected','removed') or p_decision is null or (p_decision in ('rejected','removed') and (p_reason is null or p_reason not in ('spam','personal_data','threats','unrelated','promotional_claims'))) or (p_decision='published' and p_reason is not null) then raise exception 'invalid decision' using errcode='22023'; end if;
 select * into r from private.product_reviews where id=p_review_id for update;
 if not found or p_expected_revision is null or p_expected_revision<1 or ((p_decision='removed' and r.published_revision is null) or (p_decision<>'removed' and r.status<>'pending' and not (r.status='published' and p_decision='rejected'))) or r.revision<>p_expected_revision then raise exception 'review revision conflict' using errcode='40001'; end if;
 if p_decision='published' and r.environment='live' and not (select publication_enabled from private.product_review_control where singleton) then raise exception 'publication disabled' using errcode='42501'; end if;
 update private.product_reviews set status=case when p_decision='removed' then 'rejected' else p_decision end,published_revision=case when p_decision='removed' then null when p_decision='published' then r.revision when r.status='published' then null else r.published_revision end where id=r.id;
 insert into private.product_review_audit(review_id,revision,actor_id,action,reason) values(r.id,r.revision,p_actor_id,p_decision,p_reason);
 return jsonb_build_object('id',r.id,'revision',r.revision,'status',case when p_decision='removed' then 'rejected' else p_decision end);
end $$;

create function public.read_public_product_reviews(p_slug text,p_after uuid default null,p_limit integer default 5)
returns jsonb language sql stable security definer set search_path='' as $$
 with visible as (
 select r.id,v.display_name,v.rating,v.title,v.body,v.created_at,r.offer_notice from private.product_reviews r
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

create function public.read_owned_product_reviews(p_user_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(x),'[]'::jsonb) from (
 select distinct on(i.product_id,o.checkout_environment) i.id as "orderItemId",i.product_name as "productName",i.product_slug as "productSlug",r.id,r.revision,r.status,o.checkout_environment::text as environment,
 v.display_name as "displayName",v.rating,v.title,v.body
 from public.order_items i join public.orders o on o.id=i.order_id
 left join private.product_reviews r on r.user_id=p_user_id and r.product_id=i.product_id and r.environment=o.checkout_environment::text
 left join private.product_review_revisions v on v.review_id=r.id and v.revision=(select max(revision) from private.product_review_revisions where review_id=r.id)
 where o.user_id=p_user_id and i.product_id is not null and o.status in ('paid','refunded')
 and exists(select 1 from private.checkout_verified_payments vp where vp.order_id=o.id and vp.session_id=o.stripe_checkout_session_id)
 order by i.product_id,o.checkout_environment,i.id limit 100) x;
$$;
create function public.read_product_review_queue(p_actor_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from public.admin_memberships where user_id=p_actor_id and active and role='admin') then raise exception 'moderation forbidden' using errcode='42501'; end if;
 return (select coalesce(jsonb_agg(x),'[]'::jsonb) from (select r.id,r.revision,r.environment,r.status,r.published_revision as "publishedRevision",pv.title as "publishedTitle",pv.body as "publishedBody",p.slug as "productSlug",v.display_name as "displayName",v.rating,v.title,v.body from private.product_reviews r join private.product_review_revisions v on v.review_id=r.id and v.revision=r.revision join public.products p on p.id=r.product_id left join private.product_review_revisions pv on pv.review_id=r.id and pv.revision=r.published_revision where (r.status='pending' or r.published_revision is not null) order by v.created_at,r.id limit 100) x);
end $$;

revoke all on function public.submit_product_review(uuid,uuid,integer,text,integer,text,text,boolean),public.withdraw_product_review(uuid,uuid,integer),public.moderate_product_review(uuid,uuid,integer,text,text),public.read_public_product_reviews(text,uuid,integer),public.read_owned_product_reviews(uuid),public.read_product_review_queue(uuid) from public,anon,authenticated;
grant execute on function public.submit_product_review(uuid,uuid,integer,text,integer,text,text,boolean),public.withdraw_product_review(uuid,uuid,integer),public.moderate_product_review(uuid,uuid,integer,text,text),public.read_public_product_reviews(text,uuid,integer),public.read_owned_product_reviews(uuid),public.read_product_review_queue(uuid) to service_role;
