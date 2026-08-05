"use client";

import {
  AnimatePresence,
  domAnimation,
  LazyMotion,
  MotionConfig,
  useReducedMotion,
  type Variants,
} from "motion/react";
import * as m from "motion/react-m";

const TYPEWRITER_CHARACTER_DELAY = 0.016;

const TYPEWRITER_TEXT_VARIANTS: Variants = {
  hidden: { opacity: 1 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: TYPEWRITER_CHARACTER_DELAY },
  },
  exit: {
    opacity: 0,
    transition: { duration: 0.08, ease: "easeOut" },
  },
};

const TYPEWRITER_CHARACTER_VARIANTS: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

type HomePhasedDescriptionProps = {
  className?: string;
  text: string;
};

export function HomePhasedDescription({
  className,
  text,
}: HomePhasedDescriptionProps) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <p
      className={["home-phased-description", className]
        .filter(Boolean)
        .join(" ")}
      aria-live="polite"
      aria-atomic="true"
    >
      <LazyMotion features={domAnimation} strict>
        <MotionConfig reducedMotion="user">
          <AnimatePresence initial={false} mode="wait">
            <m.span
              key={text}
              className="home-phased-description__text"
              variants={TYPEWRITER_TEXT_VARIANTS}
              initial={shouldReduceMotion ? false : "hidden"}
              animate="visible"
              exit={shouldReduceMotion ? undefined : "exit"}
              transition={shouldReduceMotion ? { duration: 0 } : undefined}
            >
              {Array.from(text).map((character, index) => (
                <m.span
                  key={`${character}-${index}`}
                  className="home-phased-description__character"
                  variants={TYPEWRITER_CHARACTER_VARIANTS}
                  transition={
                    shouldReduceMotion ? { duration: 0 } : { duration: 0.01 }
                  }
                >
                  {character}
                </m.span>
              ))}
            </m.span>
          </AnimatePresence>
        </MotionConfig>
      </LazyMotion>
    </p>
  );
}
