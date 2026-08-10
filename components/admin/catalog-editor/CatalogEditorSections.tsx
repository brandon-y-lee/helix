"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import type {
  CatalogDraftDocument,
  CatalogIngredientCard,
  CatalogIngredientHighlight,
  CatalogMediaFields,
  CatalogRelationshipFields,
  CatalogSourceFields,
  CatalogTable,
  CatalogValidationIssue,
  CatalogVariantFields,
} from "@/lib/admin/catalog-editor/client";
import type { CatalogEditorResponse } from "@/lib/admin/catalog/types";
import type {
  CatalogDocumentDiffEntry,
  CatalogDocumentTable,
} from "@/lib/admin/catalog/diff";
import type { PdpIngredientStory } from "@/lib/catalog/product-content";
import {
  canCatalogRoleEditField,
  catalogFieldsForTable,
  getCatalogFieldOwnership,
  type CatalogEditorRole,
  type CatalogEditorTable,
  type CatalogFieldOwnership,
} from "@/lib/catalog/field-ownership";
import {
  CORE_ROUTINE_MEDIA_SLOTS,
  isCoreRoutineMediaRole,
  PRODUCT_MEDIA_ROLES,
  type ProductMediaRole,
} from "@/lib/catalog/media-roles";
import { StringListEditor, TextField } from "./CatalogFieldControls";
import styles from "./CatalogEditor.module.css";

type SectionKey = CatalogTable | "system_metadata";

export const CATALOG_SECTIONS: Array<{ key: SectionKey; label: string }> = [
  { key: "products", label: "Products" },
  { key: "product_pdp_content", label: "PDP content" },
  { key: "product_variants", label: "Variants" },
  { key: "product_media", label: "Media" },
  { key: "product_relationships", label: "Relationships" },
  { key: "product_sources", label: "Sources" },
  { key: "system_metadata", label: "System Metadata" },
];

export function catalogFieldId(
  table: SectionKey,
  field: string,
  rowId?: string,
) {
  return `${table}-${rowId ? `${rowId}-` : ""}${field}`.replace(
    /[^a-zA-Z0-9_-]/g,
    "-",
  );
}

function issueFor(
  issues: CatalogValidationIssue[],
  table: CatalogTable,
  field: string,
  rowId?: string,
) {
  return issues.find(
    (issue) =>
      issue.table === table &&
      issue.field === field &&
      (!rowId || issue.row_id === rowId),
  )?.message;
}

function changedFieldName(field: string) {
  return field.includes(".") ? field.split(".").at(-1) ?? field : field;
}

function changedCount(
  changes: CatalogEditorSectionsProps["changes"],
  table: CatalogDocumentTable,
  fields?: readonly string[],
) {
  const entries = changes?.[table] ?? [];
  if (!fields) return entries.length;
  const fieldSet = new Set(fields);
  return entries.filter((entry) => fieldSet.has(changedFieldName(entry.field)))
    .length;
}

function errorCount(
  issues: CatalogValidationIssue[],
  table: CatalogTable,
  fields?: readonly string[],
) {
  const tableIssues = issues.filter((issue) => issue.table === table);
  if (!fields) return tableIssues.length;
  const fieldSet = new Set(fields);
  return tableIssues.filter((issue) => fieldSet.has(issue.field)).length;
}

export function catalogGroupIdForField(table: CatalogTable, field: string) {
  if (table === "products") {
    const metadata = getCatalogFieldOwnership(table, field);
    if (!metadata || metadata.editor.editableBy.length === 0) {
      return "group-products-metadata";
    }
    if (
      metadata.editor.editableBy.length === 1 &&
      metadata.editor.editableBy[0] === "admin"
    ) {
      return "group-products-advanced";
    }
    return "group-products-editorial";
  }
  if (table === "product_pdp_content") {
    if (field === "profile_title_tokens") return "group-pdp-profile-tokens";
    if (field === "ingredient_cards") return "group-pdp-ingredient-cards";
    if (field === "ingredient_story") return "group-pdp-ingredient-story";
    return "group-pdp-content";
  }
  if (table === "product_variants") return "group-variant-records";
  if (table === "product_media") return "group-media-records";
  if (table === "product_relationships") return "group-relationship-records";
  return "group-source-fields";
}

function FieldContext({ metadata }: { metadata: CatalogFieldOwnership }) {
  return (
    <span className={styles.fieldContext}>
      <span>{metadata.owner}</span>
      {metadata.importWarning ? <span>{metadata.importWarning}</span> : null}
      {metadata.readOnlyReason ? <span>{metadata.readOnlyReason}</span> : null}
    </span>
  );
}

