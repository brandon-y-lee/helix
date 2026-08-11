-- Run after the public Catalog grant hardening migration. All checks are
-- read-only except denied no-row writes, and the transaction is rolled back.

begin;

do $catalog_grant_contract$
declare
  v_table text;
  v_role text;
  v_privilege text;
begin
  foreach v_table in array array['products', 'product_variants', 'product_media']
  loop
    foreach v_role in array array['anon', 'authenticated']
    loop
      if not has_table_privilege(v_role, 'public.' || v_table, 'select') then
        raise exception '% requires SELECT on public.%', v_role, v_table;
      end if;

      foreach v_privilege in array array[
        'insert', 'update', 'delete', 'truncate', 'references', 'trigger'
      ]
      loop
        if has_table_privilege(
          v_role,
          'public.' || v_table,
          v_privilege
        ) then
          raise exception '% retains % on public.%', v_role, v_privilege, v_table;
        end if;
      end loop;
    end loop;

    if not has_table_privilege(
      'service_role',
      'public.' || v_table,
      'select, insert, update, delete'
    ) then
      raise exception 'service_role Catalog access is incomplete for public.%', v_table;
    end if;
  end loop;
end;
$catalog_grant_contract$;

set local role anon;

select count(*) from public.products;
select count(*) from public.product_variants;
select count(*) from public.product_media;

do $anon_catalog_write_contract$
begin
  begin
    update public.products set slug = slug where false;
    raise exception 'anonymous Product write unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;

  begin
    delete from public.product_variants where false;
    raise exception 'anonymous Product Variant write unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.product_media (id) values (gen_random_uuid());
    raise exception 'anonymous Product Media write unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end;
$anon_catalog_write_contract$;

reset role;
set local role authenticated;

do $authenticated_catalog_write_contract$
begin
  begin
    update public.products set slug = slug where false;
    raise exception 'authenticated Product write unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;

  begin
    delete from public.product_variants where false;
    raise exception 'authenticated Product Variant write unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;

  begin
    truncate table public.product_media;
    raise exception 'authenticated Product Media truncate unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end;
$authenticated_catalog_write_contract$;

reset role;
rollback;
