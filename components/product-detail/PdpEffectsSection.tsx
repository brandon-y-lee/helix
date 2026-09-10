'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, domMax, LazyMotion, useReducedMotion } from 'motion/react';
import * as m from 'motion/react-m';
import { effects, type Effect } from '@/lib/content/serum-effects';
import styles from './PdpEffectsSection.module.css';

function Chevron({ previous = false }: { previous?: boolean }) {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d={previous ? 'm12 5-5 5 5 5' : 'm8 5 5 5-5 5'} /></svg>;
}

function Properties({ effect, reduceMotion }: { effect: Effect; reduceMotion: boolean }) {
  const [active, setActive] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef(active);
  const previousRef = useRef<HTMLButtonElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);

  function goTo(index: number) {
    const track = trackRef.current;
    if (!track) return;
    const card = track.children[index] as HTMLElement;
    setActive(index);
    track.scrollTo({ left: card.offsetLeft, behavior: reduceMotion ? 'instant' : 'smooth' });
  }

  useLayoutEffect(() => {
    activeRef.current = active;
    // Move focus after the endpoint buttons have received their new disabled state.
    if (active === 0 && document.activeElement === previousRef.current) nextRef.current?.focus({ preventScroll: true });
    if (active === effect.pathways.length - 1 && document.activeElement === nextRef.current) previousRef.current?.focus({ preventScroll: true });
  }, [active, effect.pathways.length]);

  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    let width = track.clientWidth;
    const observer = new ResizeObserver(() => {
      if (track.clientWidth === width) return;
      width = track.clientWidth;
      const selected = track.children[activeRef.current] as HTMLElement;
      track.scrollTo({ left: selected.offsetLeft, behavior: 'instant' });
    });
    observer.observe(track);
    return () => observer.disconnect();
  }, []);

  return <div className={styles.properties} role="region" aria-roledescription="carousel" aria-label={`${effect.title} properties`}>
    <div className={styles.propertyTrack} ref={trackRef} onScroll={event => {
      const track = event.currentTarget;
      const index = Math.round(track.scrollLeft / track.clientWidth);
      if (index >= 0 && index < effect.pathways.length) setActive(index);
    }}>
      {effect.pathways.map((pathway, index) => <article className={styles.property} key={pathway.title} aria-hidden={active !== index} aria-roledescription="slide" aria-label={`${index + 1} of ${effect.pathways.length}`}>
        <h3>{pathway.title}</h3>
        <p className={styles.ingredients}>{pathway.ingredients}</p>
        <p className={styles.rationale}>{pathway.description}</p>
      </article>)}
    </div>
    <div className={styles.propertyControls}>
      <span className={styles.count} aria-live="polite" aria-atomic="true">{String(active + 1).padStart(2, '0')} <span aria-hidden="true">/</span><span className={styles.srOnly}>of</span> {String(effect.pathways.length).padStart(2, '0')}</span>
      <div className={styles.propertyArrows}>
        <button ref={previousRef} type="button" aria-label="Previous property" disabled={active === 0} onClick={() => goTo(active - 1)}><Chevron previous /></button>
        <button ref={nextRef} type="button" aria-label="Next property" disabled={active === effect.pathways.length - 1} onClick={() => goTo(active + 1)}><Chevron /></button>
      </div>
    </div>
  </div>;
}

