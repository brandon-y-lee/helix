import Link from "next/link";
import {
  footerLinkGroups,
  footerUpdateModule,
} from "@/content/footer";
import { CookiePreferencesDialog } from "@/components/CookiePreferencesDialog";
import { FooterMobileGroups } from "@/components/FooterMobileGroups";
import { FooterWordmark } from "@/components/FooterWordmark";

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

        <div className="site-footer__primary">
          <section
            className="site-footer__updates storefront-reading"
            aria-labelledby="site-footer-updates-heading"
          >
            <p className="eyebrow">{footerUpdateModule.eyebrow}</p>
            <h3 id="site-footer-updates-heading">{footerUpdateModule.heading}</h3>
            <p>{footerUpdateModule.summary}</p>
            <span>{footerUpdateModule.status}</span>
            <small>{footerUpdateModule.note}</small>
          </section>

          <div className="site-footer__content">
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

            <FooterMobileGroups groups={footerLinkGroups} />
          </div>
        </div>

        <div className="site-footer__utility">
          <p>&copy; {year} Mei Pelle. All rights reserved.</p>
          <div className="site-footer__utility-links">
            <CookiePreferencesDialog triggerClassName="site-footer__utility-button" />
            <Link href="/privacy-choices">Your Privacy Choices</Link>
            <Link href="/cookie-policy">Cookie Policy</Link>
            <span>USD display only</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
