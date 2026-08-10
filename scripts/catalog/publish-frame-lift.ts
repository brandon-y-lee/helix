import type { SupabaseClient } from "@supabase/supabase-js";
import {
  assertValidProductEditorDocument,
  validateProductEditorDocument,
} from "../../lib/admin/catalog/validation";
import { validateCatalogEditorOwnership } from "../../lib/admin/catalog/ownership";
import type {
  CatalogDraftRecord,
  CatalogValidationIssue,
} from "../../lib/admin/catalog/types";
import {
  FRAME_LIFT_PUBLICATIONS,
  buildFrameLiftPublicationDocument,
  type FrameLiftStep,
} from "../../lib/catalog/frame-lift-publication";
import {
  publishFrameLiftProduct,
  type FrameLiftPublicationGateway,
} from "../../lib/catalog/frame-lift-publication-runner";
import { CATALOG_MEDIA_BUCKET } from "../../lib/catalog/media-storage";
import { productMediaHttpClient } from "../../lib/catalog/product-media-http-client";
import { verifyRealProductMedia } from "../../lib/catalog/real-product-media-verification";
import { createOpsClient, parseFlag, printJson } from "../db/supabase-ops";

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function operationError(
  operation: string,
  error: { code?: string } | null,
): never {
  throw new Error(
    `${operation} failed${error?.code ? ` (${error.code})` : ""}; no provider payload was logged.`,
  );
}

function resultRecord(operation: string, value: unknown): JsonRecord {
  if (!isRecord(value) || value.ok === false) operationError(operation, null);
  return value;
}

function draftRecord(operation: string, value: unknown): CatalogDraftRecord {
  const record = resultRecord(operation, value);
  const candidate = isRecord(record.draft) ? record.draft : record;
  if (
    typeof candidate.id !== "string" ||
    typeof candidate.version !== "number" ||
    !isRecord(candidate.document)
  ) {
    operationError(operation, null);
  }
  return {
    ...candidate,
    document: assertValidProductEditorDocument(candidate.document),
  } as CatalogDraftRecord;
}

async function findAdminActor(client: SupabaseClient): Promise<string> {
  const { data, error } = await client
    .from("admin_memberships")
    .select("user_id")
    .eq("active", true)
    .eq("role", "admin")
    .limit(2);
  if (error) operationError("Admin membership lookup", error);
  if (data?.length !== 1) {
    throw new Error("Publication requires exactly one active administrator.");
  }
  return data[0]!.user_id;
}

function stepForProduct(productId: string): FrameLiftStep {
  const entry = Object.entries(FRAME_LIFT_PUBLICATIONS).find(
    ([, definition]) => definition.productId === productId,
  );
  if (!entry) throw new Error("Unexpected FRAME/LIFT Product id.");
  return entry[0] as FrameLiftStep;
}

