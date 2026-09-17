'use client';

import { useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { AnimatePresence, domMax, LazyMotion, useReducedMotion } from 'motion/react';
import * as m from 'motion/react-m';
import { effects, type Effect } from '@/lib/content/serum-effects';
import styles from './PdpEffectsSection.module.css';

const MOBILE_EFFECTS_QUERY = '(max-width: 800px)';

function subscribeMobileEffects(callback: () => void) {
  const query = window.matchMedia?.(MOBILE_EFFECTS_QUERY);
  query?.addEventListener?.('change', callback);
  return () => query?.removeEventListener?.('change', callback);
}

function mobileEffectsSnapshot() {
  return window.matchMedia?.(MOBILE_EFFECTS_QUERY).matches ?? false;
}

const serverMobileEffectsSnapshot = () => true;

function Chevron({ previous = false }: { previous?: boolean }) {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d={previous ? 'm12 5-5 5 5 5' : 'm8 5 5 5-5 5'} /></svg>;
}

function PropertyCopy({ pathway }: { pathway: Effect['pathways'][number] }) {
  return <>
    <h3>{pathway.title}</h3>
    <p className={styles.ingredients}>{pathway.ingredients}</p>
    <p className={styles.rationale}>{pathway.description}</p>
  </>;
}

function Properties({ effect, reduceMotion, mobile }: { effect: Effect; reduceMotion: boolean; mobile: boolean }) {
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
    {mobile && <div className={styles.propertySizer} aria-hidden="true" inert>
      {effects.flatMap(item => item.pathways).map((pathway, index) => <article className={styles.property} key={index}><PropertyCopy pathway={pathway} /></article>)}
    </div>}
    <div className={styles.propertyTrack} ref={trackRef} onScroll={event => {
      const track = event.currentTarget;
      const index = Math.round(track.scrollLeft / track.clientWidth);
      if (index >= 0 && index < effect.pathways.length) setActive(index);
    }}>
      {effect.pathways.map((pathway, index) => <article className={styles.property} key={pathway.title} aria-hidden={active !== index} aria-roledescription="slide" aria-label={`${index + 1} of ${effect.pathways.length}`}>
        <PropertyCopy pathway={pathway} />
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
  const selectedRef = useRef<number | null>(null);
  const [position, setPosition] = useState(0);
  const [moving, setMoving] = useState(false);
  const touching = useRef(false);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reduceMotion = !!useReducedMotion();
  const mobile = useSyncExternalStore(subscribeMobileEffects, mobileEffectsSnapshot, serverMobileEffectsSnapshot);
  const effect = active === null ? null : effects[active];

  const mobileExpanded = mobile && active !== null;
  selectedRef.current = active;

  function settle() {
    if (!touching.current) setMoving(false);
  }

  function scheduleSettle() {
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(settle, 160);
  }

  useLayoutEffect(() => {
    const rail = railRef.current;
    rail?.addEventListener('scrollend', settle);
    return () => {
      rail?.removeEventListener('scrollend', settle);
      if (settleTimer.current) clearTimeout(settleTimer.current);
      touching.current = false;
    };
  }, []);

  function centerCard(index: number, behavior: ScrollBehavior) {
    const rail = railRef.current;
    const card = rail?.children[index] as HTMLElement | undefined;
    if (rail && card) rail.scrollTo({ left: card.offsetLeft - (rail.clientWidth - card.offsetWidth) / 2, behavior });
  }

  function select(index: number) {
    if (mobileExpanded) {
      centerCard(index, reduceMotion ? 'instant' : 'smooth');
      if (!reduceMotion) return;
    }
    setPosition(index);
    setActive(index);
  }
  function close() {
    const selected = active;
    closedEffect.current = selected;
    setActive(null);
    setMoving(false);
    touching.current = false;
    if (selected !== null) (railRef.current?.children[selected] as HTMLElement | undefined)?.querySelector('button')?.focus({ preventScroll: true });
  }

  useLayoutEffect(() => {
    const rail = railRef.current;
    if (!rail || !mobile) return;
    let width = -1;
    function resize() {
      if (!rail) return;
      if (mobileExpanded) {
        let maxHeight = 44;
        for (const slot of Array.from(rail.children)) {
          const button = slot.querySelector('button');
          const description = slot.querySelector<HTMLElement>(`.${styles.description}`);
          if (button && description) {
            button.style.setProperty('--card-height', `${description.offsetHeight}px`);
            maxHeight = Math.max(maxHeight, description.offsetHeight);
          }
        }
        rail.style.setProperty('--effect-max-card-height', `${maxHeight}px`);
      }
      if (rail.clientWidth === width) return;
      width = rail.clientWidth;
      const index = selectedRef.current ?? closedEffect.current;
      if (index !== null) {
        centerCard(index, 'instant');
        setPosition(index);
      }
    }
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(rail);
    if (mobileExpanded) rail.querySelectorAll(`.${styles.description}`).forEach(description => observer.observe(description));
    return () => observer.disconnect();
  }, [mobile, mobileExpanded]);

  useLayoutEffect(() => {
    const rail = railRef.current;
    if (!mobileExpanded || moving || active === null || !rail) return;
    const hiddenEndpoint = rail.parentElement?.querySelector(`.${styles.arrows} button:disabled`);
    if (rail.contains(document.activeElement) || document.activeElement === hiddenEndpoint) {
      (rail.children[active] as HTMLElement).querySelector('button')?.focus({ preventScroll: true });
    }
  }, [active, mobileExpanded, moving]);

  function scrollEffects() {
    const rail = railRef.current;
    if (!rail || !mobileExpanded) return;
    setMoving(true);
    scheduleSettle();
    const first = rail.children[0] as HTMLElement;
    const second = rail.children[1] as HTMLElement;
    const stride = second.offsetLeft - first.offsetLeft;
    if (stride <= 0) return;
    const next = Math.max(0, Math.min(effects.length - 1,
      (rail.scrollLeft - first.offsetLeft + (rail.clientWidth - first.offsetWidth) / 2) / stride));
    setPosition(next);
    setActive(Math.round(next));
  }

  const visualContent = <>
    <div className={styles.image} data-effect={effect?.id ?? 'hero'}>
      <div className={styles.hue} role="img" aria-label={effect ? `${effect.title} model image placeholder` : 'Serum effects hero image placeholder'} />
      <h2 id="effects-title" className={styles.heading}>Four effects.<br />One formula.</h2>
    </div>
    {effect && <Properties key={effect.id} effect={effect} reduceMotion={reduceMotion} mobile={mobileExpanded} />}
  </>;
  const mediaOpacity = reduceMotion ? 1 : Math.abs(position - Math.round(position)) * -2 + 1;

  return <LazyMotion features={domMax}>
    <section id="effects-prototype" className={styles.closer} aria-labelledby="effects-title" onKeyDown={event => {
      if (event.key === 'Escape' && active !== null) { event.preventDefault(); close(); }
    }}>
      <div className={styles.stage}>
        <div className={styles.visualStage}>
          {effect && <button className={styles.close} type="button" aria-label="Collapse effect description" onClick={close}><span aria-hidden="true">×</span></button>}
          {mobileExpanded ? <div className={styles.visual} data-selected="true" style={{ opacity: mediaOpacity }}>{visualContent}</div> :
            <AnimatePresence mode="wait" initial={false}>
              <m.div key={effect?.id ?? 'hero'} className={styles.visual} data-selected={!!effect}
                initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { duration: reduceMotion ? 0 : .58, delay: reduceMotion ? 0 : .08, ease: 'easeInOut' } }}
                exit={{ opacity: 0, transition: { duration: reduceMotion ? 0 : .24, ease: 'easeInOut' } }}>
                {visualContent}
              </m.div>
            </AnimatePresence>}

        </div>
        <m.div layout={reduceMotion || mobile ? false : 'position'} transition={{ duration: .42 }} className={styles.selector} data-open={!!effect}>
          <m.div layoutScroll className={styles.effects} aria-label="Explore product effects" ref={railRef} onScroll={scrollEffects}
            onTouchStart={() => { touching.current = true; }}
            onTouchEnd={() => { touching.current = false; scheduleSettle(); }}
            onTouchCancel={() => { touching.current = false; scheduleSettle(); }}
            onKeyDown={event => {
              if (!mobileExpanded || active === null) return;
              const next = event.key === 'ArrowRight' ? Math.min(effects.length - 1, active + 1) :
                event.key === 'ArrowLeft' ? Math.max(0, active - 1) : event.key === 'Home' ? 0 : event.key === 'End' ? effects.length - 1 : null;
              if (next !== null) { event.preventDefault(); select(next); }
            }}>
            {effects.map((item, index) => {
              const expanded = active === index;
              const expansion = reduceMotion ? Number(expanded) : Math.max(0, 1 - Math.abs(position - index));
              // Mobile wrapper transforms can shrink WebKit's scroll extent and clamp the selection out of view.
              return <m.div layout={reduceMotion || mobile ? false : 'position'} transition={{ duration: .42 }} className={styles.effect} key={item.id} data-expanded={expanded}>
                <m.button layout={!reduceMotion && !mobileExpanded} style={{ borderRadius: 28, ...(mobileExpanded ? { '--card-expansion': expansion } : {}) } as CSSProperties} transition={{ layout: { duration: .42, ease: [.22, 1, .36, 1] } }}
                  type="button" aria-label={item.title} aria-describedby={expanded ? `closer-effect-${item.id}` : undefined}
                  tabIndex={mobileExpanded && !expanded ? -1 : undefined} aria-expanded={expanded} aria-controls={`closer-effect-${item.id}`} onClick={() => select(index)}>
                  <m.span layout={reduceMotion || mobileExpanded ? false : 'position'} className={styles.effectLabel}><span className={styles.effectIcon} aria-hidden="true" /><span>{item.title}</span></m.span>
                  <m.span layout={reduceMotion || mobileExpanded ? false : 'position'} animate={{ opacity: mobileExpanded ? Math.max(0, expansion * 2 - 1) : expanded ? 1 : 0 }} transition={{ duration: reduceMotion || mobileExpanded ? 0 : .42 }} id={`closer-effect-${item.id}`} className={styles.description} aria-hidden={!expanded} hidden={!expanded && !mobileExpanded}>
                    <strong>{item.title}.</strong> {item.promise} {item.summary}
                  </m.span>
                </m.button>
              </m.div>;
            })}
          </m.div>
          {mobileExpanded && <div className={styles.arrows} data-moving={moving}>
            <button type="button" aria-label="Previous effect" disabled={active === 0} onClick={() => select(active - 1)}><Chevron previous /></button>
            <button type="button" aria-label="Next effect" disabled={active === effects.length - 1} onClick={() => select(active + 1)}><Chevron /></button>
          </div>}
        </m.div>
      </div>
    </section>
  </LazyMotion>;
}
