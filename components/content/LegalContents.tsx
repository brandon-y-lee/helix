"use client";

import { useEffect, useRef } from "react";

type SectionLink = { id: string; title: string };
type ContentsFocus = { surface: "mobile" | "desktop"; href: string | null };

function SectionLinks({ sections }: { sections: SectionLink[] }) {
  return (
    <ol>
      {sections.map((section) => (
        <li key={section.id}>
          <a href={`#${section.id}`}>{section.title}</a>
        </li>
      ))}
    </ol>
  );
}

export function LegalContents({
  title,
  sections,
}: {
  title: string;
  sections: SectionLink[];
}) {
  const container = useRef<HTMLDivElement>(null);
  const desktop = useRef<HTMLElement>(null);
  const mobile = useRef<HTMLDetailsElement>(null);
  const summary = useRef<HTMLElement>(null);
  const lastFocus = useRef<ContentsFocus | null>(null);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const phone = window.matchMedia("(max-width: 720px)");

    const rememberFocus = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement) || !container.current?.contains(target)) {
        lastFocus.current = null;
        return;
      }
      lastFocus.current = {
        surface: mobile.current?.contains(target) ? "mobile" : "desktop",
        href: target.closest("a")?.getAttribute("href") ?? null,
      };
    };
    const onFocus = (event: FocusEvent) => rememberFocus(event.target);
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !container.current?.contains(event.target)) {
        lastFocus.current = null;
      }
    };
    const transferFocus = (event: MediaQueryListEvent) => {
      const previous = lastFocus.current;
      const outgoing = event.matches ? "desktop" : "mobile";
      if (!previous || previous.surface !== outgoing) return;

      // CSS may already have moved focus to body before this change event.
      // Outside focus/pointer events clear the record so resizing cannot steal it.
      const active = document.activeElement;
      if (active !== document.body && active && !container.current?.contains(active)) {
        lastFocus.current = null;
        return;
      }
      const destination = event.matches ? mobile.current : desktop.current;
      const links = destination?.querySelectorAll<HTMLAnchorElement>("a");
      const equivalent = links && Array.from(links).find(
        (link) => link.getAttribute("href") === previous.href,
      );
      const target = event.matches && !mobile.current?.open
        ? summary.current
        : equivalent ?? links?.[0];
      target?.focus({ preventScroll: true });
    };

    rememberFocus(document.activeElement);
    document.addEventListener("focusin", onFocus);
    document.addEventListener("pointerdown", onPointerDown, true);
    phone.addEventListener("change", transferFocus);
    return () => {
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("pointerdown", onPointerDown, true);
      phone.removeEventListener("change", transferFocus);
    };
  }, []);

  return (
    <div className="legal-contents" ref={container}>
      <nav
        ref={desktop}
        className="legal-toc legal-toc--desktop"
        aria-label={`${title} sections`}
      >
        <h2>Contents</h2>
        <SectionLinks sections={sections} />
      </nav>
      <details ref={mobile} className="legal-toc legal-toc--mobile">
        <summary ref={summary}>Contents</summary>
        <nav aria-label={`${title} sections`}>
          <SectionLinks sections={sections} />
        </nav>
      </details>
    </div>
  );
}
