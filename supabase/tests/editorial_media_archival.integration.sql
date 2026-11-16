-- Run against a catalog containing an active profile image. Everything rolls back.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $$
declare
  v_original public.product_media%rowtype;
  v_replacement public.product_media%rowtype;
  v_replacement_id uuid := gen_random_uuid();
  v_constraint text;
begin
  select * into strict v_original
  from public.product_media
  where role = 'profile_editorial' and archived_at is null
  order by id
  limit 1
  for update;

  update public.product_media set archived_at = now()
  where id = v_original.id;

  v_replacement := v_original;
  v_replacement.id := v_replacement_id;
  insert into public.product_media select (v_replacement).*;

  if not exists (
    select 1 from public.product_media
    where id = v_original.id and archived_at is not null
  ) or not exists (
    select 1 from public.product_media
    where id = v_replacement_id and archived_at is null
  ) then
    raise exception 'Replacement must preserve the archived original';
  end if;

  -- A different order avoids relying on the broader role/order unique index.
  begin
    v_replacement.id := gen_random_uuid();
    v_replacement.sort_order := v_original.sort_order + 1000;
    insert into public.product_media select (v_replacement).*;
    raise exception 'Two current profile images must not be permitted';
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint <> 'product_media_editorial_role_unique' then
      raise exception 'Unexpected uniqueness guard: %', v_constraint;
    end if;
  end;
end;
$$;

select 'editorial media archival regression passed' as result;
rollback;