function formatReadOnly(value: unknown, metadata: CatalogFieldOwnership) {
  if (value === null || value === undefined || value === "") return "Not set";
  if (metadata.inputKind === "date-time" && typeof value === "string") {
    return new Date(value).toLocaleString();
  }
  if (metadata.inputKind === "money" && typeof value === "number") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(value / 100);
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

const PALETTE_FIELDS = [
  "start",
  "end",
  "accent",
  "surface",
  "ink",
  "highlight",
] as const;

function PlaceholderPaletteEditor({
  id,
  value,
  onChange,
}: {
  id: string;
  value: unknown;
  onChange: (value: Record<string, string>) => void;
}) {
  const palette =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  return (
    <fieldset className={styles.paletteEditor}>
      <legend>Placeholder palette</legend>
      {PALETTE_FIELDS.map((field) => {
        const current = typeof palette[field] === "string" ? palette[field] : "";
        const color = /^#[0-9a-f]{6}$/i.test(current) ? current : "#000000";
        return (
          <label className={styles.paletteControl} key={field} htmlFor={`${id}-${field}`}>
            <span>{field}</span>
            <input
              type="color"
              aria-label={`${field} palette swatch`}
              value={color}
              onChange={(event) =>
                onChange({
                  ...Object.fromEntries(
                    Object.entries(palette).filter(
                      (entry): entry is [string, string] => typeof entry[1] === "string",
                    ),
                  ),
                  [field]: event.target.value,
                })
              }
            />
            <input
              className={styles.input}
              id={`${id}-${field}`}
              value={current}
              placeholder="Not set"
              onChange={(event) => {
                const next = Object.fromEntries(
                  Object.entries(palette).filter(
                    (entry): entry is [string, string] => typeof entry[1] === "string",
                  ),
                );
                if (event.target.value) next[field] = event.target.value;
                else delete next[field];
                onChange(next);
              }}
            />
          </label>
        );
      })}
    </fieldset>
  );
}

function NumericField({
  id,
  metadata,
  value,
  onChange,
  error,
}: {
  id: string;
  metadata: CatalogFieldOwnership;
  value: unknown;
  onChange: (value: number | null) => void;
  error?: string;
}) {
  const displayValue =
    metadata.inputKind === "money" && typeof value === "number"
      ? String(value / 100)
      : typeof value === "number"
        ? String(value)
        : "";
  const [draft, setDraft] = useState(displayValue);
  useEffect(() => setDraft(displayValue), [displayValue]);

  return (
    <label className={styles.field} htmlFor={id}>
      <span className={styles.fieldLabel}>{metadata.label}</span>
      <input
        className={styles.input}
        id={id}
        type="number"
        aria-label={metadata.label}
        min="0"
        step={metadata.inputKind === "money" ? "0.01" : "1"}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          if (!draft) {
            if (metadata.nullable) onChange(null);
            else setDraft(displayValue);
            return;
          }
          const parsed = Number(draft);
          if (!Number.isFinite(parsed)) {
            setDraft(displayValue);
            return;
          }
          onChange(
            metadata.inputKind === "money"
              ? Math.round(parsed * 100)
              : Math.trunc(parsed),
          );
        }}
      />
      <FieldContext metadata={metadata} />
      {error ? <span className={styles.fieldError}>{error}</span> : null}
    </label>
  );
}

function JsonField({
  id,
  metadata,
  value,
  readOnly,
  onChange,
  error,
}: {
  id: string;
  metadata: CatalogFieldOwnership;
  value: unknown;
  readOnly: boolean;
  onChange: (value: unknown) => void;
  error?: string;
}) {
  const serialized = JSON.stringify(value, null, 2);
  const [draft, setDraft] = useState(serialized);
  const [parseError, setParseError] = useState<string | null>(null);

  useEffect(() => setDraft(serialized), [serialized]);

  if (readOnly) {
    return (
      <ReadOnlyField id={id} metadata={metadata} value={value} />
    );
  }

  return (
    <div className={styles.field}>
      <label className={styles.fieldLabel} htmlFor={id}>
        {metadata.label}
      </label>
      <textarea
        className={styles.codeTextarea}
        id={id}
        value={draft}
        aria-invalid={Boolean(parseError || error)}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          try {
            const parsed = JSON.parse(draft);
            setParseError(null);
            onChange(parsed);
          } catch {
            setParseError("Enter valid JSON before saving this field.");
          }
        }}
      />
      <FieldContext metadata={metadata} />
      {parseError || error ? (
        <span className={styles.fieldError}>{parseError ?? error}</span>
      ) : null}
    </div>
  );
}

function ReadOnlyField({
  id,
  metadata,
  value,
}: {
  id: string;
  metadata: CatalogFieldOwnership;
  value: unknown;
}) {
  const formatted = formatReadOnly(value, metadata);
  return (
    <div className={styles.field} id={id}>
      <span className={styles.fieldLabel}>{metadata.label}</span>
      <output className={styles.readOnlyValue}>
        {metadata.inputKind === "json" ? <pre>{formatted}</pre> : formatted}
      </output>
      <FieldContext metadata={metadata} />
    </div>
  );
}

function MetadataField({
  table,
  field,
  value,
  role,
  onChange,
  issues,
  rowId,
  forceReadOnly = false,
  selectOptions,
}: {
  table: CatalogTable;
  field: string;
  value: unknown;
  role: CatalogEditorRole;
  onChange: (value: unknown) => void;
  issues: CatalogValidationIssue[];
  rowId?: string;
  forceReadOnly?: boolean;
  selectOptions?: Array<{ label: string; value: string }>;
}) {
  const metadata = getCatalogFieldOwnership(table, field);
  if (!metadata) return null;
  const id = catalogFieldId(table, field, rowId);
  const readOnly = forceReadOnly || !canCatalogRoleEditField(role, table, field);
  const error = issueFor(issues, table, field, rowId);

  if (readOnly) {
    return <ReadOnlyField id={id} metadata={metadata} value={value} />;
  }
  if (metadata.inputKind === "json") {
    return (
      <JsonField
        id={id}
        metadata={metadata}
        value={value}
        readOnly={false}
        onChange={onChange}
        error={error}
      />
    );
  }
  if (metadata.inputKind === "string-list") {
    return (
      <div className={styles.metadataField}>
        <StringListEditor
          id={id}
          label={metadata.label}
          values={Array.isArray(value) ? (value as string[]) : []}
          onChange={onChange}
          error={error}
        />
        <FieldContext metadata={metadata} />
        {metadata.nullable && value !== null ? (
          <button
            className={`${styles.button} ${styles.buttonSecondary}`}
            type="button"
            onClick={() => onChange(null)}
          >
            Clear to null
          </button>
        ) : null}
      </div>
    );
  }
  if (metadata.inputKind === "boolean") {
    return (
      <label className={styles.checkboxField} htmlFor={id}>
        <input
          id={id}
          type="checkbox"
          aria-label={metadata.label}
          checked={value === true}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span>
          <strong>{metadata.label}</strong>
          <FieldContext metadata={metadata} />
        </span>
      </label>
    );
  }
  if (metadata.inputKind === "select" || selectOptions) {
    const options =
      selectOptions ??
      (metadata.options ?? []).map((option) => ({
        label: option.replaceAll("_", " "),
        value: option,
      }));
    return (
      <label className={styles.field} htmlFor={id}>
        <span className={styles.fieldLabel}>{metadata.label}</span>
        <select
          className={styles.select}
          id={id}
          aria-label={metadata.label}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value || null)}
        >
          {metadata.nullable ? <option value="">Not assigned</option> : null}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <FieldContext metadata={metadata} />
        {error ? <span className={styles.fieldError}>{error}</span> : null}
      </label>
    );
  }
  if (metadata.inputKind === "color") {
    const color = typeof value === "string" ? value : "#000000";
    return (
      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor={`${id}-color`}>
          {metadata.label}
        </label>
        <div className={styles.colorControl}>
          <input
            id={`${id}-color`}
            type="color"
            value={/^#[0-9a-f]{6}$/i.test(color) ? color : "#000000"}
            onChange={(event) => onChange(event.target.value)}
          />
          <input
            className={styles.input}
            id={id}
            aria-label={`${metadata.label} raw value`}
            value={color}
            onChange={(event) => onChange(event.target.value)}
          />
        </div>
        <FieldContext metadata={metadata} />
      </div>
    );
  }
  if (
    metadata.inputKind === "number" ||
    metadata.inputKind === "money"
  ) {
    return (
      <NumericField
        id={id}
        metadata={metadata}
        value={value}
        onChange={onChange}
        error={error}
      />
    );
  }

  return (
    <div className={styles.metadataField}>
      <TextField
        id={id}
        label={metadata.label}
        value={typeof value === "string" ? value : null}
        onChange={(next) => onChange(metadata.nullable && !next ? null : next)}
        error={error}
        multiline={metadata.inputKind === "textarea"}
      />
      <FieldContext metadata={metadata} />
    </div>
  );
}