function createGateway(
  client: SupabaseClient,
  actorId: string,
): FrameLiftPublicationGateway {
  return {
    async readState(productId) {
      const step = stepForProduct(productId);
      const definition = FRAME_LIFT_PUBLICATIONS[step];
      const [documentResult, draftResult, revisionResult, routeResult] =
        await Promise.all([
        client.rpc("get_catalog_editor_document", { p_product_id: productId }),
        client
          .from("product_content_drafts")
          .select("id, version")
          .eq("product_id", productId)
          .in("status", ["draft", "ready"])
          .limit(2),
        client
          .from("catalog_product_revisions")
          .select("id, document")
          .eq("product_id", productId)
          .order("revision_number", { ascending: false })
          .limit(1)
          .maybeSingle(),
        client
          .from("product_slug_routes")
          .select("source_slug")
          .eq("source_slug", definition.sourceSlug)
          .eq("source_product_id", productId)
          .eq("target_product_id", productId)
          .eq("route_kind", "rename")
          .limit(1),
        ]);
      if (documentResult.error) {
        operationError("Catalog document read", documentResult.error);
      }
      if (draftResult.error) {
        operationError("Active draft read", draftResult.error);
      }
      if (revisionResult.error) {
        operationError("Catalog revision read", revisionResult.error);
      }
      if (routeResult.error) operationError("Slug redirect read", routeResult.error);
      if ((draftResult.data?.length ?? 0) > 1) {
        throw new Error(`${step} has multiple active drafts; publication is unsafe.`);
      }
      return {
        canonical: assertValidProductEditorDocument(documentResult.data),
        activeDraft: draftResult.data?.[0] ?? null,
        latestRevisionId: revisionResult.data?.id ?? null,
        latestRevisionDocument: revisionResult.data
          ? assertValidProductEditorDocument(revisionResult.data.document)
          : null,
        sourceRedirectExists: (routeResult.data?.length ?? 0) === 1,
      };
    },

    async createDraft(productId) {
      const { data, error } = await client.rpc("create_catalog_product_draft", {
        p_product_id: productId,
        p_actor_id: actorId,
      });
      if (error) operationError("Draft creation", error);
      const record = resultRecord("Draft creation", data);
      return {
        created: record.created === true,
        draft: draftRecord("Draft creation", data),
      };
    },

    async validateDocument(
      canonical,
      document,
    ): Promise<CatalogValidationIssue[]> {
      const issues = [
        ...validateProductEditorDocument(document).issues,
        ...validateCatalogEditorOwnership(document, canonical, "admin"),
      ];
      document.media.forEach((media, index) => {
        if (media.pendingUpload) {
          issues.push({
            path: `media.${index}.pendingUpload`,
            code: "pending_upload_forbidden",
            message:
              "The release command does not publish unverified pending uploads.",
          });
        }
      });
      const relatedIds = [...new Set(
        document.relationships.map((item) => item.related_product_id),
      )];
      if (relatedIds.length > 0) {
        const { data, error } = await client
          .from("products")
          .select("id")
          .in("id", relatedIds);
        if (error) operationError("Relationship verification", error);
        const existingIds = new Set((data ?? []).map((item) => item.id));
        document.relationships.forEach((relationship, index) => {
          if (!existingIds.has(relationship.related_product_id)) {
            issues.push({
              path: `relationships.${index}.related_product_id`,
              code: "related_product_not_found",
              message: "Related Product must exist before publication.",
            });
          }
        });
      }
      return issues;
    },

    async verifyMedia(document) {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      if (!supabaseUrl) throw new Error("Missing approved Supabase URL.");
      const report = await verifyRealProductMedia({
        expectedMedia: document.media.flatMap((media) =>
          media.archived_at === null &&
          typeof media.url === "string" &&
          media.url.length > 0
            ? [{
                url: media.url,
                mediaType: media.media_type as "image" | "video",
              }]
            : [],
        ),
        urlPolicy: {
          approvedLocations: [{
            origin: new URL(supabaseUrl).origin,
            pathPrefix: `/storage/v1/object/public/${CATALOG_MEDIA_BUCKET}/`,
          }],
          maxRedirects: 2,
          timeoutMs: 5_000,
        },
        httpClient: productMediaHttpClient,
      });
      if (report.summary.failures > 0) {
        throw new Error(
          `Product Media verification failed for ${report.summary.failures} asset(s).`,
        );
      }
    },

    async saveDraft({ draftId, expectedVersion, document, role }) {
      const { data, error } = await client.rpc("save_catalog_product_draft", {
        p_draft_id: draftId,
        p_expected_version: expectedVersion,
        p_document: document as never,
        p_actor_id: actorId,
        p_actor_role: role,
      });
      if (error) operationError("Draft save", error);
      return { draft: draftRecord("Draft save", data) };
    },

    async markReady({ draftId, expectedVersion }) {
      const { data, error } = await client.rpc(
        "transition_catalog_product_draft",
        {
          p_draft_id: draftId,
          p_expected_version: expectedVersion,
          p_action: "ready",
          p_validation_errors: [],
          p_actor_id: actorId,
        },
      );
      if (error) operationError("Draft readiness transition", error);
      const draft = draftRecord("Draft readiness transition", data);
      return { draft: { id: draft.id, version: draft.version } };
    },

    async discardDraft({ draftId, expectedVersion }) {
      const { data, error } = await client.rpc(
        "transition_catalog_product_draft",
        {
          p_draft_id: draftId,
          p_expected_version: expectedVersion,
          p_action: "discard",
          p_validation_errors: [],
          p_actor_id: actorId,
        },
      );
      if (error) operationError("Draft cleanup", error);
      draftRecord("Draft cleanup", data);
    },

    async publishDraft({
      draftId,
      expectedVersion,
      document,
      role,
      changeAudit,
    }) {
      const { data, error } = await client.rpc("publish_catalog_product_draft", {
        p_draft_id: draftId,
        p_expected_version: expectedVersion,
        p_actor_id: actorId,
        p_actor_role: role,
        p_change_audit: changeAudit as never,
      });
      if (error) operationError("Draft publication", error);
      const record = resultRecord("Draft publication", data);
      if (!isRecord(record.revision)) operationError("Draft publication", null);
      const revisionId = record.revision.id;
      const revisionNumber = record.revision.revision_number;
      if (typeof revisionId !== "string" || typeof revisionNumber !== "number") {
        operationError("Draft publication", null);
      }
      void document;
      return { revisionId, revisionNumber };
    },
  };
}

