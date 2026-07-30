-- Match the V1 document adapter's declared volatility to the PostgreSQL
-- functions used by its JSON and text normalization expressions.
alter function private.catalog_editor_upgrade_v1_to_v2(jsonb) stable;
