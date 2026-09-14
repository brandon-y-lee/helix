import type { ReactNode } from "react";
import { ProductDetail } from "@/components/product-detail/ProductDetail";
import type { ProductEditorDocumentV4 } from "@/lib/admin/catalog/types";
import type { CatalogPreviewProjection } from "@/lib/catalog-editor/preview-projection";
import type { ProductReviews } from "@/lib/catalog/product-reviews";
import { PREVIEW_COMMERCE_DISABLED_LABEL } from "@/lib/catalog-editor/preview-commerce";

export function CatalogPreviewState({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <article className="catalog-preview-state" aria-labelledby="preview-state">
      <p className="eyebrow">helix Catalog Preview</p>
      <h1 id="preview-state">{title}</h1>
      <p>{message}</p>
    </article>
  );
}

function PreviewMetadata({
  document,
}: {
  document: ProductEditorDocumentV4;
}) {
  const product = document.product;
  const list = (values: string[]) => values.length > 0 ? values.join(", ") : "Not set";
  const values = [
    ["Slug", product.slug],
    ["Display name", product.display_name],
    ["Product type", product.product_type],
    ["SEO title", product.seo_title ?? "Not set"],
    ["SEO description", product.seo_description ?? "Not set"],
    ["Badge", product.badge ?? "Not set"],
    ["Catalog status", product.catalog_status],
    ["Product status", product.status],
    ["Currency", product.currency],
    ["Routine group", product.routine_group],
    ["System Step", product.system_step_name ?? "Not set"],
    ["Routine order", String(product.routine_sort)],
    ["Storefront order", String(product.sort_order)],
    ["Benefits", list(product.benefits)],
    ["Formula notes", list(product.formula_notes)],
    ["Concerns", list(product.concerns)],
    ["Search keywords", list(product.search_keywords)],
  ] as const;

  return (
    <aside className="catalog-preview-metadata" aria-labelledby="preview-metadata-title">
      <h2 id="preview-metadata-title">Catalog Preview metadata</h2>
      <dl>
        {values.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}

export function CatalogPreviewView({
  document,
  preview,
  previewKey,
  reviews,
  toolbar,
}: {
  document: ProductEditorDocumentV4;
  preview: CatalogPreviewProjection;
  previewKey: string;
  reviews: ProductReviews;
  toolbar: ReactNode;
}) {
  return (
    <div className="catalog-preview-shell" data-catalog-draft-preview>
      {toolbar}
      <p className="catalog-preview-commerce-notice" role="status">
        {PREVIEW_COMMERCE_DISABLED_LABEL}
      </p>
      <PreviewMetadata document={document} />
      {preview.warnings.length > 0 && (
        <aside
          className="catalog-preview-warning"
          aria-label="Catalog Preview warnings"
        >
          {preview.warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </aside>
      )}
      <div className="storefront-shell" data-layout-shell="storefront">
        <ProductDetail
          key={previewKey}
          product={preview.product}
          coreProducts={preview.coreProducts}
          reviews={reviews}
          commerceDisabled
          stripePublishableKey={null}
        />
      </div>
    </div>
  );
}
