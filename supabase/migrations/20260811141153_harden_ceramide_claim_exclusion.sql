set lock_timeout = '10s';
set statement_timeout = '120s';

do $harden_ceramide_claim_exclusion$
declare
  v_excluded_claim_pattern constant text :=
    '(3:1:1|100[- ]?hours?|((repair|restore|rebuild)[[:alpha:]]*.{0,40}(skin[ -])?barrier)|((skin[ -])?barrier.{0,40}(repair|restore|rebuild)[[:alpha:]]*)|penetrat[[:alpha:]]*.{0,30}(deeper|into)|deliver[[:alpha:]]*.{0,30}into( the)? skin|layer[- ]specific|clinically|before[ /-]?after|all skin types|sensitive[- ]skin( safe)?|hypoallergenic|non[- ]irritating|dermatologist[- ]tested|[0-9]+([.][0-9]+)?[[:space:]]*%|[0-9]+([.][0-9]+)?[[:space:]]*percent|concentration[- ]led|vegan|cruelty[- ]free|(^|[^[:alnum:]_])clean([^[:alnum:]_]|$)|sustainab|sourcing|certif)';
  v_ceramide_id uuid;
  v_customer_copy text;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('mei-pelle-ceramide-claims-169', 0)
  );

  select product.id,
         concat_ws(
           ' ',
           (to_jsonb(product) - 'formula_notes')::text,
           to_jsonb(content)::text
         )
  into strict v_ceramide_id, v_customer_copy
  from public.products product
  join public.product_pdp_content content on content.product_id = product.id
  where product.slug = 'ceramide-cushion'
    and product.catalog_status = 'active'
    and product.status = 'coming_soon';

  if exists (
    select 1
    from public.product_variants variant
    where variant.product_id = v_ceramide_id
  ) then
    raise exception 'Ceramide Cushion must remain without Product Variants'
      using errcode = '23514';
  end if;

  if v_customer_copy ~* v_excluded_claim_pattern then
    raise exception 'Ceramide Cushion contains a claim withheld by specification 167'
      using errcode = '23514';
  end if;
end;
$harden_ceramide_claim_exclusion$;
