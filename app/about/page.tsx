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
