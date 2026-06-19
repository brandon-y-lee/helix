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

type PurchaseAccordionId = "does" | "use" | "ingredients";

function compactDescription(value: string) {
  const sentences = value
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  return (sentences.length ? sentences.slice(0, 2).join(" ") : value).trim();
}

function availabilityLabel(product: Product, variant: Product["variants"][number] | undefined) {
  if (product.status === "coming_soon") return "Coming soon";
  if (product.status === "sold_out") return "Sold out";
  if (!variant?.available || variant.inventoryStatus === "unavailable") {
    return "Unavailable";
  }
  if (variant.inventoryStatus === "out_of_stock") return "Out of stock";
  if (variant.inventoryStatus === "low_stock") return "Low stock";
  return "Available";
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
  const [openAccordion, setOpenAccordion] =
    useState<PurchaseAccordionId | null>(null);

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
  const leadDescription = compactDescription(
    product.editorialDescription || product.description || product.cardTagline,
  );
  const availability = availabilityLabel(product, variant);
  const keyIngredients = product.keyIngredients.slice(0, 5);
  const whatItDoesItems =
    product.benefits.length > 0
      ? product.benefits.slice(0, 4)
      : [leadDescription || product.cardTagline].filter(Boolean);
  const howToUse =
    product.editorialHowToUse || product.howToUse || "Use as directed in your routine.";
  const fullIngredientsText =
    product.ingredients ||
    "The current full ingredient list should be checked on product packaging or the approved product source.";
  const details = [
    {
      label: "Routine",
      value: [product.routineNumber, product.routineStep].filter(Boolean).join(" · "),
    },
    { label: "Format", value: product.productType },
    { label: "Use", value: product.usageTime.join(" / ") },
    { label: "Availability", value: availability },
    { label: "Texture", value: product.texture },
    { label: "Finish", value: product.finish },
    { label: "Size", value: variant?.volume ?? product.volume },
    {
      label: "Pack count",
      value: variant?.packCount ? String(variant.packCount) : "",
    },
    { label: "Made for", value: product.madeFor },
    { label: "Good for", value: product.goodFor },
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

  function toggleAccordion(id: PurchaseAccordionId) {
    setOpenAccordion((current) => (current === id ? null : id));
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
          <p className="pdp__collection">
            {[product.routineNumber, product.collection].filter(Boolean).join(" · ")}
          </p>
          <h1>{product.displayName}</h1>
          <p className="pdp__tagline">{product.cardTagline}</p>
          <p className="pdp__description">{leadDescription}</p>
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

          <p className="pdp__availability" role="status">
            {availability}
          </p>

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

          <div className="pdp-accordions" aria-label={`${product.displayName} purchase details`}>
            <section className="pdp-accordion">
              <h2 className="pdp-accordion__heading">
                <button
                  type="button"
                  className="pdp-accordion__trigger"
                  id="pdp-accordion-does-trigger"
                  aria-expanded={openAccordion === "does"}
                  aria-controls="pdp-accordion-does-panel"
                  onClick={() => toggleAccordion("does")}
                >
                  <span>WHAT IT DOES</span>
                  <span aria-hidden="true">{openAccordion === "does" ? "-" : "+"}</span>
                </button>
              </h2>
              <div
                id="pdp-accordion-does-panel"
                className="pdp-accordion__panel"
                data-open={openAccordion === "does"}
                role="region"
                aria-labelledby="pdp-accordion-does-trigger"
                aria-hidden={openAccordion !== "does"}
              >
                <div className="pdp-accordion__content">
                  {whatItDoesItems.length > 1 ? (
                    <ul>
                      {whatItDoesItems.map((benefit) => (
                        <li key={benefit}>{benefit}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>{whatItDoesItems[0]}</p>
                  )}
                </div>
              </div>
            </section>

            <section className="pdp-accordion">
              <h2 className="pdp-accordion__heading">
                <button
                  type="button"
                  className="pdp-accordion__trigger"
                  id="pdp-accordion-use-trigger"
                  aria-expanded={openAccordion === "use"}
                  aria-controls="pdp-accordion-use-panel"
                  onClick={() => toggleAccordion("use")}
                >
                  <span>HOW TO USE</span>
                  <span aria-hidden="true">{openAccordion === "use" ? "-" : "+"}</span>
                </button>
              </h2>
              <div
                id="pdp-accordion-use-panel"
                className="pdp-accordion__panel"
                data-open={openAccordion === "use"}
                role="region"
                aria-labelledby="pdp-accordion-use-trigger"
                aria-hidden={openAccordion !== "use"}
              >
                <div className="pdp-accordion__content">
                  <p>{howToUse}</p>
                  {product.cautions.length > 0 && (
                    <p className="pdp-accordion__note">
                      Check the details below for cautions before use.
                    </p>
                  )}
                </div>
              </div>
            </section>

            <section className="pdp-accordion">
              <h2 className="pdp-accordion__heading">
                <button
                  type="button"
                  className="pdp-accordion__trigger"
                  id="pdp-accordion-ingredients-trigger"
                  aria-expanded={openAccordion === "ingredients"}
                  aria-controls="pdp-accordion-ingredients-panel"
                  onClick={() => toggleAccordion("ingredients")}
                >
                  <span>KEY INGREDIENTS</span>
                  <span aria-hidden="true">
                    {openAccordion === "ingredients" ? "-" : "+"}
                  </span>
                </button>
              </h2>
              <div
                id="pdp-accordion-ingredients-panel"
                className="pdp-accordion__panel"
                data-open={openAccordion === "ingredients"}
                role="region"
                aria-labelledby="pdp-accordion-ingredients-trigger"
                aria-hidden={openAccordion !== "ingredients"}
              >
                <div className="pdp-accordion__content">
                  {keyIngredients.length > 0 ? (
                    <ul className="pdp-key-ingredients">
                      {keyIngredients.map((ingredient) => (
                        <li key={ingredient}>{ingredient}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>
                      Key ingredient notes are not available for this product yet.
                    </p>
                  )}
                  <a
                    href="#full-ingredients"
                    tabIndex={openAccordion === "ingredients" ? undefined : -1}
                  >
                    View full ingredients
                  </a>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>

      <section className="pdp-sections" aria-label={`${product.displayName} details`}>
        {details.length > 0 && (
          <section className="pdp-section">
            <h2 id="product-details">DETAILS</h2>
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

        <section className="pdp-section" id="full-ingredients">
          <h2>FULL INGREDIENTS</h2>
          <p>{fullIngredientsText}</p>
        </section>

        {product.formulaNotes.length > 0 && (
          <section className="pdp-section">
            <h2>FORMULA NOTES</h2>
            <ul className="benefits benefits--plain">
              {product.formulaNotes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
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
