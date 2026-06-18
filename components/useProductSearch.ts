"use client";

import { useEffect, useState } from "react";
import {
  searchProducts,
  isSearchConfigured,
  type SearchResult,
} from "@/lib/algolia/search-client";

export type SearchStatus =
  | "idle" // empty query
  | "loading"
  | "success"
  | "error"
  | "unconfigured"; // missing public Algolia env

export type UseProductSearch = {
  status: SearchStatus;
  result: SearchResult | null;
  errorMessage: string | null;
};

/**
 * Debounced, abortable product search against the synced Algolia index. The
 * storefront searches Algolia here — never Supabase. Stale resolutions are
 * ignored so out-of-order responses can't clobber newer results.
 */
export function useProductSearch(
  query: string,
  { debounceMs = 200 }: { debounceMs?: number } = {},
): UseProductSearch {
  const term = query.trim();
  const [status, setStatus] = useState<SearchStatus>("idle");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!term) {
      setStatus("idle");
      setResult(null);
      setErrorMessage(null);
      return;
    }

    if (!isSearchConfigured()) {
      setStatus("unconfigured");
      return;
    }

    let cancelled = false;
    setStatus("loading");

    const timer = setTimeout(() => {
      searchProducts(term)
        .then((r) => {
          if (cancelled) return;
          setResult(r);
          setErrorMessage(null);
          setStatus("success");
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          setErrorMessage(
            err instanceof Error ? err.message : "Search request failed.",
          );
          setStatus("error");
        });
    }, debounceMs);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [term, debounceMs]);

  return { status, result, errorMessage };
}