function FieldGroup({
  id,
  title,
  description,
  children,
  changed = 0,
  errors = 0,
  countLabel,
  readOnly = false,
}: {
  id: string;
  title: string;
  description?: string;
  children: React.ReactNode;
  changed?: number;
  errors?: number;
  countLabel?: string;
  readOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <details
      className={styles.fieldGroup}
      id={id}
      open={open}
      data-editor-disclosure="group"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className={styles.groupSummary} aria-expanded={open}>
        <span className={styles.summaryTitle}>{title}</span>
        <span className={styles.summaryMeta}>
          {countLabel ? <span>{countLabel}</span> : null}
          {changed > 0 ? <span>{changed} changed</span> : null}
          {errors > 0 ? <span className={styles.errorBadge}>{errors} errors</span> : null}
          {readOnly ? <span>Read only</span> : null}
        </span>
      </summary>
      <div className={styles.fieldGroupBody}>
        {description ? <p className={styles.help}>{description}</p> : null}
        {children}
      </div>
    </details>
  );
}

function TableSection({
  table,
  children,
  countLabel,
  changed = 0,
  errors = 0,
  readOnly = false,
}: {
  table: SectionKey;
  children: React.ReactNode;
  countLabel: string;
  changed?: number;
  errors?: number;
  readOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const label =
    table === "system_metadata"
      ? "System Metadata"
      : CATALOG_SECTIONS.find((section) => section.key === table)?.label ?? table;
  return (
    <details
      className={styles.section}
      id={`section-${table}`}
      open={open}
      data-editor-disclosure="table"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className={styles.summary} aria-expanded={open}>
        <span className={styles.summaryHeading}>
          <span className={styles.tableLabel}>
            {table === "system_metadata" ? "Read only" : "Table"}
          </span>
          <span>{table === "system_metadata" ? label : table}</span>
        </span>
        <span className={styles.summaryMeta}>
          <span>{countLabel}</span>
          {changed > 0 ? <span>{changed} changed</span> : null}
          {errors > 0 ? <span className={styles.errorBadge}>{errors} errors</span> : null}
          {changed > 0 ? <span>Dirty</span> : null}
          {readOnly ? <span>Read only</span> : null}
        </span>
      </summary>
      <div className={styles.sectionBody}>{children}</div>
    </details>
  );
}

interface CatalogEditorSectionsProps {
  document: CatalogDraftDocument;
  role: CatalogEditorRole;
  issues: CatalogValidationIssue[];
  relationshipTargets: CatalogEditorResponse["relationshipTargets"];
  systemMetadata: CatalogEditorResponse["systemMetadata"];
  changes: Partial<
    Record<CatalogDocumentTable, CatalogDocumentDiffEntry[]>
  >;
  onChange: (document: CatalogDraftDocument) => void;
  onUpload: (
    file: File,
    metadata: {
      role: ProductMediaRole;
      alt: string;
      variantId?: string | null;
      sortOrder?: number;
      replaceRole?: boolean;
    },
  ) => Promise<void>;
  uploading: boolean;
}

export default function CatalogEditorSections(props: CatalogEditorSectionsProps) {
  const { document, role, issues, onChange } = props;
  const sectionsRef = useRef<HTMLDivElement>(null);
  const productRecord = document.product as unknown as Record<string, unknown>;

  function updateProduct(field: string, value: unknown) {
    onChange({
      ...document,
      product: { ...document.product, [field]: value },
    });
  }

  const productFields = catalogFieldsForTable("products");
  const normalProductFields = productFields.filter(
    (field) => field.editor.editableBy.includes("catalog_editor"),
  );
  const advancedProductFields = productFields.filter(
    (field) =>
      field.editor.editableBy.length === 1 &&
      field.editor.editableBy[0] === "admin",
  );
  const immutableProductFields = productFields.filter(
    (field) => field.editor.editableBy.length === 0,
  );

  const toggleAll = (open: boolean) => {
    sectionsRef.current
      ?.querySelectorAll<HTMLDetailsElement>("details[data-editor-disclosure]")
      .forEach((details) => {
        details.open = open;
      });
  };

  return (
    <div className={styles.sections} ref={sectionsRef}>
      <div className={styles.disclosureControls} aria-label="Section display">
        <button
          className={`${styles.button} ${styles.buttonSecondary}`}
          type="button"
          onClick={() => toggleAll(true)}
        >
          Expand all
        </button>
        <button
          className={`${styles.button} ${styles.buttonSecondary}`}
          type="button"
          onClick={() => toggleAll(false)}
        >
          Collapse all
        </button>
      </div>
      <TableSection
        table="products"
        countLabel={`${productFields.length} fields`}
        changed={changedCount(props.changes, "products")}
        errors={errorCount(issues, "products")}
      >
        <FieldGroup
          id="group-products-editorial"
          title="Editorial"
          description="Canonical presentation fields used by the storefront."
          countLabel={`${normalProductFields.length} fields`}
          changed={changedCount(
            props.changes,
            "products",
            normalProductFields.map((field) => field.field),
          )}
          errors={errorCount(
            issues,
            "products",
            normalProductFields.map((field) => field.field),
          )}
        >
          <div className={styles.fieldGrid}>
            {normalProductFields.map((metadata) => (
              <MetadataField
                key={metadata.field}
                table="products"
                field={metadata.field}
                value={productRecord[metadata.field]}
                role={role}
                onChange={(value) => updateProduct(metadata.field, value)}
                issues={issues}
              />
            ))}
          </div>
        </FieldGroup>
        <FieldGroup
          id="group-products-advanced"
          title="Advanced administrator"
          description="Supplier, commerce, and system-classification changes are admin-only and appear in the publish review."
          countLabel={`${advancedProductFields.length} fields`}
          changed={changedCount(
            props.changes,
            "products",
            advancedProductFields.map((field) => field.field),
          )}
          errors={errorCount(
            issues,
            "products",
            advancedProductFields.map((field) => field.field),
          )}
          readOnly={role !== "admin"}
        >
          <div className={styles.fieldGrid}>
            {advancedProductFields.map((metadata) => (
              <MetadataField
                key={metadata.field}
                table="products"
                field={metadata.field}
                value={productRecord[metadata.field]}
                role={role}
                onChange={(value) => updateProduct(metadata.field, value)}
                issues={issues}
              />
            ))}
          </div>
        </FieldGroup>
        <FieldGroup
          id="group-products-metadata"
          title="Metadata"
          description="Identity, timestamps, and architecture-constrained values remain visible and read only."
          countLabel={`${immutableProductFields.length} fields`}
          readOnly
        >
          <div className={styles.fieldGrid}>
            {immutableProductFields.map((metadata) => (
              <MetadataField
                key={metadata.field}
                table="products"
                field={metadata.field}
                value={productRecord[metadata.field]}
                role={role}
                onChange={() => undefined}
                issues={issues}
              />
            ))}
          </div>
        </FieldGroup>
      </TableSection>

      <PdpSection {...props} />
      <VariantsSection {...props} />
      <MediaSection {...props} />
      <RelationshipsSection {...props} />
      <SourceSection {...props} />
      <SystemMetadataSection metadata={props.systemMetadata} />
    </div>
  );
}

function PdpSection({
  document,
  role,
  issues,
  changes,
  onChange,
}: CatalogEditorSectionsProps) {
  const pdp = document.productPdpContent;
  if (!pdp) {
    return (
      <TableSection
        table="product_pdp_content"
        countLabel="0 rows"
        errors={errorCount(issues, "product_pdp_content")}
      >
        <p className={styles.help}>No PDP content row exists for this product.</p>
      </TableSection>
    );
  }
  const record = pdp as unknown as Record<string, unknown>;
  const update = (field: string, value: unknown) =>
    onChange({
      ...document,
      productPdpContent: { ...pdp, [field]: value },
    });
  const structured = new Set([
    "profile_title_tokens",
    "ingredient_cards",
    "ingredient_story",
  ]);
  const contentFields = catalogFieldsForTable("product_pdp_content").filter(
    (field) => !structured.has(field.field),
  );
  const tableChanges = changedCount(changes, "product_pdp_content");
  return (
    <TableSection
      table="product_pdp_content"
      countLabel={`${catalogFieldsForTable("product_pdp_content").length} fields`}
      changed={tableChanges}
      errors={errorCount(issues, "product_pdp_content")}
    >
      <FieldGroup
        id="group-pdp-content"
        title="Content fields"
        description="Storefront PDP copy and structured presentation values."
        countLabel={`${contentFields.length} fields`}
        changed={changedCount(
          changes,
          "product_pdp_content",
          contentFields.map((field) => field.field),
        )}
        errors={errorCount(
          issues,
          "product_pdp_content",
          contentFields.map((field) => field.field),
        )}
      >
        <div className={styles.fieldGrid}>
          {contentFields.map((metadata) => (
            <MetadataField
              key={metadata.field}
              table="product_pdp_content"
              field={metadata.field}
              value={record[metadata.field]}
              role={role}
              onChange={(value) => update(metadata.field, value)}
              issues={issues}
            />
          ))}
        </div>
      </FieldGroup>
      <ProfileTokensEditor
        tokens={pdp.profile_title_tokens ?? []}
        readOnly={!canCatalogRoleEditField(role, "product_pdp_content", "profile_title_tokens")}
        onChange={(value) => update("profile_title_tokens", value)}
        changed={changedCount(changes, "product_pdp_content", ["profile_title_tokens"])}
        errors={errorCount(issues, "product_pdp_content", ["profile_title_tokens"])}
      />
      <IngredientCardsEditor
        cards={pdp.ingredient_cards ?? []}
        readOnly={!canCatalogRoleEditField(role, "product_pdp_content", "ingredient_cards")}
        onChange={(value) => update("ingredient_cards", value)}
        changed={changedCount(changes, "product_pdp_content", ["ingredient_cards"])}
        errors={errorCount(issues, "product_pdp_content", ["ingredient_cards"])}
      />
      <IngredientStoryEditor
        story={pdp.ingredient_story}
        readOnly={!canCatalogRoleEditField(role, "product_pdp_content", "ingredient_story")}
        onChange={(value) => update("ingredient_story", value)}
        changed={changedCount(changes, "product_pdp_content", ["ingredient_story"])}
        errors={errorCount(issues, "product_pdp_content", ["ingredient_story"])}
      />
    </TableSection>
  );
}

function VariantsSection({
  document,
  role,
  issues,
  changes,
  onChange,
}: CatalogEditorSectionsProps) {
  const canEdit = role === "admin";
  const fields = catalogFieldsForTable("product_variants");
  const update = (id: string, field: string, value: unknown) =>
    onChange({
      ...document,
      variants: document.variants.map((variant) =>
        variant.id === id ? { ...variant, [field]: value } : variant,
      ),
    });
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (!canEdit || target < 0 || target >= document.variants.length) return;
    const variants = [...document.variants];
    [variants[index], variants[target]] = [variants[target], variants[index]];
    onChange({
      ...document,
      variants: variants.map((variant, sort_order) => ({ ...variant, sort_order })),
    });
  };
  return (
    <TableSection
      table="product_variants"
      countLabel={`${document.variants.length} ${document.variants.length === 1 ? "row" : "rows"}`}
      changed={changedCount(changes, "product_variants")}
      errors={errorCount(issues, "product_variants")}
    >
      <FieldGroup
        id="group-variant-records"
        title="Variant records"
        description="Prices are edited in dollars and stored as integer cents. Variant lifecycle and commerce fields require an admin."
        countLabel={`${document.variants.length} ${document.variants.length === 1 ? "row" : "rows"}`}
        changed={changedCount(changes, "product_variants")}
        errors={errorCount(issues, "product_variants")}
        readOnly={!canEdit}
      >
        <div className={styles.stack}>
          {document.variants.map((variant, index) => {
          const record = variant as unknown as Record<string, unknown>;
          return (
            <article className={styles.recordCard} key={variant.id}>
              <div className={styles.recordHeader}>
                <strong>{variant.label || `Variant ${index + 1}`}</strong>
                <div className={styles.actionRow}>
                  <button className={`${styles.button} ${styles.buttonSecondary}`} type="button" disabled={!canEdit || index === 0} onClick={() => move(index, -1)}>Move earlier</button>
                  <button className={`${styles.button} ${styles.buttonSecondary}`} type="button" disabled={!canEdit || index === document.variants.length - 1} onClick={() => move(index, 1)}>Move later</button>
                  <button className={`${styles.button} ${styles.buttonDanger}`} type="button" disabled={!canEdit} onClick={() => onChange({ ...document, variants: document.variants.filter((item) => item.id !== variant.id) })}>Archive variant</button>
                </div>
              </div>
              <div className={styles.fieldGrid}>
                {fields.map((metadata) => (
                  <MetadataField
                    key={metadata.field}
                    table="product_variants"
                    field={metadata.field}
                    value={record[metadata.field]}
                    role={role}
                    onChange={(value) => update(variant.id, metadata.field, value)}
                    issues={issues}
                    rowId={variant.id}
                  />
                ))}
              </div>
            </article>
          );
          })}
        </div>
        <button
          className={`${styles.button} ${styles.buttonSecondary}`}
          type="button"
          disabled={!canEdit}
          onClick={() => {
            const now = new Date().toISOString();
            const variant: CatalogVariantFields = {
              id: crypto.randomUUID(),
              product_id: document.productId,
              variant_key: `variant-${document.variants.length + 1}`,
              label: "",
              price_cents: 0,
              sku: null,
              supplier_variant_id: null,
              option_values: {},
              compare_at_price_cents: null,
              available: false,
              inventory_status: "unavailable",
              volume: null,
              pack_count: null,
              sort_order: document.variants.length,
              updated_at: now,
              archived_at: null,
            };
            onChange({ ...document, variants: [...document.variants, variant] });
          }}
        >
          Add variant
        </button>
      </FieldGroup>
    </TableSection>
  );
}

