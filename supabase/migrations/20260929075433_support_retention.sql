-- Bounded, service-owned retention. Installation does not enable a schedule or delete data.
alter table private.support_inquiries
  add column redacted_at timestamptz,
  add column retention_completed_at timestamptz,
  add column retention_checked_at timestamptz,
  add column synthetic_at timestamptz,
  add column retention_hold_until timestamptz,
  add column retention_hold_reason text check(retention_hold_reason in ('safety','legal')),
  add column retention_hold_actor_id uuid,
  add constraint support_retention_hold_check check(
    (retention_hold_until is null and retention_hold_reason is null and retention_hold_actor_id is null)
    or (retention_hold_until is not null and pg_catalog.isfinite(retention_hold_until)
      and retention_hold_reason is not null and retention_hold_actor_id is not null));
alter table private.support_drafts add column redacted_at timestamptz, alter column actor_id drop not null;
alter table private.support_reply_approvals alter column actor_id drop not null;
alter table private.support_inbound_jobs add column redacted_at timestamptz;
alter table private.support_messages add column redacted_at timestamptz;
alter table private.support_upload_batches add column redacted_at timestamptz;
alter table private.support_ai_jobs add column redacted_at timestamptz, alter column actor_id drop not null;
alter table private.email_intents add column synthetic_at timestamptz;
create index support_retention_closed_idx on private.support_inquiries(closed_at,id)
  where status='closed' and redacted_at is null;
create index support_retention_pending_idx on private.support_inquiries(redacted_at,id)
  where redacted_at is not null and retention_completed_at is null;
create index support_draft_retention_idx on private.support_drafts(created_at,inquiry_id)
  where redacted_at is null;
create index email_synthetic_retention_idx on private.email_intents(created_at,id)
  where synthetic_at is not null and content_deleted_at is null;

create or replace function private.preserve_support_inquiry_identity() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if (new.id,new.created_at) is distinct from (old.id,old.created_at)
    or (old.synthetic_at is not null and new.synthetic_at is distinct from old.synthetic_at)
    or (old.redacted_at is not null and (pg_catalog.to_jsonb(new)-array['retention_completed_at','retention_checked_at'])
      is distinct from (pg_catalog.to_jsonb(old)-array['retention_completed_at','retention_checked_at'])) then
    raise exception using errcode='55000',message='support_inquiry_retired';
  end if;
  return new;
end $$;

-- An explicit per-Inquiry hold never restores content whose removal was already committed.
create function public.configure_support_retention(p_actor_id uuid,p_inquiry_id uuid,p_expected_revision integer,
  p_hold_until timestamptz default null,p_hold_reason text default null,p_mark_synthetic boolean default false)
returns boolean language plpgsql security invoker set search_path='' as $$
declare v_inquiry private.support_inquiries%rowtype;
begin
  perform private.require_support_admin(p_actor_id);
  if p_mark_synthetic is null or (p_hold_until is null)<>(p_hold_reason is null)
    or (p_hold_until is not null and (not pg_catalog.isfinite(p_hold_until)
      or p_hold_until<=pg_catalog.clock_timestamp() or p_hold_reason not in ('safety','legal'))) then
    raise exception using errcode='22023',message='invalid_support_input'; end if;
  select * into v_inquiry from private.support_inquiries where id=p_inquiry_id for update;
  if not found or v_inquiry.redacted_at is not null or p_expected_revision is distinct from v_inquiry.revision then return false; end if;
  perform private.invalidate_support_approval(p_inquiry_id);
  update private.support_inquiries set revision=revision+1,updated_at=pg_catalog.clock_timestamp(),
    retention_hold_until=p_hold_until,retention_hold_reason=p_hold_reason,
    retention_hold_actor_id=case when p_hold_until is not null then p_actor_id end,
    synthetic_at=case when p_mark_synthetic then coalesce(synthetic_at,pg_catalog.clock_timestamp()) else synthetic_at end
    where id=p_inquiry_id;
  return true;
end $$;

