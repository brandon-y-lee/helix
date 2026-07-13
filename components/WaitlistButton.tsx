"use client";

import { useState } from "react";

/**
 * Development waitlist CTA. Records a local acknowledgement only — no email,
 * no PII, no backend. Used for products that are coming soon or sold out.
 */
export function WaitlistButton({
  className = "btn btn--ghost",
  label = "Join waitlist",
  tabIndex,
}: {
  className?: string;
  label?: string;
  tabIndex?: number;
}) {
  const [joined, setJoined] = useState(false);

  return (
    <button
      type="button"
      className={className}
      aria-pressed={joined}
      tabIndex={tabIndex}
      onClick={() => setJoined(true)}
    >
      {joined ? "On the waitlist" : label}
    </button>
  );
}
