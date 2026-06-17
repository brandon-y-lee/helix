"use client";

import { useState } from "react";
import { useCart } from "@/components/CartProvider";
import { Swatch } from "@/components/Swatch";
import { WaitlistButton } from "@/components/WaitlistButton";
import { ProductCard } from "@/components/ProductCard";
import { statusLabel } from "@/components/productStatus";
import { formatPrice, type Product } from "@/lib/products";

// Derive a small set of placeholder "gallery" panels from the product's two
// swatch colors — neutral stand-ins for product photography.
function galleryPanels(swatch: [string, string]): Array<[string, string]> {
  const [a, b] = swatch;
  return [
    [a, b],
    [b, a],
    [a, a],
    [b, b],
  ];
}

export function ProductDetail({
  product,
  related = [],
}: {
  product: Product;
  related?: Product[];
}) {
  const { add } = useCart();
  const panels = galleryPanels(product.swatch);
  const [activePanel, setActivePanel] = useState(0);
  const [variantId, setVariantId] = useState(product.variants[0]?.id);
  const [added, setAdded] = useState(false);

  const variant =
    product.variants.find((v) => v.id === variantId) ?? product.variants[0];
  const isAvailable = product.status === "available";
  const badge = statusLabel(product.status);

  const metaItems = [
    { label: "Made for", value: product.madeFor },
    { label: "Good for", value: product.goodFor },
    { label: "Texture", value: product.texture },
  ].filter((m): m is { label: string; value: string } => Boolean(m.value));

  function handleAdd() {
    if (!variant) return;
    add({
      slug: product.slug,
      name: product.name,
      variantId: variant.id,
      variantLabel: variant.label,
      price: variant.price,
      swatch: product.swatch,
    });
    setAdded(true);
    window.setTimeout(() => setAdded(false), 2200);
  }

  return (
    <>
      <div className="pdp">
        <div className="pdp__gallery">
          <Swatch colors={panels[activePanel]} className="pdp__media" />
          <div
            className="pdp__thumbs"
            role="group"
            aria-label="Product images"
          >
            {panels.map((p, i) => (
              <button
                key={i}
                type="button"
                className="pdp__thumb"
                aria-pressed={i === activePanel}
                aria-label={`View image ${i + 1} of ${panels.length}`}
                onClick={() => setActivePanel(i)}
              >
                <Swatch colors={p} style={{ position: "absolute", inset: 0 }} />
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="pdp__collection">{product.collection}</p>
          <h1>{product.name}</h1>
          <p className="pdp__tagline">{product.tagline}</p>
          {badge && <span className="badge badge--status pdp__badge">{badge}</span>}
          <p className="pdp__price">
            {variant ? formatPrice(variant.price) : "—"}
          </p>
          <p className="pdp__description">{product.description}</p>

          {product.variants.length > 0 && (
            <>
              <span className="field-label" id="size-label">
                Size
              </span>
              <div
                className="variant-options"
                role="group"
                aria-labelledby="size-label"
              >
                {product.variants.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    className="variant-option"
                    aria-pressed={v.id === variantId}
                    onClick={() => setVariantId(v.id)}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            </>
          )}

          <div className="pdp__actions">
            {isAvailable && variant ? (
              <button type="button" className="btn" onClick={handleAdd}>
                Add to cart &middot; {formatPrice(variant.price)}
              </button>
            ) : product.status === "sold_out" ? (
              <WaitlistButton className="btn" label="Notify me" />
            ) : (
              <WaitlistButton className="btn" />
            )}
          </div>
          <p className="add-feedback" role="status" aria-live="polite">
            {added ? "Added to cart" : ""}
          </p>

          {metaItems.length > 0 && (
            <dl className="meta-grid">
              {metaItems.map((m) => (
                <div key={m.label} className="meta-grid__item">
                  <dt>{m.label}</dt>
                  <dd>{m.value}</dd>
                </div>
              ))}
            </dl>
          )}

          <ul className="benefits">
            {product.benefits.map((benefit) => (
              <li key={benefit}>{benefit}</li>
            ))}
          </ul>

          <div className="howto">
            <h3>How to use</h3>
            <p>{product.howToUse}</p>
          </div>
        </div>
      </div>

      {related.length > 0 && (
        <section className="related">
          <div className="section-head">
            <h2>Complete the routine</h2>
            <p>More from {product.collection}.</p>
          </div>
          <ul className="product-grid">
            {related.map((p) => (
              <ProductCard key={p.slug} product={p} />
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