create function public.mark_synthetic_email_intents(p_actor_id uuid,p_ids uuid[]) returns integer
language plpgsql security invoker set search_path='' as $$
declare v_count integer;
begin
  perform private.require_support_admin(p_actor_id);
  if p_ids is null or cardinality(p_ids) not between 1 and 100 or array_position(p_ids,null) is not null
    or (select count(distinct id) from unnest(p_ids) id)<>cardinality(p_ids) then
    raise exception using errcode='22023',message='invalid_support_input'; end if;
  -- The same Inquiry-before-intent order as support send preparation.
  perform 1 from private.support_inquiries where id in (select (receipt->>'inquiryId')::uuid
    from private.email_intents where id=any(p_ids) and purpose in ('support_acknowledgement','support_reply')) order by id for update;
  if (select count(*) from private.email_intents where id=any(p_ids))<>cardinality(p_ids) then
    raise exception using errcode='P0002',message='not_found'; end if;
  update private.email_intents set synthetic_at=pg_catalog.clock_timestamp() where id=any(p_ids) and synthetic_at is null;
  get diagnostics v_count=row_count;
  return v_count;
end $$;

create function private.support_retention_due(p_inquiry private.support_inquiries,p_now timestamptz) returns boolean
language sql immutable security invoker set search_path='' as $$
  select (p_inquiry.synthetic_at is not null and p_inquiry.created_at<=p_now-interval '30 days')
    or (p_inquiry.status='closed' and p_inquiry.closed_at<=p_now-interval '12 months');
$$;
create function private.support_retention_held(p_inquiry_id uuid,p_now timestamptz) returns boolean
language sql stable security invoker set search_path='' as $$
  select exists(select 1 from private.support_inquiries where id=p_inquiry_id and retention_hold_until>p_now)
    or private.support_pending_context(p_inquiry_id)>0
    or exists(select 1 from private.email_intents e where e.purpose in ('support_acknowledgement','support_reply')
      and e.receipt->>'inquiryId'=p_inquiry_id::text and e.content_deleted_at is null
      and ((e.first_attempt_at is not null and e.provider_email_id is null and e.delivery_status is null)
        or e.lease_expires_at>p_now))
    or exists(select 1 from private.support_inbound_routes r join private.support_inbound_routes other on other.job_id=r.job_id
      join private.support_inquiries i on i.id=other.inquiry_id
      where r.inquiry_id=p_inquiry_id and i.id<>p_inquiry_id and i.redacted_at is null
        and (i.retention_hold_until>p_now or not private.support_retention_due(i,p_now)));
$$;

-- Private elevated implementation owns narrowly scoped redaction; callers receive only counts.
-- No broad UPDATE/DELETE grants are added to immutable transcript/draft tables.
create function private.apply_support_retention(p_limit integer,p_now timestamptz) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_inquiry private.support_inquiries%rowtype; v_candidate record; v_photo private.support_photos%rowtype;
  v_count integer; v_inquiries integer:=0; v_drafts integer:=0; v_photos integer:=0;
  v_audit integer:=0; v_emails integer:=0; v_held integer; v_oldest timestamptz;
  v_removed constant text:='Content removed under retention';
