-- Remove ticket #184 aliases that incorrectly described Checkout Points
-- Reservations as redemptions. These objects were never an approved contract;
-- their applied migration is preserved while the live schema is corrected.

drop function public.redeem_rewards_points(uuid, integer, integer, text, text, uuid);
drop function public.release_rewards_redemptions_for_order(uuid, uuid, text);
drop view public.rewards_redemptions;
