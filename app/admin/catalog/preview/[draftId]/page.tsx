import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ProductDetail } from "@/components/product-detail/ProductDetail";
import { CatalogPreviewToolbar } from "@/components/admin/CatalogPreviewToolbar";
import { authRedirectParam } from "@/lib/auth/redirect";
import {
  ADMIN_CAPABILITIES,
  checkAdminCapability,
} from "@/lib/admin/capabilities";
import { CatalogAdminError } from "@/lib/admin/catalog/errors";
import { getCatalogDraftForPreview } from "@/lib/admin/catalog/service";
import { loadCatalogPreviewBase } from "@/lib/catalog-editor/preview-data";
import {
  CatalogPreviewProjectionError,
  projectCatalogDraftPreview,
} from "@/lib/catalog-editor/preview-projection";
import { PREVIEW_COMMERCE_DISABLED_LABEL } from "@/lib/catalog-editor/preview-commerce";
import { getProductReviews } from "@/lib/catalog/product-reviews";

const CATALOG_DRAFT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type CatalogDraftLoadFailure =
  | "backend_unavailable"
  | "draft_not_found"
  | "permission_revoked"
  | "validation_error";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export const metadata: Metadata = {
  title: "Catalog Preview",
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};

function PreviewState({
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

function draftFailureCopy(reason: CatalogDraftLoadFailure) {
  switch (reason) {
    case "draft_not_found":
      return {
        title: "Draft not found",
        message:
          "This draft does not exist, or it is no longer available to preview.",
      };
    case "permission_revoked":
      return {
        title: "Permission required",
        message:
          "Your catalog preview permission is no longer valid. Return to the editor and sign in again.",
      };
    case "validation_error":
      return {
        title: "Draft validation failed",
        message:
          "The saved draft could not be read safely. Correct it in the editor before previewing again.",
      };
    case "backend_unavailable":
      return {
        title: "Draft preview unavailable",
        message:
          "The protected catalog editor backend is not available. No public product data has been substituted.",
      };
  }
}

function documentProductName(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "Catalog product";
  }
  const product = (value as { product?: unknown }).product;
  if (!product || typeof product !== "object" || Array.isArray(product)) {
    return "Catalog product";
  }
  const candidate = product as { display_name?: unknown };
  return typeof candidate.display_name === "string" &&
    candidate.display_name.trim()
    ? candidate.display_name
    : "Catalog product";
}

function documentSlug(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const product = (value as { product?: unknown }).product;
  if (!product || typeof product !== "object" || Array.isArray(product)) {
    return null;
  }
  const slug = (product as { slug?: unknown }).slug;
  return typeof slug === "string" &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)
    ? slug
    : null;
}

function savedAtLabel(value: string) {
  return `${new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value))} UTC`;
}

function PreviewMetadata({
  document,
}: {
  document: Awaited<ReturnType<typeof getCatalogDraftForPreview>>["document"];
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

export default async function CatalogDraftPreviewPage({
  params,
}: {
  params: Promise<{ draftId: string }>;
}) {
  const { draftId } = await params;
  if (!CATALOG_DRAFT_ID_PATTERN.test(draftId)) {
    return (
      <PreviewState
        title="Draft not found"
        message="The preview address does not contain a valid draft identifier."
      />
    );
  }

  const previewPath = `/admin/catalog/preview/${draftId}`;
  const authorization = await checkAdminCapability(
    ADMIN_CAPABILITIES.catalogRead,
  );
  if (authorization.status === "unauthenticated") {
    redirect(authRedirectParam(previewPath));
  }
  if (authorization.status === "forbidden") {
    return (
      <PreviewState
        title="Catalog access required"
        message="Your account does not have catalog.read permission."
      />
    );
  }
  if (authorization.status === "unavailable") {
    return (
      <PreviewState
        title="Authentication unavailable"
        message="Your access could not be verified. Try again when authentication is available."
      />
    );
  }

  let record;
  try {
    record = await getCatalogDraftForPreview(draftId);
  } catch (error) {
    const failure =
      error instanceof CatalogAdminError && error.status === 404
        ? "draft_not_found"
        : "backend_unavailable";
    return (
      <PreviewState {...draftFailureCopy(failure)} />
    );
  }

  const productName = documentProductName(record.document);
  const publishedSlug = documentSlug(record.document);
  const toolbar = (linkSlug: string | null = publishedSlug) => (
    <CatalogPreviewToolbar
      productName={productName}
      status={record.status}
      version={record.version}
      lastSavedLabel={savedAtLabel(record.updated_at)}
      editorPath={`/admin/catalog/products/${encodeURIComponent(
        record.product_id,
      )}`}
      publishedPath={
        linkSlug
          ? `/products/${encodeURIComponent(linkSlug)}`
          : null
      }
    />
  );

  if (record.status === "discarded") {
    return (
      <div className="catalog-preview-shell">
        {toolbar()}
        <PreviewState
          title="Draft discarded"
          message="This saved draft was discarded and can no longer be rendered as an unpublished product."
        />
      </div>
    );
  }
  if (record.status === "published") {
    return (
      <div className="catalog-preview-shell">
        {toolbar()}
        <PreviewState
          title="Draft already published"
          message="This draft has already been published. Open the published PDP to view the canonical product."
        />
      </div>
    );
  }
  if (!publishedSlug) {
    return (
      <div className="catalog-preview-shell">
        {toolbar()}
        <PreviewState
          title="Draft validation failed"
          message="The saved draft does not identify a canonical product."
        />
      </div>
    );
  }

  let base;
  try {
    base = await loadCatalogPreviewBase(publishedSlug);
  } catch {
    return (
      <div className="catalog-preview-shell">
        {toolbar()}
        <PreviewState
          title="Canonical product unavailable"
          message="The canonical product aggregate could not be loaded. The draft was not substituted with public data."
        />
      </div>
    );
  }
  if (!base) {
    return (
      <div className="catalog-preview-shell">
        {toolbar()}
        <PreviewState
          title="Product deleted or archived"
          message="The canonical base for this draft is no longer an active product."
        />
      </div>
    );
  }

  let preview;
  try {
    preview = projectCatalogDraftPreview(record.document, base);
  } catch (error) {
    const projectionError =
      error instanceof CatalogPreviewProjectionError ? error : null;
    const title =
      projectionError?.code === "unsupported_schema"
        ? "Draft schema unsupported"
        : projectionError?.code === "product_unavailable"
          ? "Product deleted or archived"
          : "Draft validation failed";
    return (
      <div className="catalog-preview-shell">
        {toolbar(base.product.slug)}
        <PreviewState
          title={title}
          message={
            projectionError?.message ??
            "The saved draft could not be rendered safely."
          }
        />
      </div>
    );
  }

  return (
    <div className="catalog-preview-shell" data-catalog-draft-preview>
      {toolbar(base.product.slug)}
      <p className="catalog-preview-commerce-notice" role="status">
        {PREVIEW_COMMERCE_DISABLED_LABEL}
      </p>
      <PreviewMetadata document={record.document} />
      {preview.warnings.length > 0 && (
        <aside
          className="catalog-preview-warning"
          aria-label="Draft preview warnings"
        >
          {preview.warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </aside>
      )}
      <div className="storefront-shell" data-layout-shell="storefront">
        <ProductDetail
          key={`${record.id}:${record.version}`}
          product={preview.product}
          coreProducts={preview.coreProducts}
          reviews={getProductReviews(base.product.slug)}
          commerceDisabled
          stripePublishableKey={null}
        />
      </div>
    </div>
  );
}
