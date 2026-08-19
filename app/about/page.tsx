import type { Metadata } from "next";
import Link from "next/link";
import { EditorialHueField } from "@/components/content/EditorialHueField";
import {
  ABOUT_CLOSING,
  ABOUT_HERO,
  ABOUT_OPENING,
  BRAND_PROMISES,
  CULTURE_PANELS,
  QUALITY_POINTS,
  STANDARD_PRINCIPLES,
  SUSTAINABILITY,
  WHY_MEN,
} from "@/lib/content/about";

export const metadata: Metadata = {
  title: "About helix | Seoul Precision, Los Angeles Perspective",
  description:
    "Discover the values behind helix, a prestige men's skincare system shaped by South Korean formulation discipline and Los Angeles self-invention.",
  alternates: {
    canonical: "/about",
  },
  openGraph: {
    title: "About helix | Seoul Precision, Los Angeles Perspective",
    description:
      "Discover the values behind helix, a prestige men's skincare system shaped by South Korean formulation discipline and Los Angeles self-invention.",
    url: "/about",
    siteName: "helix",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "About helix | Seoul Precision, Los Angeles Perspective",
    description:
      "Discover the values behind helix, a prestige men's skincare system shaped by South Korean formulation discipline and Los Angeles self-invention.",
  },
};

export default function AboutPage() {
  return (
    <div className="about-page">
      <section className="about-hero" aria-labelledby="about-heading">
        <EditorialHueField
          className="about-hero__field"
          tone="about"
          decorated={false}
        />
        <div className="about-hero__copy">
          <p className="eyebrow">{ABOUT_HERO.eyebrow}</p>
          <h1 id="about-heading">{ABOUT_HERO.title}</h1>
          <p>{ABOUT_HERO.body}</p>
          <div className="hero__actions">
            <Link
              href={ABOUT_HERO.primaryCta.href}
              className="btn btn--editorial-rounded"
            >
              {ABOUT_HERO.primaryCta.label}
            </Link>
            <Link
              href={ABOUT_HERO.secondaryCta.href}
              className="btn btn--ghost btn--editorial-rounded"
            >
              {ABOUT_HERO.secondaryCta.label}
            </Link>
          </div>
        </div>
      </section>

      <section className="about-opening" aria-label="helix origin principles">
        <p className="about-opening__lead">Helix exists between two beauty cultures.</p>
        <div className="about-opening__text">
          {ABOUT_OPENING.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
      </section>

      <section className="culture-split" aria-labelledby="culture-heading">
        <div className="culture-split__head">
          <p className="eyebrow">Influences, not stereotypes</p>
          <h2 id="culture-heading">
            Helix is where discipline meets self-invention.
          </h2>
        </div>
        <div className="culture-split__panels">
          {CULTURE_PANELS.map((panel) => (
            <article
              key={panel.city}
              className="culture-panel"
              data-tone={panel.tone}
            >
              <p>{panel.city}</p>
              <h3>{panel.heading}</h3>
              <span>{panel.body}</span>
              <ul>
                {panel.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="about-men" aria-labelledby="about-men-heading">
        <div>
          <p className="eyebrow">{WHY_MEN.eyebrow}</p>
          <h2 id="about-men-heading">{WHY_MEN.heading}</h2>
        </div>
        <blockquote>{WHY_MEN.statement}</blockquote>
        <p>{WHY_MEN.body}</p>
      </section>

      <section className="about-standard" aria-labelledby="standard-heading">
        <div className="section-head">
          <div>
            <p className="eyebrow">The helix standard</p>
            <h2 id="standard-heading">THE STANDARD.</h2>
          </div>
          <p>Prestige without needless complexity.</p>
        </div>
        <ol>
          {STANDARD_PRINCIPLES.map((principle, index) => (
            <li key={principle.title}>
              <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
              <div>
                <h3>{principle.title}</h3>
                <p>{principle.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="about-quality" aria-labelledby="quality-heading">
        <div className="about-quality__visual" aria-hidden="true">
          <span>FORMULA</span>
          <span>FACTS</span>
          <span>FUNCTION</span>
        </div>
        <div className="about-quality__copy">
          <p className="eyebrow">Formula philosophy</p>
          <h2 id="quality-heading">PURPOSEFUL COMPOUNDS. NO EMPTY STATUS.</h2>
          <p>
            We pursue high-specification, purposeful ingredients selected for
            function, compatibility, and a place in the system.
          </p>
          <ul>
            {QUALITY_POINTS.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="about-sustainability" aria-labelledby="sustainability-heading">
        <div>
          <p className="eyebrow">Operating discipline</p>
          <h2 id="sustainability-heading">{SUSTAINABILITY.heading}</h2>
          <p>{SUSTAINABILITY.body}</p>
        </div>
        <ul>
          {SUSTAINABILITY.points.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
      </section>

      <section className="about-system" aria-labelledby="about-system-heading">
        <p className="eyebrow">The helix system</p>
        <h2 id="about-system-heading">PREPARE. TREAT. PRESERVE.</h2>
        <div className="about-system__promises">
          {BRAND_PROMISES.map((promise) => (
            <p key={promise}>{promise}</p>
          ))}
        </div>
        <Link href="/system" className="btn btn--ghost">
          See the system
        </Link>
      </section>

      <section className="editorial-cta about-cta" aria-labelledby="about-cta-heading">
        <p className="eyebrow">Standards repeated</p>
        <h2 id="about-cta-heading">{ABOUT_CLOSING.heading}</h2>
        <p>{ABOUT_CLOSING.body}</p>
        <div className="hero__actions">
          <Link href={ABOUT_CLOSING.primaryCta.href} className="btn">
            {ABOUT_CLOSING.primaryCta.label}
          </Link>
          <Link href={ABOUT_CLOSING.secondaryCta.href} className="btn btn--ghost">
            {ABOUT_CLOSING.secondaryCta.label}
          </Link>
        </div>
      </section>
    </div>
  );
}
