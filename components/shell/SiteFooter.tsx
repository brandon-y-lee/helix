import Link from "next/link";
import {
  footerLinkGroups,
  footerServiceCards,
  footerStatusModules,
  type FooterServiceCard,
} from "@/content/footer";
import { CookiePreferencesDialog } from "@/components/privacy/CookiePreferencesDialog";
import { FooterWordmark } from "@/components/shell/FooterWordmark";

function FooterServiceIcon({ name }: { name: FooterServiceCard["icon"] }) {
  if (name === "contact") {
    return (
      <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
        <rect x="3" y="5" width="18" height="14" rx="1.5" />
        <path d="m4 7 8 6 8-6" />
      </svg>
    );
  }

  if (name === "shipping") {
    return (
      <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
        <path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5z" />
        <path d="m4.5 7.5 7.5 4 7.5-4M12 12v9" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="9" />
      <path d="M9.8 9a2.3 2.3 0 0 1 4.4 1c0 1.7-2.2 2-2.2 3.5" />
      <path d="M12 17.2h.01" />
    </svg>
  );
}

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer
      id="site-footer"
      className="site-footer"
      data-site-footer
      aria-labelledby="site-footer-heading"
    >
      <div
        className="storefront-shell site-footer__inner"
        data-layout-shell="storefront"
      >
        <FooterWordmark />

        <div className="site-footer__body">
          <aside className="site-footer__services" aria-label="Footer service links">
            {footerServiceCards.map((card) => (
              <Link
                key={card.id}
                href={card.href}
                className="site-footer__service-card"
                aria-label={`${card.label}: ${card.description}`}
              >
                <span className="site-footer__service-icon">
                  <FooterServiceIcon name={card.icon} />
                </span>
                <span className="site-footer__service-copy">
                  <strong>{card.label}</strong>
                  <small>{card.description}</small>
                </span>
                <span className="site-footer__service-arrow" aria-hidden="true">
                  ↗
                </span>
              </Link>
            ))}
          </aside>

          <section
            className="site-footer__social-status"
            aria-labelledby="site-footer-social-heading"
          >
            <div className="site-footer__status-heading">
              <h3 id="site-footer-social-heading">
                {footerStatusModules.social.label}
              </h3>
              <span>{footerStatusModules.social.status}</span>
            </div>
            <ul aria-label="Planned social channels">
              {footerStatusModules.social.channels.map((channel) => (
                <li key={channel.label}>
                  <span className="site-footer__social-badge" aria-hidden="true">
                    {channel.mark}
                  </span>
                  <span className="sr-only">{channel.label}</span>
                </li>
              ))}
            </ul>
          </section>

          <div className="site-footer__navigation">
            <nav className="site-footer__nav" aria-label="Footer navigation">
              {footerLinkGroups.map((group) => (
                <section key={group.id} aria-labelledby={`footer-${group.id}`}>
                  <h3 id={`footer-${group.id}`}>{group.label}</h3>
                  <ul>
                    {group.links.map((link) => (
                      <li key={`${group.id}-${link.href}`}>
                        <Link href={link.href}>{link.label}</Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </nav>

            <div className="site-footer__mobile-groups" aria-label="Footer links">
              {footerLinkGroups.map((group) => (
                <details key={group.id} className="site-footer__accordion">
                  <summary className="site-footer__accordion-trigger">
                    {group.label}
                  </summary>
                  <ul>
                    {group.links.map((link) => (
                      <li key={`${group.id}-${link.href}`}>
                        <Link href={link.href}>{link.label}</Link>
                      </li>
                    ))}
                  </ul>
                </details>
              ))}
            </div>
          </div>

          <section
            className="site-footer__review-status"
            aria-labelledby="site-footer-reviews-heading"
          >
            <div>
              <h3 id="site-footer-reviews-heading">
                {footerStatusModules.reviews.label}
              </h3>
              <strong>{footerStatusModules.reviews.status}</strong>
            </div>
            <p>{footerStatusModules.reviews.note}</p>
          </section>

          <section
            className="site-footer__checkout-status"
            aria-labelledby="site-footer-checkout-heading"
          >
            <div className="site-footer__status-heading">
              <h3 id="site-footer-checkout-heading">
                {footerStatusModules.checkout.label}
              </h3>
              <span>{footerStatusModules.checkout.status}</span>
            </div>
            <ul aria-label="Planned checkout method categories">
              {footerStatusModules.checkout.methods.map((method) => (
                <li key={method}>{method}</li>
              ))}
            </ul>
          </section>
        </div>

        <div className="site-footer__utility">
          <p className="site-footer__locale">{footerStatusModules.locale}</p>
          <div className="site-footer__utility-links">
            <CookiePreferencesDialog triggerClassName="site-footer__utility-button" />
            <Link href="/privacy-choices">Your Privacy Choices</Link>
            <Link href="/cookie-policy">Cookie Policy</Link>
          </div>
          <p className="site-footer__copyright">
            &copy; {year} helix. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
