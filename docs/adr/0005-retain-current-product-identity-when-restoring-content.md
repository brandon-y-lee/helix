# Retain current Product identity when restoring content

Restore creates a Working Catalog Draft from a Published Revision while retaining the current Product Display Name, URL and discovery metadata. The current `slug`, `display_name`, `seo_title`, `seo_description`, and `search_keywords` take precedence over the historical revision for every supported document format. The admin interface and Catalog Audit Entry disclose that choice.

## Consequences

- Routine Restore cannot silently resurrect an earlier identity or retired search terms. Other historical content remains reviewable under current validation before Publish.
- Published Revisions and Catalog Audit Entries remain immutable; Restore does not immediately change the public Product.
- Editors can make later deliberate identity/metadata changes through the current draft ownership and publication rules.
- Required historical revision decoders remain part of the supported Restore contract. They are not public URL or old-name search compatibility.

This implements approved Spec #358. Product URL behavior is a separate decision; this ADR does not alter ADR 0003's URL policy ahead of its canonical-URL Ticket.
