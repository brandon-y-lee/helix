import Link from "next/link";
import {
  footerBrandStatement,
  footerLinkGroups,
  footerUpdateModule,
} from "@/content/footer";
import { CookiePreferencesDialog } from "@/components/CookiePreferencesDialog";
import { FooterMobileGroups } from "@/components/FooterMobileGroups";

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="site-footer" aria-labelledby="site-footer-heading">
      <div className="site-footer__inner">
        <section className="site-footer__brand">
          <div>
            <p className="eyebrow">Seoul / Los Angeles</p>
            <h2 id="site-footer-heading">MEI-PELLE</h2>
            <p>{footerBrandStatement}</p>
          </div>
          <div
            className="site-footer__updates"
            aria-labelledby="site-footer-updates-heading"
          >
            <p className="eyebrow">{footerUpdateModule.eyebrow}</p>
            <h3 id="site-footer-updates-heading">{footerUpdateModule.heading}</h3>
            <p>{footerUpdateModule.summary}</p>
            <span>{footerUpdateModule.status}</span>
            <small>{footerUpdateModule.note}</small>
          </div>
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

          <aside className="site-footer__support" aria-label="Customer care">
            <p className="eyebrow">Customer care</p>
            <p>
              Review product, shipping, return, privacy, and accessibility
              details before public support intake opens.
            </p>
            <Link href="/contact">Contact</Link>
          </aside>
        </div>

        <div className="site-footer__utility">
          <p>&copy; {year} Mei-Pelle. All rights reserved.</p>
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
