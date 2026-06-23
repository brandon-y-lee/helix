import type { Metadata } from "next";
import Link from "next/link";
import { EditorialHueField } from "@/components/EditorialHueField";
import { MethodExperience } from "@/components/MethodExperience";
import {
  buildIngredientIndex,
  getMethodProductState,
} from "@/lib/content/method";
import { getCachedProducts } from "@/lib/catalog-cache";

const siteUrl = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: "The Mei-Pelle Method | Men's Skincare Routine",
  description:
    "A clear step-by-step skincare system covering cleansing, treatment, hydration, eye care, weekly care, and daily SPF.",
  alternates: {
    canonical: "/method",
  },
  openGraph: {
    title: "The Mei-Pelle Method | Men's Skincare Routine",
    description:
      "A clear step-by-step skincare system covering cleansing, treatment, hydration, eye care, weekly care, and daily SPF.",
    url: "/method",
    siteName: "Mei-Pelle",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "The Mei-Pelle Method | Men's Skincare Routine",
    description:
      "A clear step-by-step skincare system covering cleansing, treatment, hydration, eye care, weekly care, and daily SPF.",
  },
};

export default async function MethodPage() {
  const products = await getCachedProducts();
  const { methodProducts, missingSlugs } = getMethodProductState(products);
  const ingredientCards = buildIngredientIndex(methodProducts);

  return (
    <div className="method-page">
      <section
        id="method-overview"
        className="method-hero"
        aria-labelledby="method-heading"
      >
        <EditorialHueField className="method-hero__field" />
        <div className="method-hero__copy">
          <p className="eyebrow">Mei-Pelle</p>
          <h1 id="method-heading">THE METHOD.</h1>
          <p>A system for clearer, healthier, beautiful skin</p>
          <div className="hero__actions">
            <Link href="/products" className="btn">
              Start the system
            </Link>
            <Link href="#method-routine" className="btn btn--ghost">
              View the routine
            </Link>
          </div>
        </div>
      </section>

      {missingSlugs.length > 0 && (
        <section className="container method-missing" aria-labelledby="method-missing-heading">
          <h2 id="method-missing-heading">Method catalog incomplete</h2>
          <p>
            The Method needs live catalog records for every approved step. Missing:
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
