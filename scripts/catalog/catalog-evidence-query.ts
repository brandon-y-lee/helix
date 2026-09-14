/** Catalog evidence is private operator data, never a storefront projection. */
export const MEDIA_BOUNDARY_INSPECTION_QUERY = `select jsonb_build_object(
  'catalog_media_policy', to_regclass('private.catalog_media_policy') is not null,
  'catalog_media_operations', to_regclass('private.catalog_media_operations') is not null,
  'verified_media_copies', to_regclass('private.verified_media_copies') is not null
) as media_boundary;`;

/** Authorize protected readers without widening grants; enforce read-only in PostgreSQL. */
export function catalogEvidenceReadTransaction(query: string): string {
  return `BEGIN READ ONLY;\nSET LOCAL TIME ZONE 'UTC';\n${query}\nROLLBACK;`;
}

function rowMap(relation: string, key: string, value = "to_jsonb(row)", filter = ""): string {
  return `(select coalesce(jsonb_object_agg(${key}, ${value} order by ${key}), '{}'::jsonb)
    from ${relation} row ${filter})`;
}

const completeRowHash = "encode(sha256(convert_to(to_jsonb(row)::text, 'UTF8')), 'hex')";

export function buildCatalogEvidenceQuery(mediaBoundaryPresent: boolean): string {
  // The transport must supply a read-only transaction and UTC timezone. The
  // validator checks both and the STABLE document-function chain. This single
  // SELECT then observes one statement snapshot, including nested document reads.
  // No customer tables are read; Audit, Draft and Revision payloads contribute
  // only their complete-row hashes to the exported evidence.
  const mediaOperations = mediaBoundaryPresent
    ? rowMap("private.catalog_media_operations", "row.operation_id::text",
      `jsonb_build_object('sha256', ${completeRowHash})`)
    : "'{}'::jsonb";
  const mediaCopies = mediaBoundaryPresent
    ? rowMap("private.verified_media_copies", "jsonb_build_array(row.product_id, row.source_url)::text",
      `jsonb_build_object('productId', row.product_id, 'sourceUrl', row.source_url,
        'targetUrl', row.target_url, 'operationId', row.operation_id, 'sha256', ${completeRowHash})`)
    : "'{}'::jsonb";
  const policy = mediaBoundaryPresent
    ? "(select to_jsonb(row) from private.catalog_media_policy row)"
    : "'null'::jsonb";
  return `select jsonb_build_object(
  'metadata', jsonb_build_object(
    'transactionReadOnly', current_setting('transaction_read_only'),
    'catalogReadsBypassRls', coalesce((select rolsuper or rolbypassrls
      from pg_roles where rolname = current_user), false),
    'isolationLevel', current_setting('transaction_isolation'),
    'snapshot', pg_current_snapshot()::text,
    'timezone', current_setting('TimeZone'),
    'capturedAt', statement_timestamp(),
    'postgresVersion', current_setting('server_version'),
    'mediaRelations', jsonb_build_array(
      to_regclass('private.catalog_media_policy') is not null,
      to_regclass('private.catalog_media_operations') is not null,
      to_regclass('private.verified_media_copies') is not null)
  ),
  'state', jsonb_build_object(
    'productStatuses', ${rowMap("public.products", "row.id::text", "to_jsonb(row.catalog_status)")},
    'documents', ${rowMap("public.products", "row.id::text", "public.get_catalog_editor_document(row.id)")},
    'systemSteps', ${rowMap("public.system_steps", "row.name")},
    'families', ${rowMap("public.product_families", "row.id::text")},
    'memberships', ${rowMap("public.product_family_memberships", "row.product_id::text")},
    'slugReservations', ${rowMap("public.product_slug_routes", "row.source_slug")},
    'archivedVariants', ${rowMap("public.product_variants", "row.id::text", "to_jsonb(row)", "where row.archived_at is not null")},
    'archivedMedia', ${rowMap("public.product_media", "row.id::text", "to_jsonb(row)", "where row.archived_at is not null")},
    'archivedRelationships', ${rowMap("public.product_relationships",
      "jsonb_build_array(row.product_id, row.related_product_id, row.relationship_type)::text",
      "to_jsonb(row)", "where row.archived_at is not null")},
    'drafts', ${rowMap("public.product_content_drafts", "row.id::text",
      `jsonb_build_object('productId', row.product_id, 'status', row.status,
        'version', row.version::text, 'sha256', ${completeRowHash})`)},
    'currentRevisions', ${rowMap("public.products", "row.id::text", `(select jsonb_build_object(
      'id', revision.id, 'revisionNumber', revision.revision_number,
      'sha256', encode(sha256(convert_to(to_jsonb(revision)::text, 'UTF8')), 'hex'))
      from public.catalog_product_revisions revision where revision.product_id = row.id
      order by revision.revision_number desc limit 1)`)},
    'history', jsonb_build_object(
      'revisions', ${rowMap("public.catalog_product_revisions", "row.id::text",
        `jsonb_build_object('productId', row.product_id, 'revisionNumber', row.revision_number,
          'schemaVersion', row.schema_version, 'sha256', ${completeRowHash})`)},
      'auditEntries', ${rowMap("public.catalog_editor_audit_log", "row.id::text",
        `jsonb_build_object('productId', row.product_id, 'action', row.action,
          'revisionId', row.revision_id, 'sha256', ${completeRowHash})`)},
      'mediaOperations', ${mediaOperations},
      'mediaCopies', ${mediaCopies}
    ),
    'mediaBoundary', jsonb_build_object('present', ${mediaBoundaryPresent ? "true" : "false"}, 'policy', ${policy}),
    'migrationVersions', (select coalesce(jsonb_agg(version order by version), '[]'::jsonb)
      from supabase_migrations.schema_migrations),
    'documentFunctions', (select jsonb_object_agg(signature, jsonb_build_object(
      'sha256', encode(sha256(convert_to(pg_get_functiondef(function.oid), 'UTF8')), 'hex'),
      'volatility', function.provolatile::text) order by signature)
      from unnest(array[
        'public.get_catalog_editor_document(uuid)',
        'private.catalog_editor_document_v4(uuid)',
        'private.catalog_editor_product_family(uuid)'
      ]) signature
      left join pg_proc function on function.oid = to_regprocedure(signature))
  )
) as evidence;`;
}
