"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  CatalogDraft,
  CatalogDraftDocument,
  CatalogConflictSnapshot,
  CatalogPublishResult,
  CatalogRevision,
  CatalogValidationIssue,
  CatalogValidationResult,
  CatalogVersionConflictError,
  catalogEditorApi,
} from "@/lib/admin/catalog-editor/client";
import type { CatalogEditorResponse } from "@/lib/admin/catalog/types";
import { catalogDocumentDiff } from "@/lib/admin/catalog/diff";
import type { CatalogEditorRole } from "@/lib/catalog/field-ownership";
import type { ProductMediaRole } from "@/lib/catalog/media-roles";
import CatalogEditorSections, {
  CATALOG_SECTIONS,
  catalogFieldId,
  catalogGroupIdForField,
} from "./CatalogEditorSections";
import styles from "./CatalogEditor.module.css";

function localIssues(document: CatalogDraftDocument): CatalogValidationIssue[] {
  const issues: CatalogValidationIssue[] = [];
  if (!(document.product.display_name ?? "").trim()) {
    issues.push({
      table: "products",
      field: "display_name",
      message: "Display name is required.",
    });
  }
  if (!document.product.slug.trim()) {
    issues.push({
      table: "products",
      field: "slug",
      message: "Slug is required.",
    });
  }

  const skuOwners = new Map<string, string>();
  for (const variant of document.variants) {
    if (!variant.label.trim()) {
      issues.push({
        table: "product_variants",
        field: "label",
        row_id: variant.id,
        message: "Variant title is required.",
      });
    }
    const sku = (variant.sku ?? "").trim().toLocaleLowerCase();
    if (sku && skuOwners.has(sku)) {
      issues.push({
        table: "product_variants",
        field: "sku",
        row_id: variant.id,
        message: "SKU must be unique within this product.",
      });
    } else if (sku) {
      skuOwners.set(sku, variant.id);
    }
    if (!Number.isInteger(variant.price_cents) || variant.price_cents < 0) {
      issues.push({
        table: "product_variants",
        field: "price_cents",
        row_id: variant.id,
        message: "Enter a valid non-negative price.",
      });
    }
  }

  const relationshipKeys = new Set<string>();
  for (const relationship of document.relationships) {
    const key = `${relationship.related_product_id}:${relationship.relationship_type}`;
    if (relationship.related_product_id === document.productId) {
      issues.push({
        table: "product_relationships",
        field: "related_product_id",
        row_id: key,
        message: "A product cannot relate to itself.",
      });
    } else if (relationshipKeys.has(key)) {
      issues.push({
        table: "product_relationships",
        field: "related_product_id",
        row_id: key,
        message: "This relationship is duplicated.",
      });
    } else {
      relationshipKeys.add(key);
    }
  }
  return issues;
}

