"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

export function CatalogPreviewToolbar({
  productName,
  status,
  version,
  lastSavedLabel,
  editorPath,
  publishedPath,
}: {
  productName: string;
  status: string;
  version: number;
  lastSavedLabel: string;
  editorPath: string;
  publishedPath: string | null;
}) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();

  return (
    <aside
      className="catalog-preview-toolbar"
      aria-label="Draft preview controls"
      data-catalog-preview-toolbar
    >
      <div className="catalog-preview-toolbar__identity">
        <strong>Draft Preview</strong>
        <span>{productName}</span>
      </div>
      <dl className="catalog-preview-toolbar__meta">
        <div>
          <dt>Status</dt>
          <dd>{status}</dd>
        </div>
        <div>
          <dt>Version</dt>
          <dd>{version}</dd>
        </div>
        <div>
          <dt>Last saved</dt>
          <dd>{lastSavedLabel}</dd>
        </div>
      </dl>
      <nav
        className="catalog-preview-toolbar__actions"
        aria-label="Draft preview actions"
      >
        <Link href={editorPath}>Back to Editor</Link>
        <button
          type="button"
          disabled={refreshing}
          aria-busy={refreshing}
          onClick={() => {
            startRefresh(() => router.refresh());
          }}
        >
          {refreshing ? "Refreshing…" : "Refresh Preview"}
        </button>
        {publishedPath && (
          <Link href={publishedPath}>Open Published PDP</Link>
        )}
      </nav>
    </aside>
  );
}
