import type { Metadata } from "next";
import { SearchView } from "@/components/search/SearchView";
import { createPublicSiteMetadata } from "@/lib/public-site-metadata";

export const metadata: Metadata = createPublicSiteMetadata({
  title: "Search | helix",
  description: "Search the helix Product catalog by name, type, or concern.",
  canonical: "/search",
});

// Standalone search page. Like the header overlay, it searches the synced
// Algolia index client-side (see SearchView / useProductSearch) — it does not
// query Supabase. No server data fetch is needed here.
export default function SearchPage() {
  return (
    <div className="container">
      <div className="page-head">
        <h1>Search</h1>
        <p style={{ color: "var(--ink-soft)", marginTop: "10px" }}>
          Find a formula by name, collection, or what it&rsquo;s good for.
        </p>
      </div>
      <SearchView autoFocus />
    </div>
  );
}
