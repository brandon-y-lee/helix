"use client";

import { useEffect, useState, type ChangeEvent } from "react";
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
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className={styles.fieldGroup}>
      <legend>{title}</legend>
      <p className={styles.help}>{description}</p>
      <div className={styles.fieldGrid}>{children}</div>
    </fieldset>
  );
}

function TableSection({
  table,
  children,
  open = true,
}: {
  table: SectionKey;
  children: React.ReactNode;
  open?: boolean;
}) {
  return (
    <details className={styles.section} id={`section-${table}`} open={open}>
      <summary className={styles.summary}>
        <span>
          <span className={styles.tableLabel}>
            {table === "system_metadata" ? "Read only" : "Table"}
          </span>
          <br />
          {table === "system_metadata" ? "System Metadata" : table}
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

  return (
    <>
      <TableSection table="products">
        <FieldGroup
          title="Editorial"
          description="Canonical presentation fields used by the storefront."
        >
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
        </FieldGroup>
        <FieldGroup
          title="Advanced administrator"
          description="Supplier, commerce, and system-classification changes are admin-only and appear in the publish review."
        >
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
        </FieldGroup>
        <FieldGroup
          title="Metadata"
          description="Identity, timestamps, and architecture-constrained values remain visible and read only."
        >
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
        </FieldGroup>
      </TableSection>

      <PdpSection {...props} />
      <VariantsSection {...props} />
      <MediaSection {...props} />
      <RelationshipsSection {...props} />
      <SourceSection {...props} />
      <SystemMetadataSection metadata={props.systemMetadata} />
    </>
  );
}

function PdpSection({ document, role, issues, onChange }: CatalogEditorSectionsProps) {
  const pdp = document.productPdpContent;
  if (!pdp) {
    return (
      <TableSection table="product_pdp_content">
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
  return (
    <TableSection table="product_pdp_content">
      <div className={styles.fieldGrid}>
        {catalogFieldsForTable("product_pdp_content")
          .filter((field) => !structured.has(field.field))
          .map((metadata) => (
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
      <ProfileTokensEditor
        tokens={pdp.profile_title_tokens ?? []}
        readOnly={!canCatalogRoleEditField(role, "product_pdp_content", "profile_title_tokens")}
        onChange={(value) => update("profile_title_tokens", value)}
      />
      <IngredientCardsEditor
        cards={pdp.ingredient_cards ?? []}
        readOnly={!canCatalogRoleEditField(role, "product_pdp_content", "ingredient_cards")}
        onChange={(value) => update("ingredient_cards", value)}
      />
      <IngredientStoryEditor
        story={pdp.ingredient_story}
        readOnly={!canCatalogRoleEditField(role, "product_pdp_content", "ingredient_story")}
        onChange={(value) => update("ingredient_story", value)}
      />
    </TableSection>
  );
}

function VariantsSection({ document, role, issues, onChange }: CatalogEditorSectionsProps) {
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
    <TableSection table="product_variants">
      <p className={styles.help}>
        Prices are edited in dollars and stored as integer cents. Variant lifecycle and commerce fields require an admin.
      </p>
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
    </TableSection>
  );
}

function MediaSection(props: CatalogEditorSectionsProps) {
  const { document, role, issues, onChange, onUpload, uploading } = props;
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
    <TableSection table="product_media">
      {document.product.routine_group === "core" ? (
        <fieldset className={styles.fieldGroup}>
          <legend>Core routine media</legend>
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
        </fieldset>
      ) : null}
      <MediaUploadControl
        variants={variantOptions}
        onUpload={onUpload}
        uploading={uploading}
      />
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
    </TableSection>
  );
}

function RelationshipsSection({ document, role, issues, relationshipTargets, onChange }: CatalogEditorSectionsProps) {
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
    <TableSection table="product_relationships">
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
    </TableSection>
  );
}

function SourceSection({ document, role, issues, onChange }: CatalogEditorSectionsProps) {
  const source = document.productSource;
  if (!source) {
    return (
      <TableSection table="product_sources">
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
    <TableSection table="product_sources">
      <p className={styles.help}>
        Safe source corrections require an admin. Reconciliation identifiers, hashes, inspection state, and raw snapshots remain immutable.
      </p>
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
    </TableSection>
  );
}

function SystemMetadataSection({ metadata }: { metadata: CatalogEditorResponse["systemMetadata"] }) {
  return (
    <TableSection table="system_metadata" open={false}>
      <p className={styles.help}>
        Workflow, revision, and audit records are displayed for inspection only. They are not part of the editable product document.
      </p>
      <MetadataRows table="product_content_drafts" rows={metadata.drafts} />
      <MetadataRows table="catalog_product_revisions" rows={metadata.revisions} />
      <MetadataRows table="catalog_editor_audit_log" rows={metadata.audit} />
    </TableSection>
  );
}

function MetadataRows({ table, rows }: { table: CatalogEditorTable; rows: Array<Record<string, unknown>> }) {
  const fields = catalogFieldsForTable(table);
  return (
    <section className={styles.metadataRows}>
      <h3>{table}</h3>
      {rows.length === 0 ? <p className={styles.help}>No records.</p> : null}
      {rows.map((row, index) => (
        <details className={styles.metadataRecord} key={String(row.id ?? index)}>
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
    </section>
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
    <fieldset className={styles.fieldGroup}>
      <legend>Upload media</legend>
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
    </fieldset>
  );
}

function ProfileTokensEditor({ tokens, readOnly, onChange }: {
  tokens: Array<{ text: string; emphasis?: boolean }>;
  readOnly: boolean;
  onChange: (tokens: Array<{ text: string; emphasis?: boolean }>) => void;
}) {
  return (
    <fieldset className={styles.fieldGroup}>
      <legend>Profile title tokens</legend>
      {tokens.map((token, index) => (
        <div className={styles.inlineFields} key={`profile-token-${index}`}>
          <TextField id={`profile-token-${index}-text`} label={`Token ${index + 1}`} value={token.text} readOnly={readOnly} onChange={(text) => onChange(tokens.map((item, current) => current === index ? { ...item, text } : item))} />
          <label className={styles.checkboxField}><input type="checkbox" checked={token.emphasis === true} disabled={readOnly} onChange={(event) => onChange(tokens.map((item, current) => current === index ? { ...item, emphasis: event.target.checked } : item))} /><span><strong>Emphasis</strong></span></label>
          <button className={`${styles.button} ${styles.buttonDanger}`} type="button" disabled={readOnly} onClick={() => onChange(tokens.filter((_, current) => current !== index))}>Remove token</button>
        </div>
      ))}
      <button className={`${styles.button} ${styles.buttonSecondary}`} type="button" disabled={readOnly} onClick={() => onChange([...tokens, { text: "" }])}>Add token</button>
    </fieldset>
  );
}

function IngredientCardsEditor({ cards, readOnly, onChange }: {
  cards: CatalogIngredientCard[];
  readOnly: boolean;
  onChange: (cards: CatalogIngredientCard[]) => void;
}) {
  return (
    <fieldset className={styles.fieldGroup}>
      <legend>Ingredient cards</legend>
      {cards.map((card, index) => (
        <div className={styles.repeaterItem} key={`ingredient-card-${index}`}>
          {(["name", "label", "copy"] as const).map((field) => (
            <TextField key={field} id={`ingredient-card-${index}-${field}`} label={field === "copy" ? "Description" : field} value={card[field]} readOnly={readOnly} multiline={field === "copy"} onChange={(value) => onChange(cards.map((item, current) => current === index ? { ...item, [field]: value } : item))} />
          ))}
          <button className={`${styles.button} ${styles.buttonDanger}`} type="button" disabled={readOnly} onClick={() => onChange(cards.filter((_, current) => current !== index))}>Remove ingredient card</button>
        </div>
      ))}
      <button className={`${styles.button} ${styles.buttonSecondary}`} type="button" disabled={readOnly} onClick={() => onChange([...cards, { name: "", label: "", copy: "" }])}>Add ingredient card</button>
    </fieldset>
  );
}

function IngredientStoryEditor({ story, readOnly, onChange }: {
  story: PdpIngredientStory | null;
  readOnly: boolean;
  onChange: (story: PdpIngredientStory) => void;
}) {
  if (!story) return <p className={styles.help}>No ingredient story is configured.</p>;
  const updateHighlight = (index: number, field: "name" | "description", value: string) =>
    onChange({ ...story, highlights: story.highlights.map((item, current) => current === index ? { ...item, [field]: value } : item) as [CatalogIngredientHighlight, CatalogIngredientHighlight] });
  return (
    <fieldset className={styles.fieldGroup}>
      <legend>Ingredient story</legend>
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
    </fieldset>
  );
}
