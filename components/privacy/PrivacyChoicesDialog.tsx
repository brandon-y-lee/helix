"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useModalLayer } from "@/components/overlays/modal-state";
import { HelixIdentity } from "@/components/brand/HelixIdentity";
import { privacyConsent, type PrivacyChoices } from "@/lib/privacy/consent";
import { restorePrivacyFocus } from "@/lib/privacy/reload";
import { usePrivacyConsent } from "./usePrivacyConsent";
const privacyCategories: {
  name: string;
  state?: string;
  choice?: keyof PrivacyChoices;
  description: string;
}[] = [
  {
    name: "Essential Cookies",
    state: "Always Active",
    description:
      "These cookies support account sign-in, security, shopping carts, checkout recovery, referrals and private guest receipts. They cannot be switched off here. You can block or delete cookies in your browser, but some features may stop working.",
  },
  {
    name: "Search",
    state: "When you search",
    description:
      "When you use product search, your search terms are sent to Algolia to return matching products. Search is available when you choose to use it.",
  },
  {
    name: "Analytics",
    choice: "analytics",
    description:
      "With your permission, Google Analytics, Vercel Speed Insights and Vercel Web Analytics can help us understand visits to our public pages and improve website performance. Vercel Web Analytics and Speed Insights do not use analytics cookies, but they still collect usage or performance information. This choice controls all three services.",
  },
  {
    name: "Marketing",
    choice: "marketing",
    description:
      "With your permission, Helix and Meta can use the Meta Pixel to measure visits to public pages and support more relevant advertisements. This choice does not change your email preferences. We do not send your email address, account details or purchase history through this control.",
  },
];

