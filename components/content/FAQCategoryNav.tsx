"use client";

import { useEffect, useRef, useState } from "react";
import type { FAQCategory } from "@/content/support/faq";
import styles from "./faq.module.css";

function revealCurrentLink(nav: HTMLElement | null) {
  const link = nav?.querySelector<HTMLAnchorElement>('a[aria-current="location"]');
  if (!nav || !link || nav.scrollWidth <= nav.clientWidth) return;
  const frame = nav.getBoundingClientRect();
  const target = link.getBoundingClientRect();
  if (target.left < frame.left) nav.scrollLeft += target.left - frame.left;
  else if (target.right > frame.right) nav.scrollLeft += target.right - frame.right;
}

export function FAQCategoryNav({ categories }: { categories: Pick<FAQCategory, "id" | "label">[] }) {
  const navigation = useRef<HTMLElement>(null);
  const [activeId, setActiveId] = useState<string | null>(categories[0]?.id ?? null);

  useEffect(() => {
    const nav = navigation.current!;
    const shell = nav.parentElement!;
    const phone = window.matchMedia?.("(max-width: 760px)");
    let frame = 0;
    let disposed = false;
    let followScroll = true;
    let lastScrollY = window.scrollY;
    const threshold = () => {
      const header = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--site-header-height")) || 64;
      return header + (phone?.matches ? nav.getBoundingClientRect().height : 0) + 24;
    };
    const measureRail = () => shell.style.setProperty("--faq-rail-height", `${nav.getBoundingClientRect().height}px`);
    const readFragment = () => {
      const id = categories.find((category) => `#${category.id}` === window.location.hash)?.id;
      window.cancelAnimationFrame(frame);
      frame = 0;
      followScroll = !id;
      lastScrollY = window.scrollY;
      setActiveId(id ?? (window.location.hash ? null : categories[0]?.id ?? null));
    };
    const readScroll = () => {
      frame = 0;
      const sections = categories.flatMap(({ id }) => {
        const element = document.getElementById(id);
        return element ? [{ id, rect: element.getBoundingClientRect() }] : [];
      });
      if (!sections.length) return;
      const line = threshold() + 2;
      const passed = sections.filter(({ rect }) => rect.top <= line);
      setActiveId((passed.at(-1) ?? sections[0]).id);
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(readScroll);
    };
    const onScroll = () => {
      if (window.scrollY === lastScrollY) return;
      lastScrollY = window.scrollY;
      followScroll = true;
      schedule();
    };
    // Layout can settle before native fragment restoration. Keep its selection
    // until vertical movement resumes normal viewport tracking.
    const resize = () => { measureRail(); revealCurrentLink(nav); if (followScroll) schedule(); };
    measureRail();
    readFragment();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resize);
    observer?.observe(nav);
    const contents = shell.querySelector(".faq-categories");
    if (contents) observer?.observe(contents);
    window.addEventListener("hashchange", readFragment);
    window.addEventListener("popstate", readFragment);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", resize);
    void document.fonts?.ready.then(() => { if (!disposed) resize(); });
    return () => {
      disposed = true;
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("hashchange", readFragment);
      window.removeEventListener("popstate", readFragment);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", resize);
    };
  }, [categories]);

  useEffect(() => {
    revealCurrentLink(navigation.current);
  }, [activeId]);

  return (
    <nav ref={navigation} className={`faq-category-nav ${styles.navigation}`} aria-label="FAQ categories">
      {categories.map((category) => (
        <a key={category.id} href={`#${category.id}`}
          aria-current={activeId === category.id ? "location" : undefined}>
          <span className={styles.dot} aria-hidden="true" />{category.label}
        </a>
      ))}
    </nav>
  );
}
