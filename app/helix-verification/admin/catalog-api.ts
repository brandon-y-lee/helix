import {
  CatalogVersionConflictError,
  type catalogEditorApi,
  type CatalogDraftDocument,
  type CatalogRevision,
} from "@/lib/admin/catalog-editor/client";
import {
  catalogDocument,
  catalogDraft,
  catalogProduct,
  editorResponse,
} from "./catalog-data";

export const CATALOG_VERIFICATION_STATES = [
  "default",
  "empty",
  "loading",
  "unavailable",
  "restricted",
  "validation",
  "conflict",
  "ready",
  "busy",
] as const;
export type CatalogVerificationState = (typeof CATALOG_VERIFICATION_STATES)[number];

async function rejectRemoteAction(): Promise<never> {
  throw new Error(
    "This action is disabled in local verification. No catalog changes were made.",
  );
}

// Every method is implemented locally. There is deliberately no production-client
// spread or network fallback, including when a new method is added to the API.
export function createVerificationCatalogApi(
  state: CatalogVerificationState,
): typeof catalogEditorApi {
  const canonical = structuredClone(catalogDocument);
  canonical.productFamily = {
    family: {
      id: "verification-family",
      slug: "verification-family",
      display_name: "Verification family",
      system_step_name: "CLEANSE",
      created_at: canonical.product.created_at,
      updated_at: canonical.product.updated_at,
    },
    memberships: [
      {
        family_id: "verification-family",
        product_id: canonical.productId,
        option_label: "Current cleanser",
        sort_order: 0,
        is_entry: true,
        created_at: canonical.product.created_at,
        updated_at: canonical.product.updated_at,
      },
    ],
  };
  canonical.relationships = [
    {
      product_id: canonical.productId,
      related_product_id: "123e4567-e89b-42d3-a456-426614174099",
      relationship_type: "related",
      sort_order: 0,
      created_at: canonical.product.created_at,
      archived_at: null,
    },
  ];
  let draft = {
    ...structuredClone(catalogDraft),
    document: structuredClone(canonical),
  };
  if (state === "ready") {
    draft.status = "ready";
    draft.document.product.editorial_description =
      "Synthetic draft copy prepared for presentation review.";
  }
  const revision: CatalogRevision = {
    id: "verification-revision",
    product_id: canonical.productId,
    revision_number: 3,
    schema_version: 4,
    document: canonical,
    source_draft_id: draft.id,
    published_by: null,
    published_at: canonical.product.created_at,
  };
  function response() {
    const initial = editorResponse(state !== "restricted");
    return structuredClone({
      ...initial,
      canonical,
      draft,
      systemMetadata: {
        ...initial.systemMetadata,
        drafts: [{ ...draft, document: null, validation_errors: [] }],
        revisions: [{ ...revision, document: null }],
        audit: [
          {
            id: "verification-audit",
            action: "synthetic presentation",
            created_at: canonical.product.created_at,
            actor_id: null,
            draft_id: draft.id,
            metadata: {},
            product_id: canonical.productId,
            revision_id: null,
          },
        ],
      },
    });
  }
  async function loadState() {
    if (state === "loading") await new Promise<never>(() => undefined);
    if (state === "unavailable") {
      throw new Error(
        "Synthetic catalog service unavailable. No provider was contacted.",
      );
    }
  }
  async function save(document: CatalogDraftDocument) {
    if (state === "conflict") {
      throw new CatalogVersionConflictError("Synthetic newer draft detected.", {
        id: draft.id,
        version: draft.version + 1,
        status: "draft",
        updatedAt: draft.updated_at,
        updatedBy: draft.updated_by,
      });
    }
    draft = {
      ...draft,
      version: draft.version + 1,
      document: structuredClone(document),
    };
    return { ok: true as const, draft: structuredClone(draft) };
  }
  return {
    async listProducts(params) {
      await loadState();
      if (
        state === "empty" ||
        params.search ||
        params.routine === "beyond" ||
        params.publication === "archived"
      ) {
        return { items: [], nextCursor: null };
      }
      const withImage = {
        ...catalogProduct,
        id: "verification-product-image",
        displayName: "Verification image",
        primaryMedia: {
          url: "/media/home/cleanse-product-card-default-01.webp",
          alt: "Synthetic catalog product image",
        },
      };
      return {
        items: params.cursor
          ? [withImage]
          : [structuredClone(catalogProduct), withImage],
        nextCursor: params.cursor ? null : "verification-next",
      };
    },
    async getEditor() {
      await loadState();
      return response();
    },
    async createDraft(_productId, document) {
      return save(document);
    },
    async saveDraft(_draftId, _version, document) {
      return save(document);
    },
    async validateDraft() {
      if (state === "busy") await new Promise<never>(() => undefined);
      const issues =
        state === "validation"
          ? [
              {
                table: "products" as const,
                field: "display_name",
                message: "Synthetic validation issue: review the display name.",
              },
            ]
          : [];
      return {
        valid: issues.length === 0,
        issues,
        affected_tables: ["products" as const],
        diff: {
          products: [
            {
              field: "editorial_description",
              before: canonical.product.editorial_description,
              after: draft.document.product.editorial_description,
            },
          ],
        },
        draft: structuredClone(draft),
      };
    },
    async markReady() {
      draft.status = "ready";
      return { ok: true as const, draft: structuredClone(draft) };
    },
    async listRevisions() {
      return { items: [structuredClone(revision)] };
    },
    publishDraft: rejectRemoteAction,
    discardDraft: rejectRemoteAction,
    restoreRevision: rejectRemoteAction,
    uploadMedia: rejectRemoteAction,
  };
}
