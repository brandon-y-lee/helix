import Image from "next/image";
import type { Ref } from "react";
import {
  corePdpProfileRows,
  type CorePdpPresentation,
} from "@/lib/content/core-pdp";
import type { Product, ProductMedia } from "@/lib/products";

export function PdpProfileSplit({
  product,
  presentation,
  media,
  rootRef,
}: {
  product: Product;
  presentation: CorePdpPresentation;
  media: ProductMedia;
  rootRef?: Ref<HTMLElement>;
}) {
  if (media.kind !== "image" || !media.url) return null;
  const rows = corePdpProfileRows(product);
  if (rows.length !== 4) return null;
  const profileTitle = presentation.profileTitle
    .map((token) => token.text)
    .join("");

  return (
    <section
      ref={rootRef}
      className="pdp-profile-split"
      aria-labelledby="pdp-profile-heading"
      data-pdp-panel-row="profile"
      data-pdp-panel-mode="independent"
    >
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
      <div
        className="pdp-profile-split__media"
        data-pdp-panel
        data-pdp-panel-kind="media"
      >
        <Image
          src={media.url}
          alt={media.alt}
          fill
          sizes="(max-width: 820px) 100vw, 50vw"
          style={{ objectPosition: presentation.profileMediaPosition }}
        />
      </div>
    </section>
  );
}
