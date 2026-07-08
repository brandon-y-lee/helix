"use client";

import { useEffect, useRef, useState } from "react";

type HomePhasedDescriptionProps = {
  className?: string;
  text: string;
};

export function HomePhasedDescription({
  className,
  text,
}: HomePhasedDescriptionProps) {
  const [renderedText, setRenderedText] = useState(text);
  const [phase, setPhase] = useState<"hidden" | "visible">("visible");
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (text === renderedText) return;

    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      setRenderedText(text);
      setPhase("visible");
      return;
    }

    setPhase("hidden");
    const timeout = window.setTimeout(() => {
      setRenderedText(text);
      frameRef.current = window.requestAnimationFrame(() => {
        setPhase("visible");
        frameRef.current = null;
      });
    }, 90);

    return () => {
      window.clearTimeout(timeout);
      if (frameRef.current) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [renderedText, text]);

  return (
    <p
      className={["home-phased-description", className].filter(Boolean).join(" ")}
      data-phase={phase}
    >
      {renderedText}
    </p>
  );
}
