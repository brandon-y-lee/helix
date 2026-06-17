"use client";

import { useState } from "react";

/**
 * Development waitlist CTA. Records a local acknowledgement only — no email,
 * no PII, no backend. Used for products that are coming soon or sold out.
 */
export function WaitlistButton({
  className = "btn btn--ghost",
  label = "Join waitlist",
}: {
  className?: string;
  label?: string;
}) {
  const [joined, setJoined] = useState(false);

  return (
    <button
      type="button"
      className={className}
      aria-pressed={joined}
      onClick={() => setJoined(true)}
    >
      {joined ? "On the waitlist" : label}
    </button>
  );
}
