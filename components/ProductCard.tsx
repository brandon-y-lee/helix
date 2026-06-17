import Link from "next/link";
import { Swatch } from "@/components/Swatch";
import { formatPrice, type Product } from "@/lib/products";

export function ProductCard({ product }: { product: Product }) {
  const startingPrice = Math.min(...product.variants.map((v) => v.price));
  const hasRange = product.variants.length > 1;

  return (
    <li>
      <Link
        href={`/products/${product.slug}`}
        className="product-card"
        aria-label={`${product.name} — ${product.tagline}`}
      >
        <div className="product-card__media">
          <Swatch
            colors={product.swatch}
            style={{ position: "absolute", inset: 0 }}
          />
          <span className="product-card__collection">{product.collection}</span>
        </div>
        <div className="product-card__body">
          <span className="product-card__name">{product.name}</span>
          <span className="product-card__blurb">{product.blurb}</span>
          <span className="product-card__price">
            {hasRange ? "From " : ""}
            {formatPrice(startingPrice)}
          </span>
        </div>
      </Link>
    </li>
  );
}
