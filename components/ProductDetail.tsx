"use client";

import { useState } from "react";
import { useCart } from "@/components/CartProvider";
import { ProductImage } from "@/components/ProductImage";
import { WaitlistButton } from "@/components/WaitlistButton";
import { ProductGrid } from "@/components/ProductGrid";
import { formatPrice, type Product, type ProductMedia } from "@/lib/products";
import type { CartPlaceholderMedia } from "@/lib/cart/types";

function fallbackGalleryPanels(swatch: [string, string]): Array<[string, string]> {
  const [a, b] = swatch;
  return [
    [a, b],
    [b, a],
    [a, a],
    [b, b],
  ];
}

function cartPlaceholderMedia(
  media: ProductMedia | null | undefined,
): CartPlaceholderMedia {
  if (media?.kind !== "placeholder" || !media.palette) return null;
  return {
    kind: "placeholder",
    alt: media.alt,
    paletteId: media.paletteId,
    palette: media.palette,
  };
}

export function ProductDetail({
  product,
  related = [],
}: {
  product: Product;
  related?: Product[];
}) {
  const { add } = useCart();
  const fallbackPanels = fallbackGalleryPanels(product.swatch);
  const gallery = product.media.filter((media) =>
    ["detail", "gallery", "card_default"].includes(media.role),
  );
  const panelCount = gallery.length || fallbackPanels.length;
  const [activePanel, setActivePanel] = useState(0);
  const [variantId, setVariantId] = useState(product.variants[0]?.id);
  const [added, setAdded] = useState(false);
  const [pending, setPending] = useState(false);
  const [addError, setAddError] = useState("");

  const variant =
    product.variants.find((v) => v.id === variantId) ?? product.variants[0];
  const isAvailable =
    product.status === "available" &&
    Boolean(
      variant?.available &&
        variant.inventoryStatus !== "out_of_stock" &&
        variant.inventoryStatus !== "unavailable",
    );
  const activeMedia = gallery[activePanel] ?? product.detailMedia;
  const activeSwatch = fallbackPanels[activePanel % fallbackPanels.length];
  const details = [
    { label: "Routine", value: product.routineStep },
    { label: "Type", value: product.productType },
    { label: "Use", value: product.usageTime.join(" / ") },
    { label: "Texture", value: product.texture },
    { label: "Finish", value: product.finish },
    { label: "Size", value: product.volume },
    { label: "Skin", value: product.skinTypes.join(", ") },
    { label: "Concern", value: product.concerns.slice(0, 4).join(", ") },
  ].filter((item): item is { label: string; value: string } => Boolean(item.value));

  async function handleAdd() {
    if (!variant || !isAvailable || pending) return;
    setPending(true);
    setAddError("");
    const media = product.cartMedia ?? product.cardMedia;
    const ok = await add({
      slug: product.slug,
      name: product.displayName,
      variantId: variant.id,
      variantLabel: variant.label,
      price: variant.price,
      swatch: product.swatch,
      imageUrl: null,
      imageAlt: media?.alt ?? null,
      placeholderMedia: cartPlaceholderMedia(media),
    });
    setPending(false);
    if (ok) {
      setAdded(true);
      window.setTimeout(() => setAdded(false), 2200);
    } else {
      setAddError("Cart is temporarily unavailable. Try again in a moment.");
    }
  }

  return (
    <>
      <div className="pdp">
        <div className="pdp__gallery">
          <ProductImage
            media={activeMedia}
            swatch={activeSwatch}
            className="pdp__media"
            imageClassName="pdp__img"
            sizes="(max-width: 860px) 92vw, 56vw"
            priority
          />
          <div
            className="pdp__thumbs"
            role="group"
            aria-label="Product hue views"
          >
            {Array.from({ length: panelCount }).map((_, i) => (
              <button
                key={i}
                type="button"
                className="pdp__thumb"
                aria-pressed={i === activePanel}
                aria-label={`View hue ${i + 1} of ${panelCount}`}
                onClick={() => setActivePanel(i)}
              >
                <ProductImage
                  media={gallery[i] ?? null}
                  swatch={fallbackPanels[i % fallbackPanels.length]}
                  className="pdp__thumb-image"
                  imageClassName="pdp__thumb-img"
                  sizes="96px"
                />
              </button>
            ))}
          </div>
        </div>

        <div className="pdp__purchase">
          <p className="pdp__collection">{product.collection}</p>
          <h1>{product.displayName}</h1>
          <p className="pdp__tagline">{product.cardTagline}</p>
          <p className="pdp__description">{product.editorialDescription}</p>
          <p className="pdp__price">
            {variant ? formatPrice(variant.price) : "—"}
          </p>

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
                    disabled={!v.available}
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
              <button
                type="button"
                className="btn"
                onClick={() => void handleAdd()}
                disabled={pending}
              >
                {pending ? "Adding" : `Add to cart — ${formatPrice(variant.price)}`}
              </button>
            ) : (
              <WaitlistButton className="btn" label="Join the waitlist" />
            )}
          </div>
          <p className="add-feedback" role="status" aria-live="polite">
            {added ? "Added to cart" : addError}
          </p>
        </div>
      </div>

      <section className="pdp-sections" aria-label={`${product.displayName} details`}>
        <section className="pdp-section">
          <h2>WHAT IT DOES</h2>
          {product.benefits.length > 0 ? (
            <ul className="benefits">
              {product.benefits.map((benefit) => (
                <li key={benefit}>{benefit}</li>
              ))}
            </ul>
          ) : (
            <p>{product.editorialDescription}</p>
          )}
        </section>

        <section className="pdp-section">
          <h2>HOW TO USE</h2>
          <p>{product.editorialHowToUse}</p>
        </section>

        {(product.formulaNotes.length > 0 || product.keyIngredients.length > 0) && (
          <section className="pdp-section">
            <h2>FORMULA NOTES</h2>
            {product.formulaNotes.length > 0 && (
              <ul className="benefits benefits--plain">
                {product.formulaNotes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            )}
            {product.keyIngredients.length > 0 && (
              <div className="ingredient-list">
                <h3>Key ingredients</h3>
                <ul>
                  {product.keyIngredients.map((ingredient) => (
                    <li key={ingredient}>{ingredient}</li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        {product.ingredients && (
          <section className="pdp-section">
            <h2>FULL INGREDIENTS</h2>
            <p>{product.ingredients}</p>
          </section>
        )}

        {details.length > 0 && (
          <section className="pdp-section">
            <h2>DETAILS</h2>
            <dl className="meta-grid">
              {details.map((m) => (
                <div key={m.label} className="meta-grid__item">
                  <dt>{m.label}</dt>
                  <dd>{m.value}</dd>
                </div>
              ))}
            </dl>
            {product.cautions.length > 0 && (
              <div className="pdp-disclosures">
                <details>
                  <summary>Cautions</summary>
                  <ul>
                    {product.cautions.map((caution) => (
                      <li key={caution}>{caution}</li>
                    ))}
                  </ul>
                </details>
              </div>
            )}
          </section>
        )}
      </section>

      {related.length > 0 && (
        <section className="related">
          <div className="section-head">
            <h2>COMPLETE THE SYSTEM</h2>
            <p>The next useful steps.</p>
          </div>
          <ProductGrid products={related} />
        </section>
      )}
    </>
  );
}
