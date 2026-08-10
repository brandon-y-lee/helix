import { catalogDocumentDiff } from "@/lib/admin/catalog/diff";
import type {
  CatalogValidationIssue,
  ProductEditorDocumentV4,
} from "@/lib/admin/catalog/types";
import {
  FRAME_LIFT_PUBLICATIONS,
  buildFrameLiftPublicationDocument,
  isFrameLiftPublicationCurrent,
  type FrameLiftStep,
} from "@/lib/catalog/frame-lift-publication";

type DraftWithDocument = Readonly<{
  id: string;
  version: number;
  document: ProductEditorDocumentV4;
}>;

export type FrameLiftPublicationState = Readonly<{
  canonical: ProductEditorDocumentV4;
  activeDraftId: string | null;
  sourceRedirectExists: boolean;
}>;

export type FrameLiftPublicationGateway = Readonly<{
  readState(productId: string): Promise<FrameLiftPublicationState>;
  createDraft(productId: string): Promise<{
    created: boolean;
    draft: DraftWithDocument;
  }>;
  validateDocument(document: ProductEditorDocumentV4): CatalogValidationIssue[];
  saveDraft(input: {
    draftId: string;
    expectedVersion: number;
    document: ProductEditorDocumentV4;
    role: "admin";
  }): Promise<{ draft: DraftWithDocument }>;
  markReady(input: {
    draftId: string;
    expectedVersion: number;
  }): Promise<{ draft: { id: string; version: number } }>;
  publishDraft(input: {
    draftId: string;
    expectedVersion: number;
    document: ProductEditorDocumentV4;
    role: "admin";
    changeAudit: ReturnType<typeof catalogDocumentDiff>["advancedChanges"];
  }): Promise<{ revisionId: string; revisionNumber: number }>;
}>;

export type FrameLiftPublicationResult = Readonly<{
  step: FrameLiftStep;
  status: "published" | "already_published";
  slug: string;
  revisionId?: string;
  revisionNumber?: number;
}>;

function assertVerifiedState(
  state: FrameLiftPublicationState,
  step: FrameLiftStep,
): void {
  if (!isFrameLiftPublicationCurrent(state.canonical, step)) {
    throw new Error(`${step} publication did not persist the approved document.`);
  }
  if (!state.sourceRedirectExists) {
    throw new Error(`${step} publication is missing its permanent source redirect.`);
  }
  if (state.activeDraftId) {
    throw new Error(`${step} publication left an active draft behind.`);
  }
}

export async function publishFrameLiftProduct(
  step: FrameLiftStep,
  gateway: FrameLiftPublicationGateway,
): Promise<FrameLiftPublicationResult> {
  const definition = FRAME_LIFT_PUBLICATIONS[step];
  const initial = await gateway.readState(definition.productId);
  if (isFrameLiftPublicationCurrent(initial.canonical, step)) {
    assertVerifiedState(initial, step);
    return {
      step,
      status: "already_published",
      slug: definition.slug,
    };
  }
  if (initial.activeDraftId) {
    throw new Error(`${step} has an active draft; refusing to overwrite it.`);
  }

  const candidate = buildFrameLiftPublicationDocument(initial.canonical, step);
  const validationIssues = gateway.validateDocument(candidate);
  if (validationIssues.length > 0) {
    throw new Error(
      `${step} publication failed local validation: ${validationIssues
        .map((issue) => `${issue.path}: ${issue.message}`)
        .join("; ")}`,
    );
  }

  const created = await gateway.createDraft(definition.productId);
  if (!created.created) {
    throw new Error(`${step} draft was not created; publication lost a race.`);
  }
  const draftCandidate = buildFrameLiftPublicationDocument(
    created.draft.document,
    step,
  );
  if (JSON.stringify(draftCandidate) !== JSON.stringify(candidate)) {
    throw new Error(`${step} canonical document changed during draft creation.`);
  }

  const saved = await gateway.saveDraft({
    draftId: created.draft.id,
    expectedVersion: created.draft.version,
    document: draftCandidate,
    role: "admin",
  });
  const ready = await gateway.markReady({
    draftId: saved.draft.id,
    expectedVersion: saved.draft.version,
  });
  const published = await gateway.publishDraft({
    draftId: ready.draft.id,
    expectedVersion: ready.draft.version,
    document: draftCandidate,
    role: "admin",
    changeAudit: catalogDocumentDiff(initial.canonical, draftCandidate)
      .advancedChanges,
  });
  assertVerifiedState(await gateway.readState(definition.productId), step);

  return {
    step,
    status: "published",
    slug: definition.slug,
    revisionId: published.revisionId,
    revisionNumber: published.revisionNumber,
  };
}
