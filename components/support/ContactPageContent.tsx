import type { ReactNode } from "react";
import Link from "next/link";
import { ReplyCountdown } from "@/components/support/ReplyCountdown";
import { contactPreparationGroups } from "@/content/support/contact";
import styles from "./contact-page.module.css";

export function ContactPageContent({ children }: { children: ReactNode }) {
  return (
    <div className={styles.page}>
      <header className={styles.intro}>
        <p className={styles.eyebrow}>contact us</p>
        <ReplyCountdown />
        <p>
          A question about your routine, a product, or your experience with helix?
          Tell us a little more below, or email{" "}
          <a href="mailto:support@helixskin.com">support@helixskin.com</a>.
        </p>
        <Link className={styles.faq} href="/faq">You may find your answer in our FAQ <span aria-hidden="true">↗</span></Link>
      </header>

      <section className={styles.intake} aria-label="Contact form and availability">
        {children}
      </section>

      <details className={styles.guidance}>
        <summary>Before you send <span aria-hidden="true">+</span></summary>
        <div className={styles.guidanceContent}>
          {contactPreparationGroups.map((group) => (
            <section key={group.title}>
              <h2>{group.title}</h2>
              <ul>{group.items.map((item) => <li key={item}>{item}</li>)}</ul>
            </section>
          ))}
        </div>
      </details>

      <nav className={styles.related} aria-label="Contact resources">
        <Link href="/faq">← Back to FAQ</Link>
        <div><Link href="/privacy">Privacy Policy</Link><Link href="/accessibility">Accessibility</Link></div>
      </nav>
    </div>
  );
}