function MediaSection(props: CatalogEditorSectionsProps) {
  const { document, role, issues, changes, onChange, onUpload, uploading } = props;
  const fields = catalogFieldsForTable("product_media");
  const variantOptions = document.variants.map((variant) => ({
    label: variant.label || variant.variant_key,
    value: variant.id,
  }));
  const update = (id: string, field: string, value: unknown) =>
    onChange({
      ...document,
      media: document.media.map((media) =>
        media.id === id ? { ...media, [field]: value } : media,
      ),
    });
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= document.media.length) return;
    const media = [...document.media];
    [media[index], media[target]] = [media[target], media[index]];
    onChange({
      ...document,
      media: media.map((item, sort_order) => ({ ...item, sort_order })),
    });
  };
  return (
    <TableSection
      table="product_media"
      countLabel={`${document.media.length} ${document.media.length === 1 ? "row" : "rows"}`}
      changed={changedCount(changes, "product_media")}
      errors={errorCount(issues, "product_media")}
    >
      {document.product.routine_group === "core" ? (
        <FieldGroup
          id="group-core-routine-media"
          title="Core routine media"
          description="Fixed media slots used by the shared Core routine experience."
          countLabel={`${CORE_ROUTINE_MEDIA_SLOTS.length} slots`}
        >
          <div className={styles.mediaGrid}>
            {CORE_ROUTINE_MEDIA_SLOTS.map((slot) => (
              <CoreRoutineUpload
                key={slot.role}
                slot={slot}
                media={document.media.find((item) => item.role === slot.role)}
                onUpload={onUpload}
                uploading={uploading}
              />
            ))}
          </div>
        </FieldGroup>
      ) : null}
      <MediaUploadControl
        variants={variantOptions}
        onUpload={onUpload}
        uploading={uploading}
      />
      <FieldGroup
        id="group-media-records"
        title="Media records"
        description="Edit associations, roles, ordering, alt text, and supported presentation metadata."
        countLabel={`${document.media.length} ${document.media.length === 1 ? "row" : "rows"}`}
        changed={changedCount(changes, "product_media")}
        errors={errorCount(issues, "product_media")}
      >
        <div className={styles.stack}>
          {document.media.map((media, index) => {
          const record = media as unknown as Record<string, unknown>;
          return (
            <article className={styles.recordCard} key={media.id}>
              <div className={styles.recordHeader}>
                <div className={styles.mediaIdentity}>
                  <MediaPreview media={media} />
                  <strong>{media.role} #{media.sort_order}</strong>
                </div>
                <div className={styles.actionRow}>
                  <button
                    className={`${styles.button} ${styles.buttonSecondary}`}
                    type="button"
                    aria-label={`Move ${media.alt || media.role} earlier`}
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                  >
                    Move earlier
                  </button>
                  <button
                    className={`${styles.button} ${styles.buttonSecondary}`}
                    type="button"
                    aria-label={`Move ${media.alt || media.role} later`}
                    disabled={index === document.media.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    Move later
                  </button>
                  <button
                    className={`${styles.button} ${styles.buttonDanger}`}
                    type="button"
                    disabled={!canCatalogRoleEditField(role, "product_media", "role")}
                    onClick={() => {
                      if (
                        ["card", "cart", "detail"].includes(media.role) &&
                        !window.confirm(
                          "Archive this primary media association? Review the replacement media before publishing.",
                        )
                      ) {
                        return;
                      }
                      onChange({
                        ...document,
                        media: document.media.filter((item) => item.id !== media.id),
                      });
                    }}
                  >
                    Archive association
                  </button>
                </div>
              </div>
              <div className={styles.fieldGrid}>
                {fields.map((metadata) =>
                  metadata.field === "placeholder_palette" &&
                  canCatalogRoleEditField(role, "product_media", metadata.field) ? (
                    <PlaceholderPaletteEditor
                      key={metadata.field}
                      id={catalogFieldId("product_media", metadata.field, media.id)}
                      value={record[metadata.field]}
                      onChange={(value) => update(media.id, metadata.field, value)}
                    />
                  ) : (
                    <MetadataField
                      key={metadata.field}
                      table="product_media"
                      field={metadata.field}
                      value={record[metadata.field]}
                      role={role}
                      onChange={(value) => update(media.id, metadata.field, value)}
                      issues={issues}
                      rowId={media.id}
                      forceReadOnly={metadata.field === "role" && isCoreRoutineMediaRole(media.role)}
                      selectOptions={
                        metadata.field === "role"
                          ? PRODUCT_MEDIA_ROLES.filter(
                              (item) => !isCoreRoutineMediaRole(item),
                            ).map((item) => ({
                              label: item.replaceAll("_", " "),
                              value: item,
                            }))
                          : metadata.field === "variant_id"
                            ? variantOptions
                            : undefined
                      }
                    />
                  ),
                )}
              </div>
              <span className={styles.help}>Record {index + 1} of {document.media.length}</span>
            </article>
          );
          })}
        </div>
      </FieldGroup>
    </TableSection>
  );
}

