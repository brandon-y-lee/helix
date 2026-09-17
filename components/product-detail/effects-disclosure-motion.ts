import { animate } from 'motion';

export type EffectsGeometryElements = {
  rail: HTMLElement;
  image: HTMLElement;
  properties: HTMLElement;
};

export type EffectsGeometrySnapshot = {
  slots: { width: number; buttonHeight: number }[];
  rail: { height: number; paddingLeft: number; paddingRight: number; scrollLeft: number };
  imageHeight: number;
  propertiesHeight: number;
};

function slotsIn(rail: HTMLElement) {
  return Array.from(rail.children).map(slot => ({
    slot: slot as HTMLElement,
    button: slot.querySelector('button')!,
  }));
}

export function captureEffectsGeometry({ rail, image, properties }: EffectsGeometryElements): EffectsGeometrySnapshot {
  const railStyle = getComputedStyle(rail);
  return {
    slots: slotsIn(rail).map(({ slot, button }) => ({
      width: slot.getBoundingClientRect().width,
      buttonHeight: button.getBoundingClientRect().height,
    })),
    rail: {
      height: rail.getBoundingClientRect().height,
      paddingLeft: parseFloat(railStyle.paddingLeft),
      paddingRight: parseFloat(railStyle.paddingRight),
      scrollLeft: rail.scrollLeft,
    },
    imageHeight: image.getBoundingClientRect().height,
    propertiesHeight: properties.getBoundingClientRect().height,
  };
}

export function animateEffectsGeometry(
  { rail, image, properties }: EffectsGeometryElements,
  from: EffectsGeometrySnapshot,
  to: EffectsGeometrySnapshot,
  onComplete: () => void,
): { stop(): void; finish(): void } {
  const slots = slotsIn(rail);
  const restore: (() => void)[] = [];
  let ended = false;

  function own(element: HTMLElement, names: string[]) {
    for (const name of names) {
      const value = element.style.getPropertyValue(name);
      const priority = element.style.getPropertyPriority(name);
      restore.push(() => {
        if (value) element.style.setProperty(name, value, priority);
        else element.style.removeProperty(name);
      });
    }
  }

  own(rail, ['height', 'padding-left', 'padding-right', 'scroll-snap-type', 'scroll-behavior', 'overflow-anchor']);
  own(image, ['height']);
  own(properties, ['height', 'overflow-x', 'overflow-y']);
  for (const { slot, button } of slots) {
    own(slot, ['width', 'flex-basis']);
    own(button, ['width', 'height']);
  }
  rail.style.scrollSnapType = 'none';
  rail.style.scrollBehavior = 'auto';
  rail.style.overflowAnchor = 'none';
  properties.style.overflow = 'hidden';

  function apply(progress: number) {
    const mix = (start: number, end: number) => start + (end - start) * progress;
    const px = (start: number, end: number) => `${mix(start, end)}px`;
    rail.style.height = px(from.rail.height, to.rail.height);
    rail.style.paddingLeft = px(from.rail.paddingLeft, to.rail.paddingLeft);
    rail.style.paddingRight = px(from.rail.paddingRight, to.rail.paddingRight);
    image.style.height = px(from.imageHeight, to.imageHeight);
    properties.style.height = px(from.propertiesHeight, to.propertiesHeight);
    slots.forEach(({ slot, button }, index) => {
      const width = px(from.slots[index].width, to.slots[index].width);
      slot.style.width = width;
      slot.style.flexBasis = width;
      button.style.width = width;
      button.style.height = px(from.slots[index].buttonHeight, to.slots[index].buttonHeight);
    });
    // Write scrolling after widths so the current scroll extent includes this frame's slots.
    rail.scrollLeft = mix(from.rail.scrollLeft, to.rail.scrollLeft);
  }

  function cleanup() {
    for (const reset of restore) reset();
  }

  function finish() {
    if (ended) return;
    ended = true;
    playback.stop();
    apply(1);
    cleanup();
    rail.scrollLeft = to.rail.scrollLeft;
    onComplete();
  }

  // The component starts this in a layout effect; render the old bounds before paint.
  apply(0);
  const playback = animate(0, 1, {
    duration: .42,
    ease: [.22, 1, .36, 1],
    onUpdate: apply,
    onComplete: finish,
  });

  return {
    stop() {
      if (ended) return;
      ended = true;
      playback.stop();
      cleanup();
    },
    finish,
  };
}
