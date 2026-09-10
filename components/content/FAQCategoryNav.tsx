"use client";

import { useEffect, useRef, useState } from "react";
import type { FAQCategory } from "@/content/support/faq";

export function FAQCategoryNav({
  categories,
}: {
  categories: Pick<FAQCategory, "id" | "label">[];
}) {
  const navigation = useRef<HTMLElement>(null);
  const [activeId, setActiveId] = useState<string | null>(categories[0]?.id ?? null);

  useEffect(() => {
    const readFragment = () => {
      const category = categories.find(
        (item) => `#${item.id}` === window.location.hash,
      );
      setActiveId(
        category?.id ?? (window.location.hash ? null : categories[0]?.id ?? null),
      );
    };
    readFragment();
    window.addEventListener("hashchange", readFragment);
    return () => window.removeEventListener("hashchange", readFragment);
  }, [categories]);

  useEffect(() => {
    let active = true;
    const revealActiveLink = () => {
      if (!active) return;
      const nav = navigation.current;
      const link = nav?.querySelector<HTMLAnchorElement>(
        'a[aria-current="location"]',
      );
      if (!nav || !link || nav.scrollWidth <= nav.clientWidth) return;

      // Scroll only the category rail; native fragment navigation owns the page.
      const frame = nav.getBoundingClientRect();
      const target = link.getBoundingClientRect();
      if (target.left < frame.left) nav.scrollLeft += target.left - frame.left;
      else if (target.right > frame.right) {
        nav.scrollLeft += target.right - frame.right;
      }
    };
    revealActiveLink();
    void document.fonts?.ready.then(revealActiveLink);
    window.addEventListener("resize", revealActiveLink);
    return () => {
      active = false;
      window.removeEventListener("resize", revealActiveLink);
    };
  }, [activeId]);

  return (
    <nav ref={navigation} className="faq-category-nav" aria-label="FAQ categories">
      {categories.map((category) => (
        <a
          key={category.id}
          href={`#${category.id}`}
          aria-current={activeId === category.id ? "location" : undefined}
        >
          {category.label}
        </a>
      ))}
    </nav>
  );
}
