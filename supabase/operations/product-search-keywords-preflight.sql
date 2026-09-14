-- Read-only. First load product-url-preflight.sql and independently verify the
-- connection is the approved non-production project. Save this JSON privately
-- for the review-only keyword planner; it is not an authorization to publish.
select jsonb_build_object(
  'projectRef', 'erasogmsqpgiirovubjh',
  'capturedAt', statement_timestamp(),
  'activeProducts', inventory -> 'activeProducts',
  'reservations', inventory -> 'reservations'
)
from (select pg_temp.product_url_inventory() as inventory) captured;
