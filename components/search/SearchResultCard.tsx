import Link from "next/link";
import { ProductImage } from "@/components/product/ProductImage";
import {
  composeProductTitle,
  formatPrice,
  type ProductMedia,
} from "@/lib/products";
import type { AlgoliaProductRecord } from "@/lib/algolia/record";
import { statusLabel } from "@/lib/catalog/product-status";

/** Availability-aware label shown on the result's link CTA. */
function ctaLabel(hit: AlgoliaProductRecord): string {
  if (hit.waitlist || !hit.available) return "View details";
  return "View product";
}

export function SearchResultCard({
  hit,
  onClick,
}: {
  hit: AlgoliaProductRecord;
  onClick?: () => void;
}) {
  const href = `/products/${hit.slug}`;
  const priceLabel =
    hit.priceMax > hit.priceMin
      ? `From ${formatPrice(hit.priceMin)}`
      : formatPrice(hit.priceMin);
  const availability = hit.available
    ? "Available"
    : statusLabel(hit.status) ?? "View details";
  const colors: [string, string] = hit.placeholderMedia
    ? [hit.placeholderMedia.palette.start, hit.placeholderMedia.palette.end]
    : hit.swatch;
  const media: ProductMedia | null = hit.imageMedia
    ? {
        kind: "image",
        url: hit.imageMedia.url,
        alt: hit.imageMedia.alt,
        width: hit.imageMedia.width,
        height: hit.imageMedia.height,
        role: "search",
        sortOrder: 0,
        paletteId: null,
        palette: null,
      }
    : hit.placeholderMedia
    ? {
        kind: "placeholder",
        url: null,
        alt: hit.placeholderMedia.alt,
        width: null,
        height: null,
        role: "search",
        sortOrder: 0,
        paletteId: hit.placeholderMedia.paletteId,
        palette: hit.placeholderMedia.palette,
      }
    : null;

  return (
    <li className="search-result">
      <Link
        href={href}
        className="search-result__link"
        onClick={onClick}
        aria-label={composeProductTitle(hit.displayName, hit.productType)}
      >
        <div className="search-result__media">
          <ProductImage
            media={media}
            swatch={colors}
            className="search-result__image"
            imageClassName="search-result__img"
            sizes="(max-width: 720px) 90vw, 320px"
          />
          <span className="search-result__collection">{hit.productType}</span>
        </div>
        <div className="search-result__body">
          <span className="search-result__name">{hit.displayName}</span>
          <span className="search-result__status">{availability}</span>
          <span className="search-result__descriptor">{hit.productType}</span>
          <span className="search-result__meta">
            <span className="search-result__price">{priceLabel}</span>
            <span className="search-result__cta">{ctaLabel(hit)}</span>
          </span>
        </div>
      </Link>
    </li>
  );
}
