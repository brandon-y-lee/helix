"use client";

import { useEffect, useId, useRef, useState } from "react";
import { SearchResultCard } from "@/components/SearchResultCard";
import { useProductSearch } from "@/components/useProductSearch";

const POPULAR_SEARCHES = [
  "Cleanser",
  "Serum",
  "Moisturizer",
  "Daily protection",
];

/**
 * Algolia-backed search surface. Used both as the standalone /search page
 * (variant="page") and inside the header overlay (variant="overlay"). Searches
 * the synced Algolia index via useProductSearch — never Supabase directly.
 *
 * Renders every required state: empty query, loading, results (+count), no
 * results, error, and a not-configured fallback when public Algolia env is
 * absent.
 */
export function SearchView({
  autoFocus = false,
  onResultClick,
}: {
  autoFocus?: boolean;
  onResultClick?: () => void;
}) {
  const [query, setQuery] = useState("");
  const { status, result, errorMessage } = useProductSearch(query);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const suggestionsId = useId();

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const term = query.trim();

  function clear() {
    setQuery("");
    inputRef.current?.focus();
  }

  function chooseSuggestion(suggestion: string) {
    setQuery(suggestion);
    inputRef.current?.focus();
  }

  function suggestions() {
    return (
      <section className="search-suggestions" aria-labelledby={suggestionsId}>
        <p className="search-suggestions__eyebrow">A useful place to begin</p>
        <h3 id={suggestionsId}>Popular searches</h3>
        <div className="search-suggestions__list">
          {POPULAR_SEARCHES.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              className="search-suggestions__button"
              onClick={() => chooseSuggestion(suggestion)}
            >
              {suggestion}
            </button>
          ))}
        </div>
      </section>
    );
  }

  return (
    <div className="search-panel">
      <div className="search-field">
        <label htmlFor={inputId} className="sr-only">
          Search products
        </label>
        <input
          id={inputId}
          ref={inputRef}
          type="search"
          placeholder="Search the collection…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
          // Native clear ("x") plus our own button cover both interaction modes.
        />
        {term !== "" && (
          <button
            type="button"
            className="search-field__clear"
            onClick={clear}
            aria-label="Clear search"
          >
            Clear
          </button>
        )}
      </div>

      <div className="search-status" aria-live="polite" aria-atomic="true">
        {status === "success" && result && (
          <span>
            {result.nbHits} {result.nbHits === 1 ? "result" : "results"} for
            &ldquo;{result.query}&rdquo;
          </span>
        )}
        {status === "loading" && <span>Searching…</span>}
      </div>

      <div className="search-body">
        {status === "idle" && (
          <>
            <p className="search-message">
              Search by product, routine step, texture, or concern.
            </p>
            {suggestions()}
          </>
        )}

        {status === "unconfigured" && (
          <p className="search-message" role="status">
            Search isn&rsquo;t configured in this environment yet. Set the
            <code> NEXT_PUBLIC_ALGOLIA_*</code> environment variables to enable
            it.
          </p>
        )}

        {status === "error" && (
          <p className="search-message search-message--error" role="alert">
            Something went wrong with search. Please try again.
            {errorMessage ? (
              <span className="search-message__detail"> ({errorMessage})</span>
            ) : null}
          </p>
        )}

        {status === "loading" && (
          <div className="search-loading" role="status" aria-label="Searching">
            {[0, 1, 2].map((item) => (
              <span className="search-loading__card" key={item} aria-hidden="true">
                <span className="search-loading__media" />
                <span className="search-loading__lines" />
              </span>
            ))}
          </div>
        )}

        {status === "success" && result && result.hits.length === 0 && (
          <>
            <p className="search-message">
              No products match &ldquo;{result.query}&rdquo;. Try a different term.
            </p>
            {suggestions()}
          </>
        )}

        {status === "success" && result && result.hits.length > 0 && (
          <ul className="search-results">
            {result.hits.map((hit) => (
              <SearchResultCard
                key={hit.objectID}
                hit={hit}
                onClick={onResultClick}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