begin
  if p_limit is null or p_limit not between 1 and 20 or p_now is null or not pg_catalog.isfinite(p_now) then
    raise exception using errcode='22023',message='invalid_retention_request'; end if;
  -- Photo age is original receipt/admission, never a delayed normalization timestamp.
  for v_candidate in select p.id,p.inquiry_id from private.support_photos p
    join private.support_inquiries i on i.id=p.inquiry_id
    left join private.support_inbound_jobs j on j.provider_email_id=p.provider_email_id
    left join private.support_upload_batches b on b.submission_id=p.submission_id
    where p.clean_delete_requested_at is null and (i.retention_hold_until is null or i.retention_hold_until<=p_now)
      and (coalesce(j.received_at,b.created_at,p.created_at)<=p_now-interval '90 days'
        or (i.synthetic_at is not null and i.created_at<=p_now-interval '30 days') or i.redacted_at is not null)
      and (p.lease_expires_at is null or p.lease_expires_at<=p_now)
    order by coalesce(j.received_at,b.created_at,p.created_at),p.id limit p_limit loop
    select * into v_inquiry from private.support_inquiries where id=v_candidate.inquiry_id for update skip locked;
    if not found or v_inquiry.retention_hold_until>p_now then continue; end if;
    select * into v_photo from private.support_photos where id=v_candidate.id for update skip locked;
    if not found or v_photo.clean_delete_requested_at is not null or v_photo.lease_expires_at>p_now then continue; end if;
    update private.support_photos set clean_delete_requested_at=p_now,cleanup_next_attempt_at=least(cleanup_next_attempt_at,p_now),
      state=case when state in ('pending','processing') then 'rejected' else state end,
      rejection_reason=case when state in ('pending','processing') then 'expired' else rejection_reason end,
      lease_token=null,lease_expires_at=null,updated_at=p_now where id=v_photo.id;
    v_photos:=v_photos+1;
  end loop;

  -- Unapproved drafts expire independently of conversation closure. Retain version identity.
  for v_candidate in select d.id,d.inquiry_id,d.version from private.support_drafts d
    join private.support_inquiries i on i.id=d.inquiry_id
    where d.redacted_at is null and d.created_at<=p_now-interval '30 days' and i.redacted_at is null
      and (i.retention_hold_until is null or i.retention_hold_until<=p_now)
      and not exists(select 1 from private.support_reply_approvals a where a.draft_id=d.id)
    order by d.created_at,d.id limit p_limit loop
    select * into v_inquiry from private.support_inquiries where id=v_candidate.inquiry_id for update skip locked;
    if not found or v_inquiry.redacted_at is not null or v_inquiry.retention_hold_until>p_now
      or exists(select 1 from private.support_reply_approvals where draft_id=v_candidate.id) then continue; end if;
    update private.support_drafts set recipient='',subject=v_removed,body=v_removed,actor_id=null,redacted_at=p_now
      where id=v_candidate.id and redacted_at is null;
    get diagnostics v_count=row_count; v_drafts:=v_drafts+v_count;
    if v_count>0 then
      update private.support_ai_jobs set facts='[]',reference_ids='{}',actor_id=null,runtime=null,needs_human=null,redacted_at=p_now
        where draft_id=v_candidate.id and redacted_at is null;
      if v_inquiry.current_draft_version=v_candidate.version then
        perform private.invalidate_support_approval(v_inquiry.id);
        update private.support_inquiries set revision=revision+1,updated_at=p_now where id=v_inquiry.id;
      end if;
    end if;
  end loop;

  for v_candidate in select i.id from private.support_inquiries i
    where (i.redacted_at is not null and i.retention_completed_at is null)
      or (i.redacted_at is null and private.support_retention_due(i,p_now) and not private.support_retention_held(i.id,p_now))
    order by coalesce(i.retention_checked_at,i.redacted_at,i.closed_at,i.created_at),i.id limit p_limit loop
    select * into v_inquiry from private.support_inquiries where id=v_candidate.id for update skip locked;
    if not found then continue; end if;
    update private.support_inquiries set retention_checked_at=p_now where id=v_inquiry.id;
    if v_inquiry.redacted_at is null then
      -- Acknowledgement preparation locks its intent without the Inquiry. Fence every
      -- linked intent, then recheck attempted/leased state before retiring any content.
      begin
        perform 1 from private.email_intents where purpose in ('support_acknowledgement','support_reply')
          and receipt->>'inquiryId'=v_inquiry.id::text order by id for update nowait;
      exception when lock_not_available then continue; end;
      if not private.support_retention_due(v_inquiry,p_now) or private.support_retention_held(v_inquiry.id,p_now) then continue; end if;
      -- Revoke access and future mutations before processing bounded derivative batches.
      update private.support_inquiries set redacted_at=p_now,name=v_removed,email='removed',subject=v_removed,
        order_id=null,status='closed',closed_at=coalesce(closed_at,p_now),revision=revision+1,updated_at=p_now,
        retention_hold_until=null,retention_hold_reason=null,retention_hold_actor_id=null where id=v_inquiry.id;
      delete from private.support_reply_routes where inquiry_id=v_inquiry.id;
      v_inquiries:=v_inquiries+1;
    end if;
    update private.support_messages set subject=v_removed,body=v_removed,actor_id=null,redacted_at=p_now
      where id in (select id from private.support_messages where inquiry_id=v_inquiry.id and redacted_at is null limit 100);
    update private.support_drafts set recipient='',subject=v_removed,body=v_removed,actor_id=null,redacted_at=p_now
      where id in (select id from private.support_drafts where inquiry_id=v_inquiry.id and redacted_at is null limit 100);
    get diagnostics v_count=row_count; v_drafts:=v_drafts+v_count;
    update private.support_ai_jobs set facts='[]',reference_ids='{}',runtime=null,needs_human=null,actor_id=null,redacted_at=p_now,
      state=case when state in ('queued','running') then 'cancelled' else state end,lease_token=null,
      finished_at=coalesce(finished_at,p_now) where id in (select id from private.support_ai_jobs
        where inquiry_id=v_inquiry.id and redacted_at is null limit 100);
    update private.support_inbound_jobs j set recipient='',sender='',payload=null,accept_allowed=false,participant_matches=false,redacted_at=p_now
      where j.id in (select j2.id from private.support_inbound_jobs j2 where j2.redacted_at is null
        and (j2.inquiry_id=v_inquiry.id or exists(select 1 from private.support_inbound_routes r where r.job_id=j2.id and r.inquiry_id=v_inquiry.id))
        and not exists(select 1 from private.support_inbound_routes r join private.support_inquiries i on i.id=r.inquiry_id
          where r.job_id=j2.id and i.redacted_at is null) limit 100);
    update private.support_upload_batches set capability_hash=repeat('0',64),source_hash=repeat('0',64),email_hash=repeat('0',64),
      manifest='[]',redacted_at=p_now where submission_id in (select submission_id from private.support_upload_batches
        where inquiry_id=v_inquiry.id and redacted_at is null and not exists(select 1 from private.support_photos p
          where p.submission_id=support_upload_batches.submission_id and p.raw_path is not null and p.raw_deleted_at is null) limit 100);
    update private.support_intake_submissions set abuse_key=repeat('0',64),payload_hash='retired'
      where submission_id in (select submission_id from private.support_intake_submissions
        where inquiry_id=v_inquiry.id and payload_hash<>'retired' limit 100);
    delete from private.support_rfc_messages where rfc_message_id in (select rfc_message_id from private.support_rfc_messages
      where inquiry_id=v_inquiry.id limit 100);
    update private.email_intents set recipient=null,receipt=null,request_payload=null,content_deleted_at=p_now,
      state=case when state in ('queued','leased','retry') then 'blocked' else state end,
      error_code=case when provider_email_id is null then 'retention_expired' else error_code end,
      lease_token=null,lease_expires_at=null,updated_at=p_now where id in (select e.id from private.email_intents e
        where e.purpose in ('support_acknowledgement','support_reply') and e.receipt->>'inquiryId'=v_inquiry.id::text
          and e.content_deleted_at is null
        -- The one submission acknowledgement must retire in the first batch because
        -- its preparation does not use the exact-revision reply approval guard.
        order by case when e.purpose='support_acknowledgement' then 0 else 1 end,e.created_at,e.id limit 100);
    get diagnostics v_count=row_count; v_emails:=v_emails+v_count;
    if not exists(select 1 from private.support_messages where inquiry_id=v_inquiry.id and redacted_at is null)
      and not exists(select 1 from private.support_drafts where inquiry_id=v_inquiry.id and redacted_at is null)
      and not exists(select 1 from private.support_ai_jobs where inquiry_id=v_inquiry.id and redacted_at is null)
      and not exists(select 1 from private.support_upload_batches where inquiry_id=v_inquiry.id and redacted_at is null)
      and not exists(select 1 from private.support_intake_submissions where inquiry_id=v_inquiry.id and payload_hash<>'retired')
      and not exists(select 1 from private.support_rfc_messages where inquiry_id=v_inquiry.id)
      and not exists(select 1 from private.email_intents where purpose in ('support_acknowledgement','support_reply')
        and receipt->>'inquiryId'=v_inquiry.id::text and content_deleted_at is null)
      and not exists(select 1 from private.support_inbound_jobs j where j.redacted_at is null
        and (j.inquiry_id=v_inquiry.id or exists(select 1 from private.support_inbound_routes r where r.job_id=j.id and r.inquiry_id=v_inquiry.id))) then
      update private.support_inquiries set retention_completed_at=p_now where id=v_inquiry.id;
    end if;
  end loop;

  -- Explicitly marked email copies use the same logical-message tombstone as support.
  -- Contacts, consent evidence, Product enrollments, Accounts and Orders are never relabeled.
  for v_candidate in select e.id from private.email_intents e where e.synthetic_at is not null
    and e.created_at<=p_now-interval '30 days' and e.content_deleted_at is null
    and not exists(select 1 from private.support_inquiries i where e.purpose in ('support_acknowledgement','support_reply')
      and i.id::text=e.receipt->>'inquiryId' and i.retention_hold_until>p_now)
    and (e.lease_expires_at is null or e.lease_expires_at<=p_now)
    and not(e.first_attempt_at is not null and e.provider_email_id is null and e.delivery_status is null)
    order by e.created_at,e.id limit p_limit loop
    select * into v_inquiry from private.support_inquiries where id=(select (receipt->>'inquiryId')::uuid
      from private.email_intents where id=v_candidate.id and purpose in ('support_acknowledgement','support_reply')) for update skip locked;
    if exists(select 1 from private.email_intents where id=v_candidate.id and purpose in ('support_acknowledgement','support_reply')
      and receipt->>'inquiryId' is not null) and (v_inquiry.id is null or v_inquiry.retention_hold_until>p_now) then continue; end if;
    perform 1 from private.email_intents where id=v_candidate.id for update skip locked;
    if not found then continue; end if;
    update private.email_intents set recipient=null,receipt=null,request_payload=null,content_deleted_at=p_now,
      state=case when state in ('queued','leased','retry') then 'blocked' else state end,
      error_code=case when provider_email_id is null then 'retention_expired' else error_code end,
      lease_token=null,lease_expires_at=null,updated_at=p_now where id=v_candidate.id and content_deleted_at is null
        and (lease_expires_at is null or lease_expires_at<=p_now)
        and not(first_attempt_at is not null and provider_email_id is null and delivery_status is null);
    get diagnostics v_count=row_count; v_emails:=v_emails+v_count;
    if v_count>0 then delete from private.support_rfc_messages where email_intent_id=v_candidate.id; end if;
  end loop;
  -- Retain minimal approval/job/message identities, not an indefinite Operator activity log.
  update private.support_reply_approvals set actor_id=null where id in (select a.id from private.support_reply_approvals a
    join private.support_inquiries i on i.id=a.inquiry_id where a.actor_id is not null and not private.support_retention_held(i.id,p_now)
      and (a.created_at<=p_now-interval '12 months' or (i.synthetic_at is not null and i.created_at<=p_now-interval '30 days'))
    order by a.created_at,a.id limit p_limit);
  update private.support_ai_jobs set actor_id=null,runtime=null,facts='[]',reference_ids='{}',needs_human=null
    where id in (select j.id from private.support_ai_jobs j join private.support_inquiries i on i.id=j.inquiry_id
      where j.state not in ('queued','running') and (j.actor_id is not null or j.runtime is not null)
        and j.created_at<=p_now-interval '12 months' and not private.support_retention_held(i.id,p_now)
      order by j.created_at,j.id limit p_limit);
  update private.support_messages set actor_id=null where id in (select m.id from private.support_messages m
    where m.actor_id is not null and m.created_at<=p_now-interval '12 months' and not private.support_retention_held(m.inquiry_id,p_now)
    order by m.created_at,m.id limit p_limit);
  update private.support_drafts set actor_id=null where id in (select d.id from private.support_drafts d
    where d.actor_id is not null and d.created_at<=p_now-interval '12 months' and not private.support_retention_held(d.inquiry_id,p_now)
    order by d.created_at,d.id limit p_limit);
  delete from private.support_audit_events where id in (select a.id from private.support_audit_events a
    join private.support_inquiries i on i.id=a.inquiry_id where not private.support_retention_held(i.id,p_now)
      and (a.created_at<=p_now-interval '12 months' or (i.synthetic_at is not null and i.created_at<=p_now-interval '30 days'))
    order by a.created_at,a.id limit p_limit);
  get diagnostics v_audit=row_count;
  delete from private.support_abuse_windows where (kind,abuse_key,bucket_start) in
    (select kind,abuse_key,bucket_start from private.support_abuse_windows
      where bucket_start<p_now-interval '24 hours' order by bucket_start limit 200);
  select count(*) into v_held from private.support_inquiries i
    where i.redacted_at is null and private.support_retention_due(i,p_now) and private.support_retention_held(i.id,p_now);
  select min(due_at) into v_oldest from (
    select case when i.redacted_at is not null then i.redacted_at
      when i.synthetic_at is not null then least(i.created_at+interval '30 days',coalesce(i.closed_at+interval '12 months','infinity'::timestamptz))
      else i.closed_at+interval '12 months' end due_at from private.support_inquiries i where i.retention_completed_at is null
    union all select d.created_at+interval '30 days' from private.support_drafts d where d.redacted_at is null
      and not exists(select 1 from private.support_reply_approvals a where a.draft_id=d.id)
    union all select coalesce(p.clean_delete_requested_at,coalesce(j.received_at,b.created_at,p.created_at)+interval '90 days')
      from private.support_photos p left join private.support_inbound_jobs j on j.provider_email_id=p.provider_email_id
      left join private.support_upload_batches b on b.submission_id=p.submission_id where p.clean_deleted_at is null
    union all select created_at+interval '12 months' from private.support_audit_events
    union all select created_at+interval '30 days' from private.email_intents where synthetic_at is not null and content_deleted_at is null
  ) overdue where due_at<=p_now;
  return jsonb_build_object('inquiriesRedacted',v_inquiries,'draftsRedacted',v_drafts,'photosExpired',v_photos,
    'auditDeleted',v_audit,'emailsRedacted',v_emails,'heldInquiries',v_held,'oldestOverdueAt',v_oldest);