async function main(): Promise<void> {
  if (parseFlag("--verify")) {
    const client = createOpsClient();
    const gateway = createGateway(client, "unused-read-only-actor");
    const candidates = [];
    for (const step of ["FRAME", "LIFT"] as const) {
      const definition = FRAME_LIFT_PUBLICATIONS[step];
      const state = await gateway.readState(definition.productId);
      if (state.activeDraft) {
        throw new Error(`${step} has an active draft; verification stopped.`);
      }
      const candidate = buildFrameLiftPublicationDocument(
        state.canonical,
        step,
      );
      const issues = await gateway.validateDocument(
        state.canonical,
        candidate,
      );
      if (issues.length > 0) {
        throw new Error(
          `${step} candidate has ${issues.length} validation issue(s): ${issues
            .map((issue) => `${issue.path}:${issue.code}`)
            .join(", ")}.`,
        );
      }
      await gateway.verifyMedia(candidate);
      candidates.push({
        step,
        sourceSlug: state.canonical.product.slug,
        targetSlug: candidate.product.slug,
        currentVariants: state.canonical.variants.length,
        candidateOffers: candidate.variants.length,
        preservedMedia: candidate.media.length,
        preservedRelationships: candidate.relationships.length,
        activeDraft: false,
      });
    }
    printJson({
      mode: "verified-dry-run",
      project: "erasogmsqpgiirovubjh",
      candidates,
      mutated: false,
    });
    return;
  }

  if (!parseFlag("--apply")) {
    printJson({
      mode: "plan",
      project: "erasogmsqpgiirovubjh",
      products: Object.entries(FRAME_LIFT_PUBLICATIONS).map(
        ([step, definition]) => ({
          step,
          productId: definition.productId,
          from: definition.sourceSlug,
          to: definition.slug,
          status: "coming_soon",
          offers: 0,
        }),
      ),
      next: "Re-run with --apply after live project and dependency verification.",
    });
    return;
  }

  const client = createOpsClient();
  const gateway = createGateway(client, await findAdminActor(client));
  const results = [];
  for (const step of ["FRAME", "LIFT"] as const) {
    results.push(await publishFrameLiftProduct(step, gateway));
  }
  printJson({
    project: "erasogmsqpgiirovubjh",
    results,
    catalogVerified: true,
    downstreamVerificationRequired: ["cache", "algolia"],
  });
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Publication failed.");
  process.exitCode = 1;
});
