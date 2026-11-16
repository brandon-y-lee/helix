import { isDeepStrictEqual } from "node:util";
import type { CatalogAdminAccess } from "../../lib/admin/capabilities";
import {
  createCatalogDraft,
  getCatalogEditor,
  publishCatalogDraft,
  saveCatalogDraft,
  transitionCatalogDraft,
} from "../../lib/admin/catalog/service";
import { assertValidProductEditorDocument } from "../../lib/admin/catalog/validation";
import type { CatalogEditorResponse, ProductEditorDocumentV4 } from "../../lib/admin/catalog/types";
import { createSupabaseAdminClient } from "../../lib/supabase/admin";
import { assertExpectedProjectRef } from "../db/supabase-ops";

export const SUPER_SERUM = {
  productId: "f6091deb-1177-45ad-b506-1f0427fa4abe",
  variantId: "4f6e0f65-46e7-4b6c-9b67-e0a07ad63e49",
  slug: "super-serum",
  variantKey: "30ml",
  sku: "8809672285263",
  priceCents: 2500,
  currency: "USD",
} as const;

export type PublicationInput = {
  mode: "plan" | "apply" | "verify";
  actorId: string;
  /** Base revision before this publication; reuse it when verifying or retrying. */
  expectedRevision: number;
  target: "available" | "coming_soon";
};

export class PublicationError extends Error {}
function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new PublicationError(message);
}

function variant(document: ProductEditorDocumentV4) {
  const matches = document.variants.filter((item) => item.id === SUPER_SERUM.variantId);
  check(matches.length === 1, "The exact Super Serum variant is missing or duplicated.");
  return matches[0];
}

function pinOffer(document: ProductEditorDocumentV4) {
  const offer = variant(document);
  check(document.productId === SUPER_SERUM.productId &&
    document.product.id === SUPER_SERUM.productId &&
    document.product.slug === SUPER_SERUM.slug &&
    document.product.catalog_status === "active" &&
    document.product.currency === SUPER_SERUM.currency &&
    offer.product_id === SUPER_SERUM.productId &&
    offer.variant_key === SUPER_SERUM.variantKey && offer.label === "30 mL" &&
    offer.sku === SUPER_SERUM.sku && offer.price_cents === SUPER_SERUM.priceCents &&
    offer.archived_at === null,
  "Super Serum identity, active status, size, SKU or USD 2500 price changed. Stop and reconcile.");
}

function candidate(document: ProductEditorDocumentV4, target: PublicationInput["target"]) {
  pinOffer(document);
  const available = target === "available";
  check(document.product.status === (available ? "coming_soon" : "available") &&
    variant(document).available === !available &&
    variant(document).inventory_status === (available ? "unavailable" : "in_stock"),
  "The three availability fields do not match the expected starting state.");
  const next = structuredClone(document);
  next.product.status = target;
  variant(next).available = available;
  variant(next).inventory_status = available ? "in_stock" : "unavailable";
  return next;
}

// The publisher updates product publication/update time and the changed variant.
function publishedFacts(document: ProductEditorDocumentV4) {
  const facts = structuredClone(document);
  facts.product.updated_at = "";
  facts.product.published_at = "";
  variant(facts).updated_at = "";
  return facts;
}

function verifyRevision(state: CatalogEditorResponse, input: PublicationInput) {
  const before = state.systemMetadata.revisions.find((item) => item.revision_number === input.expectedRevision);
  const after = state.systemMetadata.revisions.find((item) => item.revision_number === input.expectedRevision + 1);
  check(before && after && after.product_id === SUPER_SERUM.productId &&
    after.published_by === input.actorId && after.source_draft_id,
  "The expected publication audit is missing or belongs to another actor.");
  const expected = candidate(assertValidProductEditorDocument(before.document), input.target);
  const published = assertValidProductEditorDocument(after.document);
  check(isDeepStrictEqual(publishedFacts(expected), publishedFacts(published)) &&
    isDeepStrictEqual(state.canonical, published),
  "Publication verification found changes beyond the three approved availability fields.");
  return after;
}

