"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { FAQCategory } from "@/content/support/faq";

export function FAQAccordion({ categories }: { categories: FAQCategory[] }) {
  const initialOpen = useMemo(() => {
    const entries: Record<string, boolean> = {};
    categories.forEach((category) => {
      const first = category.items[0];
      if (first) entries[first.id] = true;
    });
    return entries;
  }, [categories]);
  const [openItems, setOpenItems] = useState<Record<string, boolean>>(initialOpen);

  return (
    <div className="faq-shell">
      <nav className="faq-category-nav" aria-label="FAQ categories">
        {categories.map((category) => (
          <a key={category.id} href={`#faq-${category.id}`}>
            {category.label}
          </a>
        ))}
      </nav>

      <div className="faq-categories">
        {categories.map((category) => (
          <section
            key={category.id}
            id={`faq-${category.id}`}
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
              {category.items.map((item) => {
                const panelId = `faq-panel-${item.id}`;
                const isOpen = Boolean(openItems[item.id]);
                return (
                  <article key={item.id} className="faq-item">
                    <h3>
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        aria-controls={panelId}
                        onClick={() =>
                          setOpenItems((current) => ({
                            ...current,
                            [item.id]: !current[item.id],
                          }))
                        }
                      >
                        <span>{item.question}</span>
                        <span aria-hidden="true">{isOpen ? "-" : "+"}</span>
                      </button>
                    </h3>
                    <div id={panelId} hidden={!isOpen}>
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
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

