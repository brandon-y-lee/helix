import type { Metadata } from "next";
import Image from "next/image";
import { MethodExperience } from "@/components/system/MethodExperience";
import {
  buildIngredientIndex,
  groupSystemProducts,
} from "@/lib/content/system";
import {
  getCachedProductCardEntryIds,
  getCachedProducts,
} from "@/lib/catalog-cache";
import { createPublicSiteMetadata } from "@/lib/public-site-metadata";

export const metadata: Metadata = createPublicSiteMetadata({
  title: "The System | helix",
  description:
    "A clear step-by-step skincare system covering cleansing, treatment, hydration, eye care, weekly care, and daily SPF.",
  canonical: "/system",
});

export default async function SystemPage() {
  const [products, collectionEntries] = await Promise.all([
    getCachedProducts(),
    getCachedProductCardEntryIds(),
  ]);
  const groups = groupSystemProducts(products, collectionEntries);
  const ingredientCards = buildIngredientIndex(
    [...groups.core, ...groups.beyond].map((entry) => entry.product),
  );

  return (
    <div className="method-page">
      <section
        id="system-overview"
        className="storefront-shell method-hero"
        aria-labelledby="system-heading"
        data-layout-shell="storefront"
      >
        <span id="method-overview" className="method-anchor-alias" aria-hidden="true" />
        <div className="method-hero__surface">
          <Image
            src="/media/system/a-new-philosophy-hero-01.webp"
            alt=""
            fill
            priority
            sizes="(max-width: 720px) calc(100vw - 32px), calc(100vw - 60px)"
            className="method-hero__image"
          />
          <div className="method-hero__copy">
            <h1 id="system-heading">a new philosophy on male skincare</h1>
          </div>
        </div>
      </section>

      <MethodExperience groups={groups} ingredientCards={ingredientCards} />
    </div>
  );
}
