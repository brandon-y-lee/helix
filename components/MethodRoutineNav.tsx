"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export type MethodRoutineNavItem = {
  id: string;
  label: string;
  meta?: string;
  position?: number;
};

export function MethodRoutineNav({ items }: { items: MethodRoutineNavItem[] }) {
  const [activeId, setActiveId] = useState(items[0]?.id ?? "");
  const previousItemsRef = useRef(items);

  useEffect(() => {
    if (items.some((item) => item.id === activeId)) {
      previousItemsRef.current = items;
      return;
    }

    const previousItem = previousItemsRef.current.find((item) => item.id === activeId);
    const nearestStep =
      typeof previousItem?.position === "number"
        ? items
            .filter((item) => typeof item.position === "number")
            .sort(
              (a, b) =>
                Math.abs((a.position ?? 0) - previousItem.position!) -
                  Math.abs((b.position ?? 0) - previousItem.position!) ||
                (a.position ?? 0) - (b.position ?? 0),
            )[0]
        : undefined;

    setActiveId(nearestStep?.id ?? items[0]?.id ?? "");
    previousItemsRef.current = items;
  }, [activeId, items]);

  useEffect(() => {
    if (items.length === 0) return;
    if (typeof IntersectionObserver === "undefined") {
      setActiveId(items[0]?.id ?? "");
      return;
    }

    const sections = items
      .map((item) => document.getElementById(item.id))
      .filter((section): section is HTMLElement => Boolean(section));

    if (sections.length === 0) {
      setActiveId(items[0]?.id ?? "");
      return;
    }

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
