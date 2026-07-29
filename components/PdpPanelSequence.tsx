"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type WheelEvent,
} from "react";

export type PdpSequenceItem = {
  kicker: string;
  title: string;
  body: string;
};

function formatSequencePosition(index: number, total: number) {
  const width = Math.max(2, String(total).length);
  return `${String(index + 1).padStart(width, "0")} / ${String(total).padStart(width, "0")}`;
}

export function PdpPanelSequence({
  label,
  items,
}: {
  label: string;
  items: PdpSequenceItem[];
}) {
  const [active, setActive] = useState(0);
  const pointerStartRef = useRef<{
    x: number;
    y: number;
    pointerId: number;
  } | null>(null);
  const lastWheelAtRef = useRef(Number.NEGATIVE_INFINITY);
  const lastIndex = Math.max(items.length - 1, 0);
  const canPrevious = active > 0;
  const canNext = active < lastIndex;

  useEffect(() => {
    setActive((current) => Math.min(current, lastIndex));
  }, [lastIndex]);

  function go(delta: -1 | 1) {
    setActive((current) => Math.min(Math.max(current + delta, 0), lastIndex));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      go(-1);
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      go(1);
    }
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    pointerStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      pointerId: event.pointerId,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    const start = pointerStartRef.current;
    pointerStartRef.current = null;
    if (!start || start.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    if (Math.abs(deltaX) < 36 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.2) {
      return;
    }
    go(deltaX < 0 ? 1 : -1);
  }

  function handleWheel(event: WheelEvent<HTMLDivElement>) {
    if (
      Math.abs(event.deltaX) <= Math.abs(event.deltaY) ||
      Math.abs(event.deltaX) < 10
    ) {
      return;
    }
    event.preventDefault();
    const now = window.performance.now();
    if (now - lastWheelAtRef.current < 260) return;
    lastWheelAtRef.current = now;
    go(event.deltaX > 0 ? 1 : -1);
  }

  if (items.length === 0) return null;

  return (
    <div
      className="pdp-panel-sequence"
      role="group"
      aria-label={label}
      tabIndex={0}
      data-can-previous={canPrevious}
      data-can-next={canNext}
      data-preview-direction={
        canNext ? "next" : canPrevious ? "previous" : "none"
      }
      onKeyDown={handleKeyDown}
    >
      <div className="pdp-panel-sequence__bar">
        <span
          className="pdp-panel-sequence__count"
          aria-label={`${label} item position`}
          aria-live="polite"
        >
          {formatSequencePosition(active, items.length)}
        </span>
        <span className="pdp-panel-sequence__controls">
          <button
            type="button"
            aria-label={`Previous ${label}`}
            disabled={!canPrevious}
            onClick={() => go(-1)}
          >
            &larr;
          </button>
          <button
            type="button"
            aria-label={`Next ${label}`}
            disabled={!canNext}
            onClick={() => go(1)}
          >
            &rarr;
          </button>
        </span>
      </div>
      <div
        className="pdp-panel-sequence__viewport"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => {
          pointerStartRef.current = null;
        }}
        onWheel={handleWheel}
      >
        <div
          className="pdp-panel-sequence__track"
          style={
            { "--pdp-sequence-offset": `${active * -100}%` } as CSSProperties
          }
        >
          {items.map((item, index) => (
            <article
              key={`${item.kicker}-${item.title}`}
              className="pdp-panel-sequence__item"
              data-active={index === active}
              aria-hidden={index !== active}
            >
              <span>{item.kicker}</span>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