end $$;
create function public.run_support_retention(p_limit integer default 20) returns jsonb
language sql security invoker set search_path='' as $$
  select private.apply_support_retention(p_limit,pg_catalog.clock_timestamp());
$$;

create or replace function public.claim_support_photo_cleanup(p_lease_token uuid,p_limit integer default 5) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_candidate record; v_photo private.support_photos%rowtype; v_result jsonb:='[]';
  v_now timestamptz:=pg_catalog.clock_timestamp(); v_raw boolean; v_clean boolean;
begin
  if p_lease_token is null or p_limit is null or p_limit not between 1 and 5 then
    raise exception using errcode='22023',message='invalid_photo_claim'; end if;
  for v_candidate in select p.id,p.inquiry_id from private.support_photos p
      where p.state in ('ready','rejected') and p.cleanup_next_attempt_at<=v_now
        and (p.cleanup_lease_expires_at is null or p.cleanup_lease_expires_at<=v_now)
        and coalesce(p.last_processing_until,p.created_at)+interval '5 minutes'<=v_now
        and ((p.raw_path is not null
          and coalesce(p.upload_expires_at,p.created_at+interval '10 minutes')+interval '5 minutes'<=v_now)
          or (p.state='rejected' and p.clean_deleted_at is null) or p.clean_delete_requested_at is not null)
      order by p.cleanup_next_attempt_at,p.created_at,p.id limit p_limit loop
    perform 1 from private.support_inquiries where id=v_candidate.inquiry_id for update skip locked;
    if not found then continue; end if;
    select * into v_photo from private.support_photos where id=v_candidate.id for update skip locked;
    v_now:=pg_catalog.clock_timestamp();
    if not found or v_photo.state not in ('ready','rejected') or v_photo.cleanup_next_attempt_at>v_now
      or v_photo.cleanup_lease_expires_at>v_now or coalesce(v_photo.last_processing_until,v_photo.created_at)+interval '5 minutes'>v_now then continue; end if;
    v_raw:=v_photo.raw_path is not null
      and coalesce(v_photo.upload_expires_at,v_photo.created_at+interval '10 minutes')+interval '5 minutes'<=v_now;
    v_clean:=(v_photo.state='rejected' and v_photo.clean_deleted_at is null) or v_photo.clean_delete_requested_at is not null;
    if not v_raw and not v_clean then continue; end if;
    -- The persisted tombstone always precedes object deletion; identities are never removed.
    -- Both paths are swept again daily after acknowledgement to catch late writes
    -- and restored backup objects. The first deletion timestamp remains the quota boundary.
    update private.support_photos set raw_delete_requested_at=case when v_raw then coalesce(raw_delete_requested_at,v_now) else raw_delete_requested_at end,
      clean_delete_requested_at=case when v_clean then coalesce(clean_delete_requested_at,v_now) else clean_delete_requested_at end,
      cleanup_lease_token=p_lease_token,cleanup_lease_expires_at=v_now+interval '5 minutes',updated_at=v_now where id=v_photo.id;
    v_result:=v_result||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('id',v_photo.id,
      'rawPath',case when v_raw then v_photo.raw_path end,'cleanPath',case when v_clean then v_photo.clean_path end,'leaseToken',p_lease_token));
  end loop;
  return v_result;
