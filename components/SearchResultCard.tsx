import Link from "next/link";
import { Swatch } from "@/components/Swatch";
import { formatPrice } from "@/lib/products";
import type { AlgoliaProductRecord } from "@/lib/algolia/record";

/** Availability-aware label shown on the result's link CTA. */
function ctaLabel(hit: AlgoliaProductRecord): string {
  if (hit.waitlist) return "Join the waitlist";
  if (!hit.available) return "View details";
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

  return (
    <li className="search-result">
      <Link
        href={href}
        className="search-result__link"
        onClick={onClick}
        aria-label={`${hit.title} — ${hit.subtitle}`}
      >
        <div className="search-result__media">
          <Swatch colors={hit.swatch} style={{ position: "absolute", inset: 0 }} />
          {hit.badge ? (
            <span className="badge badge--status">{hit.badge}</span>
          ) : (
            <span className="search-result__collection">{hit.collection}</span>
          )}
        </div>
        <div className="search-result__body">
          <span className="search-result__name">{hit.title}</span>
          <span className="search-result__descriptor">{hit.descriptor}</span>
          <span className="search-result__meta">
            <span className="search-result__price">{priceLabel}</span>
            <span className="search-result__cta">{ctaLabel(hit)}</span>
          </span>
        </div>
      </Link>
    </li>
  );
}
