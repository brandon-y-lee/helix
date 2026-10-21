"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import styles from "./faq.module.css";

export function FAQDisclosure({ question, panelId, initiallyOpen, children }: {
  question: string;
  panelId: string;
  initiallyOpen: boolean;
  children: ReactNode;
}) {
  const details = useRef<HTMLDetailsElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const requested = useRef(initiallyOpen);
  const expectedNativeOpen = useRef(initiallyOpen);
  const animation = useRef<Animation | null>(null);
  const change = useRef<(open: boolean) => void>(() => {});
  const [expanded, setExpanded] = useState(initiallyOpen);
  const [enhanced, setEnhanced] = useState(false);

  useEffect(() => {
    const element = details.current!;
    const answer = panel.current!;
    const summary = element.querySelector("summary")!;
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const nativeOpen = (open: boolean) => {
      expectedNativeOpen.current = open;
      element.open = open;
    };
    const finish = (open: boolean) => {
      animation.current?.cancel();
      animation.current = null;
      element.style.height = "";
      nativeOpen(open);
    };
    const transition = (open: boolean) => {
      requested.current = open;
      setExpanded(open);
      if (!open && answer.contains(document.activeElement)) {
        summary.focus({ preventScroll: true });
      }
      answer.inert = !open;
      answer.setAttribute("aria-hidden", String(!open));
      const from = element.getBoundingClientRect().height;
      animation.current?.cancel();
      animation.current = null;
      if (media?.matches || !element.animate) {
        finish(open);
        return;
      }
      // Keep native content rendered during closing; inert/aria-hidden exclude it
      // immediately. Measure the intrinsic destination after cancelling any run.
      nativeOpen(true);
      element.style.height = "auto";
      const to = open
        ? element.getBoundingClientRect().height
        : summary.getBoundingClientRect().height + 1;
      element.style.height = `${from}px`;
      const run = element.animate([{ height: `${from}px` }, { height: `${to}px` }], {
        duration: 700,
        easing: "cubic-bezier(0.76, 0, 0.24, 1)",
        fill: "forwards",
      });
      animation.current = run;
      run.onfinish = () => {
        if (animation.current === run) finish(requested.current);
      };
    };
    change.current = transition;
    // A native disclosure may have changed before hydration (or via page find).
    requested.current = element.open;
    expectedNativeOpen.current = element.open;
    setExpanded(element.open);
    answer.inert = !element.open;
    answer.setAttribute("aria-hidden", String(!element.open));
    setEnhanced(true);
    const onNativeToggle = () => {
      if (element.open !== expectedNativeOpen.current) transition(element.open);
    };
    const onMotionChange = () => {
      if (media?.matches) finish(requested.current);
    };
    let previousHeight = answer.getBoundingClientRect().height;
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => {
      const height = answer.getBoundingClientRect().height;
      if (height !== previousHeight && animation.current && requested.current) transition(true);
      previousHeight = height;
    });
    observer?.observe(answer);
    element.addEventListener("toggle", onNativeToggle);
    media?.addEventListener("change", onMotionChange);
    return () => {
      animation.current?.cancel();
      observer?.disconnect();
      element.removeEventListener("toggle", onNativeToggle);
      media?.removeEventListener("change", onMotionChange);
    };
  }, []);

  return (
    <details ref={details} className={`faq-item ${styles.item}`} open={initiallyOpen}
      data-expanded={enhanced ? expanded : undefined}>
      <summary tabIndex={0} aria-controls={panelId} aria-expanded={enhanced ? expanded : undefined}
        onClick={(event) => {
          if (!enhanced) return;
          event.preventDefault();
          change.current(!requested.current);
        }}>
        <span>{question}</span>
        <span className={styles.icon} aria-hidden="true"><i /><i /></span>
      </summary>
      <div ref={panel} id={panelId} className={styles.answer}>{children}</div>
    </details>
  );
}
