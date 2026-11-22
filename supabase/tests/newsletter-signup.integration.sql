-- Run only in the disposable newsletter rehearsal as the installer owner.
do $proof$
declare
  source_key constant text := repeat('1', 64);
  active_window constant timestamptz := date_bin(interval '10 minutes', clock_timestamp(), 'epoch'::timestamptz);
begin
  if public.sign_up_for_newsletter('duplicate@example.invalid', source_key) <> 'added' then
    raise exception 'Initial signup was not added';
  end if;
  if public.sign_up_for_newsletter('duplicate@example.invalid', source_key) <> 'already_added' then
    raise exception 'Repeated signup was rejected';
  end if;
  if (select count(*) from private.newsletter_signups where email = 'duplicate@example.invalid') <> 1 then
    raise exception 'Duplicate signup did not preserve one row';
  end if;

  update private.newsletter_signup_limits set request_count = 10 where requester_key = source_key;
  if public.sign_up_for_newsletter('blocked@example.invalid', source_key) <> 'limited' then
    raise exception 'Per-source limit accepted an excess signup';
  end if;
  if (select request_count from private.newsletter_signup_limits where requester_key = 'total') <> 2 then
    raise exception 'Per-source rejection evaded the limit or consumed aggregate budget';
  end if;

  insert into private.newsletter_signup_limits values (repeat('2', 64), active_window - interval '10 minutes', 1);
  update private.newsletter_signup_limits set request_count = 600 where requester_key = 'total';
  if public.sign_up_for_newsletter('blocked@example.invalid', repeat('3', 64)) <> 'limited' then
    raise exception 'Aggregate limit accepted an excess signup';
  end if;
  if exists (select from private.newsletter_signup_limits where requester_key = repeat('3', 64))
    or exists (select from private.newsletter_signups where email = 'blocked@example.invalid') then
    raise exception 'Aggregate rejection wrote an address or a rate-limit bucket';
  end if;

  update private.newsletter_signup_limits set window_start = active_window - interval '10 minutes';
  if public.sign_up_for_newsletter('fresh@example.invalid', repeat('3', 64)) <> 'added' then
    raise exception 'The new window rejected a valid signup';
  end if;
  if exists (select from private.newsletter_signup_limits where requester_key in (source_key, repeat('2', 64))) then
    raise exception 'A fresh window did not prune stale buckets';
  end if;
end;
$proof$;
