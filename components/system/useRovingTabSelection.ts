"use client";

import {
  useCallback,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

type SelectOptions = {
  focus?: boolean;
};

export function useRovingTabSelection(
  itemCount: number,
  { scrollTabsIntoView = false }: { scrollTabsIntoView?: boolean } = {},
) {
  const [activeIndex, setActiveIndex] = useState(0);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const selectIndex = useCallback(
    (index: number, { focus = false }: SelectOptions = {}) => {
      if (itemCount === 0) return;

      const nextIndex = (index + itemCount) % itemCount;
      setActiveIndex(nextIndex);
      const tab = tabRefs.current[nextIndex];
      if (scrollTabsIntoView) {
        tab?.scrollIntoView?.({ block: "nearest", inline: "center" });
      }
      if (focus) tab?.focus({ preventScroll: true });
    },
    [itemCount, scrollTabsIntoView],
  );

  const handleTabKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
      let nextIndex: number | null = null;
      if (event.key === "ArrowRight") nextIndex = index + 1;
      if (event.key === "ArrowLeft") nextIndex = index - 1;
      if (event.key === "Home") nextIndex = 0;
      if (event.key === "End") nextIndex = itemCount - 1;
      if (nextIndex === null) return;

      event.preventDefault();
      selectIndex(nextIndex, { focus: true });
    },
    [itemCount, selectIndex],
  );

  const registerTab = useCallback(
    (index: number, node: HTMLButtonElement | null) => {
      tabRefs.current[index] = node;
    },
    [],
  );

  return { activeIndex, handleTabKeyDown, registerTab, selectIndex };
}
