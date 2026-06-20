"use client";

import { useEffect, useId, useRef, useState } from "react";

const COOKIE_NAME = "mei_pelle_cookie_preferences";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

function writeEssentialPreference() {
  document.cookie = `${COOKIE_NAME}=essential-only; Max-Age=${COOKIE_MAX_AGE}; Path=/; SameSite=Lax`;
}

export function CookiePreferencesDialog({
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
        Cookie Preferences
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
              <h2 id={titleId}>Cookie Preferences</h2>
              <button
                ref={closeRef}
                type="button"
                className="cookie-dialog__close"
                onClick={() => setOpen(false)}
                aria-label="Close cookie preferences"
              >
                Close
              </button>
            </div>
            <p id={descriptionId}>
              Mei-Pelle currently uses essential cookies only: Supabase
              authentication cookies, the guest-cart token, and this preference
              acknowledgement.
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
            <div className="cookie-dialog__category cookie-dialog__category--inactive">
              <div>
                <h3>Analytics and advertising</h3>
                <p>
                  Not active in this repository, so there are no optional
                  toggles to save yet.
                </p>
              </div>
              <span>Off</span>
            </div>
            {saved && (
              <p className="cookie-dialog__status" role="status">
                Essential-only preference saved.
              </p>
            )}
            <div className="cookie-dialog__actions">
              <button
                type="button"
                className="btn"
                onClick={() => {
                  writeEssentialPreference();
                  setSaved(true);
                }}
              >
                Save essential preference
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
