DO $migration$
begin
  if to_regprocedure('public.sign_up_for_newsletter(text,text)') is null then
    raise exception 'Install the reviewed newsletter signup contract on this environment first';
  end if;
end;
$migration$;
