-- Historical benefit association, not eligibility or evidence of email delivery.
-- No review dependency; consumers use this exact versioned service-only signature.
create function public.has_review_winback_offer_v1(p_user_id uuid,p_product_id uuid,p_environment text)
returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(p_user_id is not null and p_product_id is not null
   and p_environment in ('sandbox','live') and exists (
     select 1 from private.lifecycle_offers benefit
     join public.orders original on original.id=benefit.source_order_id
     join public.order_items item on item.order_id=original.id and item.product_id=p_product_id
     join private.checkout_verified_payments payment on payment.order_id=original.id
       and payment.session_id=original.stripe_checkout_session_id
     where benefit.kind='review_winback' and benefit.percent_off=10
       and benefit.source_user_id=p_user_id and benefit.user_id=p_user_id and original.user_id=p_user_id
       and original.checkout_environment::text=p_environment and benefit.environment=p_environment
       and benefit.source_key='review_winback:'||original.id::text
       and nullif(benefit.delivery_evidence_id,'') is not null and nullif(benefit.delivery_revision,'') is not null
       and nullif(benefit.risk_evidence_id,'') is not null and nullif(benefit.risk_revision,'') is not null
       and original.paid_at is not null and payment.payment_intent_id is not null
       and payment.contract_version in ('checkout_v1','checkout_v2')
   ),false);
$$;
revoke all on function public.has_review_winback_offer_v1(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.has_review_winback_offer_v1(uuid,uuid,text) to service_role;
comment on function public.has_review_winback_offer_v1(uuid,uuid,text) is
 'v1: historical issued unconditional review offer for exact source account/product/payment mode. Boolean only; never evidence of email receipt. No current expiry, consent, risk or redemption gate.';
