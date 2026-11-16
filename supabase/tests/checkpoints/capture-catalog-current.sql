with selected as (
 select c.oid,n.nspname,c.relname,c.relrowsecurity,c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relname=any(array['system_steps','products','product_sources','product_pdp_content','product_variants','product_media','product_relationships','product_families','product_family_memberships','product_slug_routes','product_content_drafts','catalog_product_revisions','catalog_editor_audit_log','admin_memberships'])
), definitions as (
select 'table' kind,s.relname::text name,jsonb_build_object(
 'schema',s.nspname,'name',s.relname,'rls',s.relrowsecurity,'forceRls',s.relforcerowsecurity,
 'columns',(select jsonb_agg(jsonb_build_object('name',a.attname,'type',pg_catalog.format_type(a.atttypid,a.atttypmod),'notNull',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid),'identity',a.attidentity,'generated',a.attgenerated) order by a.attnum) from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=s.oid and a.attnum>0 and not a.attisdropped),
 'constraints',(select jsonb_agg(jsonb_build_object('name',c.conname,'definition',pg_get_constraintdef(c.oid),'type',c.contype) order by c.conname) from pg_constraint c where c.conrelid=s.oid),
 'indexes',(select jsonb_agg(pg_get_indexdef(i.indexrelid) order by i.indexrelid::regclass::text) from pg_index i where i.indrelid=s.oid and not exists(select 1 from pg_constraint c where c.conindid=i.indexrelid)),
 'triggers',(select jsonb_agg(pg_get_triggerdef(t.oid) order by t.tgname) from pg_trigger t join pg_proc p on p.oid=t.tgfoid join pg_namespace n on n.oid=p.pronamespace where t.tgrelid=s.oid and not t.tgisinternal and n.nspname in ('public','private')),
 'policies',(select jsonb_agg(jsonb_build_object('name',p.polname,'permissive',p.polpermissive,'command',p.polcmd,'roles',array(select rolname from pg_roles where oid=any(p.polroles)),'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid)) order by p.polname) from pg_policy p where p.polrelid=s.oid),
 'grants',(select jsonb_agg(jsonb_build_object('grantee',grantee,'privilege',privilege_type) order by grantee,privilege_type) from information_schema.role_table_grants g where g.table_schema=s.nspname and g.table_name=s.relname)
) definition from selected s
union all
select 'function',n.nspname||'.'||p.proname,jsonb_build_object('definition',pg_get_functiondef(p.oid),'signature',p.oid::regprocedure::text,'acl',p.proacl)
from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.prokind='f' and ((n.nspname='private' and p.proname<>'reject_product_waitlist_consent_mutation') or (n.nspname='public' and (p.proname like '%catalog%' or p.proname='set_updated_at')))
union all
select 'enum',n.nspname||'.'||t.typname,jsonb_build_object('schema',n.nspname,'name',t.typname,'values',jsonb_agg(e.enumlabel order by e.enumsortorder)) from pg_type t join pg_namespace n on n.oid=t.typnamespace join pg_enum e on e.enumtypid=t.oid where n.nspname='public' group by n.nspname,t.typname
) select * from definitions order by kind,name;