end $$;


create or replace function private.support_inquiry_summary(p_inquiry private.support_inquiries) returns jsonb
language sql stable security invoker set search_path='' as $$
  select pg_catalog.jsonb_build_object('id',p_inquiry.id,'revision',p_inquiry.revision,
    'status',p_inquiry.status,'redactedAt',p_inquiry.redacted_at,'inquiryType',p_inquiry.inquiry_type,'name',p_inquiry.name,'email',p_inquiry.email,
    'subject',p_inquiry.subject,'createdAt',p_inquiry.created_at,'updatedAt',p_inquiry.updated_at,
    'pendingInbound',private.support_pending_context(p_inquiry.id),'lastDeliveryState',(select coalesce(e.delivery_status,e.state) from private.email_intents e
      where e.receipt->>'inquiryId'=p_inquiry.id::text and e.purpose in ('support_acknowledgement','support_reply')
      order by e.created_at desc,e.id desc limit 1));
$$;
create or replace function public.get_support_inquiry(p_actor_id uuid,p_inquiry_id uuid,p_before_message_id uuid default null) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare v_inquiry private.support_inquiries%rowtype; v_draft jsonb; v_messages jsonb;
  v_before private.support_messages%rowtype; v_oldest private.support_messages%rowtype; v_next uuid;
