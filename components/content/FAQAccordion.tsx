import Link from "next/link";
import type { FAQCategory } from "@/content/support/faq";
import { FAQCategoryNav } from "@/components/content/FAQCategoryNav";

export function FAQAccordion({ categories }: { categories: FAQCategory[] }) {
  return (
    <div className="faq-shell">
      <FAQCategoryNav categories={categories.map(({ id, label }) => ({ id, label }))} />

      <div className="faq-categories">
        {categories.map((category) => (
          <section
            key={category.id}
            id={category.id}
            className="faq-category"
            aria-labelledby={`faq-${category.id}-heading`}
          >
            <div className="section-head">
              <div>
                <p className="eyebrow">{category.label}</p>
                <h2 id={`faq-${category.id}-heading`}>{category.label}</h2>
                <p>{category.summary}</p>
              </div>
            </div>
            <div className="faq-list">
              {category.items.map((item, itemIndex) => {
                const panelId = `faq-panel-${item.id}`;
                return (
                  <details key={item.id} className="faq-item" open={itemIndex === 0}>
                    <summary aria-controls={panelId}>
                      <span>{item.question}</span>
                      <span aria-hidden="true">+</span>
                    </summary>
                    <div id={panelId}>
                      <p>{item.answer}</p>
                      {item.links && (
                        <ul>
                          {item.links.map((link) => (
                            <li key={link.href}>
                              <Link href={link.href}>{link.label}</Link>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </details>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
