import { act, useRef, useState, type ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot, type Root } from "react-dom/client";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PERSISTENT_SHEET_MOTION_TRANSITION,
  Sheet,
} from "@/components/overlays/Sheet";

vi.mock("motion/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("motion/react")>();
  return { ...actual, useReducedMotion: () => true };
});

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function Shell({ initiallyOpen = false }: { initiallyOpen?: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <main>
        <h1>Browse the collection</h1>
        <button ref={triggerRef} onClick={() => setOpen(true)}>Open search</button>
      </main>
      <footer>Customer support</footer>
      <Sheet
        open={open}
        title="Search"
        onClose={() => setOpen(false)}
        returnFocus={() => triggerRef.current?.focus({ preventScroll: true })}
        initialFocus={() => inputRef.current}
        className="hydration-search-sheet"
        motionTransition={PERSISTENT_SHEET_MOTION_TRANSITION}
        persistent
      >
        <label>Search products<input ref={inputRef} type="search" /></label>
      </Sheet>
    </>
  );
}

function serverMarkup(tree: ReactNode) {
  // Exercise the same document-free render as Next's server, then hydrate in
  // jsdom. A client-only render cannot detect this portal mismatch.
  vi.stubGlobal("document", undefined);
  try {
    return renderToString(tree);
  } finally {
    vi.unstubAllGlobals();
  }
}

describe("Sheet server hydration", () => {
  it.each([false, true])(
    "hydrates a persistent sheet with initiallyOpen=%s without replacing the shell",
    async (initiallyOpen) => {
      const user = userEvent.setup();
      const tree = <Shell initiallyOpen={initiallyOpen} />;
      const markup = serverMarkup(tree);
      expect(markup).not.toContain("hydration-search-sheet");
      container = document.createElement("div");
      container.innerHTML = markup;
      document.body.append(container);
      const serverMain = container.querySelector("main");
      const serverFooter = container.querySelector("footer");
      const recoveryError = vi.fn();

      await act(async () => {
        root = hydrateRoot(container!, tree, { onRecoverableError: recoveryError });
      });

      expect(recoveryError).not.toHaveBeenCalled();
      expect(container.querySelector("main")).toBe(serverMain);
      expect(container.querySelector("footer")).toBe(serverFooter);
      expect(container.querySelectorAll("main")).toHaveLength(1);
      expect(container.querySelectorAll("footer")).toHaveLength(1);
      const panel = document.querySelector(".hydration-search-sheet");
      expect(panel).not.toBeNull();
      expect(document.querySelectorAll(".hydration-search-sheet")).toHaveLength(1);
      const layer = panel!.parentElement;
      const trigger = screen.getByRole("button", { name: "Open search" });

      if (!initiallyOpen) {
        expect(layer).toHaveAttribute("data-state", "closed");
        expect(layer).toHaveAttribute("inert");
        expect(layer).toHaveAttribute("aria-hidden", "true");
        expect(document.body).not.toHaveStyle({ overflow: "hidden" });
        await user.click(trigger);
      }

      const dialog = screen.getByRole("dialog", { name: "Search" });
      const input = within(dialog).getByRole("searchbox", { name: "Search products" });
      await waitFor(() => expect(input).toHaveFocus());
      expect(document.body).toHaveStyle({ overflow: "hidden" });
      expect(container).toHaveAttribute("inert");
      expect(dialog).not.toHaveAttribute("inert");
      await user.type(input, "serum");
      await user.keyboard("{Escape}");
      await waitFor(() => {
        expect(trigger).toHaveFocus();
        expect(document.body).not.toHaveStyle({ overflow: "hidden" });
      });
      expect(container).not.toHaveAttribute("inert");
      expect(document.querySelector(".hydration-search-sheet")).toBe(panel);
      await user.click(trigger);
      await waitFor(() => expect(input).toHaveFocus());
      expect(input).toHaveValue("serum");
      expect(document.querySelector(".hydration-search-sheet")).toBe(panel);
      expect(recoveryError).not.toHaveBeenCalled();
    },
  );
});