function issueTarget(issue: CatalogValidationIssue) {
  return `#${catalogFieldId(issue.table, issue.field, issue.row_id)}`;
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "Empty";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function documentDiff(
  before: CatalogDraftDocument,
  after: CatalogDraftDocument,
): Pick<CatalogValidationResult, "diff" | "affected_tables"> {
  const result = catalogDocumentDiff(before, after);
  return { diff: result.diff, affected_tables: result.affectedTables };
}

export default function CatalogEditor({ productId }: { productId: string }) {
  const [document, setDocument] = useState<CatalogDraftDocument | null>(null);
  const [savedDocument, setSavedDocument] =
    useState<CatalogDraftDocument | null>(null);
  const [canonicalDocument, setCanonicalDocument] =
    useState<CatalogDraftDocument | null>(null);
  const [draft, setDraft] = useState<CatalogDraft | null>(null);
  const [role, setRole] = useState<CatalogEditorRole>("catalog_editor");
  const [relationshipTargets, setRelationshipTargets] = useState<
    CatalogEditorResponse["relationshipTargets"]
  >([]);
  const [systemMetadata, setSystemMetadata] = useState<
    CatalogEditorResponse["systemMetadata"]
  >({ drafts: [], revisions: [], audit: [] });
  const [canPublish, setCanPublish] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<CatalogValidationIssue[]>([]);
  const [validation, setValidation] =
    useState<CatalogValidationResult | null>(null);
  const [conflict, setConflict] = useState<{
    latestDraft: CatalogConflictSnapshot | null;
  } | null>(null);
  const [revisions, setRevisions] = useState<CatalogRevision[] | null>(null);
  const [status, setStatus] = useState("");
  const [publishResult, setPublishResult] =
    useState<CatalogPublishResult | null>(null);
  const [publishReviewOpen, setPublishReviewOpen] = useState(false);
  const [disruptiveAcknowledged, setDisruptiveAcknowledged] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const activeDocument = useRef<CatalogDraftDocument | null>(null);

  const dirty = useMemo(
    () =>
      Boolean(
        document &&
          savedDocument &&
          JSON.stringify(document) !== JSON.stringify(savedDocument),
      ),
    [document, savedDocument],
  );
  const changes = useMemo(
    () =>
      document && savedDocument
        ? catalogDocumentDiff(savedDocument, document)
        : { diff: {}, affectedTables: [], advancedChanges: [] },
    [document, savedDocument],
  );

  const revealTarget = useCallback((selector: string, focus = true) => {
    const target = window.document.querySelector<HTMLElement>(selector);
    if (!target) return;
    if (target instanceof HTMLDetailsElement) target.open = true;
    let parent = target.parentElement;
    while (parent) {
      if (parent instanceof HTMLDetailsElement) parent.open = true;
      parent = parent.parentElement;
    }
    window.requestAnimationFrame(() => {
      target.scrollIntoView?.({ block: "center", behavior: "smooth" });
      if (focus) target.focus({ preventScroll: true });
    });
  }, []);

  const revealSection = useCallback(
    (key: string, focus = true) => {
      setActiveSection(key);
      revealTarget(`#section-${key}`, false);
      window.requestAnimationFrame(() => {
        const section = window.document.querySelector<HTMLDetailsElement>(
          `#section-${key}`,
        );
        section?.querySelector<HTMLElement>(":scope > summary")?.focus({
          preventScroll: true,
        });
        if (!focus) return;
        section?.scrollIntoView?.({ block: "start", behavior: "smooth" });
      });
    },
    [revealTarget],
  );

  useEffect(() => {
    activeDocument.current = document;
  }, [document]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    catalogEditorApi
      .getEditor(productId, controller.signal)
      .then((response) => {
        const initial = response.draft?.document ?? response.canonical;
        setDocument(initial);
        setSavedDocument(initial);
        setCanonicalDocument(response.canonical);
        setDraft(response.draft);
        setRole(response.role);
        setRelationshipTargets(response.relationshipTargets);
        setSystemMetadata(response.systemMetadata);
        setCanPublish(Boolean(response.permissions["catalog.publish"]));
      })
      .catch((loadError: unknown) => {
        if (loadError instanceof DOMException && loadError.name === "AbortError") {
          return;
        }
        setError(
          loadError instanceof Error
            ? loadError.message
            : "The product editor could not be loaded.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [productId, retryKey]);

  useEffect(() => {
    function warnBeforeLeave(event: BeforeUnloadEvent) {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", warnBeforeLeave);
    return () => window.removeEventListener("beforeunload", warnBeforeLeave);
  }, [dirty]);

  useEffect(() => {
    if (!document) return;
    const section = window.location.hash.replace("#section-", "");
    if (CATALOG_SECTIONS.some((candidate) => candidate.key === section)) {
      revealSection(section, false);
    }
  }, [document, revealSection]);

  useEffect(() => {
    issues.forEach((issue, index) => {
      const group = catalogGroupIdForField(issue.table, issue.field);
      window.document.querySelector<HTMLDetailsElement>(`#${group}`)?.setAttribute(
        "open",
        "",
      );
      revealTarget(issueTarget(issue), index === 0);
    });
  }, [issues, revealTarget]);

  useEffect(() => {
    if (!conflict) return;
    changes.affectedTables.forEach((table) => {
      const section = window.document.querySelector<HTMLDetailsElement>(
        `#section-${table}`,
      );
      if (!section) return;
      section.open = true;
      section
        .querySelectorAll<HTMLDetailsElement>(
          'details[data-editor-disclosure="group"]',
        )
        .forEach((group) => {
          group.open = true;
        });
    });
  }, [changes.affectedTables, conflict]);

  const saveCurrent = useCallback(async () => {
    const current = activeDocument.current;
    if (!current) throw new Error("There is no catalog document to save.");
    if (
      draft &&
      savedDocument &&
      JSON.stringify(current) === JSON.stringify(savedDocument)
    ) {
      return draft;
    }
    try {
      const response = draft
        ? await catalogEditorApi.saveDraft(draft.id, draft.version, current)
        : await catalogEditorApi.createDraft(productId, current);
      setDraft(response.draft);
      setDocument(response.draft.document);
      setSavedDocument(response.draft.document);
      setConflict(null);
      setStatus(`Draft version ${response.draft.version} saved.`);
      return response.draft;
    } catch (saveError) {
      if (saveError instanceof CatalogVersionConflictError) {
        setConflict({ latestDraft: saveError.latestDraft });
        setError(
          "Another edit was saved. Your local changes are preserved until you choose how to continue.",
        );
      }
      throw saveError;
    }
  }, [draft, productId, savedDocument]);

  async function runAction(name: string, action: () => Promise<void>) {
    setBusy(name);
    setError(null);
    setPublishResult(null);
    try {
      await action();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "The catalog action could not be completed.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function validateCurrent() {
    const savedDraft = await saveCurrent();
    const result = await catalogEditorApi.validateDraft(
      savedDraft.id,
      savedDraft.version,
    );
    const combinedIssues = [
      ...localIssues(savedDraft.document),
      ...result.issues,
    ];
    const presentationDiff = canonicalDocument
      ? documentDiff(canonicalDocument, savedDraft.document)
      : { diff: {}, affected_tables: [] };
    const combined = {
      ...result,
      valid: result.valid && combinedIssues.length === 0,
      issues: combinedIssues,
      ...presentationDiff,
    };
    setDraft(result.draft);
    setDocument(result.draft.document);
    setSavedDocument(result.draft.document);
    setIssues(combinedIssues);
    setValidation(combined);
    setStatus(
      combined.valid
        ? "Draft passed validation."
        : `Draft has ${combinedIssues.length} validation issue${
            combinedIssues.length === 1 ? "" : "s"
          }.`,
    );
    return { savedDraft: result.draft, result: combined };
  }

  async function uploadMedia(
    file: File,
    metadata: {
      role: ProductMediaRole;
      alt: string;
      variantId?: string | null;
      sortOrder?: number;
      replaceRole?: boolean;
    },
  ) {
    await runAction("upload", async () => {
      const current = activeDocument.current;
      const response = await catalogEditorApi.uploadMedia(file, productId, {
        ...metadata,
        sortOrder: metadata.sortOrder ?? current?.media.length ?? 0,
      });
      if (!current) return;
      const retainedMedia = metadata.replaceRole
        ? current.media.filter((media) => media.role !== metadata.role)
        : current.media;
      const next = {
        ...current,
        media: [
          ...retainedMedia,
          {
            ...response.media,
            product_id: current.productId,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            archived_at: null,
            sort_order: metadata.sortOrder ?? retainedMedia.length,
          },
        ],
      };
      setDocument(next);
      activeDocument.current = next;
      setStatus("Media uploaded. Save the draft to retain this association.");
    });
  }

  if (loading) {
    return (
      <div className={styles.page}>
        <section className={styles.statePanel} aria-busy="true">
          <h1>Loading product editor</h1>
          <p>Retrieving the canonical tables and current draft…</p>
        </section>
      </div>
    );
  }

  if (error && !document) {
    return (
      <div className={styles.page}>
        <section className={styles.statePanel} role="alert">
          <h1>Product editor unavailable</h1>
          <p>{error}</p>
          <button
            className={styles.button}
            type="button"
            onClick={() => setRetryKey((value) => value + 1)}
          >
            Retry
          </button>
        </section>
      </div>
    );
  }

  if (!document) return null;

  return (
    <div className={styles.page}>
      <header className={styles.editorHeader}>
        <div>
          <Link href="/admin/catalog">← Catalog</Link>
          <p className={styles.eyebrow}>Unified product editor</p>
          <h1 className={styles.title}>
            {document.product.display_name || document.product.slug}
          </h1>
          <p className={styles.lede}>/{document.product.slug}</p>
        </div>
        <div className={styles.statusRow} aria-label="Draft state">
          <span className={styles.pill}>{draft?.status ?? "No draft"}</span>
          <span className={styles.pill}>
            Base {draft?.base_revision ?? "canonical"}
          </span>
          <span className={styles.pill}>
            Version {draft?.version ?? "not saved"}
          </span>
          <span className={styles.pill}>{dirty ? "Unsaved" : "Saved"}</span>
        </div>
      </header>

      <div className={styles.editorLayout}>
        <nav className={styles.sectionNav} aria-label="Product tables">
          {CATALOG_SECTIONS.map((section) => (
            <a
              href={`#section-${section.key}`}
              key={section.key}
              aria-current={activeSection === section.key ? "location" : undefined}
              onClick={(event) => {
                event.preventDefault();
                window.history.pushState(null, "", `#section-${section.key}`);
                revealSection(section.key);
              }}
            >
              {section.label}
            </a>
          ))}
        </nav>

        <div className={styles.editorMain}>
          <section
            className={styles.commandBar}
            aria-label="Draft commands"
            aria-busy={Boolean(busy)}
          >
            <div className={styles.actionRow}>
              <button
                className={styles.button}
                type="button"
                disabled={Boolean(busy) || !dirty}
                onClick={() => runAction("save", async () => void (await saveCurrent()))}
              >
                {busy === "save" ? "Saving…" : "Save draft"}
              </button>
              <button
                className={`${styles.button} ${styles.buttonSecondary}`}
                type="button"
                disabled={Boolean(busy)}
                onClick={() =>
                  runAction("validate", async () => void (await validateCurrent()))
                }
              >
                {busy === "validate" ? "Validating…" : "Validate"}
              </button>
              <button
                className={`${styles.button} ${styles.buttonSecondary}`}
                type="button"
                disabled={Boolean(busy)}
                onClick={() =>
                  runAction("ready", async () => {
                    const checked = await validateCurrent();
                    if (!checked.result.valid) return;
                    const response = await catalogEditorApi.markReady(
                      checked.savedDraft.id,
                      checked.savedDraft.version,
                    );
                    setDraft(response.draft);
                    setStatus("Draft marked ready.");
                  })
                }
              >
                {busy === "ready" ? "Checking…" : "Mark ready"}
              </button>
              <button
                className={`${styles.button} ${styles.buttonSecondary}`}
                type="button"
                disabled={Boolean(busy)}
                onClick={() =>
                  runAction("preview", async () => {
                    const saved = await saveCurrent();
                    window.open(
                      `/admin/catalog/preview/${saved.id}`,
                      "_blank",
                      "noopener,noreferrer",
                    );
                  })
                }
              >
                Preview
              </button>
              {canPublish ? (
                <button
                  className={styles.button}
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={() =>
                    runAction("publish-review", async () => {
                      const checked = await validateCurrent();
                      if (!checked.result.valid) return;
                      if (checked.savedDraft.status !== "ready") {
                        setError(
                          "Mark the validated draft ready before publishing.",
                        );
                        return;
                      }
                      setValidation(checked.result);
                      setDisruptiveAcknowledged(false);
                      setPublishReviewOpen(true);
                      setStatus("Review the validated changes before publishing.");
                    })
                  }
                >
                  Review publish
                </button>
              ) : (
                <span className={styles.help}>
                  Publishing requires catalog.publish.
                </span>
              )}
              <button
                className={`${styles.button} ${styles.buttonSecondary}`}
                type="button"
                disabled={Boolean(busy) || !draft}
                onClick={() =>
                  runAction("revisions", async () => {
                    if (!draft) return;
                    const response =
                      await catalogEditorApi.listRevisions(draft.id);
                    setRevisions(response.items);
                  })
                }
              >
                Revision history
              </button>
              <button
                className={`${styles.button} ${styles.buttonDanger}`}
                type="button"
                disabled={Boolean(busy) || !draft}
                onClick={() => {
                  if (
                    !draft ||
                    !window.confirm(
                      "Discard this draft? Published catalog data will remain unchanged.",
                    )
                  ) {
                    return;
                  }
                  runAction("discard", async () => {
                    await catalogEditorApi.discardDraft(draft.id, draft.version);
                    setDraft(null);
                    if (canonicalDocument) {
                      setDocument(canonicalDocument);
                      setSavedDocument(canonicalDocument);
                    }
                    setValidation(null);
                    setIssues([]);
                    setStatus("Draft discarded. Canonical data remains unchanged.");
                  });
                }}
              >
                Discard
              </button>
            </div>
            <p className={styles.statusText} aria-live="polite">
              {busy ? `${busy.replace("-", " ")} in progress.` : status}
            </p>
          </section>

          {error ? (
            <section className={styles.notice} role="alert">
              <h2>Action not completed</h2>
              <p>{error}</p>
            </section>
          ) : null}

          {conflict ? (
            <section className={styles.conflict} role="alert">
              <h2>Newer draft detected</h2>
              <p>
                {conflict.latestDraft
                  ? `Draft version ${conflict.latestDraft.version}`
                  : "A newer draft"}{" "}
                was saved elsewhere. Your local fields remain on screen.
              </p>
              <div className={styles.actionRow}>
                <button
                  className={styles.button}
                  type="button"
                  onClick={() =>
                    runAction("reload", async () => {
                      const response = await catalogEditorApi.getEditor(productId);
                      const latest =
                        response.draft?.document ?? response.canonical;
                      setDraft(response.draft);
                      setDocument(latest);
                      setSavedDocument(latest);
                      setRole(response.role);
                      setRelationshipTargets(response.relationshipTargets);
                      setSystemMetadata(response.systemMetadata);
                      setConflict(null);
                      setError(null);
                      setStatus(
                        response.draft
                          ? `Reloaded draft version ${response.draft.version}.`
                          : "Reloaded canonical catalog data.",
                      );
                    })
                  }
                >
                  Reload latest
                </button>
                <button
                  className={`${styles.button} ${styles.buttonSecondary}`}
                  type="button"
                  onClick={() =>
                    runAction("copy", async () => {
                      await navigator.clipboard.writeText(
                        JSON.stringify(document, null, 2),
                      );
                      setStatus("Local document copied for review.");
                    })
                  }
                >
                  Copy/review local changes
                </button>
              </div>
            </section>
          ) : null}

          {issues.length > 0 ? (
            <section className={styles.errorSummary} role="alert" tabIndex={-1}>
              <h2>Validation issues</h2>
              <ul>
                {issues.map((issue, index) => (
                  <li key={`${issue.table}-${issue.field}-${issue.row_id}-${index}`}>
                    <a
                      href={issueTarget(issue)}
                      onClick={(event) => {
                        event.preventDefault();
                        const group = catalogGroupIdForField(
                          issue.table,
                          issue.field,
                        );
                        window.document.querySelector<HTMLDetailsElement>(
                          `#${group}`,
                        )?.setAttribute("open", "");
                        revealTarget(issueTarget(issue));
                      }}
                    >
                      {issue.table}: {issue.message}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {canPublish &&
          publishReviewOpen &&
          validation?.valid &&
          validation.affected_tables.length > 0 ? (
            <section className={styles.publishReview} aria-label="Publish review">
              <h2>Confirm publication</h2>
              <p>
                This validated draft will update{" "}
                {validation.affected_tables.join(", ")}.
              </p>
              {validation.affected_tables.map((table) => (
                <div className={styles.diffGroup} key={table}>
                  <h3>{table}</h3>
                  <ul>
                    {(validation.diff[table] ?? []).map((entry, index) => (
                      <li key={`${entry.field}-${index}`}>
                        <strong>{entry.field}</strong>:{" "}
                        {displayValue(entry.before)} → {displayValue(entry.after)}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              <div className={styles.actionRow}>
                {validation.affected_tables.some((table) =>
                  (validation.diff[table] ?? []).some(
                    (entry) => entry.disruptive,
                  ),
                ) ? (
                  <label className={styles.checkboxField}>
                    <input
                      type="checkbox"
                      checked={disruptiveAcknowledged}
                      onChange={(event) =>
                        setDisruptiveAcknowledged(event.target.checked)
                      }
                    />
                    <span>
                      <strong>Acknowledge disruptive changes</strong>
                      <span className={styles.help}>
                        Review classification, publication, variant, or media
                        lifecycle changes before publishing.
                      </span>
                    </span>
                  </label>
                ) : null}
                <button
                  className={styles.button}
                  type="button"
                  disabled={
                    Boolean(busy) ||
                    !draft ||
                    (validation.affected_tables.some((table) =>
                      (validation.diff[table] ?? []).some(
                        (entry) => entry.disruptive,
                      ),
                    ) &&
                      !disruptiveAcknowledged)
                  }
                  onClick={() =>
                    runAction("publish", async () => {
                      if (!draft) return;
                      const result = await catalogEditorApi.publishDraft(
                        draft.id,
                        draft.version,
                      );
                      setPublishResult(result);
                      const refreshed = await catalogEditorApi.getEditor(productId);
                      setDraft(refreshed.draft);
                      setCanonicalDocument(refreshed.canonical);
                      setSavedDocument(refreshed.canonical);
                      setDocument(refreshed.canonical);
                      setRole(refreshed.role);
                      setRelationshipTargets(refreshed.relationshipTargets);
                      setSystemMetadata(refreshed.systemMetadata);
                      setPublishReviewOpen(false);
                      setValidation(null);
                      setIssues([]);
                      setStatus(
                        `Published revision ${result.revision.revision_number}.`,
                      );
                    })
                  }
                >
                  Confirm publish
                </button>
                <button
                  className={`${styles.button} ${styles.buttonSecondary}`}
                  type="button"
                  onClick={() => {
                    setPublishReviewOpen(false);
                    setValidation(null);
                  }}
                >
                  Cancel
                </button>
              </div>
            </section>
          ) : null}

          {publishResult ? (
            <section className={styles.notice} aria-live="polite">
              <h2>
                Revision {publishResult.revision.revision_number} published
              </h2>
              <p>
                The canonical revision is saved. Downstream delivery is shown
                only when confirmed by the backend response.
              </p>
              {publishResult.delivery ? (
                <p>
                  Cache: {publishResult.delivery.cache ?? "not reported"} ·
                  Algolia: {publishResult.delivery.algolia ?? "not reported"}
                </p>
              ) : (
                <p>Cache and Algolia delivery were not reported.</p>
              )}
            </section>
          ) : null}

          {revisions ? (
            <section className={styles.notice}>
              <h2>Revision history</h2>
              {revisions.length === 0 ? (
                <p>No revisions are available.</p>
              ) : (
                <ul className={styles.revisionList}>
                  {revisions.map((revision) => (
                    <li key={revision.id}>
                      <span>
                        Revision {revision.revision_number} ·{" "}
                        {new Date(revision.published_at).toLocaleString()}
                      </span>
                      <button
                        className={`${styles.button} ${styles.buttonSecondary}`}
                        type="button"
                        disabled={Boolean(busy)}
                        onClick={() =>
                          runAction("restore", async () => {
                            const response =
                              await catalogEditorApi.restoreRevision(revision.id);
                            setDraft(response.draft);
                            setDocument(response.draft.document);
                            setSavedDocument(response.draft.document);
                            setValidation(null);
                            setIssues([]);
                            setStatus(
                              `Revision ${revision.revision_number} restored as draft version ${response.draft.version}.`,
                            );
                          })
                        }
                      >
                        Restore as draft
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}

          <CatalogEditorSections
            key={productId}
            document={document}
            role={role}
            issues={issues}
            relationshipTargets={relationshipTargets}
            systemMetadata={systemMetadata}
            changes={changes.diff}
            onChange={(nextDocument) => {
              setDocument(nextDocument);
              activeDocument.current = nextDocument;
              setValidation(null);
            }}
            onUpload={uploadMedia}
            uploading={busy === "upload"}
          />
        </div>
      </div>
    </div>
  );
}
