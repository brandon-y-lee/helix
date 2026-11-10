import Image from "next/image";
import Link from "next/link";
import type { ProductCard } from "@/lib/catalog/models";

export function HomeSuperSerumSpotlight({ product }: { product: ProductCard }) {
  return (
    <section className="home-lander-serum" aria-labelledby="home-serum-heading">
      <div className="home-lander-serum__media">
        <Image
          src="/media/home/super-serum-editorial-v3.webp"
          alt="Man facing the camera holding a Helix Super Serum bottle beside his cheek."
          fill
          sizes="(max-width: 900px) 100vw, 56vw"
          className="home-lander-serum__image"
        />
      </div>
      <div className="home-lander-serum__copy">
        <p className="home-lander-serum__eyebrow">Super Serum</p>
        <h2 id="home-serum-heading">One step for Longevity</h2>
        <div className="home-lander-serum__body">
          <p>
            A lightweight serum with PDRN, humectants, niacinamide, peptides,
            and adenosine for hydrated, supple-looking skin.
          </p>
          <p>
            The treatment layer of The Core. Use after cleansing and before
            moisturizer, morning and night.
          </p>
        </div>
        <Link href={`/products/${product.slug}`} className="btn btn--ghost btn--editorial-rounded">
          Shop Now
        </Link>
      </div>
    </section>
  );
}