begin
  perform private.require_support_admin(p_actor_id);
  select * into v_inquiry from private.support_inquiries where id=p_inquiry_id;
  if not found then return null; end if;
  if v_inquiry.redacted_at is not null then
    return private.support_inquiry_summary(v_inquiry)||pg_catalog.jsonb_build_object(
      'messages','[]'::jsonb,'nextMessageCursor',null,'draft',null,'order',null,'quarantinedInbound','[]'::jsonb);
  end if;
  if p_before_message_id is not null then
    select * into v_before from private.support_messages where id=p_before_message_id and inquiry_id=p_inquiry_id;
    if not found then raise exception using errcode='22023',message='invalid_support_input'; end if;
  end if;
  select pg_catalog.jsonb_build_object('id',d.id,'version',d.version,'inquiryRevision',d.inquiry_revision,
    'recipient',d.recipient,'subject',d.subject,'body',d.body,'approved',exists(
      select 1 from private.support_reply_approvals a where a.draft_id=d.id and a.inquiry_revision=v_inquiry.revision))
    into v_draft from private.support_drafts d where d.inquiry_id=p_inquiry_id and d.version=v_inquiry.current_draft_version;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',m.id,'kind',m.kind,
    'subject',m.subject,'body',m.body,'createdAt',m.created_at,'photos',private.support_photo_projection(m.id),'delivery',case when e.id is not null then
      pg_catalog.jsonb_build_object('state',e.state,'deliveryStatus',e.delivery_status,'errorCode',e.error_code) else null end)
    order by m.created_at,m.id),'[]'::jsonb) into v_messages
    from (select * from private.support_messages where inquiry_id=p_inquiry_id
      and (p_before_message_id is null or (created_at,id)<(v_before.created_at,v_before.id))
      order by created_at desc,id desc limit 50) m
    left join private.email_intents e on e.id=m.email_intent_id;
  select * into v_oldest from private.support_messages where id=(v_messages->0->>'id')::uuid;
  if found and exists(select 1 from private.support_messages where inquiry_id=p_inquiry_id
    and (created_at,id)<(v_oldest.created_at,v_oldest.id)) then v_next:=v_oldest.id; end if;
  return private.support_inquiry_summary(v_inquiry)||pg_catalog.jsonb_build_object('messages',v_messages,'nextMessageCursor',v_next,'draft',v_draft,
    'quarantinedInbound',(select coalesce(jsonb_agg(jsonb_build_object('id',q.id,
      'subject',coalesce(q.payload->>'subject','Incoming email requires review'),
      'body',coalesce(q.payload->>'body','The message could not be retrieved. Retry or dismiss this item.'),
      'receivedAt',q.received_at,'reason',q.reason,'participantMatches',q.participant_matches,
      'acceptAllowed',q.accept_allowed and q.state='quarantined','retryAllowed',q.state='failed') order by q.created_at),
      '[]'::jsonb) from (select * from private.support_inbound_jobs where id in (select job_id from private.support_inbound_routes where inquiry_id=p_inquiry_id)
        and state in ('quarantined','failed') order by created_at limit 25) q),
    'order',(select pg_catalog.jsonb_build_object('orderNumber',order_number) from public.orders where id=v_inquiry.order_id));
