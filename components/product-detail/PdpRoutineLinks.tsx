import Link from "next/link";
import { ProductImage } from "@/components/product/ProductImage";
import type { CoreRoutineSummary } from "@/lib/catalog/models";
import { statusLabel } from "@/lib/catalog/product-status";

export function PdpRoutineLinks({
  products,
  currentSlug,
}: {
  products: readonly CoreRoutineSummary[];
  currentSlug: string;
}) {
  const partners = products.filter((product) => product.slug !== currentSlug);
  if (partners.length === 0) return null;

  return (
    <section className="pdp-routine-links" aria-labelledby="pdp-routine-links-heading">
      <h2 id="pdp-routine-links-heading">Complete the routine</h2>
      <div className="pdp-routine-links__grid">
        {partners.map((product) => (
          <Link
            key={product.slug}
            className="pdp-routine-links__card"
            href={`/products/${product.slug}`}
          >
            <ProductImage
              media={product.cardMedia}
              swatch={product.swatch}
              imageAlt=""
              className="pdp-routine-links__image"
              sizes="64px"
            />
            <span className="pdp-routine-links__copy">
              <strong>{product.displayName}</strong>
              <span>{product.productType}</span>
              <small>{statusLabel(product.status) ?? "View product"}</small>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
