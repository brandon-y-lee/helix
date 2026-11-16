import type { Metadata } from "next";
import Image from "next/image";
import { SystemExperience } from "@/components/system/SystemExperience";
import {
  buildIngredientIndex,
  groupSystemProducts,
} from "@/lib/content/system";
import {
  getCachedIngredientIndexProducts,
  getCachedProductCards,
} from "@/lib/catalog-cache";
import { createPublicSiteMetadata } from "@/lib/public-site-metadata";

export const metadata: Metadata = createPublicSiteMetadata({
  title: "The System | helix",
  description:
    "A clear step-by-step skincare system covering cleansing, treatment, hydration, eye care, weekly care, and daily SPF.",
  canonical: "/system",
});

export default async function SystemPage() {
  const [products, ingredientProducts] = await Promise.all([
    getCachedProductCards(),
    getCachedIngredientIndexProducts(),
  ]);
  const groups = groupSystemProducts(products);
  const ingredientsBySlug = new Map(
    ingredientProducts.map((product) => [product.slug, product]),
  );
  const ingredientCards = buildIngredientIndex(
    [...groups.core, ...groups.beyond].flatMap(({ product }) => {
      const source = ingredientsBySlug.get(product.slug);
      return source ? [source] : [];
    }),
  );

  return (
    <div className="system-page">
      <section
        id="system-overview"
        className="storefront-shell system-hero"
        aria-labelledby="system-heading"
        data-layout-shell="storefront"
      >
        <div className="system-hero__surface">
          <Image
            src="/media/system/a-new-philosophy-hero-01.webp"
            alt=""
            fill
            priority
            sizes="(max-width: 720px) calc(100vw - 32px), calc(100vw - 60px)"
            className="system-hero__image"
          />
          <div className="system-hero__copy">
            <h1 id="system-heading">a new philosophy on male skincare</h1>
          </div>
        </div>
      </section>

      <SystemExperience groups={groups} ingredientCards={ingredientCards} />
    </div>
  );
}