end $$;


-- Approval inserts a reply without changing Inquiry revision. Guard that insert as well
-- as ordinary mutations, whose existing Inquiry update is fenced by its identity trigger.
create function private.reject_retired_support_message() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if exists(select 1 from private.support_inquiries where id=new.inquiry_id and redacted_at is not null) then
    raise exception using errcode='55000',message='support_inquiry_retired'; end if;
  return new;
end $$;
create trigger reject_retired_support_message before insert on private.support_messages
  for each row execute function private.reject_retired_support_message();
revoke all on function private.reject_retired_support_message() from public,anon,authenticated,service_role;

-- Retention timestamp parameters stay in the private schema for deterministic native tests.
-- The only exposed cleanup entry point always uses the database clock.
revoke all on function private.support_retention_due(private.support_inquiries,timestamptz),
  private.support_retention_held(uuid,timestamptz),private.apply_support_retention(integer,timestamptz),
  public.run_support_retention(integer),public.configure_support_retention(uuid,uuid,integer,timestamptz,text,boolean),
  public.mark_synthetic_email_intents(uuid,uuid[]) from public,anon,authenticated,service_role;
grant execute on function private.support_retention_due(private.support_inquiries,timestamptz),
  private.support_retention_held(uuid,timestamptz),private.apply_support_retention(integer,timestamptz),
  public.run_support_retention(integer),public.configure_support_retention(uuid,uuid,integer,timestamptz,text,boolean),
  public.mark_synthetic_email_intents(uuid,uuid[]) to service_role;

