import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About | Mei Pelle",
};

export default function AboutPage() {
  return (
    <div className="container">
      <div className="page-head">
        <h1>About</h1>
      </div>
      <div className="prose">
        <section id="method">
          <h2>Method</h2>
          <p>
            Cleanse. Treat. Hydrate. Protect. Mei-Pelle is structured around a
            disciplined routine, not a crowded shelf.
          </p>
        </section>
        <p>
          Mei Pelle is an original, development-only storefront for a focused
          men&rsquo;s skincare routine — cleanse, treat, hydrate, protect.
        </p>
        <p>
          This is placeholder copy used to build and test the shopping
          experience. Products, names, and descriptions are invented for
          development and are not for sale.
        </p>
      </div>
    </div>
  );
}
