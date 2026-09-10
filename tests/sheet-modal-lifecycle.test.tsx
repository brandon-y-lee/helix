import { useRef, useState } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PERSISTENT_SHEET_MOTION_TRANSITION, Sheet } from "@/components/overlays/Sheet";
import { CookieAcknowledgementDialog } from "@/components/privacy/CookieAcknowledgementDialog";
import { useModalPresence } from "@/components/overlays/modal-state";

vi.mock("motion/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("motion/react")>();
  return { ...actual, useReducedMotion: () => true };
});

afterEach(() => {
  vi.restoreAllMocks();
});

function Handoff({ animated = true }: { animated?: boolean }) {
  const [firstOpen, setFirstOpen] = useState(false);
  const [secondOpen, setSecondOpen] = useState(false);
  const firstTrigger = useRef<HTMLButtonElement>(null);
  const secondTrigger = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button ref={firstTrigger} onClick={() => setFirstOpen(true)}>Shop</button>
      <button ref={secondTrigger} onClick={() => setSecondOpen(true)}>Cart</button>
      <Sheet
        open={firstOpen}
        title="Quick Buy"
        onClose={() => setFirstOpen(false)}
        returnFocus={() => firstTrigger.current?.focus({ preventScroll: true })}
        motionTransition={animated ? PERSISTENT_SHEET_MOTION_TRANSITION : undefined}
        persistent
      >
        <button onClick={() => { setFirstOpen(false); setSecondOpen(true); }}>
          Continue to Cart
        </button>
      </Sheet>
      <Sheet
        open={secondOpen}
        title="Cart"
        onClose={() => setSecondOpen(false)}
        returnFocus={() => secondTrigger.current?.focus({ preventScroll: true })}
        motionTransition={PERSISTENT_SHEET_MOTION_TRANSITION}
        persistent
      >
        <button>Checkout</button>
      </Sheet>
    </>
  );
}

