set lock_timeout = '10s';
set statement_timeout = '120s';

alter table public.system_steps
  add constraint system_steps_fixed_contract_check
  check (
    (name = 'CLEANSE' and position = 1 and routine_group = 'core')
    or (name = 'REFINE' and position = 2 and routine_group = 'beyond_core')
    or (name = 'TREAT' and position = 3 and routine_group = 'core')
    or (name = 'FRAME' and position = 4 and routine_group = 'beyond_core')
    or (name = 'SEAL' and position = 5 and routine_group = 'core')
    or (name = 'PROTECT' and position = 6 and routine_group = 'beyond_core')
    or (name = 'LIFT' and position = 7 and routine_group = 'beyond_core')
  );

comment on constraint system_steps_fixed_contract_check
  on public.system_steps is
  'Keeps each governed System Step bound to its fixed position and Routine Group.';