export function PrivacyChoicesDialog({
  triggerClassName,
}: {
  triggerClassName?: string;
}) {
  const consent = usePrivacyConsent();
  const [draft, setDraft] = useState<PrivacyChoices>({
    analytics: false,
    marketing: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(0);
  const titleId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    restorePrivacyFocus(`${titleId}-trigger`, triggerRef.current);
  }, [titleId]);
  function save(choices: PrivacyChoices) {
    if (privacyConsent.save(choices)) {
      setError(null);
      setOpen(false);
    } else setError(privacyConsent.getSnapshot().error);
  }
  const { active } = useModalLayer({
    open,
    layerRef,
    panelRef,
    onClose: () => setOpen(false),
    returnFocus: () => triggerRef.current?.focus({ preventScroll: true }),
    initialFocus: () => panelRef.current,
  });

  return (
    <>
      <button
        ref={triggerRef}
        id={`${titleId}-trigger`}
        type="button"
        className={triggerClassName}
        aria-haspopup="dialog"
        onClick={() => {
          const current = privacyConsent.current();
          setDraft({
            analytics: current.analytics,
            marketing: current.marketing,
          });
          setError(null);
          setExpanded(0);
          setOpen(true);
        }}
      >
        Your Privacy Choices
      </button>
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={layerRef}
            className="privacy-dialog-backdrop"
            onClick={(event) => {
              if (event.target === event.currentTarget) setOpen(false);
            }}
          >
            <div
              ref={panelRef}
              className="privacy-dialog"
              data-privacy-trigger={`${titleId}-trigger`}
              role="dialog"
              tabIndex={-1}
              aria-hidden={active ? undefined : true}
              inert={active ? undefined : true}
              aria-modal="true"
              aria-labelledby={titleId}
              onKeyDown={(event) => {
                if (
                  event.target === panelRef.current &&
                  event.key === "Tab" &&
                  event.shiftKey
                ) {
                  event.preventDefault();
                  confirmRef.current?.focus();
                }
              }}
            >
              <header className="privacy-dialog__head">
                <HelixIdentity className="privacy-dialog__wordmark" />
                <button
                  type="button"
                  className="privacy-dialog__close"
                  aria-label="Close privacy choices"
                  onClick={() => setOpen(false)}
                >
                  <span aria-hidden="true">×</span>
                </button>
              </header>
              <div className="privacy-dialog__body">
                <h2 id={titleId}>Your Privacy Choices</h2>
                <p>
                  Helix Labs LLC DBA Helix uses cookies and similar technologies
                  to keep our website working. Here you can learn about the
                  technologies we use and your available choices. Read our{" "}
                  <a href="/privacy">Privacy Policy</a> and{" "}
                  <a href="/cookie-policy">Cookie Policy</a> for more
                  information.
                </p>
                <h3>Sensitive Personal Information</h3>
                <p>
                  We use your account and sign-in information to provide access
                  to your account and protect it. Please do not send sensitive
                  personal information unless it is needed for your request.
                  Contact{" "}
                  <a href="mailto:support@helixskin.com">
                    support@helixskin.com
                  </a>{" "}
                  with questions about your information.
                </p>
                <h3>
                  Do Not Sell or Share My Personal Information / Your Opt-Out
                  Rights
                </h3>
                <p>
                  Advertising technologies can share information about website
                  visits with advertising partners. Under some privacy laws,
                  this may be considered a sale or sharing of personal
                  information. You can decline marketing technologies below
                  without affecting required shopping or account features. Read
                  our <a href="/privacy">Privacy Policy</a> for more about how
                  we handle your information and your rights.
                </p>
                <h3>Opt-Out Preference Signal (Global Privacy Control)</h3>
                <p>
                  We apply Global Privacy Control (GPC) to turn off optional
                  marketing technologies in the browser sending the signal,
                  including when you previously allowed them. Your choices are
                  stored in this browser and are not linked to your Helix
                  account. They do not change settings on other browsers or
                  devices. For other privacy requests or email preferences,
                  contact{" "}
                  <a href="mailto:support@helixskin.com">
                    support@helixskin.com
                  </a>
                  .
                </p>
                {consent.gpc && (
                  <p className="privacy-dialog__notice" role="status">
                    Global Privacy Control is on. Marketing stays off while your
                    browser sends this signal.
                  </p>
                )}
                <button
                  type="button"
                  className="privacy-dialog__accept"
                  disabled={!consent.ready}
                  onClick={() =>
                    save({ analytics: true, marketing: !consent.gpc })
                  }
                >
                  Accept All
                </button>
                <h3>Manage consent preferences</h3>
                <div className="privacy-dialog__categories">
                  {privacyCategories.map((category, index) => (
                    <div
                      className="privacy-dialog__category"
                      key={category.name}
                    >
                      <div className="privacy-dialog__category-row">
                        <h3>
                          <button
                            type="button"
                            aria-expanded={expanded === index}
                            aria-controls={`${titleId}-category-${index}`}
                            onClick={() =>
                              setExpanded(expanded === index ? null : index)
                            }
                          >
                            <span
                              className="privacy-dialog__chevron"
                              aria-hidden="true"
                            >
                              {expanded === index ? "−" : "+"}
                            </span>
                            <span>{category.name}</span>
                            {category.state && (
                              <span className="privacy-dialog__state">
                                {category.state}
                              </span>
                            )}
                          </button>
                        </h3>
                        {category.choice && (
                          <input
                            type="checkbox"
                            role="switch"
                            className="privacy-dialog__switch"
                            aria-label={`Allow ${category.choice}`}
                            aria-describedby={`${titleId}-category-${index}`}
                            checked={
                              category.choice === "marketing" && consent.gpc
                                ? false
                                : draft[category.choice]
                            }
                            disabled={
                              !consent.ready ||
                              (category.choice === "marketing" && consent.gpc)
                            }
                            onChange={(event) =>
                              setDraft({
                                ...draft,
                                [category.choice!]: event.target.checked,
                              })
                            }
                          />
                        )}
                      </div>
                      <div
                        id={`${titleId}-category-${index}`}
                        hidden={expanded !== index}
                      >
                        <p>{category.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <footer className="privacy-dialog__actions">
                {error && <p role="alert">{error}</p>}
                <p>
                  Required cookies remain active. Your optional choices apply to
                  this browser.
                </p>
                <button
                  ref={confirmRef}
                  type="button"
                  disabled={!consent.ready}
                  onClick={() => save(draft)}
                >
                  Confirm my choices
                </button>
              </footer>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
