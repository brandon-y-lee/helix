import Link from "next/link";
import type { FAQCategory } from "@/content/support/faq";
import { FAQCategoryNav } from "./FAQCategoryNav";
import { FAQDisclosure } from "./FAQDisclosure";
import styles from "./faq.module.css";

export function FAQAccordion({ categories }: { categories: FAQCategory[] }) {
  return (
    <div className={`faq-shell ${styles.shell}`}>
      <FAQCategoryNav categories={categories.map(({ id, label }) => ({ id, label }))} />
      <div className={`faq-categories ${styles.categories}`}>
        {categories.map((category) => (
          <section key={category.id} id={category.id} className={`faq-category ${styles.category}`}
            aria-labelledby={`faq-${category.id}-heading`}>
            <h2 id={`faq-${category.id}-heading`} className={styles.title}>{category.label}</h2>
            <div className={`faq-list ${styles.list}`}>
              {category.items.map((item, index) => (
                <FAQDisclosure key={item.id} question={item.question} panelId={`faq-panel-${item.id}`}
                  initiallyOpen={index === 0}>
                  <p>{item.answer}</p>
                  {item.links && <ul>{item.links.map((link) => (
                    <li key={link.href}><Link href={link.href}>{link.label}</Link></li>
                  ))}</ul>}
                </FAQDisclosure>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
