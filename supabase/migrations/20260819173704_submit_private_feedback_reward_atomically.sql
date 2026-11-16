create function public.submit_private_feedback_reward(
  p_user_id uuid,
  p_feedback_id uuid,
  p_rating integer,
  p_comments text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_feedback public.private_feedback%rowtype;
  v_entry_id uuid;
begin
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception using
      errcode = '22023',
      message = 'feedback rating is invalid';
  end if;

  select feedback.*
  into v_feedback
  from public.private_feedback as feedback
  where feedback.id = p_feedback_id
    and feedback.user_id = p_user_id
  for update;

  if not found or v_feedback.status not in ('available', 'rewarded') then
    raise exception using
      errcode = 'P0001',
      message = 'feedback request unavailable';
  end if;

  if v_feedback.status = 'available' then
    update public.private_feedback
    set
      status = 'rewarded',
      rating = p_rating,
      comments = nullif(left(btrim(coalesce(p_comments, '')), 2000), ''),
      points_awarded = 300,
      submitted_at = now()
    where id = v_feedback.id;
  end if;

  v_entry_id := public.award_rewards_points(
    p_user_id,
    300,
    'private_feedback',
    'private-feedback:' || v_feedback.order_id::text,
    'Private post-purchase feedback Points Award.',
    v_feedback.order_id,
    '{"sentiment_neutral_reward":true}'::jsonb
  );

  return v_entry_id;
end;
$$;

revoke all on function public.submit_private_feedback_reward(uuid, uuid, integer, text)
  from public, anon, authenticated, service_role;
grant execute on function public.submit_private_feedback_reward(uuid, uuid, integer, text)
  to service_role;

comment on function public.submit_private_feedback_reward(uuid, uuid, integer, text) is
  'Completes one owned private feedback request and awards its Points atomically and idempotently.';