function RelationshipsSection({ document, role, issues, changes, relationshipTargets, onChange }: CatalogEditorSectionsProps) {
  const fields = catalogFieldsForTable("product_relationships");
  const targets = relationshipTargets.map((target) => ({
    label: `${target.displayName} (/${target.slug})`,
    value: target.id,
  }));
  const identity = (relationship: CatalogRelationshipFields) =>
    `${relationship.related_product_id}:${relationship.relationship_type}`;
  const update = (currentIdentity: string, field: string, value: unknown) =>
    onChange({
      ...document,
      relationships: document.relationships.map((relationship) =>
        identity(relationship) === currentIdentity
          ? { ...relationship, [field]: value }
          : relationship,
      ),
    });
  return (
    <TableSection
      table="product_relationships"
      countLabel={`${document.relationships.length} ${document.relationships.length === 1 ? "row" : "rows"}`}
      changed={changedCount(changes, "product_relationships")}
      errors={errorCount(issues, "product_relationships")}
    >
      <FieldGroup
        id="group-relationship-records"
        title="Relationship records"
        description="Related products and routine ordering used by storefront recommendations."
        countLabel={`${document.relationships.length} ${document.relationships.length === 1 ? "row" : "rows"}`}
        changed={changedCount(changes, "product_relationships")}
        errors={errorCount(issues, "product_relationships")}
      >
        <div className={styles.stack}>
          {document.relationships.map((relationship) => {
          const rowId = identity(relationship);
          const record = relationship as unknown as Record<string, unknown>;
          return (
            <article className={styles.recordCard} key={rowId}>
              <div className={styles.fieldGrid}>
                {fields.map((metadata) => (
                  <MetadataField
                    key={metadata.field}
                    table="product_relationships"
                    field={metadata.field}
                    value={record[metadata.field]}
                    role={role}
                    onChange={(value) => update(rowId, metadata.field, value)}
                    issues={issues}
                    rowId={rowId}
                    selectOptions={metadata.field === "related_product_id" ? targets : undefined}
                  />
                ))}
              </div>
              <button className={`${styles.button} ${styles.buttonDanger}`} type="button" disabled={!canCatalogRoleEditField(role, "product_relationships", "related_product_id")} onClick={() => onChange({ ...document, relationships: document.relationships.filter((item) => identity(item) !== rowId) })}>Remove relationship</button>
            </article>
          );
          })}
        </div>
        <button
          className={`${styles.button} ${styles.buttonSecondary}`}
          type="button"
          disabled={!canCatalogRoleEditField(role, "product_relationships", "related_product_id") || targets.length === 0}
          onClick={() => {
            const relationship: CatalogRelationshipFields = {
              product_id: document.productId,
              related_product_id: targets[0]?.value ?? "",
              relationship_type: "related",
              sort_order: document.relationships.length,
              created_at: new Date().toISOString(),
              archived_at: null,
            };
            onChange({ ...document, relationships: [...document.relationships, relationship] });
          }}
        >
          Add relationship
        </button>
      </FieldGroup>
    </TableSection>
  );
}

