import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Products | Mei Pelle",
};

const products: ReadonlyArray<{ slug: string; name: string }> = [
  { slug: "renewal-serum", name: "Renewal Serum" },
  { slug: "daily-moisturizer", name: "Daily Moisturizer" },
];

export default function ProductsPage() {
  return (
    <article>
      <h1>Products</h1>
      <ul>
        {products.map((product) => (
          <li key={product.slug}>
            <Link href={`/products/${product.slug}`}>{product.name}</Link>
          </li>
        ))}
      </ul>
    </article>
  );
}
