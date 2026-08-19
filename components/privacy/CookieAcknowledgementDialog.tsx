"use client";

import { useEffect, useId, useRef, useState } from "react";
import { COOKIE_ACKNOWLEDGEMENT_COOKIE } from "@/lib/customer-state-identifiers";

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

function writeCookieAcknowledgement() {
  document.cookie = `${COOKIE_ACKNOWLEDGEMENT_COOKIE}=required-and-payment-functional; Max-Age=${COOKIE_MAX_AGE}; Path=/; SameSite=Lax`;
}

export function CookieAcknowledgementDialog({
  triggerClassName,
}: {
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const titleId = useId();
  const descriptionId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    const trigger = triggerRef.current;
    const previous = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    closeRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
      if (event.key !== "Tab") return;

      const focusable = Array.from(
        document.querySelectorAll<HTMLElement>(
          ".cookie-dialog button, .cookie-dialog a[href]",
        ),
      ).filter((element) => !element.hasAttribute("disabled"));

      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (previous && document.contains(previous)) {
        previous.focus();
      } else {
        trigger?.focus();
      }
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={triggerClassName}
        onClick={() => {
          setSaved(false);
          setOpen(true);
        }}
      >
        Cookie notice
      </button>

      {open && (
        <div className="cookie-dialog__backdrop" role="presentation">
          <div
            className="cookie-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
          >
            <div className="cookie-dialog__head">
              <p className="eyebrow">Privacy controls</p>
              <h2 id={titleId}>Cookie notice</h2>
              <button
                ref={closeRef}
                type="button"
                className="cookie-dialog__close"
                onClick={() => setOpen(false)}
                aria-label="Close cookie notice"
              >
                Close
              </button>
            </div>
            <p id={descriptionId}>
              The helix Platform uses essential cookies for authentication,
              Cart continuity, and remembering this acknowledgement. Stripe
              may use functional storage when payment-method messaging loads
              on an eligible Product page. Optional analytics and advertising
              categories are not active.
            </p>
            <div className="cookie-dialog__category">
              <div>
                <h3>Essential cookies</h3>
                <p>
                  Required for account sessions, cart persistence, security, and
                  remembering this acknowledgement.
                </p>
              </div>
              <span>Always on</span>
            </div>
            <div className="cookie-dialog__category">
              <div>
                <h3>Payment messaging</h3>
                <p>
                  Stripe may use functional storage to determine and display
                  eligible payment-method information on product pages.
                </p>
              </div>
              <span>Active when eligible</span>
            </div>
            <div className="cookie-dialog__category cookie-dialog__category--inactive">
              <div>
                <h3>Analytics and advertising</h3>
                <p>
                  Not active on the site, so there are no optional toggles to
                  save.
                </p>
              </div>
              <span>Off</span>
            </div>
            {saved && (
              <p className="cookie-dialog__status" role="status">
                Cookie notice acknowledged.
              </p>
            )}
            <div className="cookie-dialog__actions">
              <button
                type="button"
                className="btn"
                onClick={() => {
                  writeCookieAcknowledgement();
                  setSaved(true);
                }}
              >
                Acknowledge notice
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => setOpen(false)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