export async function runSuperSerumPublication(input: PublicationInput) {
  check(["plan", "apply", "verify"].includes(input.mode) &&
    ["available", "coming_soon"].includes(input.target) &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.actorId) &&
    Number.isSafeInteger(input.expectedRevision) && input.expectedRevision > 0,
  "Supply a mode, an explicit existing admin UUID and a positive expected base revision.");
  assertExpectedProjectRef();
  const { data: member, error } = await createSupabaseAdminClient()
    .from("admin_memberships").select("user_id, role, active")
    .eq("user_id", input.actorId).maybeSingle();
  check(!error && member?.user_id === input.actorId && member.active && member.role === "admin",
    "The explicit actor must have an active admin membership; commerce fields require admin access.");
  const access: CatalogAdminAccess = {
    userId: input.actorId, email: null, role: "admin",
    capabilities: ["catalog.read", "catalog.edit", "catalog.publish"],
  };
  const state = await getCatalogEditor(SUPER_SERUM.productId, access);
  check(!state.draft, "An active draft exists. Preserve it and reconcile through Admin.");
  pinOffer(state.canonical);
  const summary = {
    offer: SUPER_SERUM, actorId: input.actorId, baseRevision: input.expectedRevision,
    target: input.target,
    changes: [
      { field: "product.status", from: input.target === "available" ? "coming_soon" : "available", to: input.target },
      { field: `variants.${SUPER_SERUM.variantId}.available`, from: input.target !== "available", to: input.target === "available" },
      { field: `variants.${SUPER_SERUM.variantId}.inventory_status`, from: input.target === "available" ? "unavailable" : "in_stock", to: input.target === "available" ? "in_stock" : "unavailable" },
    ],
    stockMeaning: "Sandbox testing fixture; not physical stock.",
    downstreamVerificationRequired: ["canonical_cache", "catalog_webhooks", "algolia", "storefront_checkout"],
  };
  if (state.latestRevision === input.expectedRevision + 1) {
    const revision = verifyRevision(state, input);
    return { ...summary, status: "verified", revision: revision.revision_number,
      revisionId: revision.id, mediaVerification: "not_rechecked" };
  }
  check(state.latestRevision === input.expectedRevision, "The canonical revision changed. Stop and reconcile.");
  const base = state.systemMetadata.revisions.find((item) => item.revision_number === input.expectedRevision);
  check(base && isDeepStrictEqual(publishedFacts(assertValidProductEditorDocument(base.document)), publishedFacts(state.canonical)),
    "Canonical facts differ from the expected audited base revision. Stop and reconcile before publication.");
  const document = candidate(state.canonical, input.target);
  check(input.mode !== "verify", "The expected publication has not happened yet.");
  if (input.mode === "plan") return { ...summary, status: "planned", revision: state.latestRevision };

  const created = await createCatalogDraft(SUPER_SERUM.productId, input.actorId);
  check(created.created, "Another operator created a draft. It was not modified; reconcile through Admin.");
  check(created.draft.base_revision === input.expectedRevision &&
    created.draft.created_by === input.actorId && isDeepStrictEqual(created.draft.document, state.canonical),
  "The newly created draft has conflicting state. Stop and inspect it through Admin.");
  const saved = await saveCatalogDraft({
    draftId: created.draft.id, expectedVersion: created.draft.version,
    document, actorId: input.actorId, role: "admin",
  });
  check(isDeepStrictEqual(saved.draft.document, document), "The saved draft differs from the approved change.");
  const ready = await transitionCatalogDraft({
    draftId: created.draft.id, expectedVersion: saved.draft.version,
    action: "ready", actorId: input.actorId, role: "admin",
  });
  check(ready.draft.status === "ready" && ready.draft.validation_errors.length === 0 &&
    isDeepStrictEqual(ready.draft.document, document), "Catalog validation failed. Inspect the preserved draft through Admin.");
  const published = await publishCatalogDraft({
    draftId: created.draft.id, expectedVersion: ready.draft.version,
    actorId: input.actorId, role: "admin",
  });
  const current = await getCatalogEditor(SUPER_SERUM.productId, access);
  check(!current.draft && current.latestRevision === input.expectedRevision + 1,
    "Publication may have committed, but canonical state changed. Reconcile before retrying.");
  const revision = verifyRevision(current, input);
  check(revision.id === published.revision.id && revision.source_draft_id === created.draft.id,
    "The resulting publication audit does not identify this draft. Stop and reconcile.");
  return { ...summary, status: "published", revision: revision.revision_number,
    revisionId: revision.id, mediaVerification: published.mediaVerification.status,
    warnings: published.mediaVerification.status === "warning"
      ? ["Publication committed, but media verification reported a warning. Inspect through Admin before activation."] : [] };
}