function SourceSection({ document, role, issues, changes, onChange }: CatalogEditorSectionsProps) {
  const source = document.productSource;
  if (!source) {
    return (
      <TableSection table="product_sources" countLabel="0 rows">
        <p className={styles.help}>No supplier provenance record exists for this product.</p>
      </TableSection>
    );
  }
  const record = source as unknown as Record<string, unknown>;
  const update = (field: string, value: unknown) =>
    onChange({
      ...document,
      productSource: { ...source, [field]: value } as CatalogSourceFields,
    });
  return (
    <TableSection
      table="product_sources"
      countLabel={`${catalogFieldsForTable("product_sources").length} fields`}
      changed={changedCount(changes, "product_sources")}
      errors={errorCount(issues, "product_sources")}
    >
      <FieldGroup
        id="group-source-fields"
        title="Source fields"
        description="Safe source corrections require an admin. Reconciliation identifiers, hashes, inspection state, and raw snapshots remain immutable."
        countLabel={`${catalogFieldsForTable("product_sources").length} fields`}
        changed={changedCount(changes, "product_sources")}
        errors={errorCount(issues, "product_sources")}
      >
        <div className={styles.fieldGrid}>
          {catalogFieldsForTable("product_sources").map((metadata) => (
          <MetadataField
            key={metadata.field}
            table="product_sources"
            field={metadata.field}
            value={record[metadata.field]}
            role={role}
            onChange={(value) => update(metadata.field, value)}
            issues={issues}
          />
          ))}
        </div>
      </FieldGroup>
    </TableSection>
  );
}