export function PdpEffectsSection() {
  const [active, setActive] = useState<number | null>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const closedEffect = useRef<number | null>(null);
  const focusSelected = useRef(false);
  const reduceMotion = !!useReducedMotion();
  const effect = active === null ? null : effects[active];

  function select(index: number) { setActive(index); }
  function close() {
    const selected = active;
    closedEffect.current = selected;
    setActive(null);
    if (selected !== null) (railRef.current?.children[selected] as HTMLElement | undefined)?.querySelector('button')?.focus({ preventScroll: true });
  }
  function step(index: number) {
    focusSelected.current = index === 0 || index === effects.length - 1;
    select(index);
  }

  useLayoutEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    function centerSelection() {
      if (!rail || !window.matchMedia('(max-width: 800px)').matches) return;
      const visibleIndex = active ?? closedEffect.current;
      const selected = visibleIndex === null ? null : rail.children[visibleIndex] as HTMLElement;
      rail.scrollTo({ left: selected ? selected.offsetLeft - (rail.clientWidth - selected.offsetWidth) / 2 : 0, behavior: 'instant' });
    }
    centerSelection();
    if (focusSelected.current && active !== null) {
      (rail.children[active] as HTMLElement).querySelector('button')?.focus({ preventScroll: true });
      focusSelected.current = false;
    }
    const observer = new ResizeObserver(centerSelection);
    observer.observe(rail);
    return () => observer.disconnect();
  }, [active]);

  return <LazyMotion features={domMax}>
    <section id="effects-prototype" className={styles.closer} aria-labelledby="effects-title" onKeyDown={event => {
      if (event.key === 'Escape' && active !== null) { event.preventDefault(); close(); }
    }}>
      <div className={styles.stage}>
        {effect && <button className={styles.close} type="button" aria-label="Collapse effect description" onClick={close}><span aria-hidden="true">×</span></button>}
        <div className={styles.visualStage}>
          <AnimatePresence mode="wait" initial={false}>
            <m.div key={effect?.id ?? 'hero'} className={styles.visual} data-selected={!!effect}
              initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { duration: reduceMotion ? 0 : .58, delay: reduceMotion ? 0 : .08, ease: 'easeInOut' } }}
              exit={{ opacity: 0, transition: { duration: reduceMotion ? 0 : .24, ease: 'easeInOut' } }}>
              <div className={styles.image} data-effect={effect?.id ?? 'hero'}>
                <div className={styles.hue} role="img" aria-label={effect ? `${effect.title} model image placeholder` : 'Serum effects hero image placeholder'} />
                <h2 id="effects-title" className={styles.heading}>Four effects.<br />One formula.</h2>
              </div>
              {effect && <Properties effect={effect} reduceMotion={reduceMotion} />}
            </m.div>
          </AnimatePresence>
        </div>
        <m.div layout={reduceMotion ? false : 'position'} transition={{ duration: .42 }} className={styles.selector} data-open={!!effect}>
          <m.div layoutScroll className={styles.effects} aria-label="Explore product effects" ref={railRef}>
            {effects.map((item, index) => {
              const expanded = active === index;
              return <m.div layout={reduceMotion ? false : 'position'} transition={{ duration: .42 }} className={styles.effect} key={item.id} data-expanded={expanded}>
                <m.button layout={!reduceMotion} style={{ borderRadius: 28 }} transition={{ layout: { duration: .42, ease: [.22, 1, .36, 1] } }}
                  type="button" aria-label={item.title} aria-describedby={expanded ? `closer-effect-${item.id}` : undefined}
                  aria-expanded={expanded} aria-controls={`closer-effect-${item.id}`} onClick={() => select(index)}>
                  <m.span layout={reduceMotion ? false : 'position'} className={styles.effectLabel}><span className={styles.effectIcon} aria-hidden="true" /><span>{item.title}</span></m.span>
                  <m.span layout={reduceMotion ? false : 'position'} animate={{ opacity: expanded ? 1 : 0 }} transition={{ duration: reduceMotion ? 0 : .42 }} id={`closer-effect-${item.id}`} className={styles.description} hidden={!expanded}>
                    <strong>{item.title}.</strong> {item.promise} {item.summary}
                  </m.span>
                </m.button>
              </m.div>;
            })}
          </m.div>
          {active !== null && <div className={styles.arrows}>
            <button type="button" aria-label="Previous effect" disabled={active === 0} onClick={() => step(active - 1)}><Chevron previous /></button>
            <button type="button" aria-label="Next effect" disabled={active === effects.length - 1} onClick={() => step(active + 1)}><Chevron /></button>
          </div>}
        </m.div>
      </div>
    </section>
  </LazyMotion>;
}
