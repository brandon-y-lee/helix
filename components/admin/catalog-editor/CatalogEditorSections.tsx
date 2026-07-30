"use client";

import { ChangeEvent, useState } from "react";
import {
  CatalogDraftDocument,
  CatalogIngredientCard,
  CatalogIngredientHighlight,
  CatalogMediaFields,
  CatalogRelationshipFields,
  CatalogTable,
  CatalogValidationIssue,
  CatalogVariantFields,
} from "@/lib/admin/catalog-editor/client";
import { getCatalogEditorFieldPolicy } from "@/lib/catalog/field-ownership";
import { StringListEditor, TextField } from "./CatalogFieldControls";
import styles from "./CatalogEditor.module.css";

export const CATALOG_SECTIONS: Array<{
  key: CatalogTable;
  label: string;
}> = [
  { key: "products", label: "Products" },
  { key: "product_pdp_content", label: "PDP content" },
  { key: "product_variants", label: "Variants" },
  { key: "product_media", label: "Media" },
  { key: "product_relationships", label: "Relationships" },
];

export function catalogFieldId(
  table: CatalogTable,
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

function fieldReadOnly(table: CatalogTable, field: string) {
  return getCatalogEditorFieldPolicy(table, field)?.editable !== true;
}

interface CatalogEditorSectionsProps {
  document: CatalogDraftDocument;
  issues: CatalogValidationIssue[];
  onChange: (document: CatalogDraftDocument) => void;
  onUpload: (
    file: File,
    metadata: { role: string; alt: string; variantId?: string | null },
  ) => Promise<void>;
  uploading: boolean;
}

export default function CatalogEditorSections({
  document,
  issues,
  onChange,
  onUpload,
  uploading,
}: CatalogEditorSectionsProps) {
  const product = document.product;
  const pdp = document.productPdpContent;

  function updateProduct<K extends keyof typeof product>(
    field: K,
    value: (typeof product)[K],
  ) {
    onChange({ ...document, product: { ...product, [field]: value } });
  }

  function updatePdp(
    changes: Partial<NonNullable<CatalogDraftDocument["productPdpContent"]>>,
  ) {
    if (!pdp) return;
    onChange({
      ...document,
      productPdpContent: { ...pdp, ...changes },
    });
  }

  function updateVariant(
    id: string,
    changes: Partial<CatalogVariantFields>,
  ) {
    onChange({
      ...document,
      variants: document.variants.map((variant) =>
        variant.id === id ? { ...variant, ...changes } : variant,
      ),
    });
  }

  function updateMedia(id: string, changes: Partial<CatalogMediaFields>) {
    onChange({
      ...document,
      media: document.media.map((media) =>
        media.id === id ? { ...media, ...changes } : media,
      ),
    });
  }

  function moveMedia(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= document.media.length) return;
    const media = [...document.media];
    [media[index], media[target]] = [media[target], media[index]];
    onChange({
      ...document,
      media: media.map((item, sortOrder) => ({
        ...item,
        sort_order: sortOrder,
      })),
    });
  }

  function removeMedia(id: string) {
    onChange({
      ...document,
      media: document.media
        .filter((media) => media.id !== id)
        .map((media, index) => ({ ...media, sort_order: index })),
    });
  }

  function updateRelationship(
    identity: string,
    changes: Partial<CatalogRelationshipFields>,
  ) {
    onChange({
      ...document,
      relationships: document.relationships.map((relationship) =>
        `${relationship.related_product_id}:${relationship.relationship_type}` ===
        identity
          ? { ...relationship, ...changes }
          : relationship,
      ),
    });
  }

  return (
    <>
      <details className={styles.section} id="section-products" open>
        <summary className={styles.summary}>
          <span>
            <span className={styles.tableLabel}>Table</span>
            <br />
            products
          </span>
        </summary>
        <div className={styles.sectionBody}>
          <div className={styles.fieldGrid}>
            <TextField
              id={catalogFieldId("products", "display_name")}
              label="Display name"
              value={product.display_name}
              onChange={(value) => updateProduct("display_name", value)}
              error={issueFor(issues, "products", "display_name")}
              readOnly={fieldReadOnly("products", "display_name")}
            />
            <TextField
              id={catalogFieldId("products", "formal_title")}
              label="Formal title"
              value={product.formal_title}
              onChange={(value) => updateProduct("formal_title", value)}
              readOnly={fieldReadOnly("products", "formal_title")}
            />
            <TextField
              id={catalogFieldId("products", "product_type")}
              label="Product type"
              value={product.product_type}
              onChange={(value) => updateProduct("product_type", value)}
              readOnly={fieldReadOnly("products", "product_type")}
            />
            <TextField
              id={catalogFieldId("products", "slug")}
              label="Slug"
              value={product.slug}
              onChange={(value) => updateProduct("slug", value)}
              error={issueFor(issues, "products", "slug")}
              readOnly={fieldReadOnly("products", "slug")}
            />
            <div className={styles.fullWidth}>
              <TextField
                id={catalogFieldId("products", "card_tagline")}
                label="Card tagline"
                value={product.card_tagline}
                onChange={(value) => updateProduct("card_tagline", value)}
                readOnly={fieldReadOnly("products", "card_tagline")}
              />
            </div>
            <div className={styles.fullWidth}>
              <TextField
                id={catalogFieldId("products", "editorial_description")}
                label="Editorial description"
                value={product.editorial_description}
                onChange={(value) =>
                  updateProduct("editorial_description", value)
                }
                multiline
                error={issueFor(issues, "products", "editorial_description")}
                readOnly={fieldReadOnly(
                  "products",
                  "editorial_description",
                )}
              />
            </div>
            <div className={styles.fullWidth}>
              <TextField
                id={catalogFieldId("products", "editorial_how_to_use")}
                label="Editorial how to use"
                value={product.editorial_how_to_use}
                onChange={(value) =>
                  updateProduct("editorial_how_to_use", value)
                }
                multiline
                readOnly={fieldReadOnly(
                  "products",
                  "editorial_how_to_use",
                )}
              />
            </div>
            {(
              [
                ["made_for", "Made for"],
                ["good_for", "Good for"],
                ["texture", "Texture"],
                ["finish", "Finish"],
                ["volume", "Volume"],
              ] as const
            ).map(([field, label]) => (
              <TextField
                id={catalogFieldId("products", field)}
                key={field}
                label={label}
                value={product[field]}
                onChange={(value) => updateProduct(field, value)}
                readOnly={fieldReadOnly("products", field)}
              />
            ))}
            <StringListEditor
              id={catalogFieldId("products", "benefits")}
              label="Benefits"
              values={product.benefits}
              onChange={(values) => updateProduct("benefits", values)}
              error={issueFor(issues, "products", "benefits")}
              readOnly={fieldReadOnly("products", "benefits")}
            />
            <StringListEditor
              id={catalogFieldId("products", "key_ingredients")}
              label="Key ingredients"
              values={product.key_ingredients}
              onChange={(values) => updateProduct("key_ingredients", values)}
              readOnly={fieldReadOnly("products", "key_ingredients")}
            />
            <StringListEditor
              id={catalogFieldId("products", "cautions")}
              label="Cautions"
              values={product.cautions}
              onChange={(values) => updateProduct("cautions", values)}
              readOnly={fieldReadOnly("products", "cautions")}
            />
            <StringListEditor
              id={catalogFieldId("products", "skin_types")}
              label="Skin types"
              values={product.skin_types}
              onChange={(values) => updateProduct("skin_types", values)}
              readOnly={fieldReadOnly("products", "skin_types")}
            />
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Routine classification</span>
              <select
                className={styles.select}
                id={catalogFieldId("products", "routine_group")}
                value={product.routine_group}
                disabled={fieldReadOnly("products", "routine_group")}
                onChange={(event) =>
                  updateProduct(
                    "routine_group",
                    event.target.value as
                      | "core"
                      | "beyond_core",
                  )
                }
              >
                <option value="core">Core</option>
                <option value="beyond_core">Beyond</option>
              </select>
            </label>
            <TextField
              id={catalogFieldId("products", "routine_step_name")}
              label="Routine step name"
              value={product.routine_step_name ?? ""}
              onChange={(value) => updateProduct("routine_step_name", value)}
              readOnly={fieldReadOnly("products", "routine_step_name")}
            />
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Routine step number</span>
              <input
                className={styles.input}
                id={catalogFieldId("products", "routine_step_number")}
                type="number"
                min="0"
                value={product.routine_step_number ?? ""}
                disabled={fieldReadOnly(
                  "products",
                  "routine_step_number",
                )}
                onChange={(event) =>
                  updateProduct(
                    "routine_step_number",
                    event.target.value ? Number(event.target.value) : null,
                  )
                }
              />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Routine sort order</span>
              <input
                className={styles.input}
                id={catalogFieldId("products", "routine_sort")}
                type="number"
                min="0"
                value={product.routine_sort}
                disabled={fieldReadOnly("products", "routine_sort")}
                onChange={(event) =>
                  updateProduct(
                    "routine_sort",
                    Number(event.target.value),
                  )
                }
              />
            </label>
            <TextField
              id={catalogFieldId("products", "seo_title")}
              label="SEO title"
              value={product.seo_title}
              onChange={(value) => updateProduct("seo_title", value)}
              readOnly={fieldReadOnly("products", "seo_title")}
            />
            <TextField
              id={catalogFieldId("products", "seo_description")}
              label="SEO description"
              value={product.seo_description}
              onChange={(value) => updateProduct("seo_description", value)}
              multiline
              readOnly={fieldReadOnly("products", "seo_description")}
            />
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Publication state</span>
              <select
                className={styles.select}
                id={catalogFieldId("products", "catalog_status")}
                value={product.catalog_status}
                disabled={fieldReadOnly("products", "catalog_status")}
                onChange={(event) =>
                  updateProduct("catalog_status", event.target.value)
                }
              >
                <option value="draft">Draft</option>
                <option value="active">Active / published</option>
                <option value="archived">Archived</option>
              </select>
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Product availability</span>
              <select
                className={styles.select}
                id={catalogFieldId("products", "status")}
                value={product.status}
                disabled={fieldReadOnly("products", "status")}
                onChange={(event) =>
                  updateProduct("status", event.target.value)
                }
              >
                <option value="available">Available</option>
                <option value="coming_soon">Coming soon</option>
                <option value="sold_out">Sold out</option>
              </select>
            </label>
          </div>

        </div>
      </details>

      <details className={styles.section} id="section-product_pdp_content" open>
        <summary className={styles.summary}>
          <span>
            <span className={styles.tableLabel}>Table</span>
            <br />
            product_pdp_content
          </span>
        </summary>
        <div className={styles.sectionBody}>
          {!pdp ? (
            <p className={styles.help}>
              No structured PDP content record is attached to this product.
            </p>
          ) : (
            <div className={styles.stack}>
              <TextField
                id={catalogFieldId("product_pdp_content", "routine_overlay")}
                label="Routine overlay"
                value={pdp.routine_overlay}
                onChange={(value) => updatePdp({ routine_overlay: value })}
              />
              <TextField
                id={catalogFieldId("product_pdp_content", "outcome_heading")}
                label="Outcome heading"
                value={pdp.outcome_heading}
                onChange={(value) => updatePdp({ outcome_heading: value })}
              />
              <StringListEditor
                id={catalogFieldId("product_pdp_content", "outcome_labels")}
                label="Outcome states"
                values={pdp.outcome_labels ?? []}
                onChange={(values) =>
                  updatePdp({
                    outcome_labels:
                      values.length === 3
                        ? (values as [string, string, string])
                        : null,
                  })
                }
                minimum={3}
                maximum={3}
                error={issueFor(
                  issues,
                  "product_pdp_content",
                  "outcome_labels",
                )}
              />
              <StringListEditor
                id={catalogFieldId("product_pdp_content", "how_to_use_steps")}
                label="How-to steps"
                values={pdp.how_to_use_steps ?? []}
                onChange={(values) => updatePdp({ how_to_use_steps: values })}
              />
              <StringListEditor
                id={catalogFieldId("product_pdp_content", "application_steps")}
                label="Application states"
                values={pdp.application_steps ?? []}
                onChange={(values) => updatePdp({ application_steps: values })}
              />
              <fieldset className={styles.repeater}>
                <legend className={styles.legend}>Profile title tokens</legend>
                {(pdp.profile_title_tokens ?? []).map((token, index) => (
                  <div className={styles.repeaterItem} key={`token-${index}`}>
                    <div className={styles.inlineFields}>
                    <TextField
                      id={`profile-token-${index}`}
                      label={`Token ${index + 1}`}
                      value={token.text}
                      onChange={(value) =>
                        updatePdp({
                          profile_title_tokens: (
                            pdp.profile_title_tokens ?? []
                          ).map(
                            (current, currentIndex) =>
                              currentIndex === index
                                ? { ...current, text: value }
                                : current,
                          ),
                        })
                      }
                    />
                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>Emphasis</span>
                      <select
                        className={styles.select}
                        value={token.emphasis ? "true" : "false"}
                        onChange={(event) =>
                          updatePdp({
                            profile_title_tokens: (
                              pdp.profile_title_tokens ?? []
                            ).map(
                              (current, currentIndex) =>
                                currentIndex === index
                                  ? {
                                      ...current,
                                      emphasis: event.target.value === "true",
                                    }
                                  : current,
                            ),
                          })
                        }
                      >
                        <option value="false">Normal</option>
                        <option value="true">Emphasized</option>
                      </select>
                    </label>
                    </div>
                    <button
                      className={`${styles.button} ${styles.buttonDanger}`}
                      type="button"
                      onClick={() =>
                        updatePdp({
                          profile_title_tokens:
                            (pdp.profile_title_tokens ?? []).filter(
                              (_, currentIndex) => currentIndex !== index,
                            ),
                        })
                      }
                    >
                      Remove token
                    </button>
                  </div>
                ))}
                <button
                  className={`${styles.button} ${styles.buttonSecondary}`}
                  type="button"
                  onClick={() =>
                    updatePdp({
                      profile_title_tokens: [
                        ...(pdp.profile_title_tokens ?? []),
                        { text: "", emphasis: false },
                      ],
                    })
                  }
                >
                  Add profile token
                </button>
              </fieldset>
              <IngredientCardsEditor
                cards={pdp.ingredient_cards ?? []}
                onChange={(ingredient_cards) => updatePdp({ ingredient_cards })}
              />
              {pdp.ingredient_story ? (
                <fieldset className={styles.repeater}>
                  <legend className={styles.legend}>Ingredient story</legend>
                  <TextField
                    id="ingredient-story-heading"
                    label="Heading"
                    value={pdp.ingredient_story.heading}
                    onChange={(heading) =>
                      updatePdp({
                        ingredient_story: {
                          ...pdp.ingredient_story!,
                          heading,
                        },
                      })
                    }
                  />
                  <TextField
                    id="ingredient-story-intro"
                    label="Introduction"
                    value={pdp.ingredient_story.intro}
                    onChange={(intro) =>
                      updatePdp({
                        ingredient_story: {
                          ...pdp.ingredient_story!,
                          intro,
                        },
                      })
                    }
                    multiline
                  />
                  <IngredientHighlightsEditor
                    highlights={pdp.ingredient_story.highlights}
                    onChange={(highlights) =>
                      updatePdp({
                        ingredient_story: {
                          ...pdp.ingredient_story!,
                          highlights,
                        },
                      })
                    }
                  />
                  <TextField
                    id="ingredient-story-supporting"
                    label="Supporting ingredients"
                    value={pdp.ingredient_story.supportingIngredients}
                    onChange={(supportingIngredients) =>
                      updatePdp({
                        ingredient_story: {
                          ...pdp.ingredient_story!,
                          supportingIngredients,
                        },
                      })
                    }
                    multiline
                  />
                </fieldset>
              ) : null}
              <TextField
                id={catalogFieldId("product_pdp_content", "routine_guidance")}
                label="Routine guidance"
                value={pdp.routine_guidance}
                onChange={(value) => updatePdp({ routine_guidance: value })}
                multiline
              />
            </div>
          )}
        </div>
      </details>

      <details className={styles.section} id="section-product_variants" open>
        <summary className={styles.summary}>
          <span>
            <span className={styles.tableLabel}>Table</span>
            <br />
            product_variants
          </span>
        </summary>
        <div className={styles.sectionBody}>
          <p className={styles.help} id="variant-table-help">
            This table scrolls horizontally at narrow widths. Prices are entered
            in dollars and saved as integer cents.
          </p>
          <div
            className={styles.tableScroller}
            role="region"
            aria-label="Product variants"
            aria-describedby="variant-table-help"
            tabIndex={0}
          >
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Title</th>
                  <th>SKU</th>
                  <th>Price</th>
                  <th>Sellable</th>
                  <th>Stock state</th>
                  <th>Order</th>
                </tr>
              </thead>
              <tbody>
                {document.variants.map((variant) => (
                  <tr key={variant.id}>
                    <td>
                      <input
                        aria-label={`${variant.label} title`}
                        className={styles.input}
                        id={catalogFieldId(
                          "product_variants",
                          "label",
                          variant.id,
                        )}
                        value={variant.label}
                        disabled={fieldReadOnly(
                          "product_variants",
                          "label",
                        )}
                        onChange={(event) =>
                          updateVariant(variant.id, {
                            label: event.target.value,
                          })
                        }
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`${variant.label} SKU`}
                        className={styles.input}
                        id={catalogFieldId(
                          "product_variants",
                          "sku",
                          variant.id,
                        )}
                        value={variant.sku ?? ""}
                        disabled={fieldReadOnly("product_variants", "sku")}
                        onChange={(event) =>
                          updateVariant(variant.id, { sku: event.target.value })
                        }
                      />
                      {issueFor(
                        issues,
                        "product_variants",
                        "sku",
                        variant.id,
                      ) ? (
                        <p className={styles.fieldError}>
                          {issueFor(
                            issues,
                            "product_variants",
                            "sku",
                            variant.id,
                          )}
                        </p>
                      ) : null}
                    </td>
                    <td>
                      <input
                        aria-label={`${variant.label} price in dollars`}
                        className={styles.input}
                        id={catalogFieldId(
                          "product_variants",
                          "price_cents",
                          variant.id,
                        )}
                        inputMode="decimal"
                        disabled={fieldReadOnly(
                          "product_variants",
                          "price_cents",
                        )}
                        value={(variant.price_cents / 100).toFixed(2)}
                        onChange={(event) => {
                          if (!event.target.value.trim()) {
                            updateVariant(variant.id, { price_cents: -1 });
                            return;
                          }
                          const dollars = Number(event.target.value);
                          updateVariant(variant.id, {
                            price_cents: Number.isFinite(dollars)
                              ? Math.round(dollars * 100)
                              : -1,
                          });
                        }}
                      />
                      {issueFor(
                        issues,
                        "product_variants",
                        "price_cents",
                        variant.id,
                      ) ? (
                        <p className={styles.fieldError}>
                          {issueFor(
                            issues,
                            "product_variants",
                            "price_cents",
                            variant.id,
                          )}
                        </p>
                      ) : null}
                    </td>
                    <td>
                      <input
                        aria-label={`${variant.label} sellable`}
                        type="checkbox"
                        checked={variant.available}
                        disabled={fieldReadOnly(
                          "product_variants",
                          "available",
                        )}
                        onChange={(event) =>
                          updateVariant(variant.id, {
                            available: event.target.checked,
                          })
                        }
                      />
                    </td>
                    <td>
                      <select
                        aria-label={`${variant.label} inventory status`}
                        className={styles.select}
                        value={variant.inventory_status}
                        disabled={fieldReadOnly(
                          "product_variants",
                          "inventory_status",
                        )}
                        onChange={(event) =>
                          updateVariant(variant.id, {
                            inventory_status: event.target.value,
                          })
                        }
                      >
                        <option value="in_stock">In stock</option>
                        <option value="low_stock">Low stock</option>
                        <option value="out_of_stock">Out of stock</option>
                        <option value="unavailable">Unavailable</option>
                      </select>
                    </td>
                    <td>
                      <input
                        aria-label={`${variant.label} sort order`}
                        className={styles.input}
                        type="number"
                        value={variant.sort_order ?? 0}
                        disabled={fieldReadOnly(
                          "product_variants",
                          "sort_order",
                        )}
                        onChange={(event) =>
                          updateVariant(variant.id, {
                            sort_order: Number(event.target.value),
                          })
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </details>

      <details className={styles.section} id="section-product_media" open>
        <summary className={styles.summary}>
          <span>
            <span className={styles.tableLabel}>Table</span>
            <br />
            product_media
          </span>
        </summary>
        <div className={styles.sectionBody}>
          <MediaUploadControl onUpload={onUpload} uploading={uploading} />
          <div className={styles.mediaGrid}>
            {document.media.map((media, index) => (
              <article className={styles.mediaCard} key={media.id}>
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
                <TextField
                  id={catalogFieldId("product_media", "role", media.id)}
                  label="Role"
                  value={media.role}
                  onChange={(role) => updateMedia(media.id, { role })}
                  readOnly={fieldReadOnly("product_media", "role")}
                  error={issueFor(
                    issues,
                    "product_media",
                    "role",
                    media.id,
                  )}
                />
                <TextField
                  id={catalogFieldId("product_media", "alt", media.id)}
                  label="Alt text"
                  value={media.alt}
                  onChange={(alt) => updateMedia(media.id, { alt })}
                  readOnly={fieldReadOnly("product_media", "alt")}
                />
                <div className={styles.actionRow}>
                  <button
                    className={`${styles.button} ${styles.buttonSecondary}`}
                    type="button"
                    disabled={
                      fieldReadOnly("product_media", "sort_order") ||
                      index === 0
                    }
                    onClick={() => moveMedia(index, -1)}
                  >
                    Move earlier
                  </button>
                  <button
                    className={`${styles.button} ${styles.buttonSecondary}`}
                    type="button"
                    disabled={
                      fieldReadOnly("product_media", "sort_order") ||
                      index === document.media.length - 1
                    }
                    onClick={() => moveMedia(index, 1)}
                  >
                    Move later
                  </button>
                  <button
                    className={`${styles.button} ${styles.buttonDanger}`}
                    type="button"
                    disabled={fieldReadOnly("product_media", "role")}
                    onClick={() => removeMedia(media.id)}
                  >
                    Remove
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>
      </details>

      <details
        className={styles.section}
        id="section-product_relationships"
        open
      >
        <summary className={styles.summary}>
          <span>
            <span className={styles.tableLabel}>Table</span>
            <br />
            product_relationships
          </span>
        </summary>
        <div className={styles.sectionBody}>
          <div className={styles.repeater}>
              {document.relationships.length === 0 ? (
                <p className={styles.help}>
                  No product relationships are configured.
                </p>
              ) : null}
              {document.relationships.map((relationship) => {
                const identity = `${relationship.related_product_id}:${relationship.relationship_type}`;
                return (
                <div className={styles.inlineFields} key={identity}>
                  <TextField
                    id={catalogFieldId(
                      "product_relationships",
                      "related_product_id",
                      identity,
                    )}
                    label="Related product"
                    value={relationship.related_product_id}
                    onChange={(related_product_id) =>
                      updateRelationship(identity, {
                        related_product_id,
                      })
                    }
                    help="Use the stable catalog product ID."
                    readOnly={fieldReadOnly(
                      "product_relationships",
                      "related_product_id",
                    )}
                    error={issueFor(
                      issues,
                      "product_relationships",
                      "related_product_id",
                      identity,
                    )}
                  />
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Relationship type</span>
                    <select
                      className={styles.select}
                      value={relationship.relationship_type}
                      disabled={fieldReadOnly(
                        "product_relationships",
                        "relationship_type",
                      )}
                      onChange={(event) =>
                        updateRelationship(identity, {
                          relationship_type: event.target.value,
                        })
                      }
                    >
                      <option value="complete_the_routine">
                        Complete the routine
                      </option>
                      <option value="related">Related</option>
                      <option value="routine_next">Routine next</option>
                    </select>
                  </label>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Sort order</span>
                    <input
                      className={styles.input}
                      type="number"
                      value={relationship.sort_order}
                      disabled={fieldReadOnly(
                        "product_relationships",
                        "sort_order",
                      )}
                      onChange={(event) =>
                        updateRelationship(identity, {
                          sort_order: Number(event.target.value),
                        })
                      }
                    />
                  </label>
                  <button
                    className={`${styles.button} ${styles.buttonDanger}`}
                    type="button"
                    onClick={() =>
                      onChange({
                        ...document,
                        relationships:
                          document.relationships.filter(
                            (current) =>
                              `${current.related_product_id}:${current.relationship_type}` !==
                              identity,
                          ),
                      })
                    }
                  >
                    Remove relationship
                  </button>
                </div>
                );
              })}
              <button
                className={`${styles.button} ${styles.buttonSecondary}`}
                type="button"
                onClick={() =>
                  onChange({
                    ...document,
                    relationships: [
                      ...document.relationships,
                      {
                        related_product_id: crypto.randomUUID(),
                        relationship_type: "related",
                        sort_order: document.relationships.length,
                      },
                    ],
                  })
                }
              >
                Add relationship
              </button>
            </div>
        </div>
      </details>
    </>
  );
}

function MediaUploadControl({
  onUpload,
  uploading,
}: {
  onUpload: (
    file: File,
    metadata: { role: string; alt: string; variantId?: string | null },
  ) => Promise<void>;
  uploading: boolean;
}) {
  const [role, setRole] = useState("gallery");
  const [alt, setAlt] = useState("");
  return (
    <fieldset className={styles.repeater}>
      <legend className={styles.legend}>Upload media</legend>
      <div className={styles.inlineFields}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Media role</span>
          <select
            className={styles.select}
            value={role}
            onChange={(event) => setRole(event.target.value)}
          >
            {[
              "card",
              "hero",
              "gallery",
              "detail",
              "card_default",
              "card_hover",
              "cart",
              "search",
              "routine_video",
              "routine_video_poster",
              "profile_editorial",
              "ingredients_texture",
              "core_routine_texture",
              "pdp_outcome",
              "pdp_application",
            ].map((value) => (
              <option value={value} key={value}>
                {value.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <TextField
          id="media-upload-alt"
          label="Media alt text"
          value={alt}
          onChange={setAlt}
          help="Describe the media without deriving meaning from its filename."
        />
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Choose media file</span>
          <input
            className={styles.input}
            type="file"
            accept="image/jpeg,image/png,image/webp,video/mp4"
            disabled={uploading || !alt.trim()}
            onChange={async (event: ChangeEvent<HTMLInputElement>) => {
              const file = event.target.files?.[0];
              if (file) await onUpload(file, { role, alt: alt.trim() });
              event.target.value = "";
            }}
          />
        </label>
      </div>
      <span className={styles.help}>
        Uploads use the protected admin endpoint and remain draft-scoped until
        publication.
      </span>
    </fieldset>
  );
}

function IngredientCardsEditor({
  cards,
  onChange,
}: {
  cards: CatalogIngredientCard[];
  onChange: (cards: CatalogIngredientCard[]) => void;
}) {
  return (
    <fieldset className={styles.repeater}>
      <legend className={styles.legend}>Ingredient cards</legend>
      {cards.map((card, index) => (
        <div className={styles.repeaterItem} key={`ingredient-card-${index}`}>
          <TextField
            id={`ingredient-card-${index}-name`}
            label={`Ingredient ${index + 1}`}
            value={card.name}
            onChange={(name) =>
              onChange(
                cards.map((current, currentIndex) =>
                  currentIndex === index ? { ...current, name } : current,
                ),
              )
            }
          />
          <TextField
            id={`ingredient-card-${index}-label`}
            label="Label"
            value={card.label}
            onChange={(label) =>
              onChange(
                cards.map((current, currentIndex) =>
                  currentIndex === index
                    ? { ...current, label }
                    : current,
                ),
              )
            }
          />
          <TextField
            id={`ingredient-card-${index}-copy`}
            label="Description"
            value={card.copy}
            onChange={(copy) =>
              onChange(
                cards.map((current, currentIndex) =>
                  currentIndex === index ? { ...current, copy } : current,
                ),
              )
            }
            multiline
          />
          <button
            className={`${styles.button} ${styles.buttonDanger}`}
            type="button"
            onClick={() =>
              onChange(cards.filter((_, currentIndex) => currentIndex !== index))
            }
          >
            Remove ingredient card
          </button>
        </div>
      ))}
      <button
        className={`${styles.button} ${styles.buttonSecondary}`}
        type="button"
        onClick={() =>
          onChange([...cards, { name: "", label: "", copy: "" }])
        }
      >
        Add ingredient card
      </button>
    </fieldset>
  );
}

function IngredientHighlightsEditor({
  highlights,
  onChange,
}: {
  highlights: readonly [
    CatalogIngredientHighlight,
    CatalogIngredientHighlight,
  ];
  onChange: (
    highlights: [
      CatalogIngredientHighlight,
      CatalogIngredientHighlight,
    ],
  ) => void;
}) {
  return (
    <fieldset className={styles.repeater}>
      <legend className={styles.legend}>Ingredient highlights</legend>
      {highlights.map((highlight, index) => (
        <div className={styles.repeaterItem} key={`highlight-${index}`}>
          <TextField
            id={`highlight-${index}-title`}
            label={`Highlight ${index + 1}`}
            value={highlight.name}
            onChange={(name) =>
              onChange(
                highlights.map((current, currentIndex) =>
                  currentIndex === index ? { ...current, name } : current,
                ) as [
                  CatalogIngredientHighlight,
                  CatalogIngredientHighlight,
                ],
              )
            }
          />
          <TextField
            id={`highlight-${index}-description`}
            label="Description"
            value={highlight.description}
            onChange={(description) =>
              onChange(
                highlights.map((current, currentIndex) =>
                  currentIndex === index
                    ? { ...current, description }
                    : current,
                ) as [
                  CatalogIngredientHighlight,
                  CatalogIngredientHighlight,
                ],
              )
            }
            multiline
          />
        </div>
      ))}
    </fieldset>
  );
}