function SystemMetadataSection({ metadata }: { metadata: CatalogEditorResponse["systemMetadata"] }) {
  const recordCount = metadata.drafts.length + metadata.revisions.length + metadata.audit.length + metadata.slugRoutes.length;
  return (
    <TableSection
      table="system_metadata"
      countLabel={`${recordCount} ${recordCount === 1 ? "record" : "records"}`}
      readOnly
    >
      <p className={styles.help}>
        Workflow, revision, audit, and Product URL redirect records are displayed for inspection only. Redirect history is append-only and cannot be silently deleted.
      </p>
      <MetadataRows table="product_content_drafts" rows={metadata.drafts} />
      <MetadataRows table="catalog_product_revisions" rows={metadata.revisions} />
      <MetadataRows table="catalog_editor_audit_log" rows={metadata.audit} />
      <MetadataRows table="product_slug_routes" rows={metadata.slugRoutes} />
    </TableSection>
  );
}

function MetadataRows({ table, rows }: { table: CatalogEditorTable; rows: Array<Record<string, unknown>> }) {
  const fields = catalogFieldsForTable(table);
  return (
    <FieldGroup
      id={`group-system-${table.replaceAll("_", "-")}`}
      title={table}
      countLabel={`${rows.length} ${rows.length === 1 ? "record" : "records"}`}
      readOnly
    >
      {rows.length === 0 ? <p className={styles.help}>No records.</p> : null}
      {rows.map((row, index) => (
        <details
          className={styles.metadataRecord}
          key={String(row.id ?? row.source_slug ?? index)}
          open={table === "product_slug_routes"}
        >
          <summary>{String(row.id ?? `Record ${index + 1}`)}</summary>
          <div className={styles.fieldGrid}>
            {fields.map((field) => (
              <ReadOnlyField
                key={field.field}
                id={catalogFieldId("system_metadata", `${table}-${field.field}`, String(row.id ?? index))}
                metadata={field}
                value={row[field.field]}
              />
            ))}
          </div>
        </details>
      ))}
    </FieldGroup>
  );
}

function MediaPreview({ media }: { media: CatalogMediaFields }) {
  return (
    <div className={styles.mediaPreview}>
      {media.url && media.media_type === "video" ? (
        <video src={media.url} muted aria-label={media.alt} />
      ) : media.url ? (
        // The protected API supplies project-controlled media URLs.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={media.url} alt={media.alt} />
      ) : (
        <span>Media unavailable</span>
      )}
    </div>
  );
}

function CoreRoutineUpload({ slot, media, onUpload, uploading }: {
  slot: (typeof CORE_ROUTINE_MEDIA_SLOTS)[number];
  media: CatalogMediaFields | undefined;
  onUpload: CatalogEditorSectionsProps["onUpload"];
  uploading: boolean;
}) {
  const [alt, setAlt] = useState(media?.alt ?? "");
  useEffect(() => setAlt(media?.alt ?? ""), [media?.alt]);
  const sortOrder = slot.role === "core_routine_editorial" ? 1 : slot.defaultSortOrder;
  return (
    <article className={styles.mediaCard}>
      {media ? <MediaPreview media={media} /> : <div className={styles.mediaPreview}>No image assigned</div>}
      <strong>{slot.label}</strong>
      <p className={styles.help}>{slot.helperText}</p>
      <TextField id={`core-routine-media-${slot.role}-alt`} label="Alt text" value={alt} onChange={setAlt} />
      <label className={styles.field}>
        <span className={styles.fieldLabel}>{media ? `Replace ${slot.label}` : `Add ${slot.label}`}</span>
        <input
          className={styles.input}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={uploading || !alt.trim()}
          onChange={async (event: ChangeEvent<HTMLInputElement>) => {
            const file = event.target.files?.[0];
            if (file) await onUpload(file, { role: slot.role, alt: alt.trim(), variantId: null, sortOrder, replaceRole: true });
            event.target.value = "";
          }}
        />
      </label>
    </article>
  );
}