describe("shared modal lifecycle", () => {
  it("allows native panel scrolling when keyboard focus wraps to either edge", async () => {
    const user = userEvent.setup();
    render(<Handoff animated={false} />);
    await user.click(screen.getByRole("button", { name: "Shop" }));
    const dialog = screen.getByRole("dialog", { name: "Quick Buy" });
    const close = within(dialog).getByRole("button", { name: "Close" });
    const last = within(dialog).getByRole("button", { name: "Continue to Cart" });
    await waitFor(() => expect(close).toHaveFocus());
    const focusLast = vi.spyOn(last, "focus");
    const focusClose = vi.spyOn(close, "focus");

    await user.tab({ shift: true });
    expect(last).toHaveFocus();
    expect(focusLast).toHaveBeenCalledWith();
    await user.tab();
    expect(close).toHaveFocus();
    expect(focusClose).toHaveBeenCalledWith();
  });

  it("does not return focus to the outgoing trigger during an immediate handoff", async () => {
    const user = userEvent.setup();
    render(<Handoff animated={false} />);
    const shop = screen.getByRole("button", { name: "Shop" });
    await user.click(shop);
    const outgoingFocus = vi.fn();
    shop.addEventListener("focus", outgoingFocus);
    await user.click(screen.getByRole("button", { name: "Continue to Cart" }));
    await waitFor(() => expect(within(screen.getByRole("dialog", { name: "Cart" }))
      .getByRole("button", { name: "Close" })).toHaveFocus());
    expect(outgoingFocus).not.toHaveBeenCalled();
    shop.removeEventListener("focus", outgoingFocus);
  });

  it("keeps scrolling locked and focus in Cart throughout a sheet handoff", async () => {
    const user = userEvent.setup();
    document.body.style.overflow = "auto";
    document.body.style.paddingRight = "4px";
    vi.spyOn(document.documentElement, "clientWidth", "get")
      .mockReturnValue(window.innerWidth - 16);
    render(<Handoff />);

    await user.click(screen.getByRole("button", { name: "Shop" }));
    await user.click(screen.getByRole("button", { name: "Continue to Cart" }));
    const cart = screen.getByRole("dialog", { name: "Cart" });
    await waitFor(() => expect(within(cart).getByRole("button", { name: "Close" })).toHaveFocus());
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(document.body).toHaveStyle({ overflow: "hidden", paddingRight: "20px" });

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => {
      expect(document.body).toHaveStyle({ overflow: "auto", paddingRight: "4px" });
      expect(screen.getByRole("button", { name: "Cart" })).toHaveFocus();
    });
    expect(document.body).not.toHaveAttribute("data-sheet-scroll-lock");
  });

  it("keeps background content inert until the last modal exits", async () => {
    const user = userEvent.setup();
    const { container } = render(<Handoff />);
    const existingInert = document.createElement("aside");
    existingInert.setAttribute("inert", "");
    document.body.append(existingInert);

    await user.click(screen.getByRole("button", { name: "Shop" }));
    expect(container).toHaveAttribute("inert");
    expect(screen.getByRole("dialog", { name: "Quick Buy" })).not.toHaveAttribute("inert");
    const laterBackground = document.createElement("aside");
    document.body.append(laterBackground);
    await waitFor(() => expect(laterBackground).toHaveAttribute("inert"));

    await user.click(screen.getByRole("button", { name: "Continue to Cart" }));
    expect(container).toHaveAttribute("inert");
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(container).not.toHaveAttribute("inert"));
    expect(laterBackground).not.toHaveAttribute("inert");
    expect(existingInert).toHaveAttribute("inert");
    laterBackground.remove();
    existingInert.remove();
  });

  it("locks Cookie notice behind its own focus trap and restores its trigger", async () => {
    const user = userEvent.setup();
    const { container } = render(<CookieAcknowledgementDialog />);
    const trigger = screen.getByRole("button", { name: "Cookie notice" });
    await user.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Cookie notice" });
    expect(document.body).toHaveStyle({ overflow: "hidden" });
    expect(container).toHaveAttribute("inert");
    expect(dialog.closest("[inert]")).toBeNull();
    const close = within(dialog).getByRole("button", { name: "Close cookie notice" });
    await waitFor(() => expect(close).toHaveFocus());
    await user.tab({ shift: true });
    expect(within(dialog).getByRole("button", { name: "Done" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Cookie notice" })).toBeNull();
    expect(container).not.toHaveAttribute("inert");
    expect(document.body).not.toHaveStyle({ overflow: "hidden" });
    expect(trigger).toHaveFocus();
  });

  it("opens a bottom sheet from below and preserves focus when its content updates", async () => {
    function Sort() {
      const [open, setOpen] = useState(false);
      const [selected, setSelected] = useState(false);
      const trigger = useRef<HTMLButtonElement>(null);
      const modalPresent = useModalPresence();
      return (
        <>
          <button ref={trigger} onClick={() => setOpen(true)}>Sort</button>
          <output aria-label="Modal present">{String(modalPresent)}</output>
          <Sheet
            open={open}
            side="bottom"
            title="Sort products"
            onClose={() => setOpen(false)}
            returnFocus={() => trigger.current?.focus({ preventScroll: true })}
            motionTransition={PERSISTENT_SHEET_MOTION_TRANSITION}
            persistent
          >
            <label>
              <input type="checkbox" checked={selected} onChange={(event) => setSelected(event.target.checked)} />
              Featured
            </label>
          </Sheet>
        </>
      );
    }
    const user = userEvent.setup();
    render(<Sort />);
    expect(document.querySelector(".sheet--bottom .sheet__panel"))
      .toHaveStyle({ transform: "translate3d(0, 100%, 0)" });
    await user.click(screen.getByRole("button", { name: "Sort" }));
    const option = screen.getByRole("checkbox", { name: "Featured" });
    await user.click(option);
    expect(option).toHaveFocus();
    expect(option).toBeChecked();
    expect(screen.getByLabelText("Modal present")).toHaveTextContent("true");
    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.getByLabelText("Modal present")).toHaveTextContent("false");
      expect(screen.getByRole("button", { name: "Sort" })).toHaveFocus();
    });
  });

  it("returns through the visible parent when the top modal closes", async () => {
    function Stacked() {
      const [menuOpen, setMenuOpen] = useState(false);
      const [noticeOpen, setNoticeOpen] = useState(false);
      const menuTrigger = useRef<HTMLButtonElement>(null);
      const noticeTrigger = useRef<HTMLButtonElement>(null);
      return (
        <>
          <button ref={menuTrigger} onClick={() => setMenuOpen(true)}>Open menu</button>
          <Sheet open={menuOpen} title="Menu" onClose={() => setMenuOpen(false)}
            returnFocus={() => menuTrigger.current?.focus({ preventScroll: true })}>
            <button ref={noticeTrigger} onClick={() => setNoticeOpen(true)}>Open notice</button>
          </Sheet>
          <Sheet open={noticeOpen} title="Notice" onClose={() => setNoticeOpen(false)}
            returnFocus={() => noticeTrigger.current?.focus({ preventScroll: true })}
            motionTransition={PERSISTENT_SHEET_MOTION_TRANSITION} persistent>
            <button>Read notice</button>
          </Sheet>
        </>
      );
    }
    const user = userEvent.setup();
    render(<Stacked />);
    const menuTrigger = screen.getByRole("button", { name: "Open menu" });
    await user.click(menuTrigger);
    const noticeTrigger = screen.getByRole("button", { name: "Open notice" });
    await user.click(noticeTrigger);
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.getByRole("dialog", { name: "Notice" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(noticeTrigger).toHaveFocus());
    expect(screen.getByRole("dialog", { name: "Menu" })).toBeInTheDocument();
    expect(document.body).toHaveStyle({ overflow: "hidden" });
    await user.keyboard("{Escape}");
    await waitFor(() => expect(menuTrigger).toHaveFocus());
    expect(document.body).not.toHaveStyle({ overflow: "hidden" });
  });
});
