import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CatalogPreviewToolbar } from "@/components/admin/CatalogPreviewToolbar";
import { CatalogPreviewState, CatalogPreviewView } from "@/components/admin/CatalogPreviewView";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Catalog Preview verification | helix",
  robots: { index: false, follow: false },
};

const statePresentations = {
  discarded: {
    title: "Draft discarded",
    message: "This saved draft was discarded and can no longer be rendered as an unpublished product.",
    toolbar: true,
  },
  published: {
    title: "Draft already published",
    message: "This draft has already been published. Open the published PDP to view the canonical product.",
    toolbar: true,
  },
  invalid: {
    title: "Draft not found",
    message: "The preview address does not contain a valid draft identifier.",
    toolbar: false,
  },
  missing: {
    title: "Draft not found",
    message: "This draft does not exist, or it is no longer available to preview.",
    toolbar: false,
  },
  forbidden: {
    title: "Catalog access required",
    message: "Your account does not have catalog.read permission.",
    toolbar: false,
  },
  "auth-unavailable": {
    title: "Authentication unavailable",
    message: "Your access could not be verified. Try again when authentication is available.",
    toolbar: false,
  },
  "backend-unavailable": {
    title: "Catalog Preview unavailable",
    message: "The protected catalog editor backend is not available. No public product data has been substituted.",
    toolbar: false,
  },
  "canonical-unavailable": {
    title: "Canonical product unavailable",
    message: "The canonical product aggregate could not be loaded. The draft was not substituted with public data.",
    toolbar: true,
  },
  "product-unavailable": {
    title: "Product deleted or archived",
    message: "The canonical base for this draft is no longer an active product.",
    toolbar: true,
  },
  "schema-error": {
    title: "Draft schema unsupported",
    message: "Draft schema version 99 is not supported.",
    toolbar: true,
  },
  "validation-error": {
    title: "Draft validation failed",
    message: "The saved draft could not be rendered safely.",
    toolbar: true,
  },
} as const;

export default async function CatalogPreviewVerificationPage({
  searchParams = Promise.resolve({}),
}: {
  searchParams?: Promise<{ state?: string | string[] }>;
}) {
  if (
    process.env.VERCEL === "1" ||
    process.env.HELIX_VERIFICATION_ADAPTER !== "1"
  ) {
    notFound();
  }

  const { state = "success" } = await searchParams;
  if (
    typeof state !== "string" ||
    (state !== "success" && state !== "warning" && !Object.hasOwn(statePresentations, state))
  ) {
    notFound();
  }

  const { previewDocument, previewProduct, previewCoreProducts, previewReviews } =
    await import("./fixture-data");
  const toolbar = (
    <CatalogPreviewToolbar
      productName={previewProduct.displayName}
      status={state === "discarded" || state === "published" ? state : "draft"}
      version={1}
      lastSavedLabel="Sep 1, 2026, 12:00 PM UTC"
      editorPath="/helix-verification/admin/editor"
      publishedPath={null}
    />
  );

  if (Object.hasOwn(statePresentations, state)) {
    const presentation = statePresentations[state as keyof typeof statePresentations];
    const view = <CatalogPreviewState title={presentation.title} message={presentation.message} />;
    return presentation.toolbar ? (
      <div className="catalog-preview-shell">{toolbar}{view}</div>
    ) : view;
  }

  return (
    <CatalogPreviewView
      document={previewDocument}
      preview={{
        product: previewProduct,
        coreProducts: previewCoreProducts,
        warnings: state === "warning" ? ["Confirm the Product Education before publishing."] : [],
      }}
      previewKey="synthetic-preview:1"
      reviews={previewReviews}
      toolbar={toolbar}
    />
  );
}
