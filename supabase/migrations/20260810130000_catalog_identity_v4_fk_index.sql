set lock_timeout = '10s';
set statement_timeout = '120s';

drop index public.products_system_step_name_idx;

create index products_system_step_routine_group_idx
  on public.products (system_step_name, routine_group);

comment on index public.products_system_step_routine_group_idx is
  'Covers the Product-to-System-Step composite foreign key and Step lookups.';
