import type { Metadata } from "next";
import Link from "next/link";
import { EditorialHueField } from "@/components/content/EditorialHueField";
import { MethodExperience } from "@/components/system/MethodExperience";
import {
  buildIngredientIndex,
  groupSystemProducts,
} from "@/lib/content/system";
import {
  getCachedProductCards,
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
    getCachedProductCards(),
  ]);
  const groups = groupSystemProducts(products, collectionEntries);
  const ingredientCards = buildIngredientIndex(
    [...groups.core, ...groups.beyond].map((entry) => entry.product),
  );

  return (
    <div className="method-page">
      <section
        id="system-overview"
        className="method-hero"
        aria-labelledby="system-heading"
      >
        <span id="method-overview" className="method-anchor-alias" aria-hidden="true" />
        <EditorialHueField
          className="method-hero__field"
          tone="method"
          decorated={false}
        />
        <div className="method-hero__copy">
          <p className="eyebrow">The System</p>
          <h1 id="system-heading">THREE STEPS. ONE BASELINE.</h1>
          <p>
            Cleanse. Treat. Seal. Start with the Core, then add targeted steps
            only where they earn a place.
          </p>
          <div className="hero__actions">
            <Link href="/collections/core" className="btn btn--editorial-rounded">
              Shop the Core
            </Link>
            <Link href="#system-core" className="btn btn--ghost btn--editorial-rounded">
              See the three steps
            </Link>
          </div>
        </div>
      </section>

      <MethodExperience groups={groups} ingredientCards={ingredientCards} />
    </div>
  );
}
