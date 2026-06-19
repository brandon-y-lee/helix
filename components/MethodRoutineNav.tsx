"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export type MethodRoutineNavItem = {
  id: string;
  label: string;
  meta?: string;
};

export function MethodRoutineNav({ items }: { items: MethodRoutineNavItem[] }) {
  const [activeId, setActiveId] = useState(items[0]?.id ?? "");

  useEffect(() => {
    if (items.length === 0) return;
    if (typeof IntersectionObserver === "undefined") return;

    const sections = items
      .map((item) => document.getElementById(item.id))
      .filter((section): section is HTMLElement => Boolean(section));

    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible?.target.id) {
          setActiveId(visible.target.id);
        }
      },
      {
        rootMargin: "-28% 0px -58% 0px",
        threshold: [0.12, 0.28, 0.48],
      },
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [items]);

  return (
    <nav className="method-index" aria-label="Method step navigation">
      <p className="method-index__label">Routine index</p>
      <ol>
        {items.map((item) => (
          <li key={item.id}>
            <Link
              href={`#${item.id}`}
              className="method-index__link"
              aria-current={activeId === item.id ? "location" : undefined}
            >
              <span>{item.label}</span>
              {item.meta && <small>{item.meta}</small>}
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}
