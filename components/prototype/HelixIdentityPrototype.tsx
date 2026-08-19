"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import styles from "./HelixIdentityPrototype.module.css";

type StudyKey = "A" | "B" | "C";

type Study = {
  key: StudyKey;
  name: string;
  note: string;
  crossingGap: number;
  primaryStroke: number;
  secondaryStroke: number;
  linecap: "butt" | "round";
};

const studies: Record<StudyKey, Study> = {
  A: {
    key: "A",
    name: "Taut",
    note: "Narrow crossing gap · higher contrast · quiet cut terminals",
    crossingGap: 2.5,
    primaryStroke: 12.5,
    secondaryStroke: 9.5,
    linecap: "butt",
  },
  B: {
    key: "B",
    name: "Balanced",
    note: "Measured crossing gap · moderate contrast · softened terminals",
    crossingGap: 4.5,
    primaryStroke: 12,
    secondaryStroke: 10.5,
    linecap: "round",
  },
  C: {
    key: "C",
    name: "Fluid",
    note: "Open crossing gap · lower contrast · tapered terminals",
    crossingGap: 6.5,
    primaryStroke: 11.5,
    secondaryStroke: 11,
    linecap: "butt",
  },
};

function HelixSymbol({ study, instance }: { study: Study; instance: string }) {
  const maskId = `helix-crossing-${study.key}-${instance}`;
  const primaryPath =
    "M35 14 C33 40 34 56 48 67 C57 75 69 80 79 89 C94 103 99 125 98 151";
  const secondaryPath = "M29 151 C25 124 27 101 39 83 C45 74 50 69 54 66";

  return (
    <svg
      className={styles.symbol}
      viewBox="0 0 122 166"
      aria-hidden="true"
      focusable="false"
    >
      <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="122" height="166">
        <rect width="122" height="166" fill="white" />
        <path
          d={primaryPath}
          fill="none"
          stroke="black"
          strokeWidth={study.primaryStroke + study.crossingGap * 2}
          strokeLinecap={study.linecap}
        />
      </mask>
      <path
        d={secondaryPath}
        fill="none"
        stroke="currentColor"
        strokeWidth={study.secondaryStroke}
        strokeLinecap={study.linecap}
        mask={`url(#${maskId})`}
      />
      <path
        d={primaryPath}
        fill="none"
        stroke="currentColor"
        strokeWidth={study.primaryStroke}
        strokeLinecap={study.linecap}
      />
      {study.key === "C" ? (
        <>
          <path d="M29.2 14 L40.8 14 L35.2 5 Z" fill="currentColor" />
          <path d="M23.5 151 L34.5 151 L29.5 160 Z" fill="currentColor" />
          <path d="M92.2 151 L103.8 151 L98.1 160 Z" fill="currentColor" />
        </>
      ) : null}
    </svg>
  );
}

function HelixWordmark({
  study,
  instance,
  symbolOnly = false,
}: {
  study: Study;
  instance: string;
  symbolOnly?: boolean;
}) {
  return (
    <span
      className={symbolOnly ? styles.symbolMark : styles.wordmark}
      aria-label="helix"
      role="img"
    >
      <HelixSymbol study={study} instance={instance} />
      {symbolOnly ? null : <span aria-hidden="true">elix</span>}
    </span>
  );
}

function StudyContexts({ study }: { study: Study }) {
  return (
    <div className={styles.contextGrid}>
      <section className={`${styles.context} ${styles.contextNavigation}`}>
        <span className={styles.contextLabel}>Navigation · 112 px wide</span>
        <HelixWordmark study={study} instance="navigation" />
      </section>
      <section className={`${styles.context} ${styles.contextReversed}`}>
        <span className={styles.contextLabel}>Reversed · one color</span>
        <HelixWordmark study={study} instance="reversed" />
      </section>
      <section className={`${styles.context} ${styles.contextFooter}`}>
        <span className={styles.contextLabel}>Footer · expanded</span>
        <HelixWordmark study={study} instance="footer" />
      </section>
      <section className={`${styles.context} ${styles.contextAdmin}`}>
        <span className={styles.contextLabel}>Admin · compact</span>
        <div className={styles.adminLockup}>
          <HelixWordmark study={study} instance="admin" />
          <span>ADMIN</span>
        </div>
      </section>
      <section className={`${styles.context} ${styles.contextCompact}`}>
        <span className={styles.contextLabel}>Symbol · 16 / 24 / 32 px</span>
        <div className={styles.compactRow}>
          {[16, 24, 32].map((size) => (
            <span key={size} style={{ width: size, height: size }}>
              <HelixWordmark
                study={study}
                instance={`compact-${size}`}
                symbolOnly
              />
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}

function PrototypeSwitcher({ current }: { current: StudyKey }) {
  const router = useRouter();
  const pathname = usePathname();
  const keys: StudyKey[] = ["A", "B", "C"];
  const currentIndex = keys.indexOf(current);

  const choose = (offset: number) => {
    const next = keys[(currentIndex + offset + keys.length) % keys.length];
    router.replace(`${pathname}?variant=${next}`, { scroll: false });
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.matches("input, textarea, select, [contenteditable='true']")
      ) {
        return;
      }

      if (event.key === "ArrowLeft") {
        choose(-1);
      } else if (event.key === "ArrowRight") {
        choose(1);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  return (
    <nav className={styles.switcher} aria-label="Identity study variants">
      <button type="button" onClick={() => choose(-1)} aria-label="Previous study">
        ←
      </button>
      <span>
        {current} — {studies[current].name}
      </span>
      <button type="button" onClick={() => choose(1)} aria-label="Next study">
        →
      </button>
    </nav>
  );
}

export function HelixIdentityPrototype({ variant }: { variant: StudyKey }) {
  const study = studies[variant];

  return (
    <div className={styles.page}>
      <header className={styles.intro}>
        <p className={styles.eyebrow}>Helix identity study · ticket #177</p>
        <h1>
          {study.key}. {study.name}
        </h1>
        <p>{study.note}</p>
      </header>

      <section className={styles.heroStudy} aria-labelledby="study-heading">
        <div>
          <p className={styles.studyIndex}>{study.key}</p>
          <h2 id="study-heading">Lowercase h first. Helix Motif second.</h2>
          <p>
            The right-hand profile sets the silhouette; the middle sketch lends
            movement through the inward crossing.
          </p>
        </div>
        <HelixWordmark study={study} instance="hero" />
      </section>

      <StudyContexts study={study} />

      <aside className={styles.reviewPrompt}>
        <p>Review only these optical controls</p>
        <ul>
          <li>Crossing clarity and negative gap</li>
          <li>Weight relationship between the two strands</li>
          <li>Terminal character at compact sizes</li>
          <li>Symbol-to-<em>elix</em> rhythm</li>
        </ul>
      </aside>

      <PrototypeSwitcher current={variant} />
    </div>
  );
}
