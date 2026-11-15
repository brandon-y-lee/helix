-- Run only inside the pinned two-checkout disposable PostgreSQL harness.
-- disclosure_test.seed/grant_offer are producer-owned synthetic fixture helpers,
-- not runtime readers or substitute production implementations.
begin;
create function pg_temp.assert_disclosure(ok boolean,label text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'Disclosure composition: %',label;end if;end$$;
create temporary table disclosure_cases(name text primary key,context jsonb,review_id uuid);
insert into disclosure_cases values('before',disclosure_test.seed(1101,'live'),null),('after',disclosure_test.seed(1102,'live'),null),('sandbox',disclosure_test.seed(1103,'sandbox'),null);
update private.product_review_control set publication_enabled=true;
select disclosure_test.grant_offer(context) from disclosure_cases where name='before';
update disclosure_cases set review_id=(public.submit_product_review((context->>'userId')::uuid,(context->>'orderItemId')::uuid,0,'Sample author',1,'Honest experience','A synthetic critical review for verification.',true)->>'id')::uuid;
select public.moderate_product_review((context->>'adminId')::uuid,review_id,1,'published') from disclosure_cases;
create function pg_temp.notice(p_context jsonb,p_id uuid) returns boolean language sql as $$
select (x->>'offerNotice')::boolean from jsonb_array_elements(public.read_public_product_reviews(p_context->>'productSlug',null,20)->'reviews') x where x->>'id'=p_id::text;
$$;
select pg_temp.assert_disclosure(pg_temp.notice(context,review_id),'offer before submission disclosed') from disclosure_cases where name='before';
select pg_temp.assert_disclosure(not pg_temp.notice(context,review_id),'review initially has no offer') from disclosure_cases where name='after';
select disclosure_test.grant_offer(context) from disclosure_cases where name in ('after','sandbox');
-- This statement gets a fresh authoritative snapshot after issuance, no review edit/cache expiry.
select pg_temp.assert_disclosure(pg_temp.notice(context,review_id),'offer after publication disclosed immediately') from disclosure_cases where name='after';
select pg_temp.assert_disclosure(pg_temp.notice(context,review_id) is null,'sandbox offer never creates genuine public review') from disclosure_cases where name='sandbox';
select pg_temp.assert_disclosure((select oi.order_id<> (c.context->>'sourceOrderId')::uuid from public.order_items oi where oi.id=(c.context->>'orderItemId')::uuid),'offer may originate from different purchase') from disclosure_cases c where name in ('before','after');
select pg_temp.assert_disclosure(not public.has_review_winback_offer_v1((context->>'userId')::uuid,(context->>'productId')::uuid,'sandbox'),'live association cannot leak across mode') from disclosure_cases where name='after';
select public.submit_product_review((context->>'userId')::uuid,(context->>'orderItemId')::uuid,1,'Sample author',2,'Edited experience','An updated synthetic honest review.',true) from disclosure_cases where name='after';
select public.moderate_product_review((context->>'adminId')::uuid,review_id,2,'rejected','personal_data') from disclosure_cases where name='after';
select pg_temp.assert_disclosure(pg_temp.notice(context,review_id),'old publication retains notice through rejected edit') from disclosure_cases where name='after';
select public.withdraw_product_review((context->>'userId')::uuid,review_id,2) from disclosure_cases where name='after';
select pg_temp.assert_disclosure(pg_temp.notice(context,review_id) is null,'withdrawal stays withdrawn despite offer') from disclosure_cases where name='after';
select public.submit_product_review((context->>'userId')::uuid,(context->>'orderItemId')::uuid,3,'Sample author',1,'Resubmitted experience','A resubmitted synthetic honest review.',true) from disclosure_cases where name='after';
select public.moderate_product_review((context->>'adminId')::uuid,review_id,4,'published') from disclosure_cases where name='after';
select pg_temp.assert_disclosure(pg_temp.notice(context,review_id),'resubmission retains historical notice') from disclosure_cases where name='after';
select pg_temp.assert_disclosure(not exists(select 1 from jsonb_array_elements(public.read_public_product_reviews(context->>'productSlug',null,20)->'reviews') x where x-array['id','displayName','rating','title','body','date','verifiedPurchase','offerNotice']<>'{}'::jsonb),'no private fields in public projection') from disclosure_cases;
rollback;
