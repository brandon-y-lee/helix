import type { Ref } from "react";
import { ProductImage } from "@/components/product/ProductImage";
import {
  corePdpProfileRows,
  type CorePdpPresentation,
} from "@/lib/content/core-pdp";
import type { PdpProduct } from "@/lib/catalog/models";
import type { ProductMedia } from "@/lib/products";
import type { PdpPresentation } from "./pdp-presentation";

export function PdpProfileSplit({
  product,
  presentation,
  media,
  rootRef,
  pdpPresentation = "default",
}: {
  product: PdpProduct;
  presentation: CorePdpPresentation;
  media: ProductMedia;
  rootRef?: Ref<HTMLElement>;
  pdpPresentation?: PdpPresentation;
}) {
  if (media.kind !== "image" || !media.url) return null;
  const rows = corePdpProfileRows(product);
  if (rows.length !== 4) return null;
  const profileTitle = presentation.profileTitle
    .map((token) => token.text)
    .join("");

  const mediaPanel = (
    <div
      className="pdp-profile-split__media"
      data-pdp-panel
      data-pdp-panel-kind="media"
      data-pdp-zoom-frame
    >
      <ProductImage
        media={media}
        swatch={product.swatch}
        className="pdp-profile-split__media-content"
        data-pdp-zoom-media
        sizes="(max-width: 820px) 100vw, 50vw"
        imageStyle={{ objectPosition: presentation.profileMediaPosition }}
      />
    </div>
  );

  return (
    <section
      ref={rootRef}
      className="pdp-profile-split"
      aria-labelledby="pdp-profile-heading"
      data-pdp-panel-row="profile"
      data-pdp-panel-mode="independent"
    >
      {pdpPresentation === "mobile-pilot" && mediaPanel}
      <div
        className="pdp-profile-split__content"
        data-pdp-panel
        data-pdp-panel-kind="copy"
      >
        <h2 id="pdp-profile-heading" aria-label={profileTitle}>
          {presentation.profileTitle.map((token, index) =>
            token.emphasis ? (
              <strong key={`${token.text}-${index}`}>{token.text}</strong>
            ) : (
              <span key={`${token.text}-${index}`}>{token.text}</span>
            ),
          )}
        </h2>
        <dl className="pdp-profile-split__facts">
          {rows.map((row) => (
            <div key={row.label}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
      </div>
      {pdpPresentation !== "mobile-pilot" && mediaPanel}
    </section>
  );
}
