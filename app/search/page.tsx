import type { Metadata } from "next";
import { SearchView } from "@/components/SearchView";
import { getProducts } from "@/lib/catalog";

export const metadata: Metadata = {
  title: "Search | Mei Pelle",
};

export default async function SearchPage() {
  const products = await getProducts();

  return (
    <div className="container">
      <div className="page-head">
        <h1>Search</h1>
      </div>
      <SearchView products={products} />
    </div>
  );
}
