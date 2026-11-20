-- Run on a disposable fixture inside the caller's ROLLBACK-only transaction.
-- PostgreSQL fires actual managed auth.users hooks; no GoTrue session or mail is used.
DO $check$
DECLARE synthetic_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO auth.users(id,raw_user_meta_data) VALUES
    (synthetic_id,'{"first_name":"Development","last_name":"Rehearsal"}'::jsonb);
  IF NOT EXISTS (SELECT FROM public.profiles WHERE user_id=synthetic_id AND first_name='Development' AND last_name='Rehearsal')
     OR NOT EXISTS (SELECT FROM public.rewards_accounts WHERE user_id=synthetic_id)
     OR NOT EXISTS (SELECT FROM public.referral_codes WHERE user_id=synthetic_id) THEN
    RAISE EXCEPTION 'Current Auth hooks failed to initialize profile, rewards or referral state';
  END IF;
  IF to_regnamespace('helix_development_prefix') IS NOT NULL THEN
    IF EXISTS (SELECT FROM helix_development_prefix.profiles WHERE user_id=synthetic_id)
       OR EXISTS (SELECT FROM helix_development_prefix.loyalty_accounts WHERE user_id=synthetic_id)
       OR EXISTS (SELECT FROM helix_development_prefix.referral_codes WHERE user_id=synthetic_id) THEN
      RAISE EXCEPTION 'Auth wrote into the historical archive';
    END IF;
  END IF;
END
$check$;
