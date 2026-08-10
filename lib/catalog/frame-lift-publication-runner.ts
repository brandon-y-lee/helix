import { catalogDocumentDiff } from "@/lib/admin/catalog/diff";
import type {
  CatalogValidationIssue,
  ProductEditorDocumentV4,
} from "@/lib/admin/catalog/types";
import {
  FRAME_LIFT_PUBLICATIONS,
  buildFrameLiftPublicationDocument,
  frameLiftPublicationSnapshot,
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
  activeDraft: Readonly<{ id: string; version: number }> | null;
  latestRevisionId: string | null;
  latestRevisionDocument: ProductEditorDocumentV4 | null;
  sourceRedirectExists: boolean;
}>;

export type FrameLiftPublicationGateway = Readonly<{
  readState(productId: string): Promise<FrameLiftPublicationState>;
  createDraft(productId: string): Promise<{
    created: boolean;
    draft: DraftWithDocument;
  }>;
  validateDocument(
    canonical: ProductEditorDocumentV4,
    document: ProductEditorDocumentV4,
  ): Promise<CatalogValidationIssue[]>;
  verifyMedia(document: ProductEditorDocumentV4): Promise<void>;
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
  discardDraft(input: {
    draftId: string;
    expectedVersion: number;
  }): Promise<void>;
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
  expected?: ProductEditorDocumentV4,
  expectedRevisionId?: string,
): void {
  if (!isFrameLiftPublicationCurrent(state.canonical, step)) {
    throw new Error(`${step} publication did not persist the approved document.`);
  }
  const reference = expected ?? state.latestRevisionDocument;
  if (
    !reference ||
    (expected !== undefined &&
      (state.latestRevisionId !== expectedRevisionId ||
        !state.latestRevisionDocument ||
        JSON.stringify(
          frameLiftPublicationSnapshot(state.latestRevisionDocument),
        ) !== JSON.stringify(frameLiftPublicationSnapshot(expected)))) ||
    !isFrameLiftPublicationCurrent(reference, step) ||
    JSON.stringify(frameLiftPublicationSnapshot(state.canonical)) !==
      JSON.stringify(frameLiftPublicationSnapshot(reference))
  ) {
    throw new Error(
      `${step} canonical state does not match its governed publication snapshot.`,
    );
  }
  if (!state.sourceRedirectExists) {
    throw new Error(`${step} publication is missing its permanent source redirect.`);
  }
  if (state.activeDraft) {
    throw new Error(`${step} publication left an active draft behind.`);
  }
}

async function recoverFailedPublication(
  step: FrameLiftStep,
  createdDraftId: string,
  gateway: FrameLiftPublicationGateway,
): Promise<FrameLiftPublicationResult | null> {
  const definition = FRAME_LIFT_PUBLICATIONS[step];
  const state = await gateway.readState(definition.productId);
  if (isFrameLiftPublicationCurrent(state.canonical, step)) {
    assertVerifiedState(state, step);
    await gateway.verifyMedia(state.canonical);
    return {
      step,
      status: "published",
      slug: definition.slug,
    };
  }
  if (state.activeDraft?.id === createdDraftId) {
    await gateway.discardDraft({
      draftId: state.activeDraft.id,
      expectedVersion: state.activeDraft.version,
    });
  }
  return null;
}

export async function publishFrameLiftProduct(
  step: FrameLiftStep,
  gateway: FrameLiftPublicationGateway,
): Promise<FrameLiftPublicationResult> {
  const definition = FRAME_LIFT_PUBLICATIONS[step];
  const initial = await gateway.readState(definition.productId);
  if (isFrameLiftPublicationCurrent(initial.canonical, step)) {
    assertVerifiedState(initial, step);
    await gateway.verifyMedia(initial.canonical);
    return {
      step,
      status: "already_published",
      slug: definition.slug,
    };
  }
  if (initial.activeDraft) {
    throw new Error(`${step} has an active draft; refusing to overwrite it.`);
  }

  const candidate = buildFrameLiftPublicationDocument(initial.canonical, step);
  const validationIssues = await gateway.validateDocument(
    initial.canonical,
    candidate,
  );
  if (validationIssues.length > 0) {
    throw new Error(
      `${step} publication failed local validation: ${validationIssues
        .map((issue) => `${issue.path}: ${issue.message}`)
        .join("; ")}`,
    );
  }
  await gateway.verifyMedia(candidate);

  const created = await gateway.createDraft(definition.productId);
  if (!created.created) {
    throw new Error(`${step} draft was not created; publication lost a race.`);
  }
  try {
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
    const finalState = await gateway.readState(definition.productId);
    assertVerifiedState(
      finalState,
      step,
      draftCandidate,
      published.revisionId,
    );
    await gateway.verifyMedia(finalState.canonical);

    return {
      step,
      status: "published",
      slug: definition.slug,
      revisionId: published.revisionId,
      revisionNumber: published.revisionNumber,
    };
  } catch (cause) {
    const recovered = await recoverFailedPublication(
      step,
      created.draft.id,
      gateway,
    );
    if (recovered) return recovered;
    throw cause;
  }
}
