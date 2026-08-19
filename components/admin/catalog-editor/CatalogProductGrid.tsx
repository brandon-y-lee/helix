"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { HelixIdentity } from "@/components/brand/HelixIdentity";
import {
  CatalogDraftFilter,
  CatalogProductListItem,
  CatalogPublicationFilter,
  CatalogRoutineFilter,
  catalogEditorApi,
} from "@/lib/admin/catalog-editor/client";
import styles from "./CatalogEditor.module.css";

function formatMoneyRange(product: CatalogProductListItem): string {
  if (product.minimumPriceCents === null) return "Not reported";
  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  });
  const minimum = formatter.format(product.minimumPriceCents / 100);
  if (
    product.maximumPriceCents === null ||
    product.maximumPriceCents === product.minimumPriceCents
  ) {
    return minimum;
  }
  return `${minimum}–${formatter.format(product.maximumPriceCents / 100)}`;
}

function formatTimestamp(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function CatalogProductGrid() {
  const [products, setProducts] = useState<CatalogProductListItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [publication, setPublication] =
    useState<CatalogPublicationFilter>("all");
  const [routine, setRoutine] = useState<CatalogRoutineFilter>("all");
  const [draft, setDraft] = useState<CatalogDraftFilter>("all");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  const load = useCallback(
    async (cursor: string | null, signal?: AbortSignal) => {
      const result = await catalogEditorApi.listProducts(
        { search, publication, routine, draft, cursor },
        signal,
      );
      setProducts((current) =>
        cursor ? [...current, ...result.items] : result.items,
      );
      setNextCursor(result.nextCursor);
    },
    [draft, publication, routine, search],
  );

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    load(null, controller.signal)
      .catch((loadError: unknown) => {
        if (loadError instanceof DOMException && loadError.name === "AbortError") {
          return;
        }
        setError(
          loadError instanceof Error
            ? loadError.message
            : "The catalog could not be loaded.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [load, retryKey]);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearch(searchInput.trim());
  }

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      await load(nextCursor);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "More products could not be loaded.",
      );
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>helix Admin · Catalog</p>
          <h1 className={styles.title}>Catalog Editor</h1>
          <p className={styles.lede}>
            Find a Product, review its operational state, and open its unified
            Catalog Draft editor.
          </p>
        </div>
      </header>

      <form className={styles.filterForm} onSubmit={submitSearch} role="search">
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Search name or slug</span>
          <input
            className={styles.input}
            name="catalog-search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Publication</span>
          <select
            className={styles.select}
            value={publication}
            onChange={(event) =>
              setPublication(event.target.value as CatalogPublicationFilter)
            }
          >
            <option value="all">All</option>
            <option value="active">Active / published</option>
            <option value="draft">Draft</option>
            <option value="archived">Archived</option>
          </select>
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Classification</span>
          <select
            className={styles.select}
            value={routine}
            onChange={(event) =>
              setRoutine(event.target.value as CatalogRoutineFilter)
            }
          >
            <option value="all">All</option>
            <option value="core">Core</option>
            <option value="beyond">Beyond</option>
          </select>
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Draft state</span>
          <select
            className={styles.select}
            value={draft}
            onChange={(event) =>
              setDraft(event.target.value as CatalogDraftFilter)
            }
          >
            <option value="all">All</option>
            <option value="draft">Draft</option>
            <option value="ready">Ready</option>
            <option value="none">No draft</option>
          </select>
        </label>
        <button className={styles.button} type="submit">
          Search
        </button>
      </form>

      <div aria-live="polite" className={styles.statusText}>
        {!loading && !error
          ? `${products.length} product${products.length === 1 ? "" : "s"} shown`
          : ""}
      </div>

      {loading ? (
        <section className={styles.statePanel} aria-busy="true">
          <h2>Loading helix Catalog</h2>
          <p>Retrieving the Product summary list…</p>
        </section>
      ) : error ? (
        <section className={styles.statePanel} role="alert">
          <h2>helix Catalog unavailable</h2>
          <p>{error}</p>
          <button
            className={styles.button}
            type="button"
            onClick={() => setRetryKey((value) => value + 1)}
          >
            Retry
          </button>
        </section>
      ) : products.length === 0 ? (
        <section className={styles.statePanel}>
          <h2>No Catalog Products found</h2>
          <p>Adjust the search or filters to see more of the helix Catalog.</p>
        </section>
      ) : (
        <>
          <section className={styles.grid} aria-label="Catalog products">
            {products.map((product) => (
              <Link
                className={styles.productCard}
                href={`/admin/catalog/products/${product.id}`}
                key={product.id}
              >
                <div className={styles.cardMedia}>
                  {product.primaryMedia?.url ? (
                    // The protected API supplies project-controlled media URLs.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={product.primaryMedia.url}
                      alt={product.primaryMedia.alt}
                    />
                  ) : (
                    <span
                      className={styles.cardMediaFallback}
                      role="img"
                      aria-label="helix Product image unavailable"
                    >
                      <HelixIdentity variant="symbol" decorative />
                    </span>
                  )}
                </div>
                <div className={styles.cardBody}>
                  <div>
                    <h2 className={styles.cardTitle}>{product.displayName}</h2>
                    <span className={styles.muted}>{product.productType}</span>
                    <br />
                    <span className={styles.muted}>/{product.slug}</span>
                  </div>
                  <div className={styles.pillRow}>
                    <span className={styles.pill}>
                      {product.routineGroup ?? "Unclassified"}
                    </span>
                    <span className={styles.pill}>
                      {product.productStatus}
                    </span>
                    {product.activeDraft ? (
                      <span className={styles.pill}>{product.activeDraft.status}</span>
                    ) : null}
                  </div>
                  <dl className={styles.cardMeta}>
                    <dt>Publication</dt>
                    <dd>{product.catalogStatus}</dd>
                    <dt>Variants</dt>
                    <dd>{product.variantCount}</dd>
                    <dt>Price</dt>
                    <dd>{formatMoneyRange(product)}</dd>
                    <dt>Canonical update</dt>
                    <dd>{formatTimestamp(product.updatedAt)}</dd>
                    <dt>Draft update</dt>
                    <dd>{formatTimestamp(product.activeDraft?.updatedAt ?? null)}</dd>
                  </dl>
                </div>
              </Link>
            ))}
          </section>
          {nextCursor ? (
            <div className={styles.actionRow}>
              <button
                className={`${styles.button} ${styles.buttonSecondary}`}
                type="button"
                disabled={loadingMore}
                onClick={loadMore}
              >
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
