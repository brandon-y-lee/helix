set lock_timeout = '10s';
set statement_timeout = '120s';

alter table public.catalog_editor_audit_log
  drop constraint catalog_editor_audit_log_action_check;

alter table public.catalog_editor_audit_log
  add constraint catalog_editor_audit_log_action_check
  check (
    action in (
      'draft.created',
      'draft.saved',
      'draft.validated',
      'draft.ready',
      'draft.discarded',
      'draft.restored',
      'draft.published',
      'media.uploaded',
      'membership.created',
      'membership.updated',
      'slug.rename.published',
      'slug.replacement.published'
    )
  );

comment on constraint catalog_editor_audit_log_action_check
  on public.catalog_editor_audit_log is
  'Allowlist for immutable Catalog Admin audit events, including Product slug route changes.';
