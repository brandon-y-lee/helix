import type { Metadata } from "next";
import Link from "next/link";
import { EditorialHueField } from "@/components/content/EditorialHueField";
import { MethodExperience } from "@/components/system/MethodExperience";
import {
  buildIngredientIndex,
  getMethodProductState,
} from "@/lib/content/system";
import { getCachedProducts } from "@/lib/catalog-cache";
import { createPublicSiteMetadata } from "@/lib/public-site-metadata";

export const metadata: Metadata = createPublicSiteMetadata({
  title: "The System | helix",
  description:
    "A clear step-by-step skincare system covering cleansing, treatment, hydration, eye care, weekly care, and daily SPF.",
  canonical: "/system",
});

export default async function SystemPage() {
  const products = await getCachedProducts();
  const { methodProducts, missingSlugs } = getMethodProductState(products);
  const ingredientCards = buildIngredientIndex(methodProducts);

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
          <h1 id="system-heading">THE SYSTEM.</h1>
          <p>A system for clearer, healthier, beautiful skin</p>
          <div className="hero__actions">
            <Link href="/collections/shop" className="btn btn--editorial-rounded">
              Start the system
            </Link>
            <Link href="#system-routine" className="btn btn--ghost btn--editorial-rounded">
              View the routine
            </Link>
          </div>
        </div>
      </section>

      {missingSlugs.length > 0 && (
        <section className="container method-missing" aria-labelledby="system-missing-heading">
          <h2 id="system-missing-heading">System catalog incomplete</h2>
          <p>
            The System needs live catalog records for every approved step. Missing:
            {" "}
            {missingSlugs.join(", ")}.
          </p>
        </section>
      )}

      {methodProducts.length > 0 && (
        <MethodExperience methodProducts={methodProducts} ingredientCards={ingredientCards} />
      )}
    </div>
  );
}
