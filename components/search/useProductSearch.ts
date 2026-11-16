"use client";

import { useCallback, useEffect, useState } from "react";
import {
  searchProducts,
  isSearchConfigured,
  type SearchResult,
} from "@/lib/algolia/search-client";

type SearchStatus =
  | "idle" // empty query
  | "loading"
  | "success"
  | "error"
  | "unconfigured"; // missing public Algolia env

export type UseProductSearch = {
  status: SearchStatus;
  result: SearchResult | null;
  retry: () => void;
};

/**
 * Debounced product search against the synced Algolia index. The
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
  const [retryAttempt, setRetryAttempt] = useState(0);
  const retry = useCallback(() => setRetryAttempt((attempt) => attempt + 1), []);

  useEffect(() => {
    if (!isSearchConfigured()) {
      setStatus("unconfigured");
      setResult(null);
      return;
    }

    if (!term) {
      setStatus("idle");
      setResult(null);
      return;
    }

    let cancelled = false;
    setStatus("loading");

    const timer = setTimeout(() => {
      searchProducts(term)
        .then((r) => {
          if (cancelled) return;
          setResult(r);
          setStatus("success");
        })
        .catch(() => {
          if (cancelled) return;
          setStatus("error");
        });
    }, debounceMs);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [term, debounceMs, retryAttempt]);

  return { status, result, retry };
}