create or replace function public.get_support_photo(p_actor_id uuid,p_inquiry_id uuid,p_photo_id uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare v_result jsonb;
begin
  perform private.require_support_admin(p_actor_id);
  select pg_catalog.jsonb_build_object('path',p.clean_path,'mediaType','image/webp') into v_result
    from private.support_photos p join private.support_inquiries i on i.id=p.inquiry_id
    where p.id=p_photo_id and p.inquiry_id=p_inquiry_id and p.state='ready' and i.redacted_at is null
      and p.clean_delete_requested_at is null and p.clean_deleted_at is null;
  return v_result;
end $$;

create or replace function public.finish_support_photo_cleanup(p_id uuid,p_lease_token uuid,p_outcome text) returns boolean
language plpgsql security invoker set search_path='' as $$
declare v_inquiry_id uuid; v_photo private.support_photos%rowtype; v_now timestamptz:=pg_catalog.clock_timestamp();
begin
  if p_outcome is null or p_outcome not in ('done','retry') then return false; end if;
  select inquiry_id into v_inquiry_id from private.support_photos where id=p_id;
  if not found then return false; end if;
  perform 1 from private.support_inquiries where id=v_inquiry_id for update;
  select * into v_photo from private.support_photos where id=p_id for update;
  v_now:=pg_catalog.clock_timestamp();
  if p_lease_token is null or v_photo.cleanup_lease_token is null or v_photo.cleanup_lease_expires_at is null
    or v_photo.cleanup_lease_token is distinct from p_lease_token or v_photo.cleanup_lease_expires_at<=v_now then return false; end if;
  update private.support_photos set raw_deleted_at=case when p_outcome='done' and raw_delete_requested_at is not null then coalesce(raw_deleted_at,v_now) else raw_deleted_at end,
    clean_deleted_at=case when p_outcome='done' and clean_delete_requested_at is not null then coalesce(clean_deleted_at,v_now) else clean_deleted_at end,
    cleanup_lease_token=null,cleanup_lease_expires_at=null,
    cleanup_next_attempt_at=v_now+case when p_outcome='done' and (raw_delete_requested_at is not null or clean_delete_requested_at is not null)
      then interval '1 day' else interval '5 minutes' end,updated_at=v_now where id=p_id;
  return true;
end $$;