function MediaUploadControl({ variants, onUpload, uploading }: {
  variants: Array<{ label: string; value: string }>;
  onUpload: CatalogEditorSectionsProps["onUpload"];
  uploading: boolean;
}) {
  const [role, setRole] = useState<ProductMediaRole>("gallery");
  const [alt, setAlt] = useState("");
  const [variantId, setVariantId] = useState("");
  return (
    <FieldGroup
      id="group-media-upload"
      title="Upload media"
      description="Stage a project-controlled image or video association in the current draft."
    >
      <div className={styles.inlineFields}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Media role</span>
          <select className={styles.select} value={role} onChange={(event) => setRole(event.target.value as ProductMediaRole)}>
            {PRODUCT_MEDIA_ROLES.filter((value) => !isCoreRoutineMediaRole(value)).map((value) => <option value={value} key={value}>{value.replaceAll("_", " ")}</option>)}
          </select>
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Variant association</span>
          <select className={styles.select} value={variantId} onChange={(event) => setVariantId(event.target.value)}>
            <option value="">All variants</option>
            {variants.map((variant) => <option value={variant.value} key={variant.value}>{variant.label}</option>)}
          </select>
        </label>
        <TextField id="media-upload-alt" label="Media alt text" value={alt} onChange={setAlt} />
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Choose media file</span>
          <input className={styles.input} type="file" accept="image/jpeg,image/png,image/webp,video/mp4" disabled={uploading || !alt.trim()} onChange={async (event) => {
            const file = event.target.files?.[0];
            if (file) await onUpload(file, { role, alt: alt.trim(), variantId: variantId || null });
            event.target.value = "";
          }} />
        </label>
      </div>
    </FieldGroup>
  );
}

function ProfileTokensEditor({ tokens, readOnly, onChange, changed, errors }: {
  tokens: Array<{ text: string; emphasis?: boolean }>;
  readOnly: boolean;
  onChange: (tokens: Array<{ text: string; emphasis?: boolean }>) => void;
  changed: number;
  errors: number;
}) {
  return (
    <FieldGroup
      id="group-pdp-profile-tokens"
      title="Profile title tokens"
      countLabel={`${tokens.length} ${tokens.length === 1 ? "token" : "tokens"}`}
      changed={changed}
      errors={errors}
      readOnly={readOnly}
    >
      {tokens.map((token, index) => (
        <div className={styles.inlineFields} key={`profile-token-${index}`}>
          <TextField id={`profile-token-${index}-text`} label={`Token ${index + 1}`} value={token.text} readOnly={readOnly} onChange={(text) => onChange(tokens.map((item, current) => current === index ? { ...item, text } : item))} />
          <label className={styles.checkboxField}><input type="checkbox" checked={token.emphasis === true} disabled={readOnly} onChange={(event) => onChange(tokens.map((item, current) => current === index ? { ...item, emphasis: event.target.checked } : item))} /><span><strong>Emphasis</strong></span></label>
          <button className={`${styles.button} ${styles.buttonDanger}`} type="button" disabled={readOnly} onClick={() => onChange(tokens.filter((_, current) => current !== index))}>Remove token</button>
        </div>
      ))}
      <button className={`${styles.button} ${styles.buttonSecondary}`} type="button" disabled={readOnly} onClick={() => onChange([...tokens, { text: "" }])}>Add token</button>
    </FieldGroup>
  );
}

function IngredientCardsEditor({ cards, readOnly, onChange, changed, errors }: {
  cards: CatalogIngredientCard[];
  readOnly: boolean;
  onChange: (cards: CatalogIngredientCard[]) => void;
  changed: number;
  errors: number;
}) {
  return (
    <FieldGroup
      id="group-pdp-ingredient-cards"
      title="Ingredient cards"
      countLabel={`${cards.length} ${cards.length === 1 ? "card" : "cards"}`}
      changed={changed}
      errors={errors}
      readOnly={readOnly}
    >
      {cards.map((card, index) => (
        <div className={styles.repeaterItem} key={`ingredient-card-${index}`}>
          {(["name", "label", "copy"] as const).map((field) => (
            <TextField key={field} id={`ingredient-card-${index}-${field}`} label={field === "copy" ? "Description" : field} value={card[field]} readOnly={readOnly} multiline={field === "copy"} onChange={(value) => onChange(cards.map((item, current) => current === index ? { ...item, [field]: value } : item))} />
          ))}
          <button className={`${styles.button} ${styles.buttonDanger}`} type="button" disabled={readOnly} onClick={() => onChange(cards.filter((_, current) => current !== index))}>Remove ingredient card</button>
        </div>
      ))}
      <button className={`${styles.button} ${styles.buttonSecondary}`} type="button" disabled={readOnly} onClick={() => onChange([...cards, { name: "", label: "", copy: "" }])}>Add ingredient card</button>
    </FieldGroup>
  );
}

function IngredientStoryEditor({ story, readOnly, onChange, changed, errors }: {
  story: PdpIngredientStory | null;
  readOnly: boolean;
  onChange: (story: PdpIngredientStory) => void;
  changed: number;
  errors: number;
}) {
  if (!story) return <p className={styles.help}>No ingredient story is configured.</p>;
  const updateHighlight = (index: number, field: "name" | "description", value: string) =>
    onChange({ ...story, highlights: story.highlights.map((item, current) => current === index ? { ...item, [field]: value } : item) as [CatalogIngredientHighlight, CatalogIngredientHighlight] });
  return (
    <FieldGroup
      id="group-pdp-ingredient-story"
      title="Ingredient story"
      countLabel={`${story.highlights.length} highlights`}
      changed={changed}
      errors={errors}
      readOnly={readOnly}
    >
      <div className={styles.fieldGrid}>
        <TextField id="ingredient-story-heading" label="Heading" value={story.heading} readOnly={readOnly} onChange={(heading) => onChange({ ...story, heading })} />
        <TextField id="ingredient-story-intro" label="Introduction" value={story.intro} readOnly={readOnly} multiline onChange={(intro) => onChange({ ...story, intro })} />
        {story.highlights.map((highlight, index) => (
          <div className={styles.repeaterItem} key={`ingredient-highlight-${index}`}>
            <TextField id={`ingredient-highlight-${index}-name`} label={`Highlight ${index + 1}`} value={highlight.name} readOnly={readOnly} onChange={(value) => updateHighlight(index, "name", value)} />
            <TextField id={`ingredient-highlight-${index}-description`} label="Description" value={highlight.description} readOnly={readOnly} multiline onChange={(value) => updateHighlight(index, "description", value)} />
          </div>
        ))}
        <TextField id="ingredient-story-supporting" label="Supporting ingredients" value={story.supportingIngredients} readOnly={readOnly} multiline onChange={(supportingIngredients) => onChange({ ...story, supportingIngredients })} />
      </div>
    </FieldGroup>
  );
}
